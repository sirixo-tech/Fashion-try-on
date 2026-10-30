import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:selfx_customer/src/auth/customer_api.dart';
import 'package:selfx_customer/src/auth/customer_controller.dart';
import 'package:selfx_customer/src/customer_app.dart';
import 'package:selfx_customer/src/experience/customer_experience.dart';
import 'package:selfx_customer/src/l10n/customer_copy.dart';
import 'package:selfx_customer/src/l10n/customer_language.dart';
import 'package:selfx_customer/src/l10n/customer_language_screen.dart';
import 'fakes.dart';

class MemoryLanguageStore implements CustomerLanguageStore {
  String? value;
  MemoryLanguageStore([this.value]);
  @override
  Future<String?> read() async => value;
  @override
  Future<void> write(String code) async {
    value = code;
  }
}

Map<String, String> catalog(String code) =>
    (jsonDecode(File('assets/l10n/$code.json').readAsStringSync()) as Map)
        .cast<String, String>();
Future<void> settleLocale(WidgetTester tester) async {
  for (var i = 0; i < 10; i++) {
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 20)),
    );
    await tester.pumpAndSettle();
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test(
    'system Saved titles can translate without changing an identically named merchant product',
    () {
      final data = <String, dynamic>{
        'id': 'look',
        'runId': 'run',
        'payer': 'PERSONAL',
        'expiresAt': '2026-11-01T00:00:00Z',
        'result': {
          'id': 'asset',
          'url': 'https://private.invalid/photo',
          'expiresAt': '2026-11-01T00:00:00Z',
        },
      };
      expect(CustomerLook.fromJson(data).nameIsDefault, true);
      expect(
        CustomerLook.fromJson({
          ...data,
          'name': 'Your look',
          'nameIsDefault': false,
        }).nameIsDefault,
        false,
      );
    },
  );
  test('all 20 catalogs are complete and preserve placeholders', () {
    final en = catalog('en');
    expect(CustomerLanguage.all.length, 20);
    final backend = File(
      '../backend/api/src/customers/customer-languages.ts',
    ).readAsStringSync();
    for (final item in CustomerLanguage.all) {
      expect(backend, contains('"${item.code}"'));
      final values = catalog(item.code);
      expect(values.keys.toSet(), en.keys.toSet());
      for (final entry in en.entries) {
        final value = values[entry.key]!;
        expect(value.trim(), isNotEmpty);
        expect(RegExp(r'ZX(ARG|TERM|BREAK)|\[\[SX_').hasMatch(value), false);
        final expected = RegExp(
          r'\{p\d+\}',
        ).allMatches(entry.key).map((m) => m.group(0)).toList()..sort();
        final actual = RegExp(
          r'\{p\d+\}',
        ).allMatches(value).map((m) => m.group(0)).toList()..sort();
        expect(actual, expected, reason: '${item.code}: ${entry.key}');
      }
    }
  });
  test(
    'new Home, Try-On and payment copy changes with the selected language',
    () {
      final telugu = CustomerCopy('te', catalog('te'));
      for (final source in [
        'Explore outfits',
        'A starter collection for your first Try-On.',
        'Search outfits',
        'All',
        'Try-On',
        'Choose a model',
        'Go Premium',
        'Payment options',
      ]) {
        expect(telugu.text(source), catalog('te')[source]);
        expect(telugu.text(source), isNot(source));
      }
      expect(telugu.text('Time left  04:52'), contains('04:52'));
      expect(telugu.text('4 trial · 10 paid'), contains('10'));
      expect(telugu.text('4 trial · 10 paid'), isNot('4 trial · 10 paid'));
    },
  );
  test('localized keyboard digits normalize to API-safe codes', () {
    const formatter = CustomerCodeFormatter();
    for (final value in [
      '١٢٣٤٥٦٧٨',
      '۱۲۳۴۵۶۷۸',
      '१२३४५६७८',
      '১২৩৪৫৬৭৮',
      '೧೨೩೪೫೬೭೮',
    ]) {
      expect(
        formatter
            .formatEditUpdate(
              TextEditingValue.empty,
              TextEditingValue(text: value),
            )
            .text,
        '12345678',
      );
    }
  });
  test(
    'translations preserve customer values and safely localize unknown errors',
    () {
      final ar = CustomerCopy('ar', catalog('ar'));
      final result = ar.text('HELLO, AVINASH');
      expect(result, contains('AVINASH'));
      expect(result, isNot(contains('HELLO')));
      expect(
        ar.text('unknown upstream error', error: true),
        catalog('ar')['Something went wrong. Please try again.'],
      );
    },
  );
  test(
    'language persists and syncs only to the signed-in account with rollback on failure',
    () async {
      final store = MemoryLanguageStore('hi');
      final api = FakeCustomerApi();
      final auth = CustomerController(
        api: api,
        store: MemorySessionStore(),
        identity: FakeIdentity(),
        languageStore: store,
      );
      await auth.initialize();
      expect(auth.language, 'hi');
      await auth.signIn('test@example.test', 'synthetic-password');
      expect(auth.language, 'en');
      await auth.changeLanguage('ar');
      expect(auth.language, 'ar');
      expect(store.value, 'ar');
      expect(api.profile['language'], 'ar');
      api.handler = (path, method, body) async =>
          throw const CustomerApiException('NETWORK', 'offline');
      await expectLater(
        auth.changeLanguage('ta'),
        throwsA(isA<CustomerApiException>()),
      );
      expect(auth.language, 'ar');
      expect(store.value, 'ar');
      await expectLater(auth.changeLanguage('invalid'), throwsArgumentError);
      auth.dispose();
    },
  );
  for (final item in CustomerLanguage.all) {
    testWidgets(
      '${item.code}: translated sign-in fits a narrow screen with correct direction',
      (tester) async {
        tester.view.physicalSize = const Size(320, 740);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final auth = CustomerController(
          api: FakeCustomerApi(),
          store: MemorySessionStore(),
          identity: FakeIdentity(),
          languageStore: MemoryLanguageStore(item.code),
        );
        await auth.initialize();
        await tester.pumpWidget(CustomerApp(controller: auth));
        await settleLocale(tester);
        expect(
          find.text(catalog(item.code)['Sign in']!),
          findsAtLeastNWidgets(1),
        );
        expect(
          Directionality.of(tester.element(find.byType(Scaffold).first)),
          ['ar', 'ur'].contains(item.code)
              ? TextDirection.rtl
              : TextDirection.ltr,
        );
        await tester.pumpWidget(const SizedBox());
        auth.dispose();
      },
    );
  }
  testWidgets(
    'picker changes Arabic immediately without restart and keeps native language names',
    (tester) async {
      final store = MemoryLanguageStore();
      final auth = CustomerController(
        api: FakeCustomerApi(),
        store: MemorySessionStore(),
        identity: FakeIdentity(),
        languageStore: store,
      );
      await auth.initialize();
      await tester.pumpWidget(
        ListenableBuilder(
          listenable: auth,
          builder: (context, _) => MaterialApp(
            locale: Locale(auth.language),
            supportedLocales: CustomerLanguage.locales,
            localizationsDelegates: const [
              CustomerCopy.delegate,
              ...GlobalMaterialLocalizations.delegates,
            ],
            home: CustomerLanguageScreen(controller: auth),
          ),
        ),
      );
      await settleLocale(tester);
      await tester.enterText(find.byType(TextField), 'Arabic');
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('language-ar')));
      await settleLocale(tester);
      expect(find.text(catalog('ar')['Language']!), findsOneWidget);
      expect(store.value, 'ar');
      expect(find.text('العربية'), findsOneWidget);
      expect(
        Directionality.of(tester.element(find.byType(Scaffold))),
        TextDirection.rtl,
      );
      await tester.pumpWidget(const SizedBox());
      auth.dispose();
    },
  );
}
