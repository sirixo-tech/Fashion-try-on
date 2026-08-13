import 'package:audioplayers/audioplayers.dart';

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
  Future<void> playCountdownStart(CaptureAudioProfile profile);

  Future<void> playFinalCountdownTick(
    CaptureAudioProfile profile,
    int secondsRemaining,
  );

  Future<void> playShutter(CaptureAudioProfile profile);

  Future<void> playCaptureSuccess(CaptureAudioProfile profile);

  Future<void> previewProfile(CaptureAudioProfile profile);

  Future<void> stop();

  Future<void> dispose();
}

class AssetCaptureAudioService implements CaptureAudioService {
  AssetCaptureAudioService({AudioPlayer? player})
    : _player = player ?? AudioPlayer(playerId: 'selfx_capture_audio');

  final AudioPlayer _player;

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
  Future<void> playCaptureSuccess(CaptureAudioProfile profile) {
    return _play(_CaptureAudioCue.success, profile);
  }

  @override
  Future<void> previewProfile(CaptureAudioProfile profile) async {
    await stop();
    await playCountdownStart(profile);
    await Future<void>.delayed(const Duration(milliseconds: 150));
    await playFinalCountdownTick(profile, 3);
    await Future<void>.delayed(const Duration(milliseconds: 150));
    await playShutter(profile);
    await Future<void>.delayed(const Duration(milliseconds: 180));
    await playCaptureSuccess(profile);
  }

  @override
  Future<void> stop() {
    return _player.stop();
  }

  @override
  Future<void> dispose() {
    return _player.dispose();
  }

  Future<void> _play(_CaptureAudioCue cue, CaptureAudioProfile profile) async {
    await _player.stop();
    await _player.play(AssetSource(_assetPath(profile, cue)));
  }
}

class SilentCaptureAudioService implements CaptureAudioService {
  const SilentCaptureAudioService();

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
  Future<void> playCaptureSuccess(CaptureAudioProfile profile) async {}

  @override
  Future<void> previewProfile(CaptureAudioProfile profile) async {}

  @override
  Future<void> stop() async {}

  @override
  Future<void> dispose() async {}
}

enum _CaptureAudioCue { start, tick, shutter, success }

String _assetPath(CaptureAudioProfile profile, _CaptureAudioCue cue) {
  return 'audio/capture/${profile.name}/${_fileName(cue)}';
}

String _fileName(_CaptureAudioCue cue) {
  return switch (cue) {
    _CaptureAudioCue.start => 'start.wav',
    _CaptureAudioCue.tick => 'tick.wav',
    _CaptureAudioCue.shutter => 'shutter.wav',
    _CaptureAudioCue.success => 'success.wav',
  };
}
