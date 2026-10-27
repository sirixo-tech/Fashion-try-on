import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:selfx_customer/src/auth/customer_controller.dart';
import 'package:selfx_customer/src/customer_app.dart';
import 'package:selfx_customer/src/l10n/customer_language.dart';
import 'fakes.dart';
import 'customer_languages_test.dart'
    show MemoryLanguageStore, catalog, settleLocale;

void main() {
  for (final item in CustomerLanguage.all) {
    testWidgets(
      '${item.code}: Home, Me, Plans and onboarding fit without losing profile data',
      (tester) async {
        tester.view.physicalSize = const Size(320, 740);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        addTearDown(tester.view.resetViewInsets);
        final api = FakeCustomerApi();
        api.trialRemaining = 0;
        api.profile = {
          ...api.profile,
          'language': item.code,
          'displayName': 'Home',
        };
        final auth = CustomerController(
          api: api,
          store: MemorySessionStore(),
          identity: FakeIdentity(),
          languageStore: MemoryLanguageStore(item.code),
        );
        await auth.initialize();
        await auth.signIn('synthetic@example.test', 'synthetic-password');
        await tester.pumpWidget(CustomerApp(controller: auth));
        await settleLocale(tester);
        final d = catalog(item.code);
        for (final width in [320.0, 390.0]) {
          tester.view.physicalSize = Size(width, 740);
          await tester.pumpAndSettle();
          final scanner = tester.getRect(
            find.widgetWithIcon(IconButton, Icons.qr_code_scanner_rounded),
          );
          final language = tester.getRect(
            find.byKey(const ValueKey('header-language')),
          );
          final credits = tester.getRect(
            find.byKey(const ValueKey('header-credits')),
          );
          final rtl = item.code == 'ar' || item.code == 'ur';
          // Actions stay together at the trailing edge in both directions.
          expect(
            rtl ? credits.left : credits.right,
            closeTo(rtl ? 20 : width - 12, .01),
          );
          expect(
            rtl ? scanner.left : scanner.right,
            closeTo(rtl ? language.right : language.left, .01),
          );
          expect(
            rtl ? language.left : language.right,
            closeTo(rtl ? credits.right : credits.left, .01),
          );
        }
        tester.view.physicalSize = const Size(320, 740);
        await tester.pumpAndSettle();
        await tester.tap(find.byKey(const ValueKey('header-credits')));
        await tester.pumpAndSettle();
        expect(find.text(d['Plans & credits']!), findsOneWidget);
        await tester.tap(find.byType(BackButton));
        await tester.pumpAndSettle();
        await tester.tap(find.text(d['Me']!));
        await tester.pumpAndSettle();
        expect(find.text('Home'), findsAtLeastNWidgets(1));
        await tester.ensureVisible(find.text(d['Profile']!));
        await tester.tap(find.text(d['Profile']!));
        await tester.pumpAndSettle();
        await tester.tap(find.byKey(const ValueKey('profile-photo-action')));
        await tester.pumpAndSettle();
        await tester.ensureVisible(find.text(d['Cancel']!));
        await tester.pumpAndSettle();
        await tester.tap(find.text(d['Cancel']!));
        await tester.pumpAndSettle();
        await tester.tap(find.text(d['Your name']!));
        await tester.pumpAndSettle();
        tester.view.viewInsets = const FakeViewPadding(bottom: 260);
        await tester.pumpAndSettle();
        expect(find.text(d['Edit profile']!), findsOneWidget);
        expect(find.text(d['Save changes']!), findsOneWidget);
        await tester.ensureVisible(find.text(d['Cancel']!));
        await tester.tap(find.text(d['Cancel']!));
        tester.view.viewInsets = FakeViewPadding.zero;
        await tester.pumpAndSettle();
        await tester.ensureVisible(find.text(d['Phone number']!));
        await tester.tap(find.text(d['Phone number']!));
        await tester.pumpAndSettle();
        expect(find.text(d['Verify your phone']!), findsOneWidget);
        await tester.tap(find.byType(BackButton));
        await tester.pumpAndSettle();
        auth.replayOnboarding();
        await settleLocale(tester);
        await tester.tap(find.byKey(const ValueKey('welcome-start')));
        await tester.pumpAndSettle();
        expect(find.text(d['Skip']!), findsOneWidget);
        for (var i = 0; i < 2; i++) {
          await tester.tap(find.text(d['Continue']!));
          await tester.pumpAndSettle();
        }
        expect(find.text(d['Get started']!), findsOneWidget);
        await auth.signOut();
        await settleLocale(tester);
        await tester.ensureVisible(find.text(d['Create an account']!));
        await tester.tap(find.text(d['Create an account']!));
        await tester.pumpAndSettle();
        expect(find.text(d['Email or mobile number']!), findsOneWidget);
        // Leave errors unconsumed: Flutter reports layout failures with their location.
        await tester.pumpWidget(const SizedBox());
        auth.dispose();
      },
    );
  }
}
