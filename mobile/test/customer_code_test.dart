import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:selfx_customer/src/auth/customer_api.dart';
import 'package:selfx_customer/src/auth/customer_controller.dart';
import 'package:selfx_customer/src/auth/customer_phone.dart';
import 'package:selfx_customer/src/customer_app.dart';
import 'fakes.dart';
import 'customer_languages_test.dart' show MemoryLanguageStore, settleLocale;

class FakePhone implements CustomerPhone {
  final sent = <String>[];
  bool enabled = true;
  @override
  Future<bool> configured() async => enabled;
  @override
  Future<CustomerPhoneChallenge> send(String phone, String projectId) async {
    sent.add(phone);
    expect(projectId, 'synthetic-project');
    return const CustomerPhoneChallenge(verificationId: 'synthetic-challenge');
  }

  @override
  Future<String> verify(CustomerPhoneChallenge challenge, String code) async {
    if (code != '123456') {
      throw const CustomerApiException(
        'INVALID',
        'Enter the correct 6-digit code.',
      );
    }
    return 'synthetic-firebase-id-token';
  }

  @override
  void cancel() {}
}

void main() {
  late FakeCustomerApi api;
  late FakePhone phone;
  late CustomerController auth;
  setUp(() {
    api = FakeCustomerApi();
    phone = FakePhone();
    auth = CustomerController(
      api: api,
      store: MemorySessionStore(),
      identity: FakeIdentity(),
      phone: phone,
      languageStore: MemoryLanguageStore(),
    );
  });
  tearDown(() => auth.dispose());
  Future<void> mount(WidgetTester tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await auth.initialize();
    await tester.pumpWidget(CustomerApp(controller: auth));
    await settleLocale(tester);
  }

  Future<void> tap(WidgetTester tester, Finder finder) async {
    await tester.ensureVisible(finder);
    await tester.tap(finder);
    await tester.pumpAndSettle();
  }

  testWidgets(
    'email code login requires six digits, keeps its request proof and starts a normal SelfX session',
    (tester) async {
      await mount(tester);
      await tap(tester, find.text('Sign in with a code'));
      await tester.enterText(
        find.byType(TextFormField).first,
        'customer@example.test',
      );
      await tap(tester, find.widgetWithText(FilledButton, 'Send code'));
      expect(
        tester
            .widget<TextButton>(
              find.widgetWithText(TextButton, 'Resend in 60s'),
            )
            .onPressed,
        isNull,
      );
      await tester.enterText(find.byType(TextFormField).last, '12345');
      await tap(tester, find.widgetWithText(FilledButton, 'Verify code'));
      expect(
        api.calls.where((c) => c.path == '/auth/email-code/login'),
        isEmpty,
      );
      await tester.enterText(find.byType(TextFormField).last, '123456');
      await tap(tester, find.widgetWithText(FilledButton, 'Verify code'));
      expect(
        api.calls.singleWhere((c) => c.path == '/auth/email-code/login').body,
        containsPair('loginProof', 'b' * 43),
      );
      expect(auth.stage, CustomerStage.ready);
      expect(phone.sent, isEmpty);
    },
  );
  testWidgets(
    'new users can open signup from code login and keep their email',
    (tester) async {
      await mount(tester);
      await tap(tester, find.text('Sign in with a code'));
      await tester.enterText(
        find.byType(TextFormField).first,
        'new@example.test',
      );
      await tap(tester, find.text('Create an account'));
      expect(find.text('Your name'), findsOneWidget);
      expect(
        tester
            .widget<TextFormField>(find.byType(TextFormField).at(1))
            .controller!
            .text,
        'new@example.test',
      );
    },
  );
  testWidgets(
    'Account security uses six-digit reset codes and an eight-character password minimum',
    (tester) async {
      await mount(tester);
      await auth.signIn('customer@example.test', 'synthetic-password');
      await tester.pumpAndSettle();
      await tap(tester, find.text('Me'));
      await tap(tester, find.text('Profile'));
      await tap(tester, find.text('Account security'));
      await tap(
        tester,
        find.widgetWithText(FilledButton, 'Send verification code'),
      );
      await tester.enterText(find.byType(TextFormField).first, '123456');
      await tester.enterText(find.byType(TextFormField).last, 'Abcd123');
      await tap(tester, find.widgetWithText(FilledButton, 'Update password'));
      expect(api.calls.where((c) => c.path == '/auth/reset-password'), isEmpty);
      await tester.enterText(find.byType(TextFormField).last, 'Abcd1234');
      await tap(tester, find.widgetWithText(FilledButton, 'Update password'));
      expect(
        api.calls.singleWhere((c) => c.path == '/auth/reset-password').body,
        containsPair('password', 'Abcd1234'),
      );
      expect(auth.stage, CustomerStage.authentication);
    },
  );
  testWidgets('unconfigured phone sign-in never calls Firebase or sends SMS', (
    tester,
  ) async {
    await mount(tester);
    await tap(tester, find.text('Sign in with a code'));
    await tester.enterText(find.byType(TextFormField).first, '+919876543210');
    await tester.pump();
    await tap(tester, find.byType(CheckboxListTile));
    await tap(tester, find.widgetWithText(FilledButton, 'Send code'));
    expect(find.text('Phone sign-in is not configured yet.'), findsOneWidget);
    expect(phone.sent, isEmpty);
    expect(api.calls.where((c) => c.path == '/auth/phone/request'), isEmpty);
  });
  testWidgets(
    'phone verification refreshes a previously disabled server capability before sending',
    (tester) async {
      await mount(tester);
      expect(auth.capabilities.phone, false);
      api.phoneAvailable = true;
      await tap(tester, find.text('Sign in with a code'));
      await tester.enterText(find.byType(TextFormField).first, '+919876543210');
      await tester.pump();
      await tap(tester, find.byType(CheckboxListTile));
      await tap(tester, find.widgetWithText(FilledButton, 'Send code'));
      expect(auth.capabilities.phone, true);
      expect(phone.sent, ['+919876543210']);
      expect(find.text('Phone sign-in is not configured yet.'), findsNothing);
    },
  );
  testWidgets(
    'phone linking requires consent and sends only verified proof to the authenticated account',
    (tester) async {
      api.phoneAvailable = true;
      await mount(tester);
      await auth.signIn('customer@example.test', 'synthetic-password');
      await tester.pumpAndSettle();
      final owner = auth.profile!.id;
      await tap(tester, find.text('Me'));
      await tap(tester, find.text('Profile'));
      await tap(tester, find.text('Phone number'));
      await tester.enterText(find.byType(TextFormField).first, '+919876543210');
      await tester.pump();
      await tap(tester, find.widgetWithText(FilledButton, 'Send code'));
      expect(phone.sent, isEmpty);
      await tap(tester, find.byType(CheckboxListTile));
      await tap(tester, find.widgetWithText(FilledButton, 'Send code'));
      expect(phone.sent, ['+919876543210']);
      await tester.enterText(find.byType(TextFormField).last, '123456');
      await tap(tester, find.widgetWithText(FilledButton, 'Verify code'));
      final link = api.calls.singleWhere((c) => c.path == '/me/phone');
      expect(link.token, isNotNull);
      expect(link.body, {
        'idToken': 'synthetic-firebase-id-token',
        'acceptPhoneVerification': true,
      });
      expect(auth.profile!.id, owner);
      expect(auth.profile!.phoneNumber, '+919876543210');
    },
  );
}
