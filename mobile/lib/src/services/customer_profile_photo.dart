import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/painting.dart';
import '../auth/customer_api.dart';
import '../auth/customer_controller.dart';
import '../experience/customer_media.dart';

const customerProfilePhotoConsent =
    'I allow SelfX to upload my selected profile photo. It is private to my account, is not used for Try-On, and expires within 7 days. I can change or remove it earlier.';
const customerProfilePhotoCriteria =
    'Choose a clear photo of yourself. JPEG, PNG or WebP, up to 5 MB; 256–8192 pixels on each side. Your photo is cropped to a square and expires within 7 days.';

class CustomerProfilePhoto extends ChangeNotifier {
  final CustomerController auth;
  Uint8List? bytes;
  DateTime? expiresAt;
  String? error;
  bool busy = false;
  bool _disposed = false;
  int _revision = 0;
  String? _owner;
  String? _photoId;
  Timer? _expiry;
  CustomerProfilePhoto(this.auth) {
    _owner = auth.profile?.id;
    auth.addListener(_authChanged);
  }
  bool _valid(int revision) =>
      !_disposed &&
      revision == _revision &&
      auth.stage == CustomerStage.ready &&
      auth.profile?.id == _owner;
  void _notify() {
    if (!_disposed) notifyListeners();
  }

  void _authChanged() {
    if (auth.stage != CustomerStage.ready || auth.profile?.id != _owner) {
      clear();
      _owner = auth.profile?.id;
    }
  }

  void clear() {
    ++_revision;
    _expiry?.cancel();
    _dropBytes();
    expiresAt = null;
    error = null;
    busy = false;
    _notify();
  }

  void _dropBytes() {
    if (bytes != null) {
      PaintingBinding.instance.imageCache.evict(MemoryImage(bytes!));
    }
    bytes = null;
    _photoId = null;
  }

  Future<void> _read(Map<String, dynamic> result, int revision) async {
    if (!_valid(revision)) return;
    final photo = result['photo'] as Map?;
    if (photo == null) {
      _expiry?.cancel();
      _dropBytes();
      expiresAt = null;
      return;
    }
    final expiry = DateTime.parse(photo['expiresAt'] as String);
    if (_photoId == photo['id'] &&
        bytes != null &&
        expiry.isAfter(DateTime.now())) {
      return;
    }
    final data = await auth.authorizedDownload(
      '/me/photo/${photo['id']}/content',
    );
    if (!_valid(revision) || !expiry.isAfter(DateTime.now())) return;
    _dropBytes();
    bytes = data;
    _photoId = photo['id'] as String;
    expiresAt = expiry;
    _expiry?.cancel();
    _expiry = Timer(expiry.difference(DateTime.now()), clear);
  }

  Future<void> load() async {
    if (busy) return;
    final revision = ++_revision;
    try {
      await _read(await auth.authorized('/me/photo'), revision);
      if (_valid(revision)) error = null;
    } catch (_) {
      if (_valid(revision)) {
        error = 'Your profile photo could not be loaded. Please try again.';
      }
    } finally {
      if (_valid(revision)) _notify();
    }
  }

  Future<void> upload(PickedCustomerPhoto photo) => _change(() async {
    if (photo.bytes.length > 5 * 1024 * 1024 ||
        photoMime(photo.bytes) != photo.mime) {
      throw const CustomerApiException(
        'PROFILE_PHOTO_INVALID',
        'Choose one JPEG, PNG or WebP photo up to 5 MB.',
      );
    }
    return auth.authorizedUpload(
      '/me/photo?consentVersion=2026-10-27&consentLanguage=${auth.language}',
      photo.bytes,
      photo.mime,
    );
  });
  Future<void> remove() =>
      _change(() => auth.authorized('/me/photo', method: 'DELETE'));
  Future<void> _change(
    Future<Map<String, dynamic>> Function() operation,
  ) async {
    if (busy) return;
    final revision = ++_revision;
    busy = true;
    error = null;
    _notify();
    try {
      await _read(await operation(), revision);
    } catch (e) {
      if (_valid(revision)) {
        error = e is CustomerApiException
            ? e.message
            : 'Unable to complete that. Please try again.';
      }
    } finally {
      if (_valid(revision)) {
        busy = false;
        _notify();
      }
    }
  }

  @override
  void dispose() {
    _disposed = true;
    _expiry?.cancel();
    auth.removeListener(_authChanged);
    _dropBytes();
    super.dispose();
  }
}
