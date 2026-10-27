import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:selfx_customer/src/auth/customer_api.dart';
import 'package:selfx_customer/src/auth/customer_controller.dart';
import 'package:selfx_customer/src/customer_app.dart';
import 'package:selfx_customer/src/services/customer_country.dart';
import 'package:selfx_customer/src/ui/customer_phone_field.dart';
import 'fakes.dart';
import 'customer_country_test.dart' show MemoryCountryStore;
import 'customer_languages_test.dart' show MemoryLanguageStore, settleLocale;

void main() {
  late FakeCustomerApi api;
  late CustomerController auth;
  late MemoryCountryStore countries;
  setUp(() {
    api = FakeCustomerApi();
    countries = MemoryCountryStore();
    auth = CustomerController(
      api: api,
      store: MemorySessionStore(),
      identity: FakeIdentity(),
      languageStore: MemoryLanguageStore(),
      countries: CustomerCountrySelection(
        store: countries,
        deviceLocales: const [Locale('en', 'IN')],
      ),
    );
    PackageInfo.setMockInitialValues(
      appName: 'SelfX',
      packageName: 'com.selfx.selfx_customer',
      version: '8.4.2',
      buildNumber: '307',
      buildSignature: 'fixture',
    );
  });
  tearDown(() => auth.dispose());
  Future<void> mount(WidgetTester tester, {bool login = true}) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await auth.initialize();
    if (login) await auth.signIn('customer@example.test', 'synthetic-password');
    await tester.pumpWidget(CustomerApp(controller: auth));
    await settleLocale(tester);
  }

  Future<void> tap(WidgetTester tester, Finder finder) async {
    if (finder.evaluate().isEmpty) {
      await tester.scrollUntilVisible(
        finder,
        200,
        scrollable: find.byType(Scrollable).last,
      );
    }
    await tester.ensureVisible(finder);
    await tester.pumpAndSettle();
    await tester.tap(finder);
    await tester.pumpAndSettle();
  }

  testWidgets(
    'country dropdown searches names/calling codes and remembers a selection across phone entry screens',
    (tester) async {
      await mount(tester, login: false);
      await tap(tester, find.text('Create an account'));
      expect(find.text('IN +91'), findsOneWidget);
      await tap(tester, find.text('IN +91'));
      await tester.enterText(find.byType(TextField).last, '+44');
      await tester.pumpAndSettle();
      await tap(tester, find.text('United Kingdom'));
      expect(countries.value, 'GB');
      expect(find.text('GB +44'), findsOneWidget);
      await tester.enterText(find.byType(TextFormField).last, '020 7946 0018');
      expect(
        tester
            .state<CustomerPhoneFieldState>(find.byType(CustomerPhoneField))
            .canonical,
        '+442079460018',
      );
      expect(
        tester
            .widget<TextField>(
              find.descendant(
                of: find.byType(CustomerPhoneField),
                matching: find.byType(TextField),
              ),
            )
            .keyboardType,
        TextInputType.phone,
      );
    },
  );
  testWidgets(
    'profile is an editable bottom sheet with validation, cancel and a successful save',
    (tester) async {
      await mount(tester);
      await tap(tester, find.text('Me'));
      await tap(tester, find.text('Profile'));
      await tap(tester, find.text('Your name'));
      expect(find.byType(BottomSheet), findsOneWidget);
      expect(find.byType(AlertDialog), findsNothing);
      expect(find.text('9/160'), findsNothing);
      await tester.enterText(find.byType(TextFormField).last, '');
      await tap(tester, find.text('Save changes'));
      expect(find.text('Enter your name.'), findsOneWidget);
      expect(
        api.calls.where((c) => c.path == '/me' && c.method == 'PATCH'),
        isEmpty,
      );
      await tap(tester, find.text('Cancel'));
      expect(find.byType(BottomSheet), findsNothing);
      final owner = auth.profile!.id;
      await tap(tester, find.text('Your name'));
      await tester.enterText(
        find.byType(TextFormField).last,
        '  Updated name  ',
      );
      await tap(tester, find.text('Save changes'));
      expect(auth.profile!.displayName, 'Updated name');
      expect(auth.profile!.id, owner);
      expect(find.byType(BottomSheet), findsNothing);
    },
  );
  testWidgets(
    'failed profile save keeps the sheet and the typed name for retry',
    (tester) async {
      await mount(tester);
      await tap(tester, find.text('Me'));
      await tap(tester, find.text('Profile'));
      await tap(tester, find.text('Your name'));
      api.handler = (_, method, _) async => throw const CustomerApiException(
        'NETWORK',
        'Check your connection and try again.',
      );
      await tester.enterText(find.byType(TextFormField).last, 'Keep this name');
      await tap(tester, find.text('Save changes'));
      expect(find.text('Check your connection and try again.'), findsOneWidget);
      expect(find.byType(BottomSheet), findsOneWidget);
      expect(
        tester
            .widget<TextFormField>(find.byType(TextFormField).last)
            .controller!
            .text,
        'Keep this name',
      );
    },
  );
  testWidgets('About shows installed metadata without a licenses section', (
    tester,
  ) async {
    await mount(tester);
    await tap(tester, find.text('Me'));
    expect(find.text('Licenses'), findsNothing);
    await tap(tester, find.text('About SelfX'));
    expect(find.text('8.4.2 (307)'), findsOneWidget);
    expect(find.text('0.1.0'), findsNothing);
    expect(find.text('Open-source licenses'), findsNothing);
    expect(find.byType(LicensePage), findsNothing);
  });
}
