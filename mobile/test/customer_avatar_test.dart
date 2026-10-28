import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:selfx_customer/src/auth/customer_api.dart';
import 'package:selfx_customer/src/auth/customer_controller.dart';
import 'package:selfx_customer/src/customer_app.dart';
import 'package:selfx_customer/src/experience/customer_experience.dart';
import 'package:selfx_customer/src/services/customer_avatar.dart';
import 'fakes.dart';
import 'customer_experience_test.dart' show syntheticPhoto, PhotoPicker;
import 'customer_languages_test.dart' show catalog, settleLocale;

class AvatarApi extends FakeCustomerApi implements CustomerMediaApi {
  final saved = <String, String>{};
  final uploads = <String>[];
  Completer<Uint8List>? delayedDownload;
  bool failDefault = false;
  AvatarApi() {
    profile = {
      ...profile,
      'interests': <String>[],
      'avatarSetupComplete': false,
    };
  }
  Map<String, dynamic> avatar() => {
    'interests': profile['interests'],
    'complete': profile['avatarSetupComplete'],
    'selfie': saved['SELFIE'] == null
        ? null
        : {'id': saved['SELFIE'], 'expiresAt': null},
    'fullBody': saved['FULL_BODY'] == null
        ? null
        : {'id': saved['FULL_BODY'], 'expiresAt': null},
  };
  Map<String, dynamic> input(String id) => {
    'id': id,
    'url': 'https://private.invalid/image',
    'expiresAt': DateTime.now().add(const Duration(days: 7)).toIso8601String(),
  };
  @override
  Future<Map<String, dynamic>> request(
    String path, {
    String method = 'POST',
    Map<String, dynamic>? body,
    String? token,
  }) async {
    if (path == '/me/avatar') {
      if (method == 'PATCH') {
        profile = {
          ...profile,
          'interests': body!['interests'],
          if (body['complete'] == true) 'avatarSetupComplete': true,
        };
      }
      return avatar();
    }
    if (path.endsWith('/avatar') && path.startsWith('/try-on/sessions/')) {
      if (failDefault) {
        throw const CustomerApiException('FAILED', 'Try again', 503);
      }
      return saved['FULL_BODY'] == null
          ? {'photo': null}
          : input('avatar-copy');
    }
    if (path == '/try-on/sessions') {
      return {'id': 'session', 'payer': 'PERSONAL'};
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
    uploads.add(path);
    if (path.startsWith('/me/avatar/')) {
      saved[Uri.parse(path).pathSegments.last] = 'photo-${uploads.length}';
      return {
        'photo': {'id': saved.values.last},
      };
    }
    return input('replacement');
  }

  @override
  Future<Uint8List> download(String path, String token) async =>
      delayedDownload == null ? syntheticPhoto : delayedDownload!.future;
}

void main() {
  late AvatarApi api;
  late CustomerController auth;
  late PhotoPicker picker;
  setUp(() async {
    api = AvatarApi();
    picker = PhotoPicker();
    auth = CustomerController(
      api: api,
      store: MemorySessionStore(),
      identity: FakeIdentity(),
    );
    await auth.initialize();
    await auth.signIn('test@example.test', 'password');
  });
  tearDown(() => auth.dispose());
  Future<void> mount(
    WidgetTester tester, {
    Size size = const Size(390, 844),
  }) async {
    tester.view.physicalSize = size;
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(CustomerApp(controller: auth, picker: picker));
    await tester.pumpAndSettle();
  }

  Future<void> tap(WidgetTester tester, Finder finder) async {
    await Scrollable.ensureVisible(tester.element(finder), alignment: .5);
    await tester.pumpAndSettle();
    await tester.tap(finder);
    await tester.pumpAndSettle();
  }

  testWidgets(
    'sign-in opens interests, then consented avatar capture, then Home; setup stays complete',
    (tester) async {
      await mount(tester);
      expect(find.text('I want to try on'), findsOneWidget);
      await tap(tester, find.text('Women'));
      await tap(tester, find.text('Men'));
      await tap(tester, find.byKey(const ValueKey('avatar-continue')));
      expect(find.text('Create your avatar'), findsOneWidget);
      expect(picker.selections, 0);
      for (final kind in ['FULL_BODY', 'SELFIE']) {
        await tap(tester, find.byKey(ValueKey('avatar-$kind')));
        expect(find.text(customerAvatarConsent), findsOneWidget);
        await tap(tester, find.text('Choose from photos'));
      }
      expect(picker.selections, 2);
      await tap(tester, find.byKey(const ValueKey('avatar-continue')));
      expect(find.text('I want to try on'), findsNothing);
      expect(auth.profile!.avatarSetupComplete, true);
      expect(auth.profile!.interests.toSet(), {'WOMEN', 'MEN'});
      expect(
        api.uploads.every(
          (path) => path.contains('consentVersion=2026-10-28-avatar-v1'),
        ),
        true,
      );
      await auth.loadProfile();
      await tester.pumpAndSettle();
      expect(find.text('Create your avatar'), findsNothing);
    },
  );
  testWidgets('small phone can skip photos after selecting an interest', (
    tester,
  ) async {
    await mount(tester, size: const Size(320, 700));
    tester.platformDispatcher.textScaleFactorTestValue = 1.5;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    await tester.pumpAndSettle();
    await tap(tester, find.text('Jewellery'));
    await tap(tester, find.byKey(const ValueKey('avatar-continue')));
    expect(tester.takeException(), isNull);
    tester.platformDispatcher.textScaleFactorTestValue = 1;
    await tester.pumpAndSettle();
    await tap(tester, find.text('Skip for now'));
    expect(picker.selections, 0);
    expect(auth.profile!.avatarSetupComplete, true);
    expect(tester.takeException(), isNull);
  });
  testWidgets(
    'saved full-body is the default input; changing the Try-On image leaves the saved avatar alone',
    (tester) async {
      api.saved['FULL_BODY'] = 'saved-body';
      api.profile['avatarSetupComplete'] = true;
      await auth.loadProfile();
      final exp = CustomerExperience(auth);
      addTearDown(exp.dispose);
      await exp.refresh();
      await exp.begin();
      expect(exp.person!.id, 'avatar-copy');
      expect(exp.usingAvatar, true);
      await exp.upload('PERSON', syntheticPhoto, 'image/png');
      expect(exp.person!.id, 'replacement');
      expect(exp.usingAvatar, false);
      expect(api.saved['FULL_BODY'], 'saved-body');
      expect(api.uploads.single, contains('/photos/PERSON'));
    },
  );
  testWidgets(
    'default load failure allows a normal photo upload and reports the failure',
    (tester) async {
      api.failDefault = true;
      final exp = CustomerExperience(auth);
      addTearDown(exp.dispose);
      await exp.refresh();
      await exp.begin();
      expect(exp.person, isNull);
      expect(exp.avatarError, isNotNull);
      await exp.upload('PERSON', syntheticPhoto, 'image/png');
      expect(exp.avatarError, isNull);
    },
  );
  for (final language in ['ar', 'ta', 'te']) {
    testWidgets(
      '$language: category and avatar layouts support narrow screens',
      (tester) async {
        auth.language = language;
        await mount(tester, size: const Size(320, 740));
        await settleLocale(tester);
        await tap(tester, find.text(catalog(language)['Women']!));
        await tap(tester, find.byKey(const ValueKey('avatar-continue')));
        expect(
          find.text(catalog(language)['Create your avatar']!),
          findsOneWidget,
        );
        expect(
          Directionality.of(
            tester.element(find.byKey(const ValueKey('avatar-FULL_BODY'))),
          ),
          language == 'ar' ? TextDirection.rtl : TextDirection.ltr,
        );
        expect(tester.takeException(), isNull);
      },
    );
  }
  test('logout discards an in-flight avatar download and its bytes', () async {
    api.saved['SELFIE'] = 'selfie';
    api.delayedDownload = Completer();
    final avatar = CustomerAvatar(auth);
    addTearDown(avatar.dispose);
    final pending = avatar.load();
    await Future<void>.delayed(Duration.zero);
    await auth.signOut();
    api.delayedDownload!.complete(syntheticPhoto);
    await pending;
    expect(avatar.photos, isEmpty);
    expect(avatar.ids, isEmpty);
  });
  testWidgets('renders actual category and avatar screens', (tester) async {
    if (!const bool.fromEnvironment('CUSTOMER_REVIEW')) return;
    final sdk = Platform.environment['FLUTTER_ROOT']!;
    await tester.runAsync(() async {
      final font = FontLoader('Roboto');
      for (final file in ['roboto-regular.ttf', 'roboto-bold.ttf']) {
        font.addFont(
          File(
            '$sdk/bin/cache/artifacts/material_fonts/$file',
          ).readAsBytes().then(ByteData.sublistView),
        );
      }
      await font.load();
      final icons = FontLoader('MaterialIcons');
      icons.addFont(
        File(
          '$sdk/bin/cache/artifacts/material_fonts/materialicons-regular.otf',
        ).readAsBytes().then(ByteData.sublistView),
      );
      await icons.load();
    });
    final boundary = GlobalKey();
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      RepaintBoundary(
        key: boundary,
        child: CustomerApp(controller: auth, picker: picker),
      ),
    );
    await tester.pumpAndSettle();
    await tester.runAsync(
      () => Future.wait([
        for (final asset in [
          'style-muse',
          'style-tailored',
          'category-jewellery-v1',
        ])
          precacheImage(
            AssetImage('assets/editorial/$asset.webp'),
            boundary.currentContext!,
          ),
        precacheImage(
          const AssetImage('assets/branding/selfx-logo.png'),
          boundary.currentContext!,
        ).catchError((_) {}),
      ]),
    );
    Future<void> capture(String name) async {
      await tester.pumpAndSettle();
      await tester.runAsync(() async {
        final image =
            await (boundary.currentContext!.findRenderObject()!
                    as RenderRepaintBoundary)
                .toImage(pixelRatio: 1.5);
        final data = await image.toByteData(format: ui.ImageByteFormat.png);
        final file = File('../tmp/customer-mobile-review/$name.png');
        await file.parent.create(recursive: true);
        await file.writeAsBytes(data!.buffer.asUint8List());
        image.dispose();
      });
    }

    await tap(tester, find.text('Women'));
    await capture('category-setup');
    await tap(tester, find.byKey(const ValueKey('avatar-continue')));
    await tester.drag(
      find.byType(SingleChildScrollView).first,
      const Offset(0, 1000),
    );
    await tester.pumpAndSettle();
    await capture('avatar-setup');
    expect(tester.takeException(), isNull);
  });
}
