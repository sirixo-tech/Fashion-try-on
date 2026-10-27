import 'dart:async';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:selfx_customer/src/auth/customer_api.dart';
import 'package:selfx_customer/src/auth/customer_controller.dart';
import 'package:selfx_customer/src/auth/customer_phone.dart';
import 'package:selfx_customer/src/customer_app.dart';
import 'fakes.dart';
import 'customer_code_test.dart' show FakePhone;

class _FailingPhone extends FakePhone {
  @override
  Future<CustomerPhoneChallenge> send(String number, String projectId) async {
    sent.add(number);
    throw const CustomerPhoneException(
      'Phone sign-in is not configured yet.',
      'FIREBASE_REQUEST',
      'billing-not-enabled',
    );
  }
}

void main() {
  late FakeCustomerApi api;
  late CustomerController auth;
  Future<void> mount(WidgetTester tester, {CustomerPhone? phone}) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    api = FakeCustomerApi()..phoneAvailable = true;
    auth = CustomerController(
      api: api,
      store: MemorySessionStore(),
      identity: FakeIdentity(),
      phone: phone ?? FakePhone(),
    );
    addTearDown(auth.dispose);
    await auth.initialize();
    await tester.pumpWidget(CustomerApp(controller: auth));
    await tester.pumpAndSettle();
  }

  Future<void> tap(WidgetTester tester, Finder target) async {
    await tester.ensureVisible(target);
    await tester.tap(target);
    await tester.pumpAndSettle();
  }

  test(
    'Firebase callback errors keep their original safe code across normalization and omit raw details',
    () {
      final phone = FirebaseCustomerPhone();
      final error = phone.failure(
        FirebaseAuthException(
          code: 'billing-not-enabled',
          message: 'private phone/token details',
        ),
      );
      expect(error, isA<CustomerPhoneException>());
      expect(
        (error as CustomerPhoneException).diagnosticCode,
        'billing-not-enabled',
      );
      expect(phone.failure(error), same(error));
      expect(error.toString(), isNot(contains('private')));
      expect(
        (phone.failure(TimeoutException('raw')) as CustomerPhoneException)
            .diagnosticCode,
        'timeout',
      );
      expect(
        (phone.failure(FirebaseAuthException(code: 'unexpected-private-value'))
                as CustomerPhoneException)
            .diagnosticCode,
        'verification-failed',
      );
    },
  );

  testWidgets(
    'number-first signup collects email and accepts inline terms without invoking SMS',
    (tester) async {
      final phone = FakePhone();
      await mount(tester, phone: phone);
      await tap(tester, find.text('Create an account'));
      await tester.enterText(find.byType(TextFormField).at(0), 'Ava');
      await tester.enterText(find.byType(TextFormField).at(1), '+919876543210');
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byType(TextFormField).at(2),
        'secure-password',
      );
      await tester.enterText(
        find.byKey(const ValueKey('signup-verification-email')),
        'ava@example.test',
      );
      expect(find.byType(CheckboxListTile), findsNothing);
      await tap(tester, find.widgetWithText(FilledButton, 'Create account'));
      final request = api.calls.singleWhere((c) => c.path == '/auth/signup');
      expect(request.body, containsPair('email', 'ava@example.test'));
      expect(request.body, containsPair('phoneNumber', '+919876543210'));
      expect(request.body, containsPair('acceptTerms', true));
      expect(find.text('Check your inbox.'), findsOneWidget);
      expect(phone.sent, isEmpty);
    },
  );

  testWidgets(
    'mobile password login normalizes the selected country and creates the normal session',
    (tester) async {
      final phone = FakePhone();
      await mount(tester, phone: phone);
      await tester.enterText(find.byType(TextFormField).first, '+919876543210');
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byType(TextFormField).last,
        'secure-password',
      );
      await tap(tester, find.widgetWithText(FilledButton, 'Sign in'));
      expect(
        api.calls.singleWhere((c) => c.path == '/auth/login').body?['email'],
        '+919876543210',
      );
      expect(auth.stage, CustomerStage.ready);
      expect(phone.sent, isEmpty);
    },
  );

  testWidgets(
    'Google continues directly without a signup checkbox, and existing users can explicitly link it',
    (tester) async {
      await mount(tester);
      await tap(tester, find.text('Continue with Google'));
      expect(
        api.calls
            .singleWhere((c) => c.path == '/auth/oauth')
            .body?['acceptTerms'],
        true,
      );
      final owner = auth.profile!.id;
      await tap(tester, find.text('Me'));
      await tap(tester, find.text('Profile'));
      await tap(tester, find.text('Link Google'));
      expect(
        api.calls.singleWhere((c) => c.path == '/me/oauth').body?['provider'],
        'GOOGLE',
      );
      expect(auth.profile!.id, owner);
      expect(find.text('Google linked'), findsOneWidget);
    },
  );

  testWidgets(
    'Firebase send failure shows its stage/code and retains the ten second retry cooldown',
    (tester) async {
      final phone = _FailingPhone();
      await mount(tester, phone: phone);
      await tap(tester, find.text('Sign in with a code'));
      await tester.enterText(find.byType(TextFormField).first, '+919876543210');
      await tester.pumpAndSettle();
      await tap(tester, find.byType(CheckboxListTile));
      await tap(tester, find.widgetWithText(FilledButton, 'Send code'));
      expect(
        find.text('Verification error: FIREBASE_REQUEST / billing-not-enabled'),
        findsOneWidget,
      );
      expect(
        tester
            .widget<FilledButton>(
              find.widgetWithText(FilledButton, 'Resend in 10s'),
            )
            .onPressed,
        isNull,
      );
      await tester.pump(const Duration(seconds: 10));
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<FilledButton>(
              find.widgetWithText(FilledButton, 'Send code'),
            )
            .onPressed,
        isNotNull,
      );
      expect(phone.sent, hasLength(1));
      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'SelfX 429 retains its retry delay and does not contact Firebase',
    (tester) async {
      final phone = FakePhone();
      await mount(tester, phone: phone);
      api.handler = (path, method, body) async =>
          throw const CustomerApiException(
            'CUSTOMER_PHONE_COOLDOWN',
            'Please wait before requesting another code.',
            429,
            7,
          );
      await tap(tester, find.text('Sign in with a code'));
      await tester.enterText(find.byType(TextFormField).first, '+919876543210');
      await tester.pumpAndSettle();
      await tap(tester, find.byType(CheckboxListTile));
      await tap(tester, find.widgetWithText(FilledButton, 'Send code'));
      expect(
        find.text(
          'Verification error: SELFX_PREFLIGHT / CUSTOMER_PHONE_COOLDOWN',
        ),
        findsOneWidget,
      );
      expect(find.text('Resend in 7s'), findsOneWidget);
      expect(phone.sent, isEmpty);
      await tester.pumpWidget(const SizedBox());
    },
  );
}
