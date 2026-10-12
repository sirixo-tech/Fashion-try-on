import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:selfx_kiosk/src/inference/image_classification_processing.dart';
import 'package:selfx_kiosk/src/inference/image_inference.dart';
import 'package:selfx_kiosk/src/inference/tflite_image_inference_service.dart';

void main() {
  test(
    'center crop preserves RGB channel order and leaves source untouched',
    () {
      final image = img.Image(width: 4, height: 2);
      img.fill(image, color: img.ColorRgb8(200, 0, 0));
      for (var y = 0; y < 2; y++) {
        image.setPixelRgb(1, y, 10, 20, 30);
        image.setPixelRgb(2, y, 10, 20, 30);
      }
      final bytes = img.encodePng(image);
      final original = Uint8List.fromList(bytes);
      expect(prepareClassificationImage(bytes, width: 2, height: 2), [
        10,
        20,
        30,
        10,
        20,
        30,
        10,
        20,
        30,
        10,
        20,
        30,
      ]);
      expect(bytes, original);
    },
  );

  test('JPEG EXIF rotation is applied before model preprocessing', () {
    final image = img.Image(width: 32, height: 32);
    img.fill(image, color: img.ColorRgb8(255, 0, 0));
    img.fillRect(
      image,
      x1: 16,
      y1: 0,
      x2: 31,
      y2: 31,
      color: img.ColorRgb8(0, 0, 255),
    );
    image.exif.imageIfd.orientation = 6;
    final rgb = prepareClassificationImage(
      img.encodeJpg(image, quality: 100),
      width: 2,
      height: 2,
    );
    // Clockwise rotation moves the red left half to the top half.
    expect(rgb[0], greaterThan(rgb[2]));
    expect(rgb[8], greaterThan(rgb[6]));
  });

  test('corrupt and oversized inputs return explicit failures', () {
    expect(
      () => prepareClassificationImage(
        Uint8List.fromList([1, 2, 3]),
        width: 2,
        height: 2,
      ),
      throwsA(ImageInferenceFailure.invalidImage),
    );
    expect(
      () => prepareClassificationImage(
        Uint8List(maxInferenceImageBytes + 1),
        width: 2,
        height: 2,
      ),
      throwsA(ImageInferenceFailure.imageTooLarge),
    );
  });

  test('ranking is deterministic and rejects unusable model outputs', () {
    final ranked = rankClassificationScores(
      [0.1, 0.8, 0.8],
      ['a', 'b', 'c'],
      2,
    );
    expect(ranked.map((prediction) => prediction.label), ['b', 'c']);
    expect(
      () => rankClassificationScores([double.nan], ['a'], 5),
      throwsA(ImageInferenceFailure.invalidModel),
    );
    expect(
      () => rankClassificationScores([1.5], ['a'], 5),
      throwsA(ImageInferenceFailure.invalidModel),
    );
  });

  test(
    'overlapping requests are rejected and disposal invalidates pending work',
    () async {
      final service = TfliteImageInferenceService();
      final pending = service.classifyFile('unused.jpg');
      final overlapping = service.classifyFile('unused.jpg');
      final disposal = service.dispose();
      expect((await overlapping).failure, ImageInferenceFailure.busy);
      await disposal;
      expect((await pending).failure, ImageInferenceFailure.disposed);
    },
  );

  test(
    'desktop returns unavailable without loading native libraries',
    () async {
      final service = TfliteImageInferenceService();
      expect(
        await service.initialize(),
        ImageInferenceFailure.unsupportedPlatform,
      );
      expect(
        (await service.classifyFile('unused.jpg')).failure,
        ImageInferenceFailure.unsupportedPlatform,
      );
      await service.dispose();
      await service.dispose();
      expect(
        (await service.classifyBytes(Uint8List.fromList([1]))).failure,
        ImageInferenceFailure.disposed,
      );
    },
  );
}
