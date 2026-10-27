import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:selfx_customer/src/config/customer_firebase_config.dart';

class FirebaseConfigAssets extends CachingAssetBundle {
  final Map<String, dynamic> data;
  FirebaseConfigAssets(this.data);
  @override
  Future<ByteData> load(String key) async =>
      ByteData.sublistView(Uint8List.fromList(utf8.encode(jsonEncode(data))));
}

const native = FirebaseOptions(
  apiKey: 'synthetic-api-key',
  appId: '1:123:android:abc',
  messagingSenderId: '123',
  projectId: 'selfx-test',
);
Map<String, dynamic> get explicit => {
  'firebase': {
    'android': {
      'apiKey': native.apiKey,
      'appId': native.appId,
      'messagingSenderId': native.messagingSenderId,
      'projectId': native.projectId,
    },
  },
};

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test(
    'downloaded Android settings match the installed package and native build wiring',
    () {
      final data =
          jsonDecode(
                File('android/app/google-services.json').readAsStringSync(),
              )
              as Map;
      final clients = (data['client'] as List).cast<Map>().where(
        (client) =>
            (client['client_info']
                as Map)['android_client_info']['package_name'] ==
            'com.selfx.selfx_customer',
      );
      expect(clients.length, 1);
      expect(clients.single['client_info']['mobilesdk_app_id'], isNotEmpty);
      expect(data['project_info']['project_id'], isNotEmpty);
      expect(data['project_info']['project_number'], isNotEmpty);
      expect(clients.single['api_key'][0]['current_key'], isNotEmpty);
      expect(
        File('android/app/build.gradle.kts').readAsStringSync(),
        contains('id("com.google.gms.google-services")'),
      );
      final manifest = File(
        'android/app/src/main/AndroidManifest.xml',
      ).readAsStringSync();
      expect(
        manifest,
        contains(
          'android:name="firebase_messaging_auto_init_enabled" android:value="false"',
        ),
      );
      expect(
        manifest,
        contains(
          'android:name="firebase_analytics_collection_enabled" android:value="false"',
        ),
      );
    },
  );
  test(
    'native settings fill the missing Dart Firebase section, with one concurrent load',
    () async {
      final source = Completer<FirebaseOptions?>();
      var loads = 0;
      final config = CustomerFirebaseConfiguration(
        assets: FirebaseConfigAssets({'apiBaseUrl': 'https://example.test'}),
        nativeOptions: () {
          loads++;
          return source.future;
        },
        platform: TargetPlatform.android,
        web: false,
      );
      final first = config.configured(), second = config.configured();
      await Future<void>.delayed(Duration.zero);
      expect(loads, 1);
      source.complete(native);
      expect(await first, true);
      expect(await second, true);
      expect(config.options, native);
      expect(config.matches(native), true);
      expect(
        config.matches(
          const FirebaseOptions(
            apiKey: 'synthetic-api-key',
            appId: '1:123:android:other',
            messagingSenderId: '123',
            projectId: 'selfx-test',
          ),
        ),
        false,
      );
    },
  );
  test(
    'valid explicit configuration is kept and never replaced by native settings',
    () async {
      var nativeLoads = 0;
      final config = CustomerFirebaseConfiguration(
        assets: FirebaseConfigAssets(explicit),
        nativeOptions: () async {
          nativeLoads++;
          return null;
        },
        platform: TargetPlatform.android,
        web: false,
      );
      expect(await config.configured(), true);
      expect(config.options!.projectId, native.projectId);
      expect(nativeLoads, 0);
    },
  );
  test(
    'bad explicit settings fail closed rather than silently falling back to another project',
    () async {
      for (final bad in [
        <String, dynamic>{},
        {
          'apiKey': 'PUBLIC_FIREBASE_API_KEY',
          'appId': 'x',
          'projectId': 'YOUR_PROJECT',
          'messagingSenderId': 'x',
        },
        'invalid',
      ]) {
        var nativeLoads = 0;
        final config = CustomerFirebaseConfiguration(
          assets: FirebaseConfigAssets({
            'firebase': {'android': bad},
          }),
          nativeOptions: () async {
            nativeLoads++;
            return native;
          },
          platform: TargetPlatform.android,
          web: false,
        );
        expect(await config.configured(), false);
        expect(nativeLoads, 0);
      }
    },
  );
  test(
    'missing native settings keep services disabled without crashing',
    () async {
      final config = CustomerFirebaseConfiguration(
        assets: FirebaseConfigAssets({}),
        nativeOptions: () async =>
            throw PlatformException(code: 'missing-native-config'),
        platform: TargetPlatform.android,
        web: false,
      );
      expect(await config.configured(), false);
      expect(config.options, isNull);
    },
  );
  test(
    'iOS uses its own options and unsupported platforms never initialize Firebase',
    () async {
      final ios = CustomerFirebaseConfiguration(
        assets: FirebaseConfigAssets(explicit),
        nativeOptions: () async => null,
        platform: TargetPlatform.iOS,
        web: false,
      );
      expect(await ios.configured(), false);
      for (final platform in [
        TargetPlatform.windows,
        TargetPlatform.linux,
        TargetPlatform.macOS,
      ]) {
        final config = CustomerFirebaseConfiguration(
          assets: FirebaseConfigAssets({}),
          nativeOptions: () => throw StateError('Must not load'),
          platform: platform,
          web: false,
        );
        expect(await config.configured(), false);
      }
      final web = CustomerFirebaseConfiguration(
        assets: FirebaseConfigAssets(explicit),
        nativeOptions: () => throw StateError('Must not load'),
        platform: TargetPlatform.android,
        web: true,
      );
      expect(await web.configured(), false);
    },
  );
}
