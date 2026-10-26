import 'dart:io';

import 'package:file_selector/file_selector.dart';
import 'package:image/image.dart' as img;
import 'package:path/path.dart' as path;

class PickedGarmentImage {
  const PickedGarmentImage({required this.path, required this.fileName});

  final String path;
  final String fileName;
}

abstract class GarmentImagePicker {
  Future<PickedGarmentImage?> pickGarmentImage();
}

class FileSelectorGarmentImagePicker implements GarmentImagePicker {
  const FileSelectorGarmentImagePicker();

  static const _imageGroup = XTypeGroup(
    label: 'Garment images',
    extensions: ['jpg', 'jpeg', 'png', 'webp'],
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  );

  @override
  Future<PickedGarmentImage?> pickGarmentImage() async {
    final file = await openFile(acceptedTypeGroups: const [_imageGroup]);
    if (file == null || file.path.isEmpty) {
      return null;
    }
    return PickedGarmentImage(
      path: file.path,
      fileName: file.name.isNotEmpty ? file.name : path.basename(file.path),
    );
  }
}

class GarmentImageValidationResult {
  const GarmentImageValidationResult._({
    required this.valid,
    required this.message,
  });

  const GarmentImageValidationResult.valid()
    : this._(valid: true, message: null);

  const GarmentImageValidationResult.invalid(String message)
    : this._(valid: false, message: message);

  final bool valid;
  final String? message;
}

Future<GarmentImageValidationResult> validateGarmentImagePath(
  String imagePath,
) async {
  if (imagePath.trim().isEmpty) {
    return const GarmentImageValidationResult.invalid(
      'Choose a garment image to continue.',
    );
  }

  final extension = path.extension(imagePath).toLowerCase();
  if (!{'.jpg', '.jpeg', '.png', '.webp'}.contains(extension)) {
    return const GarmentImageValidationResult.invalid(
      'Choose a JPEG, PNG or WebP garment image.',
    );
  }

  try {
    final file = File(imagePath);
    if (!await file.exists()) {
      return const GarmentImageValidationResult.invalid(
        'Garment image is unavailable. Choose another image.',
      );
    }
    final bytes = await file.readAsBytes();
    if (bytes.isEmpty || img.decodeImage(bytes) == null) {
      return const GarmentImageValidationResult.invalid(
        'Garment image could not be opened. Choose another image.',
      );
    }
  } catch (_) {
    return const GarmentImageValidationResult.invalid(
      'Garment image could not be opened. Choose another image.',
    );
  }

  return const GarmentImageValidationResult.valid();
}
