import 'dart:async';
import 'dart:io';
import 'dart:isolate';
import 'dart:typed_data';

import 'package:flutter/services.dart';
import 'package:tflite_flutter/tflite_flutter.dart';

import 'image_classification_processing.dart';
import 'image_inference.dart';

/// Optional Android adapter. No network, capture/session mutations or logging.
/// One worker owns all native resources; overlapping calls return busy.
class TfliteImageInferenceService implements ImageInferenceService {
  TfliteImageInferenceService({
    this.model = ImageClassificationModel.objectValidation,
    this.cpuThreads = 1,
    this.operationTimeout = const Duration(seconds: 30),
    AssetBundle? assets,
  }) : _assets = assets ?? rootBundle;

  final ImageClassificationModel model;
  final int cpuThreads;
  final Duration operationTimeout;
  final AssetBundle _assets;

  Future<ImageInferenceFailure?>? _initialization;
  Isolate? _worker;
  ReceivePort? _responses;
  SendPort? _commands;
  StreamSubscription<dynamic>? _subscription;
  final _pending = <int, Completer<Object>>{};
  int _generation = 0;
  bool _disposed = false;
  bool _busy = false;
  Future<void>? _disposal;

  @override
  Future<ImageInferenceFailure?> initialize() {
    if (_disposed) return Future.value(ImageInferenceFailure.disposed);
    return _initialization ??= _initialize();
  }

  Future<ImageInferenceFailure?> _initialize() async {
    // Do not access FFI on Windows: this slice does not bundle a Windows DLL.
    if (!Platform.isAndroid) return ImageInferenceFailure.unsupportedPlatform;
    if (cpuThreads < 1 ||
        cpuThreads > 4 ||
        operationTimeout <= Duration.zero ||
        !model.inputMean.isFinite ||
        !model.inputStd.isFinite ||
        model.inputStd <= 0) {
      return ImageInferenceFailure.invalidModel;
    }
    try {
      return await _startWorker(_generation).timeout(operationTimeout);
    } on TimeoutException {
      _stopWorker();
      return ImageInferenceFailure.timedOut;
    } catch (_) {
      _stopWorker();
      return _disposed
          ? ImageInferenceFailure.disposed
          : ImageInferenceFailure.initializationFailed;
    }
  }

  Future<ImageInferenceFailure?> _startWorker(int generation) async {
    final modelBytes = await _assets.load(model.modelAsset);
    final labelText = await _assets.loadString(model.labelsAsset);
    if (_disposed) return ImageInferenceFailure.disposed;
    if (generation != _generation) return ImageInferenceFailure.timedOut;
    final labels = labelText
        .trim()
        .split('\n')
        .map((line) => line.trim())
        .toList();
    if (labels.isEmpty || labels.any((label) => label.isEmpty)) {
      return ImageInferenceFailure.invalidModel;
    }
    _responses = ReceivePort();
    final ready = Completer<Object>();
    _pending[0] = ready;
    _subscription = _responses!.listen((message) {
      // onExit/onError share this port; raw errors/paths are never surfaced.
      if (message case (int id, Object response)) {
        final pending = _pending[id];
        if (pending != null && !pending.isCompleted) pending.complete(response);
      } else {
        _commands = null;
        for (final pending in _pending.values) {
          if (!pending.isCompleted) {
            pending.complete(ImageInferenceFailure.inferenceFailed);
          }
        }
      }
    });
    final worker = await Isolate.spawn(
      _inferenceWorker,
      (
        _responses!.sendPort,
        TransferableTypedData.fromList([
          modelBytes.buffer.asUint8List(
            modelBytes.offsetInBytes,
            modelBytes.lengthInBytes,
          ),
        ]),
        labels,
        cpuThreads,
        model,
      ),
      onError: _responses!.sendPort,
      onExit: _responses!.sendPort,
      errorsAreFatal: true,
    );
    if (_disposed || generation != _generation) {
      worker.kill(priority: Isolate.immediate);
      return _disposed
          ? ImageInferenceFailure.disposed
          : ImageInferenceFailure.timedOut;
    }
    _worker = worker;
    final response = await ready.future;
    if (_disposed || generation != _generation) {
      return _disposed
          ? ImageInferenceFailure.disposed
          : ImageInferenceFailure.timedOut;
    }
    _pending.remove(0);
    if (response is SendPort) {
      _commands = response;
      return null;
    }
    _stopWorker();
    return response is ImageInferenceFailure
        ? response
        : ImageInferenceFailure.initializationFailed;
  }

  @override
  Future<ImageInferenceResult> classifyFile(String path, {int topK = 5}) =>
      _classify(path, topK);

  @override
  Future<ImageInferenceResult> classifyBytes(Uint8List bytes, {int topK = 5}) {
    if (_disposed) {
      return Future.value(
        const ImageInferenceResult.unavailable(ImageInferenceFailure.disposed),
      );
    }
    if (bytes.isEmpty || bytes.length > maxInferenceImageBytes) {
      return Future.value(
        ImageInferenceResult.unavailable(
          bytes.isEmpty
              ? ImageInferenceFailure.invalidImage
              : ImageInferenceFailure.imageTooLarge,
        ),
      );
    }
    if (_busy) {
      return Future.value(
        const ImageInferenceResult.unavailable(ImageInferenceFailure.busy),
      );
    }
    return _classify(TransferableTypedData.fromList([bytes]), topK);
  }

  Future<ImageInferenceResult> _classify(Object source, int topK) async {
    if (_disposed) {
      return const ImageInferenceResult.unavailable(
        ImageInferenceFailure.disposed,
      );
    }
    if (_busy) {
      return const ImageInferenceResult.unavailable(ImageInferenceFailure.busy);
    }
    _busy = true;
    try {
      final failure = await initialize();
      if (_disposed) {
        return const ImageInferenceResult.unavailable(
          ImageInferenceFailure.disposed,
        );
      }
      if (failure != null) return ImageInferenceResult.unavailable(failure);
      if (_commands == null) {
        return const ImageInferenceResult.unavailable(
          ImageInferenceFailure.inferenceFailed,
        );
      }
      final result = Completer<Object>();
      _pending[1] = result;
      _commands!.send((source, topK));
      final response = await result.future.timeout(operationTimeout);
      return response is ImageInferenceResult
          ? response
          : ImageInferenceResult.unavailable(
              response is ImageInferenceFailure
                  ? response
                  : ImageInferenceFailure.inferenceFailed,
            );
    } on TimeoutException {
      _stopWorker();
      _initialization = null;
      return const ImageInferenceResult.unavailable(
        ImageInferenceFailure.timedOut,
      );
    } catch (_) {
      return const ImageInferenceResult.unavailable(
        ImageInferenceFailure.inferenceFailed,
      );
    } finally {
      _pending.remove(1);
      _busy = false;
    }
  }

  @override
  Future<void> dispose() => _disposal ??= _dispose();

  Future<void> _dispose() async {
    _disposed = true;
    for (final pending in _pending.values) {
      if (!pending.isCompleted) {
        pending.complete(ImageInferenceFailure.disposed);
      }
    }
    final commands = _commands;
    if (commands != null) {
      // Queued after any current invocation so close cannot race native run.
      final acknowledgement = Completer<Object>();
      _pending[2] = acknowledgement;
      commands.send(null);
      try {
        await acknowledgement.future.timeout(operationTimeout);
      } catch (_) {
        // A stuck/failed worker must not prevent the caller leaving the screen.
      }
    }
    _stopWorker();
  }

  void _stopWorker() {
    _generation++;
    for (final pending in _pending.values) {
      if (!pending.isCompleted) {
        pending.complete(
          _disposed
              ? ImageInferenceFailure.disposed
              : ImageInferenceFailure.inferenceFailed,
        );
      }
    }
    _pending.clear();
    _worker?.kill(priority: Isolate.immediate);
    _worker = null;
    _commands = null;
    _subscription?.cancel();
    _subscription = null;
    _responses?.close();
    _responses = null;
  }
}

void _inferenceWorker(
  (SendPort, TransferableTypedData, List<String>, int, ImageClassificationModel)
  setup,
) async {
  final (responses, modelData, labels, threads, model) = setup;
  final commands = ReceivePort();
  Interpreter? interpreter;
  try {
    final options = InterpreterOptions()..threads = threads;
    try {
      interpreter = Interpreter.fromBuffer(
        modelData.materialize().asUint8List(),
        options: options,
      );
    } finally {
      options.delete();
    }
    final inputs = interpreter.getInputTensors();
    final outputs = interpreter.getOutputTensors();
    if (inputs.length != 1 || outputs.length != 1) {
      throw ImageInferenceFailure.invalidModel;
    }
    final input = inputs.single;
    final output = outputs.single;
    if (input.shape.length != 4 ||
        input.shape[0] != 1 ||
        input.shape[3] != 3 ||
        input.shape[1] < 1 ||
        input.shape[1] > 512 ||
        input.shape[2] < 1 ||
        input.shape[2] > 512 ||
        output.shape.length != 2 ||
        output.shape[0] != 1 ||
        output.shape[1] != labels.length ||
        ![TensorType.uint8, TensorType.float32].contains(input.type) ||
        ![TensorType.uint8, TensorType.float32].contains(output.type) ||
        (output.type == TensorType.uint8 && output.params.scale <= 0)) {
      throw ImageInferenceFailure.invalidModel;
    }
    responses.send((0, commands.sendPort));
    await for (final request in commands) {
      if (request == null) break;
      final (source, topK) = request as (Object, int);
      final stopwatch = Stopwatch()..start();
      try {
        final bytes = source is String
            ? await _readImageFile(source)
            : (source as TransferableTypedData).materialize().asUint8List();
        final rgb = prepareClassificationImage(
          bytes,
          width: input.shape[2],
          height: input.shape[1],
        );
        final inputBuffer = input.type == TensorType.uint8
            ? rgb.buffer
            : Float32List.fromList([
                for (final pixel in rgb)
                  (pixel - model.inputMean) / model.inputStd,
              ]).buffer;
        final outputBuffer = Uint8List(output.numBytes());
        interpreter.run(inputBuffer, outputBuffer.buffer);
        final scores = output.type == TensorType.uint8
            ? [
                for (final score in outputBuffer)
                  (score - output.params.zeroPoint) * output.params.scale,
              ]
            : outputBuffer.buffer.asFloat32List().toList();
        responses.send((
          1,
          ImageInferenceResult.success(
            rankClassificationScores(scores, labels, topK),
            stopwatch.elapsed,
          ),
        ));
      } on ImageInferenceFailure catch (failure) {
        responses.send((1, ImageInferenceResult.unavailable(failure)));
      } catch (_) {
        responses.send((
          1,
          const ImageInferenceResult.unavailable(
            ImageInferenceFailure.inferenceFailed,
          ),
        ));
      }
    }
  } on ImageInferenceFailure catch (failure) {
    responses.send((0, failure));
  } catch (_) {
    responses.send((0, ImageInferenceFailure.initializationFailed));
  } finally {
    interpreter?.close();
    commands.close();
    responses.send((2, true));
  }
}

Future<Uint8List> _readImageFile(String path) async {
  try {
    final file = File(path);
    if (await file.length() > maxInferenceImageBytes) {
      throw ImageInferenceFailure.imageTooLarge;
    }
    return await file.readAsBytes();
  } on ImageInferenceFailure {
    rethrow;
  } catch (_) {
    throw ImageInferenceFailure.invalidImage;
  }
}
