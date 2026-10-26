import 'package:flutter/foundation.dart';
import 'customer_api.dart';
import 'customer_identity.dart';
import 'session_store.dart';

enum CustomerStage { loading, onboarding, authentication, ready, recovery }

class CustomerController extends ChangeNotifier {
  final CustomerApi api;
  final CustomerSessionStore store;
  final CustomerIdentity identity;
  CustomerStage stage = CustomerStage.loading;
  CustomerCapabilities capabilities = const CustomerCapabilities();
  CustomerProfile? profile;
  String? _accessToken;
  String? _refreshToken;
  DateTime? _accessExpiresAt;
  Future<void>? _refreshing;
  Future<void>? _storageTail;
  int _epoch = 0;
  bool _disposed = false;
  String? initializationError;
  bool restoringSession = false;
  bool profileLoading = false;
  int _profileRequests = 0;
  CustomerController({
    required this.api,
    required this.store,
    required this.identity,
  });
  void _notify() {
    if (!_disposed) notifyListeners();
  }

  Future<void> initialize() async {
    final epoch = ++_epoch;
    stage = CustomerStage.loading;
    restoringSession = false;
    _profileRequests = 0;
    profileLoading = false;
    initializationError = null;
    _notify();
    try {
      final complete = await store.onboardingComplete();
      if (_disposed || epoch != _epoch) return;
      if (!complete) {
        stage = CustomerStage.onboarding;
        _notify();
        return;
      }
      _refreshToken = await store.readRefreshToken();
      if (_disposed || epoch != _epoch) return;
      restoringSession = _refreshToken != null;
      _notify();
      final capabilitiesJson = await api.request(
        '/auth/capabilities',
        method: 'GET',
      );
      if (_disposed || epoch != _epoch) return;
      capabilities = CustomerCapabilities.fromJson(capabilitiesJson);
      if (_refreshToken != null && capabilities.enabled) {
        try {
          await _refresh();
          await loadProfile();
        } on CustomerApiException catch (error) {
          if (error.status == 401 || error.status == 403) {
            await _clear();
          } else {
            rethrow;
          }
        }
      }
      if (_disposed || epoch != _epoch) return;
      stage = profile != null
          ? CustomerStage.ready
          : complete
          ? CustomerStage.authentication
          : CustomerStage.onboarding;
    } catch (error) {
      if (_disposed || epoch != _epoch) return;
      initializationError = error is CustomerApiException
          ? error.message
          : 'Unable to open SelfX. Please try again.';
      stage = CustomerStage.recovery;
    }
    _notify();
  }

  Future<void> finishOnboarding() async {
    await store.finishOnboarding();
    if (profile != null) {
      stage = CustomerStage.ready;
      _notify();
    } else {
      await initialize();
    }
  }

  void replayOnboarding() {
    stage = CustomerStage.onboarding;
    _notify();
  }

  Future<void> _accept(Map<String, dynamic> result, int epoch) async {
    if (_disposed || epoch != _epoch) return;
    final refresh = result['refreshToken'] as String;
    await _persist(refresh, epoch: epoch);
    if (_disposed || epoch != _epoch) {
      return;
    }
    _accessToken = result['accessToken'] as String;
    _refreshToken = refresh;
    _accessExpiresAt = DateTime.parse(result['accessTokenExpiresAt'] as String);
    profile = CustomerProfile.fromJson(
      result['customer'] as Map<String, dynamic>,
    );
  }

  Future<Map<String, dynamic>> signIn(String email, String password) async {
    final epoch = _epoch;
    final result = await api.request(
      '/auth/login',
      body: {
        'email': email.trim(),
        'password': password,
        'deviceName': 'SelfX mobile',
      },
    );
    if (result['verificationRequired'] == true) return result;
    await _accept(result, epoch);
    if (epoch == _epoch && !_disposed) {
      await loadProfile();
      if (epoch == _epoch && !_disposed && profile != null) {
        stage = CustomerStage.ready;
        _notify();
      }
    }
    return result;
  }

  Future<Map<String, dynamic>> signUp(
    String name,
    String email,
    String password,
  ) => api.request(
    '/auth/signup',
    body: {
      'displayName': name.trim(),
      'email': email.trim(),
      'password': password,
      'acceptTerms': true,
      'termsVersion': capabilities.termsVersion,
    },
  );
  Future<void> oauth(String provider, {required bool signup}) async {
    final epoch = _epoch;
    final credential = await identity.authenticate(provider, api);
    if (_disposed || epoch != _epoch) return;
    final result = await api.request(
      '/auth/oauth',
      body: {
        ...credential,
        if (signup) ...{
          'acceptTerms': true,
          'termsVersion': capabilities.termsVersion,
        },
        'deviceName': 'SelfX mobile',
      },
    );
    await _accept(result, epoch);
    if (epoch == _epoch && !_disposed) {
      await loadProfile();
      if (epoch == _epoch && !_disposed && profile != null) {
        stage = CustomerStage.ready;
        _notify();
      }
    }
  }

  Future<void> _refresh() {
    return _refreshing ??= _performRefresh().whenComplete(() {
      _refreshing = null;
    });
  }

  Future<void> _performRefresh() async {
    final epoch = _epoch, refresh = _refreshToken;
    if (refresh == null) {
      throw const CustomerApiException(
        'CUSTOMER_UNAUTHORIZED',
        'Please sign in again.',
        401,
      );
    }
    final result = await api.request(
      '/auth/refresh',
      body: {'refreshToken': refresh},
    );
    await _accept(result, epoch);
  }

  Future<T> withAccess<T>(Future<T> Function(String token) operation) async {
    final epoch = _epoch;
    void check() {
      if (_disposed || epoch != _epoch || _refreshToken == null) {
        throw const CustomerApiException(
          'CUSTOMER_UNAUTHORIZED',
          'Please sign in again.',
          401,
        );
      }
    }

    check();
    try {
      if (_accessToken == null ||
          (_accessExpiresAt?.isBefore(
                DateTime.now().add(const Duration(seconds: 30)),
              ) ??
              true)) {
        await _refresh();
      }
      check();
      final result = await operation(_accessToken!);
      check();
      return result;
    } on CustomerApiException catch (error) {
      if (error.status != 401 || epoch != _epoch || _disposed) rethrow;
      try {
        await _refresh();
        check();
        final result = await operation(_accessToken!);
        check();
        return result;
      } on CustomerApiException catch (retry) {
        if ((retry.status == 401 || retry.status == 403) &&
            epoch == _epoch &&
            !_disposed) {
          ++_epoch;
          await _clear();
          stage = CustomerStage.authentication;
          _notify();
        }
        rethrow;
      }
    }
  }

  Future<Map<String, dynamic>> authorized(
    String path, {
    String method = 'GET',
    Map<String, dynamic>? body,
  }) => withAccess(
    (token) => api.request(path, method: method, body: body, token: token),
  );

  Future<Map<String, dynamic>> authorizedUpload(
    String path,
    Uint8List bytes,
    String mime,
  ) => withAccess((token) {
    if (api case final CustomerMediaApi media) {
      return media.upload(path, bytes, mime, token);
    }
    throw const CustomerApiException(
      'UPLOAD_UNAVAILABLE',
      'Photo upload is unavailable on this device.',
    );
  });
  Future<Uint8List> authorizedDownload(String path) => withAccess((token) {
    if (api case final CustomerMediaApi media) {
      return media.download(path, token);
    }
    throw const CustomerApiException(
      'DOWNLOAD_UNAVAILABLE',
      'Download is unavailable on this device.',
    );
  });

  Future<void> loadProfile() async {
    final epoch = _epoch;
    _profileRequests++;
    profileLoading = true;
    _notify();
    try {
      final result = await authorized('/me');
      if (!_disposed && epoch == _epoch) {
        profile = CustomerProfile.fromJson(result);
      }
    } finally {
      if (!_disposed && epoch == _epoch) {
        _profileRequests--;
        profileLoading = _profileRequests > 0;
        _notify();
      }
    }
  }

  Future<void> updateProfile({String? name, bool? notifications}) async {
    await authorized(
      '/me',
      method: 'PATCH',
      body: {
        if (name != null) 'displayName': name.trim(),
        'notifications': ?notifications,
      },
    );
    await loadProfile();
  }

  Future<void> signOut({bool all = false}) async {
    try {
      await authorized(
        all ? '/auth/logout-all' : '/auth/logout',
        method: 'POST',
      );
    } finally {
      ++_epoch;
      await _clear();
      await identity.signOut();
      stage = CustomerStage.authentication;
      _notify();
    }
  }

  Future<void> deleteAccount({String? password, String? provider}) async {
    final credential = provider != null
        ? await identity.authenticate(provider, api)
        : <String, dynamic>{};
    await authorized(
      '/me',
      method: 'DELETE',
      body: {'confirmation': 'DELETE', 'password': ?password, ...credential}
        ..remove('displayName'),
    );
    ++_epoch;
    await _clear();
    await identity.signOut();
    stage = CustomerStage.authentication;
    _notify();
  }

  Future<void> _clear() async {
    _profileRequests = 0;
    profileLoading = false;
    _accessToken = null;
    _refreshToken = null;
    _accessExpiresAt = null;
    profile = null;
    await _persist(null);
  }

  Future<void> _persist(String? token, {int? epoch}) {
    final operation = (_storageTail ?? Future<void>.value())
        .catchError((_) {})
        .then((_) async {
          if (epoch != null && (epoch != _epoch || _disposed)) {
            return;
          }
          if (token == null) {
            await store.clearRefreshToken();
          } else {
            await store.saveRefreshToken(token);
          }
        });
    _storageTail = operation;
    return operation;
  }

  @override
  void dispose() {
    _disposed = true;
    ++_epoch;
    super.dispose();
  }
}
