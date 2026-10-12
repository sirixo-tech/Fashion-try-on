import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:selfx_kiosk/src/config/kiosk_runtime_configuration.dart';
import 'package:selfx_kiosk/src/config/kiosk_runtime_configuration_controller.dart';
import 'package:selfx_kiosk/src/device/kiosk_device_session_controller.dart';
import 'package:selfx_kiosk/src/idle/kiosk_idle_presentation.dart';
import 'package:selfx_kiosk/src/tryon/kiosk_try_on_session_controller.dart';
import 'package:selfx_kiosk/src/ui/kiosk_home_screen.dart';
import 'package:video_player/video_player.dart';
import 'package:video_player_platform_interface/video_player_platform_interface.dart';

import 'kiosk_camera_foundation_test.dart' as fixtures;

void main() {
  late _FakeVideoPlatform platform;
  late VideoPlayerPlatform previousPlatform;

  setUp(() {
    previousPlatform = VideoPlayerPlatform.instance;
    platform = _FakeVideoPlatform();
    VideoPlayerPlatform.instance = platform;
  });
  tearDown(() => VideoPlayerPlatform.instance = previousPlatform);

  testWidgets('bundled video keeps playing through both menus and Back', (
    tester,
  ) async {
    await _pumpHome(tester);
    expect(platform.sources.single.asset, fallbackIdleAsset.assetVideoPath);
    final player = tester
        .widget<VideoPlayer>(find.byType(VideoPlayer))
        .controller;
    expect(player.value.isPlaying, isTrue);
    expect(player.value.isLooping, isTrue);
    expect(player.value.volume, 0);
    final playCalls = platform.playCalls;
    for (final category in [
      'home-garments-category',
      'home-jewellery-category',
    ]) {
      await tester.tap(find.byKey(Key(category)));
      await tester.pumpAndSettle();
      expect(
        tester.widget<VideoPlayer>(find.byType(VideoPlayer)).controller,
        same(player),
      );
      expect(player.value.isPlaying, isTrue);
      await tester.tap(find.byKey(const Key('home-menu-back')));
      await tester.pumpAndSettle();
    }
    expect(platform.sources, hasLength(1));
    expect(platform.playCalls, playCalls);
    expect(platform.seekCalls, 0);
    expect(platform.disposedIds, isEmpty);
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(const Duration(milliseconds: 100));
    await tester.runAsync(() async {
      await Future<void>.delayed(const Duration(milliseconds: 20));
    });
    expect(platform.disposedIds, [1]);
  });

  testWidgets(
    'Store video takes priority and cached media changes replace the player',
    (tester) async {
      final config = await _pumpHome(tester, cachedStoreVideo: true);
      final original = tester
          .widget<VideoPlayer>(find.byType(VideoPlayer))
          .controller;
      expect(platform.sources.single.sourceType, DataSourceType.file);
      expect(platform.sources.single.uri, endsWith('/store-hero.mp4'));
      await tester.tap(find.byKey(const Key('home-jewellery-category')));
      await tester.pumpAndSettle();
      expect(
        tester.widget<VideoPlayer>(find.byType(VideoPlayer)).controller,
        same(original),
      );
      expect(platform.sources, hasLength(1));

      config.configuration = _storeVideoConfiguration('store-hero-v2.mp4');
      config.notifyListeners();
      await tester.pumpAndSettle();
      await tester.pump(const Duration(milliseconds: 100));
      await tester.runAsync(() async {
        await Future<void>.delayed(const Duration(milliseconds: 20));
      });
      expect(platform.sources, hasLength(2));
      expect(platform.sources.last.uri, endsWith('/store-hero-v2.mp4'));
      expect(platform.disposedIds, [1]);
      final replacement = tester
          .widget<VideoPlayer>(find.byType(VideoPlayer))
          .controller;
      expect(replacement, isNot(same(original)));
      expect(replacement.value.isPlaying, isTrue);
      expect(replacement.value.isLooping, isTrue);
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(milliseconds: 100));
    },
  );

  testWidgets(
    'a video failure during playback falls back without resetting the menu',
    (tester) async {
      await _pumpHome(tester);
      await tester.tap(find.byKey(const Key('home-jewellery-category')));
      await tester.pumpAndSettle();
      platform.events[1]!.addError(
        PlatformException(
          code: 'TEST_PLAYBACK_FAILED',
          message: 'Playback stopped',
        ),
      );
      await tester.pumpAndSettle();
      expect(find.byType(VideoPlayer), findsNothing);
      expect(find.text('Browse Jewellery'), findsOneWidget);
      expect(
        find.byWidgetPredicate(
          (widget) =>
              widget is Image &&
              widget.image is AssetImage &&
              (widget.image as AssetImage).assetName ==
                  fallbackIdleAsset.assetImagePath,
        ),
        findsOneWidget,
      );
      expect(platform.sources, hasLength(1));
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.runAsync(() async {
        await Future<void>.delayed(const Duration(milliseconds: 20));
      });
    },
  );

  testWidgets(
    'failed Store video uses the bundled wallpaper and keeps menus usable',
    (tester) async {
      platform.failInitialization = true;
      await _pumpHome(tester, cachedStoreVideo: true);
      expect(find.byType(VideoPlayer), findsNothing);
      expect(
        find.byWidgetPredicate(
          (widget) =>
              widget is Image &&
              widget.image is AssetImage &&
              (widget.image as AssetImage).assetName ==
                  fallbackIdleAsset.assetImagePath,
        ),
        findsOneWidget,
      );
      await tester.tap(find.byKey(const Key('home-garments-category')));
      await tester.pumpAndSettle();
      expect(find.text('Virtual Try-On'), findsOneWidget);
      expect(platform.sources, hasLength(1));
      expect(platform.playCalls, 0);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
}

KioskRuntimeConfiguration _storeVideoConfiguration(String name) =>
    KioskRuntimeConfiguration.fromJson({
      'display': {
        'assets': [
          {
            'id': 'store-hero',
            'type': 'REMOTE_VIDEO',
            'contentType': 'video/mp4',
            'assetVideoPath': 'C:/selfx-test-cache/$name',
          },
        ],
      },
    });

Future<KioskRuntimeConfigurationController> _pumpHome(
  WidgetTester tester, {
  bool cachedStoreVideo = false,
}) async {
  final capture = fixtures.testController();
  final tryOn = KioskTryOnSessionController(
    gateway: fixtures.FakeKioskTryOnGateway(),
  );
  final uploads = fixtures.testUploadController(capture.captureStore);
  final device = KioskDeviceSessionController(
    gateway: fixtures.FakeKioskDeviceGateway(),
    store: fixtures.InMemoryKioskDeviceCredentialStore(),
  );
  final config = KioskRuntimeConfigurationController(
    gateway: fixtures.FakeKioskDeviceGateway(),
    deviceController: device,
    cache: fixtures.InMemoryKioskRuntimeConfigurationCache(),
  );
  if (cachedStoreVideo) {
    config.configuration = _storeVideoConfiguration('store-hero.mp4');
  }
  addTearDown(() {
    uploads.dispose();
    tryOn.dispose();
    capture.dispose();
    config.dispose();
    device.dispose();
  });
  await tester.pumpWidget(
    MaterialApp(
      home: KioskHomeScreen(
        controller: capture,
        tryOnController: tryOn,
        uploadController: uploads,
        operatorAccessController: fixtures.testOperatorAccessController(),
        configurationController: config,
      ),
    ),
  );
  await tester.pumpAndSettle();
  return config;
}

class _FakeVideoPlatform extends VideoPlayerPlatform {
  final sources = <DataSource>[];
  final events = <int, StreamController<VideoEvent>>{};
  final disposedIds = <int>[];
  var playCalls = 0;
  var seekCalls = 0;
  var failInitialization = false;

  @override
  Future<void> init() async {}
  @override
  Future<int?> createWithOptions(VideoCreationOptions options) async {
    sources.add(options.dataSource);
    return sources.length;
  }

  @override
  Stream<VideoEvent> videoEventsFor(int playerId) {
    final stream = StreamController<VideoEvent>();
    events[playerId] = stream;
    scheduleMicrotask(() {
      if (failInitialization) {
        stream.addError(
          PlatformException(
            code: 'TEST_VIDEO_UNAVAILABLE',
            message: 'Video playback unavailable',
          ),
        );
      } else {
        stream.add(
          VideoEvent(
            eventType: VideoEventType.initialized,
            duration: const Duration(seconds: 30),
            size: const Size(900, 1600),
          ),
        );
      }
    });
    return stream.stream;
  }

  @override
  Widget buildViewWithOptions(VideoViewOptions options) =>
      const ColoredBox(color: Colors.black);
  @override
  Future<void> dispose(int playerId) async {
    disposedIds.add(playerId);
    await events.remove(playerId)?.close();
  }

  @override
  Future<void> play(int playerId) async => playCalls++;
  @override
  Future<void> pause(int playerId) async {}
  @override
  Future<void> setLooping(int playerId, bool looping) async {}
  @override
  Future<void> setVolume(int playerId, double volume) async {}
  @override
  Future<void> setPlaybackSpeed(int playerId, double speed) async {}
  @override
  Future<void> setMixWithOthers(bool mixWithOthers) async {}
  @override
  Future<void> seekTo(int playerId, Duration position) async => seekCalls++;
  @override
  Future<Duration> getPosition(int playerId) async =>
      const Duration(seconds: 2);
}
