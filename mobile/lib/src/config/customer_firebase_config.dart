import 'dart:convert';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

class CustomerFirebaseConfiguration {
  FirebaseOptions? options;
  bool loaded = false;
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
}
