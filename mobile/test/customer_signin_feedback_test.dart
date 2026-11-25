import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:selfx_customer/src/auth/customer_api.dart';
import 'package:selfx_customer/src/auth/customer_controller.dart';
import 'package:selfx_customer/src/l10n/customer_copy.dart';
import 'package:selfx_customer/src/l10n/customer_language.dart';
import 'package:selfx_customer/src/ui/auth_screen.dart';
import 'package:selfx_customer/src/ui/customer_phone_field.dart';
import 'package:selfx_customer/src/ui/customer_theme.dart';
import 'fakes.dart';
import 'customer_code_test.dart' show FakePhone;

const missing =
    'No SelfX customer account was found with this email. Please check the address or create an account.';
const wrong = 'Incorrect password. Try again or reset your password.';
const unlinked =
    'This phone is not linked. Sign in with email or create an account, then verify your phone in Account settings.';

void main() {
  late FakeCustomerApi api;
  late CustomerController auth;
  setUp(() async {
    api = FakeCustomerApi()..phoneAvailable = true;
    auth = CustomerController(
      api: api,
      store: MemorySessionStore(),
      identity: FakeIdentity(),
      phone: FakePhone(),
    );
    await auth.initialize();
  });
  tearDown(() => auth.dispose());
  Future<void> mount(WidgetTester tester) async {
    tester.view.physicalSize = const Size(320, 700);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      MaterialApp(
        theme: customerTheme(),
        home: CustomerAuthScreen(controller: auth),
      ),
    );
    await tester.pumpAndSettle();
  }

  Future<void> tap(WidgetTester tester, Finder finder) async {
    if (finder.evaluate().isEmpty) {
      await tester.scrollUntilVisible(
        finder,
        180,
        scrollable: find.byType(Scrollable).last,
      );
    }
    await Scrollable.ensureVisible(tester.element(finder), alignment: .3);
    await tester.pumpAndSettle();
    await tester.tap(finder);
    await tester.pumpAndSettle();
  }

  Future<void> emailLogin(
    WidgetTester tester,
    CustomerApiException failure,
  ) async {
    await mount(tester);
    await tester.enterText(
      find.byType(TextFormField).at(0),
      'unknown@example.test',
    );
    await tester.enterText(
      find.byType(TextFormField).at(1),
      'incorrect-password',
    );
    await tap(tester, find.byType(Checkbox));
    api.handler = (path, method, body) async => throw failure;
    await tap(tester, find.widgetWithText(FilledButton, 'Sign in'));
    expect(auth.profile, isNull);
  }

  Future<void> phoneLogin(WidgetTester tester) async {
    await mount(tester);
    api.handler = (path, method, body) async {
      if (path == '/auth/phone/request') {
        return {'projectId': 'synthetic-project', 'resendAfterSeconds': 10};
      }
      if (path == '/auth/phone/login') {
        throw const CustomerApiException(
          'CUSTOMER_PHONE_NOT_LINKED',
          unlinked,
          409,
        );
      }
      return {};
    };
    await tap(tester, find.text('Mobile (OTP)'));
    await tester.enterText(find.byType(TextFormField).first, '+919876543210');
    await tap(tester, find.byType(Checkbox));
    await tap(tester, find.widgetWithText(FilledButton, 'Send code'));
    await tester.enterText(
      find.byKey(const ValueKey('mobile-otp-code')),
      '123456',
    );
    await tap(tester, find.widgetWithText(FilledButton, 'Verify code'));
  }

  testWidgets('unknown sign-in email offers signup and preserves the address', (
    tester,
  ) async {
    await emailLogin(
      tester,
      const CustomerApiException('CUSTOMER_ACCOUNT_NOT_FOUND', missing, 404),
    );
    expect(find.text(missing), findsOneWidget);
    expect(find.text('Your name'), findsNothing);
    await tap(tester, find.widgetWithText(TextButton, 'Create account'));
    expect(
      tester
          .widget<TextFormField>(find.byType(TextFormField).at(1))
          .controller!
          .text,
      'unknown@example.test',
    );
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
  });
  testWidgets('incorrect password offers recovery with the email preserved', (
    tester,
  ) async {
    await emailLogin(
      tester,
      const CustomerApiException('CUSTOMER_INVALID_CREDENTIALS', wrong, 401),
    );
    expect(find.text(wrong), findsOneWidget);
    expect(find.widgetWithText(TextButton, 'Create account'), findsNothing);
    await tap(tester, find.widgetWithText(TextButton, 'Reset password'));
    expect(
      find.widgetWithText(FilledButton, 'Send reset code'),
      findsOneWidget,
    );
    expect(
      tester
          .widget<TextFormField>(find.byType(TextFormField).first)
          .controller!
          .text,
      'unknown@example.test',
    );
    await tester.pumpWidget(const SizedBox());
  });
  testWidgets(
    'provider-only account receives method guidance and recovery instead of signup',
    (tester) async {
      const provider =
          'Sign in with Google for this account, or reset your password.';
      await emailLogin(
        tester,
        const CustomerApiException('CUSTOMER_PASSWORD_NOT_SET', provider, 409),
      );
      expect(find.text(provider), findsOneWidget);
      expect(find.widgetWithText(TextButton, 'Reset password'), findsOneWidget);
      expect(find.widgetWithText(TextButton, 'Create account'), findsNothing);
      await tester.pumpWidget(const SizedBox());
    },
  );
  testWidgets('suspended sign-in account does not offer duplicate signup', (
    tester,
  ) async {
    const unavailable =
        'This customer account is unavailable. Please contact SelfX support.';
    await emailLogin(
      tester,
      const CustomerApiException(
        'CUSTOMER_ACCOUNT_UNAVAILABLE',
        unavailable,
        403,
      ),
    );
    expect(find.text(unavailable), findsOneWidget);
    expect(find.widgetWithText(TextButton, 'Create account'), findsNothing);
    expect(find.widgetWithText(TextButton, 'Reset password'), findsNothing);
    await tester.pumpWidget(const SizedBox());
  });
  testWidgets(
    'unlinked phone offers signup with the number preserved and no diagnostics',
    (tester) async {
      await phoneLogin(tester);
      expect(find.text(unlinked), findsOneWidget);
      expect(find.textContaining('Verification error:'), findsNothing);
      expect(
        find.widgetWithText(TextButton, 'Sign in with email'),
        findsOneWidget,
      );
      await tap(tester, find.widgetWithText(TextButton, 'Create account'));
      expect(
        tester
            .state<CustomerPhoneFieldState>(
              find.byType(CustomerPhoneField).first,
            )
            .canonical,
        '+919876543210',
      );
      expect(auth.profile, isNull);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
    },
  );
  testWidgets(
    'unlinked phone can return to email sign-in without starting signup',
    (tester) async {
      await phoneLogin(tester);
      await tap(tester, find.widgetWithText(TextButton, 'Sign in with email'));
      expect(find.widgetWithText(FilledButton, 'Sign in'), findsOneWidget);
      expect(find.byKey(const ValueKey('mobile-otp-code')), findsNothing);
      expect(find.widgetWithText(TextButton, 'Create account'), findsNothing);
      await tester.pumpWidget(const SizedBox());
    },
  );
  test(
    'new sign-in feedback stays specific and preserves provider names in all 20 languages',
    () {
      const keys = [
        wrong,
        'Sign in with {p0} for this account, or reset your password.',
        'No password is set for this account. Use your existing sign-in method or reset your password.',
        'More than one account uses this number. Sign in with your email instead.',
        'Sign in with email',
      ];
      for (final language in CustomerLanguage.all) {
        final messages =
            (jsonDecode(
                      File(
                        'assets/l10n/${language.code}.json',
                      ).readAsStringSync(),
                    )
                    as Map)
                .cast<String, String>();
        final copy = CustomerCopy(language.code, messages);
        for (final key in keys) {
          expect(messages[key], isNotEmpty, reason: '${language.code}: $key');
        }
        expect(copy.text(wrong, error: true), messages[wrong]);
        final provider = copy.text(
          'Sign in with Google / Apple for this account, or reset your password.',
          error: true,
        );
        expect(provider, contains('Google / Apple'));
        expect(
          provider,
          isNot(messages['Something went wrong. Please try again.']),
        );
      }
    },
  );
}
