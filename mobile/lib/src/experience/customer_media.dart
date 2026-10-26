import 'package:flutter/foundation.dart';
import 'package:image_picker/image_picker.dart';
import '../auth/customer_api.dart';
import 'photo_cleanup_stub.dart' if (dart.library.io) 'photo_cleanup_io.dart';

enum CustomerPhotoSource { gallery, camera }

class PickedCustomerPhoto {
  final Uint8List bytes;
  final String mime;
  const PickedCustomerPhoto(this.bytes, this.mime);
}

abstract interface class CustomerPhotoPicker {
  Future<PickedCustomerPhoto?> pick(CustomerPhotoSource source);
  Future<void> discardLost();
}

class NativeCustomerPhotoPicker implements CustomerPhotoPicker {
  final ImagePicker picker;
  NativeCustomerPhotoPicker({ImagePicker? picker})
    : picker = picker ?? ImagePicker();
  @override
  Future<void> discardLost() async {
    if (kIsWeb || defaultTargetPlatform != TargetPlatform.android) return;
    try {
      final response = await picker.retrieveLostData();
      for (final file in response.files ?? <XFile>[]) {
        await discardPickedCopy(file.path);
      }
    } catch (_) {
      /* A new selection always requires a current consent/session. */
    }
  }

  @override
  Future<PickedCustomerPhoto?> pick(CustomerPhotoSource source) async {
    final file = await picker.pickImage(
      source: source == CustomerPhotoSource.camera
          ? ImageSource.camera
          : ImageSource.gallery,
      maxWidth: 2048,
      maxHeight: 2560,
      imageQuality: 90,
      requestFullMetadata: false,
    );
    if (file == null) return null;
    try {
      if (await file.length() > 16 * 1024 * 1024) {
        throw const CustomerApiException(
          'PHOTO_TOO_LARGE',
          'Choose a photo smaller than 16 MB.',
        );
      }
      final bytes = await file.readAsBytes();
      final mime = photoMime(bytes);
      if (mime == null) {
        throw const CustomerApiException(
          'PHOTO_FORMAT',
          'Choose a JPEG, PNG or WebP photo.',
        );
      }
      return PickedCustomerPhoto(bytes, mime);
    } finally {
      await discardPickedCopy(file.path);
    }
  }
}

String? photoMime(Uint8List bytes) {
  if (bytes.length > 3 &&
      bytes[0] == 0xff &&
      bytes[1] == 0xd8 &&
      bytes[2] == 0xff) {
    return 'image/jpeg';
  }
  if (bytes.length > 8 &&
      listEquals(bytes.sublist(0, 8), [137, 80, 78, 71, 13, 10, 26, 10])) {
    return 'image/png';
  }
  if (bytes.length > 12 &&
      String.fromCharCodes(bytes.sublist(0, 4)) == 'RIFF' &&
      String.fromCharCodes(bytes.sublist(8, 12)) == 'WEBP') {
    return 'image/webp';
  }
  return null;
}
