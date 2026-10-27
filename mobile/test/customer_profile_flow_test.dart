import 'dart:async';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:selfx_customer/src/auth/customer_api.dart';
import 'package:selfx_customer/src/auth/customer_controller.dart';
import 'package:selfx_customer/src/customer_app.dart';
import 'package:selfx_customer/src/experience/customer_media.dart';
import 'package:selfx_customer/src/services/customer_profile_photo.dart';
import 'fakes.dart';
import 'customer_experience_test.dart' show syntheticPhoto, PhotoPicker;
import 'customer_languages_test.dart'
    show MemoryLanguageStore, catalog, settleLocale;

class ProfileMediaApi extends FakeCustomerApi implements CustomerMediaApi {
  Map<String, dynamic>? photo;
  int uploads = 0;
  String? uploadPath;
  Completer<Uint8List>? downloadWait;
  @override
  Future<Map<String, dynamic>> request(
    String path, {
    String method = 'POST',
    Map<String, dynamic>? body,
    String? token,
  }) {
    if (path == '/me/photo') {
      if (method == 'DELETE') photo = null;
      return Future.value({'photo': photo});
    }
    return super.request(path, method: method, body: body, token: token);
  }

  @override
  Future<Map<String, dynamic>> upload(
    String path,
    Uint8List bytes,
    String mime,
    String token,
  ) async {
    uploads++;
    uploadPath = path;
    photo = {
      'id': 'private-avatar',
      'expiresAt': DateTime.now()
          .add(const Duration(days: 7))
          .toIso8601String(),
    };
    return {'photo': photo};
  }

  @override
  Future<Uint8List> download(String path, String token) async =>
      downloadWait == null ? syntheticPhoto : await downloadWait!.future;
}

void main() {
  late ProfileMediaApi api;
  late CustomerController auth;
  late PhotoPicker picker;
  setUp(() {
    api = ProfileMediaApi();
    picker = PhotoPicker();
    auth = CustomerController(
      api: api,
      store: MemorySessionStore(),
      identity: FakeIdentity(),
      languageStore: MemoryLanguageStore(),
    );
  });
  tearDown(() => auth.dispose());
  Future<void> mount(WidgetTester tester, {int remaining = 10}) async {
    tester.view.physicalSize = const Size(320, 740);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    api.trialRemaining = remaining;
    await auth.initialize();
    await auth.signIn('customer@example.test', 'synthetic-password');
    await tester.pumpWidget(CustomerApp(controller: auth, picker: picker));
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
    'zero credits becomes Add credits, opens plans, and language dropdown changes the app',
    (tester) async {
      await mount(tester, remaining: 0);
      expect(find.text('Add credits'), findsOneWidget);
      expect(find.text('Plans'), findsNothing);
      expect(tester.takeException(), isNull);
      await tap(tester, find.byKey(const ValueKey('header-credits')));
      expect(find.text('Plans & credits'), findsOneWidget);
      await tap(tester, find.byType(BackButton));
      await tap(tester, find.byKey(const ValueKey('header-language')));
      await tap(tester, find.text('हिन्दी'));
      await settleLocale(tester);
      expect(auth.language, 'hi');
      expect(find.text('HIN'), findsOneWidget);
      expect(find.text(catalog('hi')['Add credits']!), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'profile consolidates account fields and photos require consent before choosing or uploading',
    (tester) async {
      await mount(tester);
      await tap(tester, find.text('Me'));
      expect(find.text('Phone number'), findsNothing);
      expect(find.text('Account security'), findsNothing);
      expect(find.text('See the introduction'), findsNothing);
      await tap(tester, find.byKey(const ValueKey('account-profile')));
      expect(find.text('Email address'), findsOneWidget);
      expect(find.text('Verified'), findsOneWidget);
      await tap(tester, find.text('Add profile photo'));
      expect(find.text(customerProfilePhotoConsent), findsOneWidget);
      await tap(tester, find.text('Cancel'));
      expect(picker.selections, 0);
      expect(api.uploads, 0);
      await tap(tester, find.text('Add profile photo'));
      await tap(tester, find.text('Agree & choose photo'));
      expect(picker.selections, 1);
      expect(
        api.uploadPath,
        contains('consentVersion=2026-10-27&consentLanguage=en'),
      );
      expect(find.text('Change profile photo'), findsOneWidget);
      await tap(tester, find.text('Remove profile photo'));
      await tester.scrollUntilVisible(find.text('Add profile photo'), -160, scrollable: find.byType(Scrollable).last);
      expect(find.text('Add profile photo'), findsOneWidget);
      expect(api.photo, isNull);
      expect(tester.takeException(), isNull);
    },
  );
  test(
    'late photo downloads cannot repopulate memory after sign-out and oversize files never upload',
    () async {
      await auth.initialize();
      await auth.signIn('customer@example.test', 'synthetic-password');
      final photo = CustomerProfilePhoto(auth);
      addTearDown(photo.dispose);
      await photo.upload(
        PickedCustomerPhoto(Uint8List(5 * 1024 * 1024 + 1), 'image/png'),
      );
      expect(api.uploads, 0);
      api.photo = {
        'id': 'private-avatar',
        'expiresAt': DateTime.now()
            .add(const Duration(days: 7))
            .toIso8601String(),
      };
      api.downloadWait = Completer<Uint8List>();
      final pending = photo.load();
      await Future<void>.delayed(Duration.zero);
      await auth.signOut();
      api.downloadWait!.complete(syntheticPhoto);
      await pending;
      expect(photo.bytes, isNull);
      expect(photo.expiresAt, isNull);
    },
  );
}
