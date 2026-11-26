import 'package:selfx_customer/src/ui/customer_wardrobe_screen.dart';
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:selfx_customer/src/auth/customer_api.dart';
import 'package:selfx_customer/src/auth/customer_controller.dart';
import 'package:selfx_customer/src/experience/customer_experience.dart';
import 'package:selfx_customer/src/services/customer_outfit_planner.dart';
import 'package:selfx_customer/src/ui/customer_outfit_planner_screen.dart';
import 'package:selfx_customer/src/ui/customer_theme.dart';
import 'fakes.dart';

final bytes = base64Decode(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4AWP4DwQACfsD/fteaysAAAAASUVORK5CYII=',
);
final clothes = <Json>[
  {'id': 'garment-a', 'name': 'Navy shirt', 'category': 'TOPS'},
  {'id': 'garment-b', 'name': 'Black trousers', 'category': 'BOTTOMS'},
];

class PlannerApi extends FakeCustomerApi implements CustomerMediaApi {
  final schedules = <Json>[];
  bool emptyWardrobe = false, failSave = false;
  Uint8List? image;
  @override
  Future<Json> upload(
    String path,
    Uint8List bytes,
    String mime,
    String token,
  ) async =>
      throw UnimplementedError('Scheduling never uploads or generates images.');
  @override
  Future<Uint8List> download(String path, String token) async => image ?? bytes;
  void useSchedules() {
    handler = (path, method, body) async {
      final uri = Uri.parse(path);
      if (uri.path == '/wardrobe') {
        return {
          'items': emptyWardrobe ? <Json>[] : clothes,
          'page': 1,
          'hasMore': false,
        };
      }
      if (uri.path == '/outfit-schedules' && method == 'GET') {
        final days = <String, int>{};
        for (final item in schedules) {
          final date = item['date'] as String;
          if (date.compareTo(uri.queryParameters['from']!) >= 0 &&
              date.compareTo(uri.queryParameters['to']!) <= 0) {
            days.update(date, (old) => old + 1, ifAbsent: () => 1);
          }
        }
        return {
          'items': schedules
              .where((item) => item['date'] == uri.queryParameters['day'])
              .toList(),
          'page': 1,
          'hasMore': false,
          'hasWardrobeItems': !emptyWardrobe,
          'days': [
            for (final entry in days.entries)
              {'date': entry.key, 'count': entry.value},
          ],
        };
      }
      if (uri.path.startsWith('/outfit-schedules') && method == 'POST') {
        if (failSave) {
          throw const CustomerApiException(
            'NETWORK_ERROR',
            'Connection lost.',
            503,
          );
        }
        final item = entry(body!['id'] as String, body);
        schedules.add(item);
        return {'item': item};
      }
      if (uri.path.startsWith('/outfit-schedules/') && method == 'PATCH') {
        final index = schedules.indexWhere(
          (item) => item['id'] == uri.pathSegments.last,
        );
        final old = schedules[index];
        final item = entry(
          old['id'] as String,
          body!,
          version: (old['version'] as int) + 1,
        );
        schedules[index] = item;
        return {'item': item};
      }
      if (uri.path.startsWith('/outfit-schedules/') && method == 'DELETE') {
        schedules.removeWhere((item) => item['id'] == uri.pathSegments.last);
        return {'deleted': true};
      }
      return <String, dynamic>{};
    };
  }

  Json entry(String id, Json body, {int version = 1}) => {
    'id': id,
    'date': body['date'],
    'occasion': body['occasion'],
    'notes': body['notes'],
    'version': version,
    'pieces': [
      for (final garmentId in (body['garmentIds'] as List))
        {
          'id': 'piece-$garmentId',
          'garment': clothes.firstWhere((item) => item['id'] == garmentId),
        },
    ],
  };
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting('en');
    if (!const bool.fromEnvironment('SELFX_RENDER_PLANNER')) return;
    final sdk = Platform.environment['FLUTTER_ROOT']!;
    for (final entry in {
      'Roboto': ['roboto-regular.ttf', 'roboto-bold.ttf'],
      'MaterialIcons': ['materialicons-regular.otf'],
    }.entries) {
      final loader = FontLoader(entry.key);
      for (final file in entry.value) {
        loader.addFont(
          File(
            '$sdk/bin/cache/artifacts/material_fonts/$file',
          ).readAsBytes().then(ByteData.sublistView),
        );
      }
      await loader.load();
    }
  });
  late PlannerApi api;
  late CustomerController auth;
  late CustomerOutfitPlanner planner;
  setUp(() async {
    api = PlannerApi();
    auth = CustomerController(
      api: api,
      store: MemorySessionStore(),
      identity: FakeIdentity(),
    );
    await auth.initialize();
    await auth.signIn('synthetic@example.test', 'synthetic-password');
    api.useSchedules();
    planner = CustomerOutfitPlanner(auth, today: DateTime(2026, 11, 26));
  });
  tearDown(() {
    planner.dispose();
    auth.dispose();
  });
  Json payload() => {
    'date': '2026-11-26',
    'occasion': 'Dinner',
    'notes': 'Bring a jacket',
    'garmentIds': ['garment-a', 'garment-b'],
  };
  test('week windows stay valid at the date-picker boundaries', () async {
    await planner.chooseDay(DateTime(2199, 12, 31));
    expect(outfitDateKey(planner.weekEnd), '2199-12-31');
    expect(planner.canNextWeek, false);
    await planner.chooseDay(DateTime(1900));
    expect(planner.canPreviousWeek, false);
    expect(outfitDateKey(planner.weekEnd), '1900-01-07');
  });
  test(
    'date keys preserve calendar days across months, leap years and timezone offsets',
    () async {
      expect(outfitDateKey(DateTime(2028, 2, 29)), '2028-02-29');
      expect(outfitDate('2026-11-26'), DateTime(2026, 11, 26));
      await planner.chooseDay(DateTime(2026, 12, 31, 23, 59));
      await planner.shiftWeek(1);
      expect(outfitDateKey(planner.weekStart), '2027-01-07');
      expect(outfitDateKey(planner.weekEnd), '2027-01-13');
      final query = Uri.parse(api.calls.last.path).queryParameters;
      expect(query, {
        'from': '2027-01-07',
        'to': '2027-01-13',
        'day': '2027-01-07',
        'page': '1',
      });
    },
  );
  test('a late day response cannot overwrite the newly selected day', () async {
    final pending = Completer<Json>();
    api.handler = (path, method, body) async =>
        Uri.parse(path).queryParameters['day'] == '2026-11-26'
        ? pending.future
        : {
            'items': <Json>[],
            'page': 1,
            'hasMore': false,
            'hasWardrobeItems': true,
            'days': <Json>[],
          };
    final old = planner.load();
    await planner.chooseDay(DateTime(2026, 11, 27));
    pending.complete({
      'items': [api.entry('old', payload())],
      'page': 1,
      'hasMore': false,
      'hasWardrobeItems': true,
      'days': <Json>[],
    });
    await old;
    expect(planner.items, isEmpty);
    expect(outfitDateKey(planner.selectedDay), '2026-11-27');
  });
  test(
    'late account responses clear scheduled outfits after sign-out',
    () async {
      final pending = Completer<Json>();
      api.handler = (path, method, body) async =>
          path.startsWith('/outfit-schedules')
          ? pending.future
          : <String, dynamic>{};
      final loading = planner.load();
      await auth.signOut();
      pending.complete({
        'items': [api.entry('private', payload())],
        'page': 1,
        'hasMore': false,
        'hasWardrobeItems': true,
        'days': <Json>[],
      });
      await loading;
      expect(planner.items, isEmpty);
      expect(planner.days, isEmpty);
      expect(planner.active, false);
    },
  );
  test(
    'day pagination preserves filter context and deduplicates schedule ids',
    () async {
      api.handler = (path, method, body) async => {
        'items': [
          api.entry('one', payload()),
          if (Uri.parse(path).queryParameters['page'] == '2')
            api.entry('two', payload()),
        ],
        'page': int.parse(Uri.parse(path).queryParameters['page']!),
        'hasMore': Uri.parse(path).queryParameters['page'] == '1',
        'hasWardrobeItems': true,
        'days': [
          {'date': '2026-11-26', 'count': 2},
        ],
      };
      await planner.load();
      await planner.load(more: true);
      expect(planner.items.length, 2);
      expect(planner.days['2026-11-26'], 2);
      expect(planner.hasMore, false);
      expect(
        Uri.parse(api.calls.last.path).queryParameters['day'],
        '2026-11-26',
      );
    },
  );
  Future<void> mount(
    WidgetTester tester, {
    VoidCallback? import,
    GlobalKey? boundary,
  }) async {
    await tester.pumpWidget(
      RepaintBoundary(
        key: boundary,
        child: MaterialApp(
          debugShowCheckedModeBanner: false,
          theme: customerTheme(),
          builder: (context, child) =>
              ColoredBox(color: CustomerColors.canvas, child: child),
          home: CustomerOutfitPlannerScreen(
            auth: auth,
            initialDay: DateTime(2026, 11, 26),
            onImport: import == null
                ? null
                : () async {
                    import();
                  },
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  Future<void> tapMenu(WidgetTester tester, String label) async {
    await tester.tap(find.byTooltip('More options'));
    await tester.pumpAndSettle();
    await tester.tap(find.text(label));
    await tester.pumpAndSettle();
  }

  testWidgets(
    'weekly planner builds, edits, moves and deletes outfits without generation',
    (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      api.image = File(
        'assets/editorial/navy-overshirt.webp',
      ).readAsBytesSync();
      final boundary = GlobalKey();
      await mount(tester, boundary: boundary);
      await capture(tester, boundary, 'outfit-planner-empty');
      await tester.tap(find.byKey(const ValueKey('outfit-day-2026-11-27')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Add outfit'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField).first, 'Dinner');
      await tester.tap(find.text('Choose from wardrobe'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('choose-outfit-garment-a')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('choose-outfit-garment-b')));
      await tester.pumpAndSettle();
      await capture(tester, boundary, 'outfit-planner-pieces');
      await tester.tap(find.text('Done'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField).last, 'Bring a jacket');
      await tester.scrollUntilVisible(
        find.byKey(const ValueKey('save-scheduled-outfit')),
        150,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.pumpAndSettle();
      await capture(tester, boundary, 'outfit-planner-editor');
      await tester.tap(find.byKey(const ValueKey('save-scheduled-outfit')));
      await tester.pumpAndSettle();
      expect(api.schedules.single['date'], '2026-11-27');
      expect(find.text('Dinner'), findsOneWidget);
      expect(find.text('Navy shirt'), findsOneWidget);
      await capture(tester, boundary, 'outfit-planner-week');
      await tapMenu(tester, 'Edit outfit');
      await tester.enterText(find.byType(TextField).first, 'Office');
      await tester.scrollUntilVisible(
        find.byKey(const ValueKey('save-scheduled-outfit')),
        150,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('save-scheduled-outfit')));
      await tester.pumpAndSettle();
      expect(find.text('Office'), findsOneWidget);
      await tapMenu(tester, 'Move to another date');
      await tester.tap(
        find.descendant(
          of: find.byType(DatePickerDialog),
          matching: find.text('28'),
        ),
      );
      await tester.tap(find.text('OK'));
      await tester.pumpAndSettle();
      expect(api.schedules.single['date'], '2026-11-28');
      expect(find.text('Office'), findsOneWidget);
      await tapMenu(tester, 'Delete');
      expect(api.schedules, hasLength(1));
      await tester.tap(find.text('Delete'));
      await tester.pumpAndSettle();
      expect(api.schedules, isEmpty);
      expect(find.text('No outfit scheduled for this day.'), findsOneWidget);
      expect(api.calls.any((call) => call.path == '/try-on/runs'), false);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'empty wardrobe offers import instead of creating an empty outfit',
    (tester) async {
      api.emptyWardrobe = true;
      var imports = 0;
      await mount(
        tester,
        import: () {
          imports++;
        },
      );
      expect(find.text('Your wardrobe is empty'), findsOneWidget);
      expect(find.text('Add outfit'), findsNothing);
      await tester.tap(find.text('Import photos'));
      await tester.pumpAndSettle();
      expect(imports, 1);
    },
  );
  testWidgets(
    'interrupted saves retry the same id and payload and show errors honestly',
    (tester) async {
      api.failSave = true;
      await tester.pumpWidget(
        MaterialApp(
          theme: customerTheme(),
          home: Builder(
            builder: (context) => Scaffold(
              body: TextButton(
                onPressed: () => Navigator.push<Json>(
                  context,
                  MaterialPageRoute(
                    builder: (_) => CustomerOutfitScheduleEditor(
                      planner: planner,
                      initialGarment: clothes.first,
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
      await tester.ensureVisible(
        find.byKey(const ValueKey('save-scheduled-outfit')),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('save-scheduled-outfit')));
      await tester.pumpAndSettle();
      expect(api.schedules, isEmpty);
      expect(find.text('Connection lost.'), findsOneWidget);
      api.failSave = false;
      await tester.ensureVisible(find.text('Try again'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Try again'));
      await tester.pumpAndSettle();
      expect(api.schedules, hasLength(1));
      final calls = api.calls
          .where(
            (call) => call.path == '/outfit-schedules' && call.method == 'POST',
          )
          .toList();
      expect(calls, hasLength(2));
      expect(calls[0].body, calls[1].body);
      expect(find.text('Open'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'deleted garment placeholders do not fetch or display original photos',
    (tester) async {
      api.schedules.add({
        'id': 'removed',
        'date': '2026-11-26',
        'version': 1,
        'occasion': 'Dinner',
        'notes': '',
        'pieces': [
          {'id': 'piece', 'garment': null},
        ],
      });
      await mount(tester);
      expect(find.text('Garment unavailable'), findsOneWidget);
      expect(find.byType(WardrobeImage), findsNothing);
    },
  );
  testWidgets('planner and nested editor close and clear on sign-out', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: customerTheme(),
        home: Builder(
          builder: (context) => Scaffold(
            body: TextButton(
              onPressed: () => Navigator.push<void>(
                context,
                MaterialPageRoute(
                  builder: (_) => CustomerOutfitPlannerScreen(
                    auth: auth,
                    initialDay: DateTime(2026, 11, 26),
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
    await tester.tap(find.text('Add outfit'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).first, 'Private occasion');
    await tester.runAsync(() => auth.signOut());
    await tester.pumpAndSettle();
    expect(find.text('Private occasion'), findsNothing);
    expect(find.byType(CustomerOutfitScheduleEditor), findsNothing);
    expect(find.text('Open'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
  testWidgets(
    'Wardrobe calendar and garment menu open the planner with the selected piece',
    (tester) async {
      final experience = CustomerExperience(auth);
      await tester.pumpWidget(
        MaterialApp(
          theme: customerTheme(),
          home: Scaffold(
            body: SingleChildScrollView(
              child: CustomerWardrobePanel(experience: experience),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('wardrobe-planner')));
      await tester.pumpAndSettle();
      expect(find.byType(CustomerOutfitPlannerScreen), findsOneWidget);
      await tester.pageBack();
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Navy shirt'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Navy shirt'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('wardrobe-actions')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Schedule outfit'));
      await tester.pumpAndSettle();
      expect(find.byType(CustomerOutfitScheduleEditor), findsOneWidget);
      expect(find.text('Navy shirt'), findsOneWidget);
      expect(api.calls.any((call) => call.path == '/try-on/runs'), false);
      await tester.pumpWidget(const SizedBox.shrink());
      experience.dispose();
    },
  );
  for (final direction in [TextDirection.ltr, TextDirection.rtl]) {
    testWidgets('weekly day controls fit narrow large-text $direction', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(320, 740);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(
        MaterialApp(
          theme: customerTheme(),
          builder: (context, child) => Directionality(
            textDirection: direction,
            child: MediaQuery(
              data: MediaQuery.of(
                context,
              ).copyWith(textScaler: TextScaler.linear(1.4)),
              child: child!,
            ),
          ),
          home: CustomerOutfitPlannerScreen(
            auth: auth,
            initialDay: DateTime(2026, 11, 26),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(
        find.byKey(const ValueKey('outfit-day-2026-11-26')),
        findsOneWidget,
      );
      await tester.tap(find.byTooltip('Next week'));
      await tester.pumpAndSettle();
      expect(
        find.byKey(const ValueKey('outfit-day-2026-12-03')),
        findsOneWidget,
      );
      expect(tester.takeException(), isNull);
    });
  }
}

Future<void> capture(
  WidgetTester tester,
  GlobalKey boundary,
  String name,
) async {
  if (!const bool.fromEnvironment('SELFX_RENDER_PLANNER')) return;
  await tester.runAsync(
    () => Future<void>.delayed(const Duration(milliseconds: 150)),
  );
  await tester.pumpAndSettle();
  await tester.runAsync(() async {
    final image =
        await (boundary.currentContext!.findRenderObject()!
                as RenderRepaintBoundary)
            .toImage(pixelRatio: 1.5);
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    final file = File('../tmp/customer-mobile-review/$name.png');
    await file.parent.create(recursive: true);
    await file.writeAsBytes(bytes!.buffer.asUint8List());
    image.dispose();
  });
}
