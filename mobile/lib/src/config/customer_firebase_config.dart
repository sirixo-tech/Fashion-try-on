import 'dart:convert';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

class CustomerFirebaseConfiguration {
  final AssetBundle assets;
  final Future<FirebaseOptions?> Function() _nativeOptions;
  final TargetPlatform? platform;
  final bool? web;
  FirebaseOptions? options;
  Future<bool>? _loading;
  CustomerFirebaseConfiguration({
    AssetBundle? assets,
    Future<FirebaseOptions?> Function()? nativeOptions,
    this.platform,
    this.web,
  }) : assets = assets ?? rootBundle,
       _nativeOptions = nativeOptions ?? _readNativeOptions;

  // Android resolves the resources generated from google-services.json. Apple
  // uses its registered GoogleService-Info.plist when that platform is set up.
  // Collection and messaging auto-init remain disabled by native configuration.
  static Future<FirebaseOptions?> _readNativeOptions() async =>
      (await Firebase.initializeApp()).options;

  Future<bool> configured() => _loading ??= _load();
  Future<bool> _load() async {
    final target = platform ?? defaultTargetPlatform;
    if ((web ?? kIsWeb) ||
        ![TargetPlatform.android, TargetPlatform.iOS].contains(target)) {
      return false;
    }
    try {
      Map? data;
      try {
        data =
            jsonDecode(await assets.loadString('assets/config/production.json'))
                as Map;
      } catch (_) {
        // A native Firebase configuration does not need duplicated Dart options.
      }
      final firebase = data?['firebase'];
      if (firebase != null && firebase is! Map) return false;
      final item =
          (firebase as Map?)?[target == TargetPlatform.android
              ? 'android'
              : 'ios'];
      if (item != null) {
        // An explicit but invalid override fails closed rather than silently
        // selecting another project from the native resources.
        if (item is! Map ||
            ![
              'apiKey',
              'appId',
              'messagingSenderId',
              'projectId',
            ].every((key) => _value(item[key]))) {
          return false;
        }
        options = FirebaseOptions(
          apiKey: (item['apiKey'] as String).trim(),
          appId: (item['appId'] as String).trim(),
          messagingSenderId: (item['messagingSenderId'] as String).trim(),
          projectId: (item['projectId'] as String).trim(),
          iosBundleId: item['iosBundleId'] as String?,
        );
      } else {
        options = await _nativeOptions();
      }
      final selected = options;
      if (selected == null ||
          ![
            selected.apiKey,
            selected.appId,
            selected.messagingSenderId,
            selected.projectId,
          ].every(_value)) {
        options = null;
      }
    } catch (_) {
      // Missing native settings or an unsupported SDK remains unavailable.
      options = null;
    }
    return options != null;
  }

  static bool _value(Object? value) =>
      value is String &&
      value.trim().isNotEmpty &&
      !RegExp(
        r'^(PUBLIC_|YOUR_|REPLACE_)',
        caseSensitive: false,
      ).hasMatch(value.trim());

  bool matches(FirebaseOptions other) =>
      options != null &&
      options!.projectId == other.projectId &&
      options!.appId == other.appId &&
      options!.messagingSenderId == other.messagingSenderId;

  Future<FirebaseApp> initializeDefaultApp() async {
    if (!await configured()) {
      throw FirebaseException(plugin: 'selfx', code: 'firebase-not-configured');
    }
    final app = await Firebase.initializeApp(options: options);
    if (!matches(app.options)) {
      throw FirebaseException(
        plugin: 'selfx',
        code: 'firebase-project-mismatch',
      );
    }
    return app;
  }
}
