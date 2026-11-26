import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:selfx_customer/src/auth/customer_api.dart';
import 'package:selfx_customer/src/auth/customer_controller.dart';
import 'package:selfx_customer/src/experience/customer_experience.dart';
import 'package:selfx_customer/src/experience/customer_media.dart';
import 'package:selfx_customer/src/services/customer_wardrobe.dart';
import 'package:selfx_customer/src/ui/customer_wardrobe_screen.dart';
import 'package:selfx_customer/src/ui/customer_theme.dart';
import 'fakes.dart';

final photoBytes = base64Decode(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4AWP4DwQACfsD/fteaysAAAAASUVORK5CYII=',
);
final garment = <String, dynamic>{
  'id': 'garment-a',
  'name': 'Navy shirt',
  'category': 'TOPS',
  'colour': 'Navy',
  'notes': 'Owned garment',
};

class WardrobeApi extends FakeCustomerApi implements CustomerMediaApi {
  bool failUpload = false;
  final uploads = <String>[];
  @override
  Future<Map<String, dynamic>> upload(
    String path,
    Uint8List bytes,
    String mime,
    String token,
  ) async {
    uploads.add(path);
    if (failUpload) {
      throw const CustomerApiException('NETWORK_ERROR', 'Connection lost.');
    }
    return {'item': garment};
  }

  @override
  Future<Uint8List> download(String path, String token) async => photoBytes;
}

class WardrobePicker implements CustomerWardrobePicker {
  int reads = 0, discards = 0;
  @override
  Future<List<WardrobeSelection>> pick(CustomerPhotoSource source) async => [
    for (var i = 0; i < 2; i++)
      WardrobeSelection(
        read: () async {
          reads++;
          return PickedCustomerPhoto(photoBytes, 'image/png');
        },
        discard: () async {
          discards++;
        },
      ),
  ];
}

void main() {
  late WardrobeApi api;
  late CustomerController auth;
  late CustomerWardrobe wardrobe;
  setUp(() async {
    api = WardrobeApi();
    auth = CustomerController(
      api: api,
      store: MemorySessionStore(),
      identity: FakeIdentity(),
    );
    await auth.initialize();
    await auth.signIn('synthetic@example.test', 'synthetic-passphrase');
    wardrobe = CustomerWardrobe(auth);
  });
  tearDown(() {
    wardrobe.dispose();
    auth.dispose();
  });
  Map<String, dynamic> page(
    List<Map<String, dynamic>> items, {
    int number = 1,
    bool more = false,
  }) => {'items': items, 'page': number, 'hasMore': more};
  test('pagination deduplicates and search/category are encoded', () async {
    api.handler = (path, method, body) async => path.contains('page=2')
        ? page([
            garment,
            {...garment, 'id': 'garment-b'},
          ], number: 2)
        : page([garment], more: true);
    await wardrobe.load(query: 'navy & white', filter: 'TOPS');
    expect(Uri.parse(api.calls.last.path).queryParameters, {
      'page': '1',
      'search': 'navy & white',
      'category': 'TOPS',
    });
    await wardrobe.load(more: true);
    expect(wardrobe.items.length, 2);
    expect(wardrobe.hasMore, false);
  });
  test(
    'late list responses cannot restore another signed-out account photos',
    () async {
      final pending = Completer<Map<String, dynamic>>();
      api.handler = (path, method, body) async =>
          path.startsWith('/wardrobe') ? pending.future : <String, dynamic>{};
      final loading = wardrobe.load();
      await auth.signOut();
      pending.complete(page([garment]));
      await loading;
      expect(wardrobe.items, isEmpty);
      expect(wardrobe.loading, false);
    },
  );
  test(
    'interrupted upload retries the same UUID and metadata without generation',
    () async {
      api.handler = (path, method, body) async => {'item': garment};
      final id = wardrobe.newId();
      expect(id.split('-')[2].startsWith('7'), true);
      api.failUpload = true;
      final photo = PickedCustomerPhoto(photoBytes, 'image/png');
      await expectLater(
        wardrobe.save(id, {'name': 'Navy shirt', 'category': 'TOPS'}, photo),
        throwsA(isA<CustomerApiException>()),
      );
      api.failUpload = false;
      await wardrobe.save(id, {
        'name': 'Navy shirt',
        'category': 'TOPS',
      }, photo);
      expect(api.uploads, ['/wardrobe/$id/photo', '/wardrobe/$id/photo']);
      expect(
        api.calls.where((c) => c.path == '/wardrobe').map((c) => c.body!['id']),
        [id, id],
      );
      expect(api.calls.any((c) => c.path == '/try-on/runs'), false);
    },
  );
  test(
    'selecting a saved garment preserves the model and never starts generation',
    () async {
      api.handler = (path, method, body) async {
        if (path == '/try-on/sessions') {
          return {'id': 'session-a', 'payer': 'PERSONAL'};
        }
        return {
          'id': path.endsWith('/wardrobe')
              ? 'saved-garment-copy'
              : 'model-copy',
          'url': 'https://private.invalid/photo',
          'expiresAt': DateTime.now()
              .add(const Duration(days: 7))
              .toIso8601String(),
        };
      };
      final experience = CustomerExperience(auth);
      await experience.begin(selectedDemoModelId: 'muse');
      await experience.chooseWardrobe('garment-a');
      expect(experience.person?.id, 'model-copy');
      expect(experience.outfit?.id, 'saved-garment-copy');
      expect(experience.demoProduct, isNull);
      expect(api.calls.last.body, {'itemId': 'garment-a'});
      expect(api.calls.any((call) => call.path == '/try-on/runs'), false);
      experience.dispose();
    },
  );
  test(
    'a late selection cannot restore private garments after sign-out',
    () async {
      final pending = Completer<Map<String, dynamic>>();
      api.handler = (path, method, body) async => path.endsWith('/wardrobe')
          ? pending.future
          : {'id': 'session-a', 'payer': 'PERSONAL'};
      final experience = CustomerExperience(auth);
      await experience.begin();
      final selecting = experience.chooseWardrobe('garment-a');
      final rejected = expectLater(
        selecting,
        throwsA(isA<CustomerApiException>()),
      );
      await auth.signOut();
      pending.complete({
        'id': 'private-copy',
        'url': 'https://private.invalid/photo',
        'expiresAt': DateTime.now()
            .add(const Duration(days: 7))
            .toIso8601String(),
      });
      await rejected;
      expect(experience.outfit, isNull);
      experience.dispose();
    },
  );
  testWidgets(
    'empty wardrobe imports sequentially; Skip advances and Back cancels remaining',
    (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      api.handler = (path, method, body) async => page([]);
      final experience = CustomerExperience(auth);
      final picker = WardrobePicker();
      await tester.pumpWidget(
        MaterialApp(
          theme: customerTheme(),
          home: Scaffold(
            body: SingleChildScrollView(
              child: CustomerWardrobePanel(
                experience: experience,
                picker: picker,
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Your wardrobe starts here'), findsOneWidget);
      await tester.ensureVisible(find.text('Import photos').first);
      await tester.tap(find.text('Import photos').first);
      await tester.pumpAndSettle();
      expect(find.text('1 / 2'), findsOneWidget);
      expect(picker.reads, 1);
      await tester.tap(find.text('Skip'));
      await tester.pumpAndSettle();
      expect(find.text('2 / 2'), findsOneWidget);
      expect(picker.reads, 2);
      await tester.pageBack();
      await tester.pumpAndSettle();
      expect(find.text('Your wardrobe starts here'), findsOneWidget);
      expect(api.uploads, isEmpty);
      expect(picker.discards, greaterThanOrEqualTo(2));
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
      experience.dispose();
    },
  );
  testWidgets(
    'detail edits metadata, selects only when tapped, and deletes with confirmation',
    (tester) async {
      api.handler = (path, method, body) async => method == 'PATCH'
          ? {
              'item': {...garment, ...?body},
            }
          : page([]);
      var selections = 0;
      await tester.pumpWidget(
        MaterialApp(
          theme: customerTheme(),
          home: Builder(
            builder: (context) => Scaffold(
              body: TextButton(
                onPressed: () => Navigator.push<void>(
                  context,
                  MaterialPageRoute(
                    builder: (_) => CustomerWardrobeDetail(
                      wardrobe: wardrobe,
                      item: garment,
                      onTryOn: (item) async {
                        selections++;
                      },
                    ),
                  ),
                ),
                child: const Text('Open'),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Open'));
      await tester.pumpAndSettle();
      expect(selections, 0);
      await tester.tap(find.text('Try it on'));
      await tester.pumpAndSettle();
      expect(selections, 1);
      await tester.tap(find.byTooltip('Edit garment'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextFormField).first, 'Blue shirt');
      await tester.tap(find.text('Save garment'));
      await tester.pumpAndSettle();
      expect(find.text('Blue shirt'), findsOneWidget);
      await tester.tap(find.byTooltip('Delete'));
      await tester.pumpAndSettle();
      expect(api.calls.where((c) => c.method == 'DELETE'), isEmpty);
      await tester.tap(find.text('Delete'));
      await tester.pumpAndSettle();
      expect(
        api.calls.where((c) => c.method == 'DELETE').single.path,
        '/wardrobe/garment-a',
      );
      expect(find.text('Open'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
}
