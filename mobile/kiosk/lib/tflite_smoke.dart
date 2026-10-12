// Optional developer entry point. Normal lib/main.dart remains unchanged.
import 'package:flutter/foundation.dart';
import 'package:image/image.dart' as img;

import 'main.dart' as kiosk;
import 'src/inference/tflite_image_inference_service.dart';

Future<void> main() async {
  await kiosk.main();
  final service = TfliteImageInferenceService();
  try {
    // Synthetic image validates runtime plumbing, not model accuracy.
    final sample = img.Image(width: 32, height: 32);
    img.fill(sample, color: img.ColorRgb8(80, 140, 200));
    final result = await service.classifyBytes(img.encodePng(sample));
    debugPrint(
      'SelfX offline TFLite smoke: ${result.failure?.name ?? 'success'}; '
      'outputs=${result.predictions.length}; elapsedMs=${result.elapsed.inMilliseconds}',
    );
  } finally {
    await service.dispose();
  }
}
