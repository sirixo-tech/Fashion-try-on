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
        final api = FakeCustomerApi();
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
        await tester.tap(find.text(d['Plans']!));
        await tester.pumpAndSettle();
        expect(find.text(d['Plans & credits']!), findsOneWidget);
        await tester.tap(find.byType(BackButton));
        await tester.pumpAndSettle();
        await tester.tap(find.text(d['Me']!));
        await tester.pumpAndSettle();
        expect(find.text('Home'), findsAtLeastNWidgets(1));
        auth.replayOnboarding();
        await settleLocale(tester);
        expect(find.text(d['Skip']!), findsOneWidget);
        for (var i = 0; i < 3; i++) {
          await tester.tap(find.text(d['Continue']!));
          await tester.pumpAndSettle();
        }
        expect(find.text(d['Get started']!), findsOneWidget);
        // Leave errors unconsumed: Flutter reports layout failures with their location.
        await tester.pumpWidget(const SizedBox());
        auth.dispose();
      },
    );
  }
}
