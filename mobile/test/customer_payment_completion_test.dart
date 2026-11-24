import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:selfx_customer/src/auth/customer_api.dart';
import 'package:selfx_customer/src/auth/customer_controller.dart';
import 'package:selfx_customer/src/experience/customer_experience.dart';
import 'package:selfx_customer/src/ui/customer_experience_screens.dart';
import 'package:selfx_customer/src/ui/customer_theme.dart';
import 'fakes.dart';

void main() {
  late FakeCustomerApi api;
  late CustomerController auth;
  late CustomerExperience experience;
  late String status;
  late int balance, purchases;
  late bool balanceUnavailable;
  Completer<Json>? delayedBalance;
  Completer<Json>? delayedStatus;
  Json summary() => {
    'generationAvailable': true,
    'personalCreditsRemaining': balance,
    'trial': {'granted': 0, 'used': 0, 'reserved': 0, 'remaining': 0},
    'paid': {'remaining': balance},
  };
  Json purchase() => {
    'id': 'payment-$purchases',
    'status': status,
    'amountMinor': 100,
    'currency': 'INR',
    'planId': 'basic',
    'credits': 10,
    'checkoutUrl': 'upi://pay?pa=synthetic@selfx.invalid',
    'expiresAt': DateTime.now()
        .add(const Duration(minutes: 5))
        .toIso8601String(),
  };
  setUp(() async {
    api = FakeCustomerApi();
    auth = CustomerController(
      api: api,
      store: MemorySessionStore(),
      identity: FakeIdentity(),
    );
    await auth.initialize();
    await auth.signIn('synthetic@example.test', 'synthetic-passphrase');
    experience = CustomerExperience(auth);
    status = 'PENDING';
    balance = 0;
    purchases = 0;
    balanceUnavailable = false;
    delayedBalance = null;
    delayedStatus = null;
    experience.summary = summary();
    api.handler = (path, method, body) async {
      if (path == '/mobile-plans') {
        return {
          'purchasingAvailable': true,
          'data': [
            {
              'id': 'basic',
              'name': 'Basic',
              'description': '',
              'currency': 'INR',
              'priceCents': 100,
              'includedCredits': 10,
              'trialCredits': 0,
              'billingPeriod': 'MONTHLY',
            },
          ],
        };
      }
      if (path == '/mobile-payments') {
        if (method == 'GET') return {'purchase': null};
        purchases++;
        return purchase();
      }
      if (path.startsWith('/mobile-payments/payment-')) {
        if (path.endsWith('/cancel')) return purchase();
        return delayedStatus?.future ?? Future.value(purchase());
      }
      if (path == '/experience') {
        if (balanceUnavailable) {
          throw const CustomerApiException(
            'CONNECTION',
            'Unable to complete that. Please try again.',
          );
        }
        return delayedBalance?.future ?? Future.value(summary());
      }
      return {};
    };
  });
  tearDown(() {
    experience.dispose();
    auth.dispose();
  });

  Future<void> start(WidgetTester tester, {bool expectDialog = true}) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: customerTheme(),
        home: CustomerPlansScreen(experience: experience),
      ),
    );
    await tester.pumpAndSettle();
    final button = find.widgetWithText(FilledButton, 'Continue');
    await tester.scrollUntilVisible(
      button,
      250,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();
    await tester.tap(button);
    await tester.pumpAndSettle();
    expect(
      find.text('UPI payment'),
      expectDialog ? findsOneWidget : findsNothing,
    );
  }

  void resume(WidgetTester tester) {
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
  }

  const success = 'Payment confirmed. Your credits are ready.';

  testWidgets('an already-paid purchase skips payment options entirely', (
    tester,
  ) async {
    status = 'PAID';
    balance = 10;
    await start(tester, expectDialog: false);
    expect(experience.remaining, 10);
    expect(find.text(success), findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
  });
  testWidgets(
    'payment settled during cancellation uses the same automatic completion',
    (tester) async {
      await start(tester);
      await tester.tap(find.text('Leave payment'));
      await tester.pumpAndSettle();
      status = 'PAID';
      balance = 10;
      await tester.tap(find.widgetWithText(OutlinedButton, 'Leave payment'));
      await tester.pumpAndSettle();
      expect(experience.remaining, 10);
      expect(find.text(success), findsOneWidget);
      expect(find.text('UPI payment'), findsNothing);
      expect(
        api.calls.where((call) => call.path.endsWith('/cancel')).length,
        1,
      );
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
  testWidgets(
    'does not announce an old account payment after the account changes',
    (tester) async {
      await start(tester);
      status = 'PAID';
      balance = 10;
      delayedBalance = Completer<Json>();
      resume(tester);
      await tester.pump(const Duration(milliseconds: 100));
      auth.profile = null;
      delayedBalance!.complete(summary());
      await tester.pumpAndSettle();
      expect(find.text(success), findsNothing);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  testWidgets(
    'verified payment refreshes credits, dismisses the popup and notifies only once',
    (tester) async {
      await start(tester);
      status = 'PAID';
      balance = 10;
      resume(tester);
      await tester.pumpAndSettle();
      expect(experience.remaining, 10);
      expect(find.text('UPI payment'), findsNothing);
      expect(find.text('Pay through UPI'), findsNothing);
      expect(find.textContaining('Time left'), findsNothing);
      expect(find.text(success), findsOneWidget);
      final reads = api.calls
          .where((call) => call.path == '/mobile-payments/payment-1')
          .length;
      await tester.pump(const Duration(seconds: 6));
      await tester.pumpAndSettle();
      resume(tester);
      await tester.pumpAndSettle();
      expect(
        api.calls
            .where((call) => call.path == '/mobile-payments/payment-1')
            .length,
        reads,
      );
      expect(find.text(success), findsNothing);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
  testWidgets(
    'does not close or announce success before credits have refreshed',
    (tester) async {
      await start(tester);
      status = 'PAID';
      balance = 10;
      delayedBalance = Completer<Json>();
      resume(tester);
      await tester.pump(const Duration(milliseconds: 100));
      expect(find.text('UPI payment'), findsOneWidget);
      expect(find.text(success), findsNothing);
      expect(find.textContaining('Time left'), findsNothing);
      delayedBalance!.complete(summary());
      await tester.pumpAndSettle();
      expect(find.text('UPI payment'), findsNothing);
      expect(find.text(success), findsOneWidget);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
  for (final serverStatus in [
    'PENDING',
    'UNKNOWN',
    'CANCELLING',
    'FAILED',
    'CANCELLED',
  ]) {
    testWidgets(
      'returning from UPI with $serverStatus keeps the status popup without credit success',
      (tester) async {
        await start(tester);
        status = serverStatus;
        resume(tester);
        await tester.pumpAndSettle();
        expect(find.text('UPI payment'), findsOneWidget);
        expect(find.text(success), findsNothing);
        expect(experience.remaining, 0);
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox.shrink());
      },
    );
  }
  testWidgets(
    'a refresh failure keeps a retry action and cannot display false success',
    (tester) async {
      await start(tester);
      status = 'PAID';
      balance = 10;
      balanceUnavailable = true;
      resume(tester);
      await tester.pumpAndSettle();
      expect(find.text('UPI payment'), findsOneWidget);
      expect(find.text(success), findsNothing);
      expect(experience.remaining, 0);
      balanceUnavailable = false;
      await tester.tap(find.widgetWithText(TextButton, 'Check payment'));
      await tester.pumpAndSettle();
      expect(experience.remaining, 10);
      expect(find.text('UPI payment'), findsNothing);
      expect(find.text(success), findsOneWidget);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
  testWidgets(
    'paid confirmation closes the owned leave-payment sheet without cancelling',
    (tester) async {
      await start(tester);
      await tester.tap(find.text('Leave payment'));
      await tester.pumpAndSettle();
      expect(find.text('Leave payment?'), findsOneWidget);
      status = 'PAID';
      balance = 10;
      resume(tester);
      await tester.pumpAndSettle();
      expect(find.text('Leave payment?'), findsNothing);
      expect(find.text('UPI payment'), findsNothing);
      expect(find.text(success), findsOneWidget);
      expect(api.calls.where((call) => call.path.endsWith('/cancel')), isEmpty);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
  testWidgets(
    'paid confirmation never pops an unrelated dialog above payment',
    (tester) async {
      await start(tester);
      unawaited(
        showDialog<void>(
          context: tester.element(find.byType(CustomerPlansScreen)),
          builder: (_) => const AlertDialog(title: Text('Unrelated dialog')),
        ),
      );
      await tester.pumpAndSettle();
      status = 'PAID';
      balance = 10;
      resume(tester);
      await tester.pumpAndSettle();
      expect(find.text('Unrelated dialog'), findsOneWidget);
      expect(find.text('UPI payment'), findsNothing);
      expect(find.text('Plans & credits'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
  testWidgets(
    'can start and complete a second purchase on the same plans screen',
    (tester) async {
      await start(tester);
      status = 'PAID';
      balance = 10;
      resume(tester);
      await tester.pumpAndSettle();
      await tester.pump(const Duration(seconds: 5));
      await tester.pumpAndSettle();
      status = 'PENDING';
      final button = find.widgetWithText(FilledButton, 'Continue');
      await tester.ensureVisible(button);
      await tester.pumpAndSettle();
      await tester.tap(button);
      await tester.pumpAndSettle();
      expect(purchases, 2);
      expect(find.textContaining('Time left'), findsOneWidget);
      status = 'PAID';
      balance = 20;
      resume(tester);
      await tester.pumpAndSettle();
      expect(experience.remaining, 20);
      expect(find.text(success), findsOneWidget);
      expect(find.text('UPI payment'), findsNothing);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
  testWidgets(
    'ignores a late confirmation after the plans screen is disposed',
    (tester) async {
      await start(tester);
      delayedStatus = Completer<Json>();
      resume(tester);
      await tester.pump();
      await tester.pumpWidget(const SizedBox.shrink());
      status = 'PAID';
      balance = 10;
      delayedStatus!.complete(purchase());
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(find.text(success), findsNothing);
    },
  );
}
