import 'package:flutter/foundation.dart';
import 'package:flutter/painting.dart';
import '../auth/customer_api.dart';
import '../auth/customer_controller.dart';
import '../experience/customer_media.dart';

const customerAvatarConsent =
    'I allow SelfX to save my selfie and full-body photos privately to my account and reuse them for Try-On. They stay until I replace or delete them, delete all my photos, or delete my account. Temporary Try-On copies still expire within 7 days.';

class CustomerAvatar extends ChangeNotifier {
  final CustomerController auth;
  final photos = <String, Uint8List>{};
  final ids = <String, String>{};
  List<String> interests = [];
  bool busy = false, loaded = false;
  String? error;
  int _epoch = 0;
  bool _disposed = false;
  late final String? _owner;
  CustomerAvatar(this.auth) {
    _owner = auth.profile?.id;
    interests = [...?auth.profile?.interests];
    auth.addListener(_authChanged);
  }
  bool _valid(int epoch) =>
      !_disposed &&
      epoch == _epoch &&
      auth.stage == CustomerStage.ready &&
      auth.profile?.id == _owner;
  void _authChanged() {
    if (auth.stage != CustomerStage.ready || auth.profile?.id != _owner) {
      ++_epoch;
      _clear();
      if (!_disposed) notifyListeners();
    }
  }

  void _clear() {
    for (final bytes in photos.values) {
      PaintingBinding.instance.imageCache.evict(MemoryImage(bytes));
    }
    photos.clear();
    ids.clear();
  }

  Future<void> _read() async {
    final epoch = _epoch;
    final result = await auth.authorized('/me/avatar');
    if (!_valid(epoch)) return;
    interests = List<String>.from(result['interests'] as List? ?? []);
    for (final kind in ['SELFIE', 'FULL_BODY']) {
      final photo = result[kind == 'SELFIE' ? 'selfie' : 'fullBody'] as Map?;
      final id = photo?['id'] as String?;
      if (id == ids[kind]) continue;
      final bytes = id == null
          ? null
          : await auth.authorizedDownload('/me/avatar/$kind/$id/content');
      if (!_valid(epoch)) return;
      if (photos[kind] case final old?) {
        PaintingBinding.instance.imageCache.evict(MemoryImage(old));
      }
      photos.remove(kind);
      ids.remove(kind);
      if (bytes != null) {
        photos[kind] = bytes;
        ids[kind] = id!;
      }
    }
    loaded = true;
  }

  Future<bool> _run(Future<void> Function() action) async {
    if (busy || !_valid(_epoch)) return false;
    final epoch = _epoch;
    busy = true;
    error = null;
    notifyListeners();
    try {
      await action();
      return _valid(epoch);
    } catch (e) {
      if (_valid(epoch)) {
        error = e is CustomerApiException
            ? e.message
            : 'Unable to complete that. Please try again.';
      }
      return false;
    } finally {
      if (_valid(epoch)) {
        busy = false;
        notifyListeners();
      }
    }
  }

  Future<bool> load() => _run(_read);
  Future<bool> saveInterests(List<String> values, {bool complete = false}) =>
      _run(() async {
        await auth.authorized(
          '/me/avatar',
          method: 'PATCH',
          body: {'interests': values, 'complete': complete},
        );
        if (_disposed || auth.profile?.id != _owner) return;
        interests = [...values];
        if (complete) await auth.loadProfile();
      });
  Future<bool> upload(String kind, PickedCustomerPhoto photo) => _run(() async {
    if (photo.bytes.length > 16 * 1024 * 1024 ||
        photoMime(photo.bytes) != photo.mime) {
      throw const CustomerApiException(
        'AVATAR_PHOTO_INVALID',
        'Choose one JPEG, PNG or WebP photo up to 16 MB.',
      );
    }
    await auth.authorizedUpload(
      '/me/avatar/$kind?consentVersion=2026-10-28-avatar-v1&consentLanguage=en',
      photo.bytes,
      photo.mime,
    );
    await _read();
  });
  Future<bool> remove(String kind) => _run(() async {
    await auth.authorized('/me/avatar/$kind', method: 'DELETE');
    await _read();
  });
  @override
  void dispose() {
    _disposed = true;
    ++_epoch;
    auth.removeListener(_authChanged);
    _clear();
    super.dispose();
  }
}
