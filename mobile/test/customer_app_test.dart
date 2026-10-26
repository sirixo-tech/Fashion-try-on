import 'dart:io';
import 'dart:async';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:selfx_customer/src/auth/customer_api.dart';
import 'package:selfx_customer/src/auth/customer_controller.dart';
import 'package:selfx_customer/src/customer_app.dart';
import 'package:selfx_customer/src/ui/customer_skeleton.dart';
import 'package:selfx_customer/src/ui/customer_theme.dart';
import 'fakes.dart';

void main() {
  setUpAll(() async {
    if (!const bool.fromEnvironment('CUSTOMER_REVIEW')) {
      return;
    }
    final sdk = Platform.environment['FLUTTER_ROOT'];
    if (sdk == null) {
      throw StateError('FLUTTER_ROOT is required for rendered reviews');
    }
    Future<void> font(String family, List<String> files) async {
      final loader = FontLoader(family);
      for (final file in files) {
        loader.addFont(
          File(file).readAsBytes().then((bytes) => ByteData.sublistView(bytes)),
        );
      }
      await loader.load();
    }

    final fonts = '$sdk/bin/cache/artifacts/material_fonts';
    await font('Roboto', [
      '$fonts/roboto-regular.ttf',
      '$fonts/roboto-bold.ttf',
    ]);
    await font('MaterialIcons', ['$fonts/materialicons-regular.otf']);
    if (Platform.isWindows) {
      await font('serif', [
        '${Platform.environment['WINDIR']}/Fonts/georgia.ttf',
      ]);
    }
  });
  late FakeCustomerApi api;
  late MemorySessionStore store;
  late CustomerController controller;
  setUp(() {
    api = FakeCustomerApi();
    store = MemorySessionStore();
    controller = CustomerController(
      api: api,
      store: store,
      identity: FakeIdentity(),
    );
  });
  tearDown(() => controller.dispose());
  Future<void> mount(
    WidgetTester tester, {
    Size size = const Size(390, 844),
  }) async {
    tester.view.physicalSize = size;
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(CustomerApp(controller: controller));
    await controller.initialize();
    await tester.pumpAndSettle();
  }

  Future<void> tap(WidgetTester tester, Finder finder) async {
    if (finder.evaluate().isEmpty) {
      await tester.scrollUntilVisible(
        finder,
        220,
        scrollable: find.byType(Scrollable).last,
      );
    }
    await Scrollable.ensureVisible(tester.element(finder), alignment: .3);
    await tester.pumpAndSettle();
    await tester.tap(finder);
    await tester.pumpAndSettle();
  }

  Future<void> login(WidgetTester tester) async {
    await tester.enterText(
      find.byType(TextFormField).at(0),
      'customer@example.test',
    );
    await tester.enterText(
      find.byType(TextFormField).at(1),
      'a-secure-password',
    );
    await tap(tester, find.widgetWithText(FilledButton, 'Sign in'));
  }

  testWidgets('uses the official packaged logo and accessible brand label', (
    tester,
  ) async {
    await mount(tester);
    final image = tester.widget<Image>(
      find.descendant(
        of: find.byType(CustomerBrand),
        matching: find.byType(Image),
      ),
    );
    expect(
      image.image,
      isA<AssetImage>().having(
        (value) => value.assetName,
        'asset name',
        CustomerBrand.asset,
      ),
    );
    expect(find.bySemanticsLabel('SelfX'), findsOneWidget);
    expect(find.text('selfx'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'shows sign-in skeleton only while capabilities are pending and removes it on failure',
    (tester) async {
      final response = Completer<Map<String, dynamic>>();
      api.handler = (path, method, body) => response.future;
      await tester.pumpWidget(CustomerApp(controller: controller));
      final initialization = controller.initialize();
      await tester.pump();
      expect(find.byType(CustomerContentSkeleton), findsOneWidget);
      expect(find.bySemanticsLabel('Loading sign-in'), findsOneWidget);
      expect(find.byType(TextFormField), findsNothing);
      response.completeError(
        const CustomerApiException(
          'CONNECTION_UNAVAILABLE',
          'Check your connection.',
        ),
      );
      await initialization;
      await tester.pumpAndSettle();
      expect(find.byType(CustomerSkeleton), findsNothing);
      expect(find.text('Check your connection.'), findsOneWidget);
      expect(find.text('Try again'), findsOneWidget);
    },
  );

  testWidgets(
    'shows Home skeleton during secure session restoration then genuine content',
    (tester) async {
      store.token = 'restoring-refresh';
      final response = Completer<Map<String, dynamic>>();
      api.handler = (path, method, body) async {
        if (path == '/auth/capabilities') {
          return {
            'enabled': true,
            'providers': {},
            'termsVersion': '2026-10-25',
          };
        }
        if (path == '/auth/refresh') return response.future;
        return api.profile;
      };
      await tester.pumpWidget(CustomerApp(controller: controller));
      final initialization = controller.initialize();
      await tester.pump();
      expect(find.bySemanticsLabel('Restoring your account'), findsOneWidget);
      expect(find.text('Ava Morgan'), findsNothing);
      response.complete(api.bundle());
      await initialization;
      await tester.pumpAndSettle();
      expect(find.byType(CustomerSkeleton), findsNothing);
      expect(find.text('HELLO, AVA'), findsOneWidget);
    },
  );

  testWidgets(
    'replaces profile details with skeleton during fetch and clears it after an error',
    (tester) async {
      await mount(tester);
      await login(tester);
      await tap(tester, find.text('Me'));
      final response = Completer<Map<String, dynamic>>();
      api.handler = (path, method, body) => response.future;
      final loading = controller.loadProfile();
      final result = expectLater(loading, throwsA(isA<CustomerApiException>()));
      await tester.pump();
      expect(find.bySemanticsLabel('Loading your account'), findsOneWidget);
      expect(find.text('Ava Morgan'), findsNothing);
      response.completeError(
        const CustomerApiException(
          'CONNECTION_UNAVAILABLE',
          'Check your connection.',
        ),
      );
      await result;
      await tester.pumpAndSettle();
      expect(controller.profileLoading, isFalse);
      expect(find.byType(CustomerSkeleton), findsNothing);
      expect(find.text('Ava Morgan'), findsOneWidget);
    },
  );

  testWidgets(
    'keeps skeletons still for reduced motion and fits narrow screens',
    (tester) async {
      tester.view.physicalSize = const Size(320, 700);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(
        MaterialApp(
          theme: customerTheme(),
          home: const MediaQuery(
            data: MediaQueryData(
              disableAnimations: true,
              textScaler: TextScaler.linear(1.5),
            ),
            child: CustomerLoadingScreen(restoringSession: true),
          ),
        ),
      );
      await tester.pumpAndSettle();
      final transition = tester.widget<FadeTransition>(
        find.descendant(
          of: find.byType(CustomerSkeleton),
          matching: find.byType(FadeTransition),
        ),
      );
      expect(transition.opacity.value, 1);
      expect(tester.binding.hasScheduledFrame, isFalse);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'shows four introduction slides and persists Skip on first launch',
    (tester) async {
      store.complete = false;
      await mount(tester);
      expect(find.text('See yourself\nin something new.'), findsOneWidget);
      await tap(tester, find.widgetWithText(FilledButton, 'Continue'));
      expect(find.text('From a photo\nto your next look.'), findsOneWidget);
      await tap(tester, find.widgetWithText(FilledButton, 'Continue'));
      await tap(tester, find.widgetWithText(FilledButton, 'Continue'));
      expect(find.text('Keep the looks\nyou love.'), findsOneWidget);
      await tap(tester, find.text('Skip'));
      expect(store.complete, isTrue);
      expect(find.text('Your next look\nstarts here.'), findsOneWidget);
    },
  );
  testWidgets(
    'keeps sign-in and signup separate with validation and password visibility',
    (tester) async {
      await mount(tester);
      expect(find.text('Continue with Google'), findsOneWidget);
      await tap(tester, find.widgetWithText(FilledButton, 'Sign in'));
      expect(find.text('Enter a valid email address.'), findsOneWidget);
      expect(api.calls.where((call) => call.path == '/auth/login'), isEmpty);
      await tap(
        tester,
        find.text('Show password').evaluate().isEmpty
            ? find.byTooltip('Show password')
            : find.text('Show password'),
      );
      expect(find.byTooltip('Hide password'), findsOneWidget);
      await tap(tester, find.text('Create an account'));
      expect(find.text('Your name'), findsOneWidget);
      await tester.enterText(find.byType(TextFormField).at(0), 'Ava');
      await tester.enterText(
        find.byType(TextFormField).at(1),
        'customer@example.test',
      );
      await tester.enterText(
        find.byType(TextFormField).at(2),
        'a-secure-password',
      );
      await tap(tester, find.widgetWithText(FilledButton, 'Create account'));
      expect(
        find.text('Please read and accept the Terms and Privacy Policy.'),
        findsOneWidget,
      );
      expect(api.calls.where((call) => call.path == '/auth/signup'), isEmpty);
    },
  );
  testWidgets(
    'creates an email account, verifies its bound code and returns to sign in',
    (tester) async {
      await mount(tester);
      await tap(tester, find.text('Create an account'));
      await tester.enterText(find.byType(TextFormField).at(0), 'Ava');
      await tester.enterText(
        find.byType(TextFormField).at(1),
        'customer@example.test',
      );
      await tester.enterText(
        find.byType(TextFormField).at(2),
        'a-secure-password',
      );
      await tap(tester, find.byType(CheckboxListTile));
      await tap(tester, find.widgetWithText(FilledButton, 'Create account'));
      expect(find.text('Check your inbox.'), findsOneWidget);
      await tester.enterText(find.byType(TextFormField).at(1), '12345678');
      await tap(tester, find.widgetWithText(FilledButton, 'Verify email'));
      expect(
        api.calls
            .firstWhere((call) => call.path == '/auth/verify-email')
            .body?['signupProof'],
        'a' * 43,
      );
      expect(find.text('Email verified. You can now sign in.'), findsOneWidget);
      expect(store.saved, isEmpty);
    },
  );
  testWidgets(
    'supports email password recovery without creating an authenticated session',
    (tester) async {
      await mount(tester);
      await tap(tester, find.text('Forgot password?'));
      await tester.enterText(
        find.byType(TextFormField).first,
        'customer@example.test',
      );
      await tap(tester, find.widgetWithText(FilledButton, 'Send reset code'));
      expect(find.text('A fresh start.'), findsOneWidget);
      await tester.enterText(find.byType(TextFormField).at(1), '12345678');
      await tester.enterText(
        find.byType(TextFormField).at(2),
        'a-new-secure-password',
      );
      await tap(tester, find.widgetWithText(FilledButton, 'Reset password'));
      expect(
        api.calls.where((call) => call.path == '/auth/reset-password'),
        hasLength(1),
      );
      expect(controller.profile, isNull);
    },
  );
  testWidgets(
    'signs in to the new shell and keeps scanner, Plans and balance in the header',
    (tester) async {
      await mount(tester);
      await login(tester);
      expect(find.byTooltip('Scan Store QR'), findsOneWidget);
      expect(find.text('Plans'), findsOneWidget);
      expect(
        tester.getTopLeft(find.byTooltip('Scan Store QR')).dx,
        lessThan(tester.getTopLeft(find.text('Plans')).dx),
      );
      expect(find.text('—'), findsOneWidget);
      await tap(tester, find.text('Saved'));
      expect(find.text('Your first look\nis yet to come.'), findsOneWidget);
      await tap(tester, find.text('Me'));
      expect(find.text('Ava Morgan'), findsOneWidget);
      await tester.scrollUntilVisible(
        find.text('Privacy Policy'),
        200,
        scrollable: find.byType(Scrollable).last,
      );
      expect(find.text('Privacy Policy'), findsOneWidget);
      expect(store.token, 'synthetic-refresh');
      expect(store.saved, isNot(contains('synthetic-access')));
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets('clears account routes and local credentials on logout', (
    tester,
  ) async {
    await mount(tester);
    await login(tester);
    await tap(tester, find.text('Me'));
    await tap(tester, find.text('Sign out'));
    expect(find.text('Your next look\nstarts here.'), findsOneWidget);
    expect(find.text('Ava Morgan'), findsNothing);
    expect(store.token, isNull);
  });
  testWidgets(
    'shows safe sign-in failure without treating unknown email as signup',
    (tester) async {
      await mount(tester);
      api.handler = (path, method, body) async => throw const CustomerApiException(
        'CUSTOMER_INVALID_CREDENTIALS',
        'We couldn’t sign you in. Check your details, try Google, or create an account.',
        401,
      );
      await login(tester);
      expect(find.textContaining('We couldn’t sign you in.'), findsOneWidget);
      expect(controller.profile, isNull);
      expect(find.text('Your name'), findsNothing);
    },
  );
  testWidgets(
    'has no layout overflow on a small phone or larger accessibility text',
    (tester) async {
      await mount(tester, size: const Size(320, 700));
      await login(tester);
      expect(tester.takeException(), isNull);
      tester.platformDispatcher.textScaleFactorTestValue = 1.35;
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
      await tester.pumpWidget(CustomerApp(controller: controller));
      await tester.pumpAndSettle();
      await tap(tester, find.text('Saved'));
      await tap(tester, find.text('Me'));
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets('does not delete an account without explicit confirmation', (
    tester,
  ) async {
    await mount(tester);
    await login(tester);
    await tap(tester, find.text('Me'));
    await tap(tester, find.text('Delete account'));
    await tap(tester, find.text('Permanently delete account'));
    expect(find.text('Type DELETE to confirm.'), findsOneWidget);
    expect(api.calls.where((call) => call.method == 'DELETE'), isEmpty);
  });
  testWidgets(
    'renders actual onboarding, auth and Home/Saved/Me review screenshots',
    (tester) async {
      const enabled = bool.fromEnvironment('CUSTOMER_REVIEW');
      if (!enabled) return;
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final boundary = GlobalKey();
      Future<void> capture(String name) async {
        await tester.runAsync(() async {
          final image =
              await (boundary.currentContext!.findRenderObject()!
                      as RenderRepaintBoundary)
                  .toImage();
          final data = await image.toByteData(format: ui.ImageByteFormat.png);
          final file = File('../tmp/customer-mobile-review/$name.png');
          await file.parent.create(recursive: true);
          await file.writeAsBytes(data!.buffer.asUint8List());
          image.dispose();
        });
      }

      await tester.pumpWidget(
        RepaintBoundary(
          key: boundary,
          child: MaterialApp(
            debugShowCheckedModeBanner: false,
            theme: customerTheme(),
            home: const CustomerLoadingScreen(restoringSession: true),
          ),
        ),
      );
      await tester.runAsync(
        () => precacheImage(
          const AssetImage(CustomerBrand.asset),
          boundary.currentContext!,
        ),
      );
      await tester.pump(const Duration(milliseconds: 300));
      await capture('loading');
      await tester.pumpWidget(const SizedBox());
      store.complete = false;
      await tester.pumpWidget(
        RepaintBoundary(
          key: boundary,
          child: CustomerApp(controller: controller),
        ),
      );
      await controller.initialize();
      await tester.pumpAndSettle();

      await capture('onboarding');
      await tap(tester, find.text('Skip'));
      await capture('sign-in');
      await tap(tester, find.text('Create an account'));
      await capture('sign-up');
      await tap(tester, find.widgetWithText(TextButton, 'Sign in'));
      await login(tester);
      await capture('home');
      await tap(tester, find.text('Saved'));
      await capture('saved');
      await tap(tester, find.text('Me'));
      await capture('account');
    },
  );
}
