import 'dart:typed_data';

import 'package:image/image.dart' as img;

import 'image_inference.dart';

const maxInferenceImageBytes = 20 * 1024 * 1024;
const maxInferenceImagePixels = 24 * 1000 * 1000;

/// Runs only in the inference worker. Originals are never rewritten.
Uint8List prepareClassificationImage(
  Uint8List bytes, {
  required int width,
  required int height,
}) {
  if (bytes.isEmpty) throw ImageInferenceFailure.invalidImage;
  if (bytes.length > maxInferenceImageBytes) {
    throw ImageInferenceFailure.imageTooLarge;
  }
  try {
    final decoder = img.findDecoderForData(bytes);
    final info = decoder?.startDecode(bytes);
    if (info == null || info.width <= 0 || info.height <= 0) {
      throw ImageInferenceFailure.invalidImage;
    }
    if (info.width * info.height > maxInferenceImagePixels) {
      throw ImageInferenceFailure.imageTooLarge;
    }
    final decoded = decoder!.decodeFrame(0);
    if (decoded == null) throw ImageInferenceFailure.invalidImage;
    final upright = img.bakeOrientation(decoded);
    final side = upright.width < upright.height
        ? upright.width
        : upright.height;
    final cropped = img.copyCrop(
      upright,
      x: (upright.width - side) ~/ 2,
      y: (upright.height - side) ~/ 2,
      width: side,
      height: side,
    );
    final resized = img.copyResize(
      cropped,
      width: width,
      height: height,
      interpolation: img.Interpolation.linear,
    );
    return resized.getBytes(order: img.ChannelOrder.rgb);
  } on ImageInferenceFailure {
    rethrow;
  } catch (_) {
    throw ImageInferenceFailure.invalidImage;
  }
}

List<ImagePrediction> rankClassificationScores(
  List<double> scores,
  List<String> labels,
  int topK,
) {
  if (labels.isEmpty ||
      scores.length != labels.length ||
      scores.any((score) => !score.isFinite || score < 0 || score > 1.001)) {
    throw ImageInferenceFailure.invalidModel;
  }
  final indices = List.generate(scores.length, (index) => index);
  indices.sort((a, b) {
    final scoreOrder = scores[b].compareTo(scores[a]);
    return scoreOrder != 0 ? scoreOrder : a.compareTo(b);
  });
  return [
    for (final index in indices.take(topK.clamp(1, labels.length)))
      ImagePrediction(label: labels[index], score: scores[index].clamp(0, 1)),
  ];
}
