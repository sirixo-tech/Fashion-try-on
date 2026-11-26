import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:image_picker/image_picker.dart';
import 'package:uuid/uuid.dart';
import '../auth/customer_api.dart';
import '../auth/customer_controller.dart';
import '../experience/customer_experience.dart';
import '../experience/customer_media.dart';
import '../experience/photo_cleanup_stub.dart'
    if (dart.library.io) '../experience/photo_cleanup_io.dart';

const wardrobeCategories = <String, String>{
  'TOPS': 'Tops',
  'JACKETS': 'Jackets',
  'BOTTOMS': 'Bottoms',
  'DRESSES': 'Dresses',
  'INDIAN_WEAR': 'Indian wear',
  'OTHER': 'Other',
};

class WardrobeSelection {
  final Future<PickedCustomerPhoto> Function() read;
  final Future<void> Function() discard;
  const WardrobeSelection({required this.read, required this.discard});
}

abstract interface class CustomerWardrobePicker {
  Future<List<WardrobeSelection>> pick(CustomerPhotoSource source);
}

class NativeWardrobePicker implements CustomerWardrobePicker {
  final ImagePicker picker;
  NativeWardrobePicker({ImagePicker? picker})
    : picker = picker ?? ImagePicker();
  @override
  Future<List<WardrobeSelection>> pick(CustomerPhotoSource source) async {
    final files = source == CustomerPhotoSource.gallery
        ? await picker.pickMultiImage(
            maxWidth: 2048,
            maxHeight: 2560,
            imageQuality: 90,
            requestFullMetadata: false,
          )
        : <XFile>[
            if (await picker.pickImage(
                  source: ImageSource.camera,
                  maxWidth: 2048,
                  maxHeight: 2560,
                  imageQuality: 90,
                  requestFullMetadata: false,
                )
                case final XFile file)
              file,
          ];
    // Keep file handles, not every image in memory. Review and upload one at a time.
    return [
      for (final file in files)
        WardrobeSelection(
          read: () async {
            if (await file.length() > 16 * 1024 * 1024) {
              throw const CustomerApiException(
                'PHOTO_TOO_LARGE',
                'Choose a photo smaller than 16 MB.',
              );
            }
            final bytes = await file.readAsBytes(), mime = photoMime(bytes);
            if (mime == null) {
              throw const CustomerApiException(
                'PHOTO_FORMAT',
                'Choose a JPEG, PNG or WebP photo.',
              );
            }
            return PickedCustomerPhoto(bytes, mime);
          },
          discard: () => discardPickedCopy(file.path),
        ),
    ];
  }
}

class CustomerWardrobe extends ChangeNotifier {
  final CustomerController auth;
  List<Json> items = [];
  bool loading = false, hasMore = false;
  String search = '', category = '';
  String? error;
  int page = 0, _revision = 0;
  String? _owner;
  bool _disposed = false;
  CustomerWardrobe(this.auth) {
    _owner = auth.profile?.id;
    auth.addListener(_authChanged);
  }
  bool valid(int revision) =>
      !_disposed &&
      revision == _revision &&
      auth.profile?.id == _owner &&
      auth.stage == CustomerStage.ready;
  void _notify() {
    if (!_disposed) notifyListeners();
  }

  void _authChanged() {
    if (auth.profile?.id != _owner || auth.stage != CustomerStage.ready) {
      _owner = auth.profile?.id;
      ++_revision;
      items = [];
      page = 0;
      hasMore = false;
      loading = false;
      error = null;
      _notify();
    }
  }

  Future<void> load({bool more = false, String? query, String? filter}) async {
    if (more && (loading || !hasMore)) return;
    final revision = ++_revision;
    if (!more) {
      search = query ?? search;
      category = filter ?? category;
      items = [];
      page = 0;
      hasMore = false;
    }
    loading = true;
    error = null;
    _notify();
    try {
      final parameters = {
        'page': '${more ? page + 1 : 1}',
        if (search.trim().isNotEmpty) 'search': search.trim(),
        if (category.isNotEmpty) 'category': category,
      };
      final result = await auth.authorized(
        '/wardrobe?${Uri(queryParameters: parameters).query}',
      );
      if (!valid(revision)) return;
      final added = (result['items'] as List).cast<Json>();
      final existing = more ? items : <Json>[];
      items = [
        ...existing,
        ...added.where(
          (item) => !existing.any((old) => old['id'] == item['id']),
        ),
      ];
      page = (result['page'] as num).toInt();
      hasMore = result['hasMore'] == true;
    } catch (caught) {
      if (valid(revision)) error = CustomerExperience.message(caught);
    } finally {
      if (valid(revision)) {
        loading = false;
        _notify();
      }
    }
  }

  Future<Json> save(String id, Json metadata, PickedCustomerPhoto photo) async {
    final owner = auth.profile?.id;
    await auth.authorized(
      '/wardrobe',
      method: 'POST',
      body: {'id': id, ...metadata},
    );
    if (_disposed ||
        auth.profile?.id != owner ||
        auth.stage != CustomerStage.ready) {
      throw const CustomerApiException(
        'CUSTOMER_UNAUTHORIZED',
        'Please sign in again.',
        401,
      );
    }
    final result = await auth.authorizedUpload(
      '/wardrobe/$id/photo',
      photo.bytes,
      photo.mime,
    );
    return result['item'] as Json;
  }

  Future<Json> update(String id, Json metadata) async {
    final result = await auth.authorized(
      '/wardrobe/$id',
      method: 'PATCH',
      body: metadata,
    );
    return result['item'] as Json;
  }

  Future<void> remove(String id) async {
    await auth.authorized('/wardrobe/$id', method: 'DELETE');
    await load();
  }

  String newId() => const Uuid().v7();
  @override
  void dispose() {
    _disposed = true;
    ++_revision;
    auth.removeListener(_authChanged);
    super.dispose();
  }
}
