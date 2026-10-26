import 'dart:async';
import 'dart:convert';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:uuid/uuid.dart';
import '../auth/customer_api.dart';
import '../auth/customer_controller.dart';
import 'customer_public_links.dart';

abstract interface class CustomerPush {
  Future<bool> configured();
  Future<bool> enable({
    required bool requestPermission,
    required Future<void> Function(String) onToken,
    required void Function() onNotification,
    required void Function() onOpened,
  });
  Future<void> disable();
}

class NativeCustomerPush implements CustomerPush {
  FirebaseOptions? options;
  bool loaded = false, started = false;
  StreamSubscription<String>? tokens;
  StreamSubscription<RemoteMessage>? foreground, opened;
  @override
  Future<bool> configured() async {
    if (kIsWeb ||
        ![
          TargetPlatform.android,
          TargetPlatform.iOS,
        ].contains(defaultTargetPlatform)) {
      return false;
    }
    if (!loaded) {
      loaded = true;
      try {
        final data =
            jsonDecode(
                  await rootBundle.loadString('assets/config/production.json'),
                )
                as Map;
        final item =
            (data['firebase'] as Map?)?[defaultTargetPlatform ==
                        TargetPlatform.android
                    ? 'android'
                    : 'ios']
                as Map?;
        if (item != null &&
            ['apiKey', 'appId', 'messagingSenderId', 'projectId'].every(
              (key) =>
                  item[key] is String &&
                  (item[key] as String).trim().isNotEmpty,
            )) {
          options = FirebaseOptions(
            apiKey: item['apiKey'] as String,
            appId: item['appId'] as String,
            messagingSenderId: item['messagingSenderId'] as String,
            projectId: item['projectId'] as String,
            iosBundleId: item['iosBundleId'] as String?,
          );
        }
      } catch (_) {
        /* No Firebase project is bundled until configuration. */
      }
    }
    return options != null;
  }

  @override
  Future<bool> enable({
    required bool requestPermission,
    required Future<void> Function(String) onToken,
    required void Function() onNotification,
    required void Function() onOpened,
  }) async {
    if (!await configured()) return false;
    if (Firebase.apps.isEmpty) await Firebase.initializeApp(options: options);
    final messaging = FirebaseMessaging.instance;
    final settings = requestPermission
        ? await messaging.requestPermission(
            alert: true,
            sound: true,
            badge: true,
          )
        : await messaging.getNotificationSettings();
    if (![
      AuthorizationStatus.authorized,
      AuthorizationStatus.provisional,
    ].contains(settings.authorizationStatus)) {
      return false;
    }
    await messaging.setAutoInitEnabled(true);
    started = true;
    if (defaultTargetPlatform == TargetPlatform.iOS &&
        await messaging.getAPNSToken() == null) {
      throw const CustomerApiException(
        'PUSH_APNS_PENDING',
        'Phone alerts are waiting for Apple registration. Check your notification settings and try again.',
      );
    }
    await tokens?.cancel();
    await foreground?.cancel();
    await opened?.cancel();
    final registered = Completer<void>();
    tokens = messaging.onRegistered.listen(
      (value) async {
        if (!started) return;
        try {
          await onToken(value);
          if (!registered.isCompleted) registered.complete();
        } catch (error, stack) {
          if (!registered.isCompleted) registered.completeError(error, stack);
        }
      },
      onError: (Object error, StackTrace stack) {
        if (!registered.isCompleted) registered.completeError(error, stack);
      },
    );
    // Attach the error handler before native registration can emit an event.
    final registration = registered.future.timeout(const Duration(seconds: 25));
    unawaited(registration.catchError((Object _) {}));
    await messaging.register();
    await registration;
    foreground = FirebaseMessaging.onMessage.listen((_) => onNotification());
    opened = FirebaseMessaging.onMessageOpenedApp.listen((_) => onOpened());
    if (await messaging.getInitialMessage() != null) onOpened();
    return true;
  }

  @override
  Future<void> disable() async {
    await tokens?.cancel();
    await foreground?.cancel();
    await opened?.cancel();
    tokens = null;
    foreground = opened = null;
    if (started) {
      started = false;
      try {
        await FirebaseMessaging.instance.setAutoInitEnabled(false);
        await FirebaseMessaging.instance.unregister();
      } catch (_) {}
    }
  }
}

class CustomerPushRegistration {
  final CustomerController auth;
  final CustomerPush push;
  final void Function()? onNotification;
  final void Function()? onOpened;
  bool disposed = false;
  CustomerPushRegistration(
    this.auth,
    this.push, {
    this.onNotification,
    this.onOpened,
  });
  Future<void> enable({
    required bool requestPermission,
    required void Function() onNotification,
  }) async {
    final owner = auth.profile?.id;
    if (disposed || owner == null) return;
    final config = await CustomerPublicLinks.load(auth.api);
    if (config['pushAvailable'] != true) {
      throw const CustomerApiException(
        'PUSH_UNAVAILABLE',
        'Phone alerts have not been configured yet. Your in-app inbox remains available.',
      );
    }
    final prefs = await SharedPreferences.getInstance();
    var id = prefs.getString('selfx-push-installation');
    id ??= const Uuid().v4();
    await prefs.setString('selfx-push-installation', id);
    final installationId = id;
    if (disposed ||
        auth.profile?.id != owner ||
        auth.stage != CustomerStage.ready) {
      return;
    }
    try {
      final allowed = await push.enable(
        requestPermission: requestPermission,
        onNotification: () {
          if (!disposed &&
              auth.stage == CustomerStage.ready &&
              auth.profile?.id == owner) {
            this.onNotification?.call();
            onNotification();
          }
        },
        onOpened: () {
          if (!disposed &&
              auth.stage == CustomerStage.ready &&
              auth.profile?.id == owner) {
            onOpened?.call();
          }
        },
        onToken: (token) async {
          if (disposed ||
              auth.profile?.id != owner ||
              auth.stage != CustomerStage.ready) {
            return;
          }
          await auth.authorized(
            '/push-devices',
            method: 'POST',
            body: {
              'installationId': installationId,
              'token': token,
              'platform': defaultTargetPlatform == TargetPlatform.iOS
                  ? 'IOS'
                  : 'ANDROID',
            },
          );
        },
      );
      if (disposed ||
          auth.profile?.id != owner ||
          auth.stage != CustomerStage.ready) {
        await push.disable();
        return;
      }
      if (!allowed) {
        throw const CustomerApiException(
          'PUSH_PERMISSION',
          'Allow SelfX notifications in your device settings to receive phone alerts. In-app notifications remain available.',
        );
      }
    } catch (_) {
      await push.disable();
      rethrow;
    }
  }

  Future<void> dispose() async {
    disposed = true;
    await push.disable();
  }
}
