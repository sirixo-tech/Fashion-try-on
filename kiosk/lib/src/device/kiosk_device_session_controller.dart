import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';

import 'kiosk_device_gateway.dart';
import 'kiosk_device_models.dart';
import 'kiosk_device_storage.dart';

enum KioskStartupState {
  checking,
  pairing,
  waitingForPairing,
  restoring,
  active,
  networkUnavailable,
  error,
}

class KioskDeviceSessionController extends ChangeNotifier {
  KioskDeviceSessionController({
    required this.gateway,
    required this.store,
    this.platform,
    this.appVersion = '1.0.0',
  });

  final KioskDeviceGateway gateway;
  final KioskDeviceCredentialStore store;
  final String? platform;
  final String appVersion;

  KioskStartupState state = KioskStartupState.checking;
  KioskPairingSession? pairingSession;
  KioskDeviceIdentity? device;
  String? accessToken;
  DateTime? accessTokenExpiresAt;
  String? message;
  Duration? serverClockOffset;

  Timer? _pollTimer;
  Timer? _heartbeatTimer;
  Future<KioskDeviceCredentials>? _refreshInFlight;
  bool _disposed = false;

  String get platformLabel =>
      platform ??
      (Platform.isAndroid
          ? 'android'
          : Platform.isWindows
          ? 'windows'
          : 'flutter');

  Future<void> start() async {
    state = KioskStartupState.checking;
    notifyListeners();
    final refreshToken = await store.readRefreshToken();
    if (refreshToken == null || refreshToken.isEmpty) {
      await requestPairingSession();
      return;
    }
    await restore(refreshToken);
  }

  Future<void> restore(String refreshToken) async {
    state = KioskStartupState.restoring;
    notifyListeners();
    try {
      final credentials = await _refreshWithCredential(refreshToken);
      await _applyCredentials(credentials);
    } on TimeoutException catch (_) {
      _recoverableNetwork();
    } on SocketException catch (_) {
      _recoverableNetwork();
    } on KioskDeviceException catch (error) {
      if (_isTerminalRefreshFailure(error)) {
        await clearAndPair();
      } else {
        _fail(error.message);
      }
    } catch (_) {
      _fail('SelfX kiosk session could not be restored.');
    }
  }

  Future<void> requestPairingSession() async {
    _pollTimer?.cancel();
    state = KioskStartupState.pairing;
    notifyListeners();
    try {
      final session = await gateway.createPairingSession(
        installationId: await store.installationId(),
        platform: platformLabel,
        appVersion: appVersion,
      );
      pairingSession = session;
      serverClockOffset = session.serverTime.difference(DateTime.now());
      state = KioskStartupState.waitingForPairing;
      message = null;
      notifyListeners();
      _beginPolling(session);
    } on TimeoutException catch (_) {
      _recoverableNetwork();
    } on SocketException catch (_) {
      _recoverableNetwork();
    } on KioskDeviceException catch (error) {
      _fail(error.message);
    } catch (_) {
      _fail('SelfX could not create a pairing code.');
    }
  }

  Future<void> pollNow() async {
    final session = pairingSession;
    if (session == null) {
      await requestPairingSession();
      return;
    }
    await _poll(session);
  }

  Future<void> heartbeat() async {
    try {
      device = await withDeviceAccess(
        (token) => gateway.heartbeat(
          accessToken: token,
          platform: platformLabel,
          appVersion: appVersion,
        ),
      );
      notifyListeners();
    } on KioskDeviceException catch (error) {
      if (error.isTerminalDeviceState) {
        await clearAndPair();
      }
    } catch (_) {
      // Heartbeat is best-effort; startup restoration handles longer outages.
    }
  }

  Future<String> requireAccessToken({bool forceRefresh = false}) async {
    final token = accessToken;
    if (!forceRefresh && token != null && token.trim().isNotEmpty) {
      final expiresAt = accessTokenExpiresAt;
      if (expiresAt == null ||
          expiresAt.difference(DateTime.now()) > const Duration(minutes: 1)) {
        return token;
      }
    }

    final refreshToken = await store.readRefreshToken();
    if (refreshToken == null || refreshToken.isEmpty) {
      debugPrint('DEVICE_ACCESS_TOKEN_MISSING');
      debugPrint('DEVICE_REFRESH_AVAILABLE=false');
      await clearAndPair();
      throw const KioskDeviceException(
        'DEVICE_UNPAIRED',
        'Kiosk device is not paired.',
      );
    }

    debugPrint('DEVICE_REFRESH_AVAILABLE=true');
    final credentials = await _refreshFromStoredCredential(refreshToken);
    await _applyCredentials(credentials, restartHeartbeat: false);
    final refreshed = accessToken;
    if (state == KioskStartupState.active &&
        refreshed != null &&
        refreshed.trim().isNotEmpty) {
      debugPrint('DEVICE_SESSION_RESTORED');
      return refreshed;
    }
    debugPrint('DEVICE_REFRESH_FAILED code=DEVICE_SESSION_UNAVAILABLE');
    throw KioskDeviceException(
      'DEVICE_SESSION_UNAVAILABLE',
      message ?? 'SelfX kiosk session is not active.',
    );
  }

  Future<T> withDeviceAccess<T>(
    Future<T> Function(String accessToken) request,
  ) async {
    final token = await requireAccessToken();
    try {
      return await request(token);
    } on KioskDeviceException catch (error) {
      if (error.isRefreshableAccessToken) {
        final refreshedToken = await requireAccessToken(forceRefresh: true);
        return request(refreshedToken);
      }
      if (error.isTerminalDeviceState) {
        await clearAndPair();
      }
      rethrow;
    }
  }

  Future<void> handleDeviceAuthRejected([KioskDeviceException? error]) async {
    if (error == null || error.isTerminalDeviceState) {
      await clearAndPair();
    }
  }

  Future<void> clearAndPair() async {
    await store.clearRefreshToken();
    accessToken = null;
    accessTokenExpiresAt = null;
    device = null;
    _heartbeatTimer?.cancel();
    _heartbeatTimer = null;
    await requestPairingSession();
  }

  void _beginPolling(KioskPairingSession session) {
    _pollTimer?.cancel();
    _pollTimer = Timer.periodic(
      Duration(seconds: session.pollIntervalSeconds.clamp(2, 5).toInt()),
      (_) => unawaited(_poll(session)),
    );
    unawaited(_poll(session));
  }

  Future<void> _poll(KioskPairingSession session) async {
    if (remainingFor(session) <= Duration.zero) {
      await requestPairingSession();
      return;
    }
    try {
      final status = await gateway.getPairingStatus(
        sessionId: session.pairingSessionId,
        provisioningSecret: session.provisioningSecret,
      );
      serverClockOffset = status.serverTime.difference(DateTime.now());
      if (status.status == KioskProvisioningStatus.expired) {
        await requestPairingSession();
        return;
      }
      if (status.status == KioskProvisioningStatus.paired &&
          status.provisioningGrant != null) {
        _pollTimer?.cancel();
        final credentials = await gateway.exchangeProvisioningGrant(
          pairingSessionId: session.pairingSessionId,
          provisioningSecret: session.provisioningSecret,
          provisioningGrant: status.provisioningGrant!,
        );
        await _applyCredentials(credentials);
      }
    } on TimeoutException catch (_) {
      message = 'Waiting for SelfX connection...';
      notifyListeners();
    } on SocketException catch (_) {
      message = 'Waiting for SelfX connection...';
      notifyListeners();
    } on KioskDeviceException catch (error) {
      message = error.message;
      notifyListeners();
    }
  }

  Duration remainingFor(KioskPairingSession session) {
    final serverNow = DateTime.now().add(serverClockOffset ?? Duration.zero);
    return session.expiresAt.difference(serverNow);
  }

  double progressFor(KioskPairingSession session) {
    final remaining = remainingFor(session);
    if (remaining <= Duration.zero) {
      return 0;
    }
    return (remaining.inMilliseconds / (session.ttlSeconds * 1000)).clamp(0, 1);
  }

  Future<void> _applyCredentials(
    KioskDeviceCredentials credentials, {
    bool restartHeartbeat = true,
  }) async {
    await store.writeRefreshToken(credentials.refreshToken);
    accessToken = credentials.accessToken;
    accessTokenExpiresAt = credentials.accessTokenExpiresAt;
    device = credentials.device;
    pairingSession = null;
    state = KioskStartupState.active;
    message = null;
    notifyListeners();
    if (!restartHeartbeat) {
      return;
    }
    _heartbeatTimer?.cancel();
    _heartbeatTimer = Timer.periodic(
      const Duration(seconds: 60),
      (_) => unawaited(heartbeat()),
    );
    unawaited(heartbeat());
  }

  Future<KioskDeviceCredentials> _refreshFromStoredCredential(
    String refreshToken,
  ) async {
    try {
      debugPrint('DEVICE_ACCESS_REFRESH_STARTED');
      final credentials = await _refreshWithCredential(refreshToken);
      debugPrint('DEVICE_ACCESS_REFRESH_SUCCEEDED');
      return credentials;
    } on KioskDeviceException catch (error) {
      debugPrint('DEVICE_ACCESS_REFRESH_FAILED code=${error.code}');
      if (_isTerminalRefreshFailure(error)) {
        await clearAndPair();
      }
      rethrow;
    } catch (_) {
      debugPrint('DEVICE_ACCESS_REFRESH_FAILED');
      rethrow;
    }
  }

  Future<KioskDeviceCredentials> _refreshWithCredential(String refreshToken) {
    final current = _refreshInFlight;
    if (current != null) {
      return current;
    }
    late final Future<KioskDeviceCredentials> next;
    next = gateway.refreshSession(refreshToken).whenComplete(() {
      if (_refreshInFlight == next) {
        _refreshInFlight = null;
      }
    });
    _refreshInFlight = next;
    return next;
  }

  bool _isTerminalRefreshFailure(KioskDeviceException error) {
    return error.isTerminalDeviceState || error.code == 'DEVICE_TOKEN_INVALID';
  }

  void _recoverableNetwork() {
    state = KioskStartupState.networkUnavailable;
    message = 'SelfX is unreachable. Check the connection and retry.';
    notifyListeners();
  }

  void _fail(String nextMessage) {
    state = KioskStartupState.error;
    message = nextMessage;
    notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    _pollTimer?.cancel();
    _heartbeatTimer?.cancel();
    super.dispose();
  }

  @override
  void notifyListeners() {
    if (!_disposed) {
      super.notifyListeners();
    }
  }
}
