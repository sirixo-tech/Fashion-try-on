import 'dart:typed_data';

/// Local, transient classification results. These are not customer attributes.
enum ImageInferenceFailure {
  unsupportedPlatform,
  initializationFailed,
  invalidModel,
  invalidImage,
  imageTooLarge,
  inferenceFailed,
  busy,
  timedOut,
  disposed,
}

class ImagePrediction {
  const ImagePrediction({required this.label, required this.score});

  final String label;

  /// Model score, not a guarantee of correctness or calibrated confidence.
  final double score;
}

class ImageInferenceResult {
  ImageInferenceResult.success(List<ImagePrediction> predictions, this.elapsed)
    : predictions = List.unmodifiable(predictions),
      failure = null;

  const ImageInferenceResult.unavailable(this.failure)
    : predictions = const [],
      elapsed = Duration.zero;

  final List<ImagePrediction> predictions;
  final ImageInferenceFailure? failure;

  /// Includes decoding, preprocessing and invocation; excludes initialization.
  final Duration elapsed;
  bool get isSuccess => failure == null;
}

/// Single NHWC RGB input, single [1, labels.length] probability output.
/// uint8 models consume raw RGB bytes; float32 models use (pixel - mean) / std.
/// Different model contracts require a separate adapter, not guessed metadata.
class ImageClassificationModel {
  const ImageClassificationModel({
    required this.modelAsset,
    required this.labelsAsset,
    this.inputMean = 127.5,
    this.inputStd = 127.5,
  });

  static const objectValidation = ImageClassificationModel(
    modelAsset: 'assets/models/object_classifier/mobilenet_quant.tflite',
    labelsAsset: 'assets/models/object_classifier/labels.txt',
  );

  final String modelAsset;
  final String labelsAsset;
  final double inputMean;
  final double inputStd;
}

abstract interface class ImageInferenceService {
  Future<ImageInferenceFailure?> initialize();
  Future<ImageInferenceResult> classifyFile(String path, {int topK = 5});
  Future<ImageInferenceResult> classifyBytes(Uint8List bytes, {int topK = 5});
  Future<void> dispose();
}
