import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:intl/date_symbol_data_local.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:selfx_customer/src/auth/customer_api.dart';
import 'package:selfx_customer/src/auth/customer_controller.dart';
import 'package:selfx_customer/src/experience/customer_content_reports.dart';
import 'package:selfx_customer/src/experience/customer_experience.dart';
import 'package:selfx_customer/src/experience/customer_media.dart';
import 'package:selfx_customer/src/ui/customer_content_report.dart';
import 'package:selfx_customer/src/ui/customer_experience_screens.dart';
import 'package:selfx_customer/src/ui/customer_quick_tryon.dart';
import 'package:selfx_customer/src/ui/customer_theme.dart';
import 'package:selfx_customer/src/l10n/customer_language.dart';
import 'package:selfx_customer/src/l10n/customer_copy.dart';
import 'fakes.dart';

class _UnusedPicker implements CustomerPhotoPicker {
  @override
  Future<void> discardLost() async {}
  @override
  Future<PickedCustomerPhoto?> pick(CustomerPhotoSource source) async => null;
}

void main() {
  setUpAll(() => initializeDateFormatting('en'));
  late FakeCustomerApi api;
  late CustomerController auth;
  late CustomerExperience experience;
  late CustomerPhoto photo;
  late Map<String, dynamic> result;
  setUp(() async {
    api = FakeCustomerApi();
    auth = CustomerController(
      api: api,
      store: MemorySessionStore(),
      identity: FakeIdentity(),
    );
    await auth.initialize();
    await auth.signIn('synthetic@example.test', 'synthetic-password');
    experience = CustomerExperience(auth);
    result = {
      'id': 'generated-result',
      'url': 'https://private.invalid/result',
      'expiresAt': DateTime.now()
          .add(const Duration(days: 30))
          .toIso8601String(),
    };
    photo = CustomerPhoto.fromJson(result);
    experience.cacheAssetImage(
      photo,
      base64Decode(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4AWP4DwQACfsD/fteaysAAAAASUVORK5CYII=',
      ),
    );
    api.handler = (path, method, body) async => {
      'id': 'report-receipt',
      'submitted': true,
    };
  });
  tearDown(() {
    experience.dispose();
    auth.dispose();
  });

  Future<void> openForm(WidgetTester tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: customerTheme(),
        home: Scaffold(
          body: CustomerReportButton(experience: experience, result: photo),
        ),
      ),
    );
    await tester.tap(find.text('Report'));
    await tester.pumpAndSettle();
  }

  Future<void> chooseOther(WidgetTester tester) async {
    await tester.ensureVisible(
      find.byType(DropdownButtonFormField<CustomerReportReason>),
    );
    await tester.pumpAndSettle();
    await tester.tap(
      find.byType(DropdownButtonFormField<CustomerReportReason>),
    );
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.text('Other'),
      150,
      scrollable: find.byType(Scrollable).last,
    );
    await tester.tap(find.text('Other').last);
    await tester.pumpAndSettle();
  }

  Future<void> submit(WidgetTester tester) async {
    await tester.ensureVisible(find.text('Submit report'));
    await tester.tap(find.text('Submit report'));
    await tester.pumpAndSettle();
  }

  test(
    'reporting labels and actionable errors are available in all 20 languages',
    () {
      final messages = [
        'Report',
        'Report this image',
        'Reason',
        'Select a reason',
        ...CustomerReportReason.values.map((reason) => reason.label),
        'Comment (optional)',
        'Submit report',
        'Submitting…',
        'Report submitted. Thank you for helping keep SelfX safe.',
        'You have already reported this image.',
        "We couldn't submit your report. Please try again.",
        'This image is no longer available to report.',
        'Too many reports. Please try again later.',
        'Please sign in again to report this image.',
        "We couldn't confirm your report. Please try again.",
        'Report offensive or unsafe AI-generated content to SelfX.',
        'Keep your comment within 2,000 characters.',
      ];
      for (final language in CustomerLanguage.all) {
        final catalog =
            (jsonDecode(
                      File(
                        'assets/l10n/${language.code}.json',
                      ).readAsStringSync(),
                    )
                    as Map)
                .cast<String, String>();
        final copy = CustomerCopy(language.code, catalog);
        for (final message in messages) {
          expect(
            catalog[message],
            isNotEmpty,
            reason: '${language.code}: $message',
          );
          expect(copy.text(message, error: true), catalog[message]);
        }
      }
    },
  );

  test(
    'reports missing images, rate limits and sign-in failures without raw server details',
    () {
      expect(
        customerReportError(
          const CustomerApiException(
            'CONTENT_REPORT_RESULT_NOT_FOUND',
            'internal',
            404,
          ),
        ),
        'This image is no longer available to report.',
      );
      expect(
        customerReportError(
          const CustomerApiException('CUSTOMER_RATE_LIMITED', 'internal', 429),
        ),
        'Too many reports. Please try again later.',
      );
      expect(
        customerReportError(
          const CustomerApiException('CUSTOMER_UNAUTHORIZED', 'internal', 401),
        ),
        'Please sign in again to report this image.',
      );
    },
  );

  test(
    'sends the generated asset reference and stable reason using the current session',
    () async {
      await submitCustomerContentReport(
        auth,
        resultAssetId: photo.id,
        reason: CustomerReportReason.privacy,
        comment: '  My feedback  ',
      );
      final call = api.calls.last;
      expect(call.path, '/content-reports');
      expect(call.method, 'POST');
      expect(call.token, isNotEmpty);
      expect(call.body, {
        'resultAssetId': photo.id,
        'reason': 'PRIVACY_NON_CONSENSUAL',
        'comment': 'My feedback',
      });
      await submitCustomerContentReport(
        auth,
        resultAssetId: photo.id,
        reason: CustomerReportReason.other,
        comment: '  ',
      );
      expect(api.calls.last.body!.containsKey('comment'), isFalse);
    },
  );
  test(
    'does not accept a missing, malformed or unconfirmed server receipt',
    () async {
      for (final response in <Map<String, dynamic>>[
        {},
        {'id': 'receipt'},
        {'submitted': true},
        {'id': '', 'submitted': true},
      ]) {
        api.handler = (_, _, _) async => response;
        await expectLater(
          submitCustomerContentReport(
            auth,
            resultAssetId: photo.id,
            reason: CustomerReportReason.other,
            comment: '',
          ),
          throwsA(
            isA<CustomerApiException>().having(
              (e) => e.code,
              'code',
              'CONTENT_REPORT_UNCONFIRMED',
            ),
          ),
        );
      }
    },
  );
  test(
    'does not acknowledge an in-flight report after the account changes',
    () async {
      final pending = Completer<Map<String, dynamic>>();
      api.handler = (_, _, _) => pending.future;
      final request = submitCustomerContentReport(
        auth,
        resultAssetId: photo.id,
        reason: CustomerReportReason.other,
        comment: '',
      );
      final expectation = expectLater(
        request,
        throwsA(
          isA<CustomerApiException>().having(
            (e) => e.code,
            'code',
            'CUSTOMER_UNAUTHORIZED',
          ),
        ),
      );
      auth.profile = null;
      pending.complete({'id': 'receipt', 'submitted': true});
      await expectation;
    },
  );
  testWidgets(
    'requires a reason and shows success only after submission is confirmed',
    (tester) async {
      await openForm(tester);
      expect(
        tester
            .widget<FilledButton>(
              find.widgetWithText(FilledButton, 'Submit report'),
            )
            .onPressed,
        isNull,
      );
      await chooseOther(tester);
      await tester.enterText(find.byType(TextFormField), 'Synthetic comment');
      await submit(tester);
      expect(
        find.text('Report submitted. Thank you for helping keep SelfX safe.'),
        findsOneWidget,
      );
      expect(api.calls.last.body!['resultAssetId'], photo.id);
      await tester.tap(find.text('Done'));
      await tester.pumpAndSettle();
      expect(find.text('Report this image'), findsNothing);
    },
  );
  testWidgets('preserves inputs after failure and retries the same report', (
    tester,
  ) async {
    var attempts = 0;
    api.handler = (_, _, _) async {
      if (++attempts == 1) {
        throw const CustomerApiException('CONNECTION', 'network failure');
      }
      return {'id': 'receipt', 'submitted': true};
    };
    await openForm(tester);
    await chooseOther(tester);
    await tester.enterText(find.byType(TextFormField), 'Keep this comment');
    await submit(tester);
    expect(
      find.text("We couldn't submit your report. Please try again."),
      findsOneWidget,
    );
    expect(find.text('Keep this comment'), findsOneWidget);
    expect(
      find.text('Report submitted. Thank you for helping keep SelfX safe.'),
      findsNothing,
    );
    await submit(tester);
    expect(attempts, 2);
    expect(
      find.text('Report submitted. Thank you for helping keep SelfX safe.'),
      findsOneWidget,
    );
  });
  testWidgets(
    'blocks duplicate taps and dismissal while submission is pending',
    (tester) async {
      final pending = Completer<Map<String, dynamic>>();
      var submissions = 0;
      api.handler = (_, _, _) {
        submissions++;
        return pending.future;
      };
      await openForm(tester);
      await chooseOther(tester);
      await tester.ensureVisible(find.text('Submit report'));
      await tester.tap(find.text('Submit report'));
      await tester.pump();
      expect(
        tester
            .widget<TextButton>(find.widgetWithText(TextButton, 'Cancel'))
            .onPressed,
        isNull,
      );
      expect(
        tester
            .widget<FilledButton>(
              find.widgetWithText(FilledButton, 'Submitting…'),
            )
            .onPressed,
        isNull,
      );
      await tester.binding.handlePopRoute();
      await tester.pump();
      expect(find.text('Report this image'), findsOneWidget);
      expect(submissions, 1);
      pending.complete({'id': 'receipt', 'submitted': true});
      await tester.pumpAndSettle();
    },
  );
  testWidgets(
    'shows an existing-report acknowledgement rather than a false new success',
    (tester) async {
      api.handler = (_, _, _) async => throw const CustomerApiException(
        'CONTENT_REPORT_ALREADY_SUBMITTED',
        'Already reported',
        409,
      );
      await openForm(tester);
      await chooseOther(tester);
      await submit(tester);
      expect(
        find.text('You have already reported this image.'),
        findsOneWidget,
      );
      expect(
        find.text('Report submitted. Thank you for helping keep SelfX safe.'),
        findsNothing,
      );
    },
  );
  testWidgets('keeps the screenshot action placement on the completed result', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(390, 620);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    experience.run = {'id': 'run', 'status': 'COMPLETED', 'result': result};
    await tester.pumpWidget(
      MaterialApp(
        theme: customerTheme(),
        home: Scaffold(
          body: CustomerQuickTryOn(
            experience: experience,
            picker: _UnusedPicker(),
            onChooseProduct: () {},
            onViewSaved: () {},
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    final primary = tester.getRect(
      find.widgetWithText(FilledButton, 'New Try-On'),
    );
    final report = tester.getRect(
      find.widgetWithText(OutlinedButton, 'Report'),
    );
    expect(report.left, greaterThan(primary.right));
    expect(report.center.dy, closeTo(primary.center.dy, 1));
    expect(report.height, primary.height);
    expect(tester.takeException(), isNull);
    await tester.tap(find.text('Report'));
    await tester.pumpAndSettle();
    expect(find.text('Report this image'), findsOneWidget);
  });
  testWidgets(
    'offers reporting on saved-look details using that saved result',
    (tester) async {
      final look = CustomerLook.fromJson({
        'id': 'look',
        'runId': 'run',
        'payer': 'PERSONAL',
        'expiresAt': result['expiresAt'],
        'result': result,
      });
      await tester.pumpWidget(
        MaterialApp(
          theme: customerTheme(),
          home: CustomerSavedLookScreen(experience: experience, look: look),
        ),
      );
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text('Report'),
        300,
        scrollable: find.byType(Scrollable).last,
      );
      await tester.tap(find.text('Report'));
      await tester.pumpAndSettle();
      await chooseOther(tester);
      await submit(tester);
      expect(api.calls.last.body!['resultAssetId'], look.result.id);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets('supports large text and a small viewport without overflowing', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 568);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      MaterialApp(
        theme: customerTheme(),
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(
            context,
          ).copyWith(textScaler: const TextScaler.linear(2)),
          child: child!,
        ),
        home: Scaffold(
          body: CustomerResultActions(
            experience: experience,
            result: photo,
            onNewTryOn: () {},
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    await tester.tap(find.text('Report'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    await chooseOther(tester);
    await tester.enterText(find.byType(TextFormField), 'Small screen report');
    await submit(tester);
    expect(
      find.text('Report submitted. Thank you for helping keep SelfX safe.'),
      findsOneWidget,
    );
    expect(tester.takeException(), isNull);
  });
  testWidgets('reports inside the app with Arabic labels and RTL direction', (
    tester,
  ) async {
    final catalog =
        (jsonDecode(File('assets/l10n/ar.json').readAsStringSync()) as Map)
            .cast<String, String>();
    await tester.pumpWidget(
      MaterialApp(
        locale: const Locale('ar'),
        supportedLocales: const [Locale('en'), Locale('ar')],
        localizationsDelegates: const [
          CustomerCopy.delegate,
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        theme: customerTheme('ar'),
        home: Scaffold(
          body: CustomerReportButton(experience: experience, result: photo),
        ),
      ),
    );
    for (var i = 0; i < 5; i++) {
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 20)),
      );
      await tester.pumpAndSettle();
    }
    await tester.tap(find.text(catalog['Report']!));
    await tester.pumpAndSettle();
    final reason = find.byType(DropdownButtonFormField<CustomerReportReason>);
    expect(Directionality.of(tester.element(reason)), TextDirection.rtl);
    await tester.tap(reason);
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.text(catalog['Other']!),
      150,
      scrollable: find.byType(Scrollable).last,
    );
    await tester.tap(find.text(catalog['Other']!).last);
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text(catalog['Submit report']!));
    await tester.tap(find.text(catalog['Submit report']!));
    await tester.pumpAndSettle();
    expect(
      find.text(
        catalog['Report submitted. Thank you for helping keep SelfX safe.']!,
      ),
      findsOneWidget,
    );
    expect(tester.takeException(), isNull);
  });
}
