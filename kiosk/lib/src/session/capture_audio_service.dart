import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/foundation.dart';

enum CaptureAudioProfile {
  soft('Soft'),
  classic('Classic'),
  digital('Digital'),
  minimal('Minimal');

  const CaptureAudioProfile(this.label);

  final String label;
}

const defaultCaptureAudioProfile = CaptureAudioProfile.soft;

CaptureAudioProfile captureAudioProfileFromName(String? name) {
  for (final profile in CaptureAudioProfile.values) {
    if (profile.name == name) {
      return profile;
    }
  }
  return defaultCaptureAudioProfile;
}

abstract class CaptureAudioService {
  Future<void> warmUpProfile(CaptureAudioProfile profile);

  Future<void> playCountdownStart(CaptureAudioProfile profile);

  Future<void> playFinalCountdownTick(
    CaptureAudioProfile profile,
    int secondsRemaining,
  );

  Future<void> playShutter(CaptureAudioProfile profile);

  Future<void> previewProfile(CaptureAudioProfile profile);

  Future<void> stop();

  Future<void> dispose();
}

typedef CaptureCueAudioPlayerFactory =
    CaptureCueAudioPlayer Function(String playerId);

typedef CaptureAudioAssetPreloader = Future<void> Function(List<String> paths);

abstract class CaptureCueAudioPlayer {
  AudioCache get audioCache;

  set audioCache(AudioCache cache);

  Future<void> setAudioContext(AudioContext context);

  Future<void> setPlayerMode(PlayerMode mode);

  Future<void> setReleaseMode(ReleaseMode mode);

  Future<void> setSource(Source source);

  Future<void> setVolume(double volume);

  Future<void> stop();

  Future<void> resume();

  Future<void> dispose();
}

class AudioplayersCaptureCuePlayer implements CaptureCueAudioPlayer {
  AudioplayersCaptureCuePlayer(String playerId)
    : _player = AudioPlayer(playerId: playerId);

  final AudioPlayer _player;

  @override
  AudioCache get audioCache => _player.audioCache;

  @override
  set audioCache(AudioCache cache) {
    _player.audioCache = cache;
  }

  @override
  Future<void> setAudioContext(AudioContext context) {
    return _player.setAudioContext(context);
  }

  @override
  Future<void> setPlayerMode(PlayerMode mode) {
    return _player.setPlayerMode(mode);
  }

  @override
  Future<void> setReleaseMode(ReleaseMode mode) {
    return _player.setReleaseMode(mode);
  }

  @override
  Future<void> setSource(Source source) {
    return _player.setSource(source);
  }

  @override
  Future<void> setVolume(double volume) {
    return _player.setVolume(volume);
  }

  @override
  Future<void> stop() {
    return _player.stop();
  }

  @override
  Future<void> resume() {
    return _player.resume();
  }

  @override
  Future<void> dispose() {
    return _player.dispose();
  }
}

class AssetCaptureAudioService implements CaptureAudioService {
  AssetCaptureAudioService({
    AudioCache? audioCache,
    CaptureCueAudioPlayerFactory? playerFactory,
    CaptureAudioAssetPreloader? assetPreloader,
  }) : _audioCache =
           audioCache ??
           AudioCache(prefix: 'assets/', cacheId: 'selfx_capture_audio'),
       _playerFactory =
           playerFactory ??
           ((playerId) => AudioplayersCaptureCuePlayer(playerId)),
       _preloadAssets = assetPreloader;

  final AudioCache _audioCache;
  final CaptureCueAudioPlayerFactory _playerFactory;
  final CaptureAudioAssetPreloader? _preloadAssets;
  final Map<CaptureAudioProfile, Future<void>> _profileWarmUps = {};
  final Map<CaptureAudioProfile, Map<_CaptureAudioCue, CaptureCueAudioPlayer>>
  _profilePlayers = {};
  bool _disposed = false;

  static final AudioContext _kioskAudioContext = AudioContextConfig(
    route: AudioContextConfigRoute.system,
    focus: AudioContextConfigFocus.gain,
    respectSilence: false,
  ).build();

  @override
  Future<void> warmUpProfile(CaptureAudioProfile profile) {
    return _ensureProfileReady(profile);
  }

  @override
  Future<void> playCountdownStart(CaptureAudioProfile profile) {
    return _play(_CaptureAudioCue.start, profile);
  }

  @override
  Future<void> playFinalCountdownTick(
    CaptureAudioProfile profile,
    int secondsRemaining,
  ) {
    return _play(_CaptureAudioCue.tick, profile);
  }

  @override
  Future<void> playShutter(CaptureAudioProfile profile) {
    return _play(_CaptureAudioCue.shutter, profile);
  }

  @override
  Future<void> previewProfile(CaptureAudioProfile profile) async {
    await warmUpProfile(profile);
    await stop();
    await playCountdownStart(profile);
    await Future<void>.delayed(const Duration(seconds: 1));
    await playFinalCountdownTick(profile, 3);
    await Future<void>.delayed(const Duration(seconds: 1));
    await playFinalCountdownTick(profile, 2);
    await Future<void>.delayed(const Duration(seconds: 1));
    await playFinalCountdownTick(profile, 1);
    await Future<void>.delayed(const Duration(seconds: 1));
    await playShutter(profile);
  }

  @override
  Future<void> stop() async {
    final players = _profilePlayers.values
        .expand((profilePlayers) => profilePlayers.values)
        .toList(growable: false);
    await Future.wait(players.map((player) => player.stop()));
  }

  @override
  Future<void> dispose() async {
    _disposed = true;
    final players = _profilePlayers.values
        .expand((profilePlayers) => profilePlayers.values)
        .toList(growable: false);
    _profileWarmUps.clear();
    _profilePlayers.clear();
    await Future.wait(players.map((player) => player.dispose()));
  }

  Future<void> _play(_CaptureAudioCue cue, CaptureAudioProfile profile) async {
    try {
      await _restartCue(cue, profile);
    } catch (error) {
      if (profile == defaultCaptureAudioProfile) {
        rethrow;
      }
      debugPrint(
        'Capture audio profile ${profile.name} failed for ${cue.name}; '
        'falling back to ${defaultCaptureAudioProfile.name}: $error',
      );
      await _restartCue(cue, defaultCaptureAudioProfile);
    }
  }

  Future<void> _restartCue(
    _CaptureAudioCue cue,
    CaptureAudioProfile profile,
  ) async {
    final player = await _playerFor(profile, cue);
    await player.stop();
    await player.setVolume(1);
    await player.resume();
  }

  Future<CaptureCueAudioPlayer> _playerFor(
    CaptureAudioProfile profile,
    _CaptureAudioCue cue,
  ) async {
    await _ensureProfileReady(profile);
    final player = _profilePlayers[profile]?[cue];
    if (player == null) {
      throw StateError('Capture audio cue ${profile.name}/${cue.name} missing');
    }
    return player;
  }

  Future<void> _ensureProfileReady(CaptureAudioProfile profile) {
    if (_disposed) {
      throw StateError('Capture audio service has been disposed.');
    }
    final existing = _profileWarmUps[profile];
    if (existing != null) {
      return existing;
    }
    final warmUp = _createProfilePlayers(profile);
    _profileWarmUps[profile] = warmUp;
    return warmUp.catchError((Object error) {
      _profileWarmUps.remove(profile);
      throw error;
    });
  }

  Future<void> _createProfilePlayers(CaptureAudioProfile profile) async {
    final paths = _CaptureAudioCue.values
        .map((cue) => _assetPath(profile, cue))
        .toList(growable: false);
    if (_preloadAssets != null) {
      await _preloadAssets(paths);
    } else {
      await _audioCache.loadAll(paths);
    }

    final players = <_CaptureAudioCue, CaptureCueAudioPlayer>{};
    try {
      for (final cue in _CaptureAudioCue.values) {
        final player = _playerFactory(
          'selfx_capture_${profile.name}_${cue.name}',
        );
        player.audioCache = _audioCache;
        await player.setPlayerMode(PlayerMode.lowLatency);
        await player.setReleaseMode(ReleaseMode.stop);
        try {
          await player.setAudioContext(_kioskAudioContext);
        } catch (error) {
          debugPrint('Capture audio context unavailable: $error');
        }
        await player.setSource(AssetSource(_assetPath(profile, cue)));
        await player.setVolume(1);
        players[cue] = player;
      }
      _profilePlayers[profile] = players;
    } catch (_) {
      await Future.wait(players.values.map((player) => player.dispose()));
      rethrow;
    }
  }
}

class SilentCaptureAudioService implements CaptureAudioService {
  const SilentCaptureAudioService();

  @override
  Future<void> warmUpProfile(CaptureAudioProfile profile) async {}

  @override
  Future<void> playCountdownStart(CaptureAudioProfile profile) async {}

  @override
  Future<void> playFinalCountdownTick(
    CaptureAudioProfile profile,
    int secondsRemaining,
  ) async {}

  @override
  Future<void> playShutter(CaptureAudioProfile profile) async {}

  @override
  Future<void> previewProfile(CaptureAudioProfile profile) async {}

  @override
  Future<void> stop() async {}

  @override
  Future<void> dispose() async {}
}

enum _CaptureAudioCue { start, tick, shutter }

const _countdownTickAssetPath = 'audio/capture/countdown_tick.wav';

String _assetPath(CaptureAudioProfile profile, _CaptureAudioCue cue) {
  if (cue == _CaptureAudioCue.tick) {
    return _countdownTickAssetPath;
  }
  return 'audio/capture/${profile.name}/${_fileName(cue)}';
}

String _fileName(_CaptureAudioCue cue) {
  return switch (cue) {
    _CaptureAudioCue.start => 'start.wav',
    _CaptureAudioCue.tick => 'tick.wav',
    _CaptureAudioCue.shutter => 'shutter.wav',
  };
}
