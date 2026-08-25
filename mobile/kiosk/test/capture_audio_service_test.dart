import 'package:audioplayers/audioplayers.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:selfx_kiosk/src/session/capture_audio_service.dart';

void main() {
  group('AssetCaptureAudioService', () {
    test('warms bundled cues using reusable low-latency players', () async {
      final createdPlayers = <String, FakeCaptureCueAudioPlayer>{};
      final preloadedPaths = <String>[];
      final service = AssetCaptureAudioService(
        assetPreloader: (paths) async => preloadedPaths.addAll(paths),
        playerFactory: (playerId) {
          return createdPlayers[playerId] = FakeCaptureCueAudioPlayer(playerId);
        },
      );

      await service.warmUpProfile(CaptureAudioProfile.soft);
      await service.playFinalCountdownTick(CaptureAudioProfile.soft, 3);

      expect(preloadedPaths, [
        'audio/capture/soft/start.wav',
        'audio/capture/countdown_tick.wav',
        'audio/capture/soft/shutter.wav',
      ]);
      expect(createdPlayers.keys, {
        'selfx_capture_soft_start',
        'selfx_capture_soft_tick',
        'selfx_capture_soft_shutter',
      });

      final tickPlayer = createdPlayers['selfx_capture_soft_tick'];
      expect(tickPlayer, isNotNull);
      expect(tickPlayer!.mode, PlayerMode.lowLatency);
      expect(tickPlayer.releaseMode, ReleaseMode.stop);
      expect(tickPlayer.sourcePath, 'audio/capture/countdown_tick.wav');
      expect(tickPlayer.events, containsAllInOrder(['stop', 'resume']));
    });

    test(
      'falls back to the default profile when selected profile fails',
      () async {
        final createdPlayers = <String, FakeCaptureCueAudioPlayer>{};
        final service = AssetCaptureAudioService(
          assetPreloader: (_) async {},
          playerFactory: (playerId) {
            final player = FakeCaptureCueAudioPlayer(playerId);
            if (playerId.startsWith('selfx_capture_digital_')) {
              player.failSetSource = true;
            }
            return createdPlayers[playerId] = player;
          },
        );

        await service.playCountdownStart(CaptureAudioProfile.digital);

        expect(createdPlayers, contains('selfx_capture_digital_start'));
        expect(createdPlayers, contains('selfx_capture_soft_start'));
        expect(
          createdPlayers['selfx_capture_soft_start']!.events,
          containsAllInOrder(['stop', 'resume']),
        );
      },
    );

    test('stops and disposes all warmed cue players', () async {
      final createdPlayers = <FakeCaptureCueAudioPlayer>[];
      final service = AssetCaptureAudioService(
        assetPreloader: (_) async {},
        playerFactory: (playerId) {
          final player = FakeCaptureCueAudioPlayer(playerId);
          createdPlayers.add(player);
          return player;
        },
      );

      await service.warmUpProfile(CaptureAudioProfile.classic);
      await service.stop();
      await service.dispose();

      expect(createdPlayers, hasLength(3));
      for (final player in createdPlayers) {
        expect(player.events, contains('stop'));
        expect(player.disposed, isTrue);
      }
    });
  });
}

class FakeCaptureCueAudioPlayer implements CaptureCueAudioPlayer {
  FakeCaptureCueAudioPlayer(this.playerId);

  final String playerId;
  final List<String> events = [];
  bool failSetSource = false;
  bool disposed = false;
  PlayerMode? mode;
  ReleaseMode? releaseMode;
  String? sourcePath;

  @override
  AudioCache audioCache = AudioCache(prefix: 'assets/');

  @override
  Future<void> setAudioContext(AudioContext context) async {
    events.add('context');
  }

  @override
  Future<void> setPlayerMode(PlayerMode mode) async {
    this.mode = mode;
    events.add('mode:${mode.name}');
  }

  @override
  Future<void> setReleaseMode(ReleaseMode mode) async {
    releaseMode = mode;
    events.add('release:${mode.name}');
  }

  @override
  Future<void> setSource(Source source) async {
    events.add('source');
    if (failSetSource) {
      throw StateError('unsupported cue');
    }
    sourcePath = switch (source) {
      AssetSource(:final path) => path,
      _ => source.toString(),
    };
  }

  @override
  Future<void> setVolume(double volume) async {
    events.add('volume:$volume');
  }

  @override
  Future<void> stop() async {
    events.add('stop');
  }

  @override
  Future<void> resume() async {
    events.add('resume');
  }

  @override
  Future<void> dispose() async {
    disposed = true;
    events.add('dispose');
  }
}
