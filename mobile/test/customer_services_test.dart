import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:selfx_customer/src/auth/customer_controller.dart';
import 'package:selfx_customer/src/experience/customer_experience.dart';
import 'package:selfx_customer/src/services/customer_public_links.dart';
import 'package:selfx_customer/src/services/customer_push.dart';
import 'package:selfx_customer/src/ui/customer_service_screens.dart';
import 'fakes.dart';

class PreparedPush implements CustomerPush {
  final bool available;
  PreparedPush({this.available = false});
  int starts = 0, stops = 0;
  @override
  Future<bool> configured() async => available;
  @override
  Future<bool> enable({
    required bool requestPermission,
    required Future<void> Function(String) onToken,
    required void Function() onNotification,
    required void Function() onOpened,
  }) async {
    starts++;
    return false;
  }

  @override
  Future<void> disable() async {
    stops++;
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late FakeCustomerApi api;
  late CustomerController auth;
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    api = FakeCustomerApi();
    auth = CustomerController(
      api: api,
      store: MemorySessionStore(),
      identity: FakeIdentity(),
    );
    await auth.initialize();
    await auth.signIn('test@example.invalid', 'synthetic-password');
  });
  tearDown(() {
    auth.dispose();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(customerDeviceChannel, null);
  });
  test(
    'official links work without build flags and unsafe remote links are ignored',
    () async {
      api.handler = (path, method, body) async => {
        'termsUrl': 'javascript:bad()',
        'privacyUrl': 'https://user:pass@example.test/privacy',
        'supportUrl': 'http://example.test',
        'supportEmail': 'bad\naddress',
      };
      final links = await CustomerPublicLinks.load(api);
      expect(links['termsUrl'], endsWith('/terms'));
      expect(links['privacyUrl'], CustomerPublicLinks.privacy);
      expect(links['supportEmail'], 'sirixollc@gmail.com');
      expect(links['pushAvailable'], false);
    },
  );
  test('missing Firebase delivery never initializes phone alerts', () async {
    final push = PreparedPush();
    final registration = CustomerPushRegistration(auth, push);
    await expectLater(
      registration.enable(requestPermission: true, onNotification: () {}),
      throwsA(isA<Exception>()),
    );
    expect(push.starts, 0);
    await registration.dispose();
  });
  for (final serverReady in [false, true]) {
    testWidgets(
      'phone-alert messaging distinguishes server readiness from missing app settings ($serverReady)',
      (tester) async {
        api.handler = (path, method, body) async => path == '/app/config'
            ? {'pushAvailable': serverReady}
            : {'data': []};
        final push = PreparedPush();
        final registration = CustomerPushRegistration(auth, push);
        final experience = CustomerExperience(auth);
        addTearDown(registration.dispose);
        addTearDown(experience.dispose);
        await tester.pumpWidget(
          MaterialApp(
            home: CustomerNotificationsScreen(
              auth: auth,
              experience: experience,
              registration: registration,
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(
          tester.widget<SwitchListTile>(find.byType(SwitchListTile)).onChanged,
          isNull,
        );
        expect(
          find.text(
            serverReady
                ? 'Phone alerts are not configured in this build. Your in-app inbox works independently.'
                : 'Phone alerts have not been configured yet. Your in-app inbox remains available.',
          ),
          findsOneWidget,
        );
        expect(push.starts, 0);
      },
    );
  }
  testWidgets(
    'notification refresh recognizes newly enabled server delivery without requesting permission',
    (tester) async {
      var serverReady = false;
      api.handler = (path, method, body) async =>
          path == '/app/config' ? {'pushAvailable': serverReady} : {'data': []};
      final push = PreparedPush(available: true);
      final registration = CustomerPushRegistration(auth, push);
      final experience = CustomerExperience(auth);
      addTearDown(registration.dispose);
      addTearDown(experience.dispose);
      await tester.pumpWidget(
        MaterialApp(
          home: CustomerNotificationsScreen(
            auth: auth,
            experience: experience,
            registration: registration,
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(
        tester.widget<SwitchListTile>(find.byType(SwitchListTile)).onChanged,
        isNull,
      );
      serverReady = true;
      await tester.tap(find.byTooltip('Refresh notifications'));
      await tester.pumpAndSettle();
      expect(
        tester.widget<SwitchListTile>(find.byType(SwitchListTile)).onChanged,
        isNotNull,
      );
      expect(push.starts, 0);
    },
  );
  testWidgets('support shows the known contact and a copy fallback', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(home: CustomerSupportScreen(auth: auth)),
    );
    await tester.pumpAndSettle();
    expect(find.text('sirixollc@gmail.com'), findsOneWidget);
    String? copied;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(SystemChannels.platform, (call) async {
          if (call.method == 'Clipboard.setData') {
            copied = (call.arguments as Map)['text'] as String;
          }
          return null;
        });
    await tester.runAsync(() async {
      await tester.tap(find.text('Copy email address'));
      await Future<void>.delayed(const Duration(milliseconds: 10));
    });
    await tester.pumpAndSettle();
    expect(copied, 'sirixollc@gmail.com');
    expect(find.text('Support email copied.'), findsOneWidget);
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(SystemChannels.platform, null);
  });
  testWidgets('inbox works while unconfigured phone alerts remain disabled', (
    tester,
  ) async {
    api.handler = (path, method, body) async =>
        path.startsWith('/notifications')
        ? {
            'data': [
              {
                'id': 'event',
                'runId': 'run',
                'title': 'Your look is ready',
                'body': 'Open your saved Try-On.',
                'readAt': null,
              },
            ],
            'nextCursor': null,
          }
        : {};
    final exp = CustomerExperience(auth);
    final registration = CustomerPushRegistration(auth, PreparedPush());
    await tester.pumpWidget(
      MaterialApp(
        home: CustomerNotificationsScreen(
          auth: auth,
          experience: exp,
          registration: registration,
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Your look is ready'), findsOneWidget);
    expect(
      tester.widget<SwitchListTile>(find.byType(SwitchListTile)).onChanged,
      isNull,
    );
    expect(
      api.calls.where((c) => c.path.startsWith('/notifications')).single.token,
      'synthetic-access',
    );
    await tester.pumpWidget(const SizedBox());
    exp.dispose();
    await registration.dispose();
  });
  const installed = {
    'versionCode': 3,
    'versionName': '0.3.0',
    'architecture': 'ARM64',
    'sdk': 35,
    'packageName': 'com.selfx.selfx_customer',
    'signerSha256': 'trusted',
  };
  for (final mismatch in [false, true]) {
    testWidgets(
      'updates ${mismatch ? 'reject a different signing key' : 'offer a compatible newer release'}',
      (tester) async {
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
            .setMockMethodCallHandler(
              customerDeviceChannel,
              (call) async => installed,
            );
        api.handler = (path, method, body) async => {
          'update': {
            'id': 'release',
            'versionCode': 4,
            'versionName': '0.3.1',
            'packageName': installed['packageName'],
            'signerSha256': mismatch ? 'other-key' : 'trusted',
            'releaseNotes': 'New improvements',
          },
        };
        await tester.pumpWidget(
          MaterialApp(home: CustomerUpdatesScreen(auth: auth)),
        );
        await tester.pumpAndSettle();
        expect(
          find.text('Download update'),
          mismatch ? findsNothing : findsOneWidget,
        );
        expect(
          find.textContaining('signing key'),
          mismatch ? findsOneWidget : findsNothing,
        );
      },
    );
  }
  testWidgets('a failed update check does not claim the app is current', (
    tester,
  ) async {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
          customerDeviceChannel,
          (call) async => installed,
        );
    api.handler = (path, method, body) async => throw Exception('offline');
    await tester.pumpWidget(
      MaterialApp(home: CustomerUpdatesScreen(auth: auth)),
    );
    await tester.pumpAndSettle();
    expect(find.textContaining('No newer compatible'), findsNothing);
    expect(find.text('Download update'), findsNothing);
    expect(find.text('Check for updates'), findsOneWidget);
  });
}
