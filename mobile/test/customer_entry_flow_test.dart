import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:selfx_customer/src/auth/customer_controller.dart';
import 'package:selfx_customer/src/customer_app.dart';
import 'fakes.dart';

class _RetryOnboardingStore extends MemorySessionStore {
  bool fail = true;
  _RetryOnboardingStore() : super(complete: false);
  @override
  Future<void> finishOnboarding() async {
    if (fail) throw StateError('Simulated preference failure');
    await super.finishOnboarding();
  }
}

void main() {
  testWidgets(
    'switching to signup opens the form at its branding and heading',
    (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final auth = CustomerController(
        api: FakeCustomerApi(),
        store: MemorySessionStore(),
        identity: FakeIdentity(),
      );
      addTearDown(auth.dispose);
      await auth.initialize();
      await tester.pumpWidget(CustomerApp(controller: auth));
      await tester.pumpAndSettle();
      final create = find.widgetWithText(TextButton, 'Create an account');
      await Scrollable.ensureVisible(tester.element(create), alignment: .3);
      await tester.pumpAndSettle();
      await tester.tap(create);
      await tester.pumpAndSettle();
      final view = tester.widget<SingleChildScrollView>(
        find.byType(SingleChildScrollView).first,
      );
      expect(view.controller!.offset, 0);
      expect(
        find.text('A little more you.\nA world of style.').hitTestable(),
        findsOneWidget,
      );
      expect(tester.takeException(), isNull);
    },
  );
  Future<CustomerController> mount(
    WidgetTester tester,
    MemorySessionStore store,
  ) async {
    tester.view.physicalSize = const Size(320, 740);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final auth = CustomerController(
      api: FakeCustomerApi(),
      store: store,
      identity: FakeIdentity(),
    );
    addTearDown(auth.dispose);
    await auth.initialize();
    await tester.pumpWidget(CustomerApp(controller: auth));
    await tester.pumpAndSettle();
    return auth;
  }

  Future<void> start(WidgetTester tester) async {
    final button = find.byKey(const ValueKey('welcome-start'));
    await tester.ensureVisible(button);
    await tester.tap(button);
    await tester.pumpAndSettle();
  }

  testWidgets(
    'welcome does not complete onboarding; swipe and Back preserve sequence',
    (tester) async {
      final store = MemorySessionStore(complete: false);
      await mount(tester, store);
      await start(tester);
      expect(store.complete, isFalse);
      expect(find.byType(TextFormField), findsNothing);
      await tester.drag(
        find.byKey(const ValueKey('information-pages')),
        const Offset(-270, 0),
      );
      await tester.pumpAndSettle();
      expect(find.text('Scan. Discover.\nMake it yours.'), findsOneWidget);
      await tester.tap(find.byType(BackButtonIcon));
      await tester.pumpAndSettle();
      expect(find.text('From a photo\nto your next look.'), findsOneWidget);
      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('customer-welcome')), findsOneWidget);
      await start(tester);
      for (var i = 0; i < 3; i++) {
        await tester.tap(find.byKey(const ValueKey('onboarding-next')));
        await tester.pumpAndSettle();
      }
      expect(store.complete, isTrue);
      expect(find.text('Your next look\nstarts here.'), findsOneWidget);
      expect(find.byType(TextFormField), findsNWidgets(2));
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'failed completion remains retryable before opening authentication',
    (tester) async {
      final store = _RetryOnboardingStore();
      await mount(tester, store);
      await start(tester);
      await tester.tap(find.text('Skip'));
      await tester.pumpAndSettle();
      expect(
        find.text('Unable to save your preference. Please try again.'),
        findsOneWidget,
      );
      expect(find.byType(TextFormField), findsNothing);
      expect(store.complete, isFalse);
      store.fail = false;
      await tester.tap(find.text('Skip'));
      await tester.pumpAndSettle();
      expect(find.text('Your next look\nstarts here.'), findsOneWidget);
      expect(store.complete, isTrue);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('large text and landscape keep entry actions reachable', (
    tester,
  ) async {
    tester.platformDispatcher.textScaleFactorTestValue = 1.8;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    await mount(tester, MemorySessionStore(complete: false));
    await start(tester);
    for (final size in [const Size(320, 740), const Size(740, 320)]) {
      tester.view.physicalSize = size;
      await tester.pumpAndSettle();
      for (var i = 0; i < 2; i++) {
        await tester.tap(find.byKey(const ValueKey('onboarding-next')));
        await tester.pumpAndSettle();
      }
      expect(tester.takeException(), isNull);
      if (size.width == 320) {
        await tester.tap(find.byType(BackButtonIcon));
        await tester.pumpAndSettle();
        await tester.tap(find.byType(BackButtonIcon));
        await tester.pumpAndSettle();
      }
    }
    await tester.tap(find.byKey(const ValueKey('onboarding-next')));
    await tester.pumpAndSettle();
    final signIn = find.widgetWithText(FilledButton, 'Sign in');
    await tester.ensureVisible(signIn);
    expect(signIn.hitTestable(), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
