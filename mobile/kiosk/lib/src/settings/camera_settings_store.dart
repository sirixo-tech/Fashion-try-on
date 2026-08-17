import 'dart:io';

import 'package:shared_preferences/shared_preferences.dart';

import '../camera/camera_orientation.dart';
import '../session/capture_audio_service.dart';
import '../session/capture_flow.dart';

abstract class CameraSettingsStore {
  Future<String?> readPreferredCameraId();

  Future<void> savePreferredCameraId(String cameraId);

  Future<void> clearPreferredCameraId();

  Future<int> readCaptureCountdownSeconds();

  Future<void> saveCaptureCountdownSeconds(int seconds);

  Future<bool> readCaptureSoundsEnabled();

  Future<void> saveCaptureSoundsEnabled(bool enabled);

  Future<CaptureAudioProfile> readCaptureAudioProfile();

  Future<void> saveCaptureAudioProfile(CaptureAudioProfile profile);

  Future<CameraOrientationMode> readCameraOrientationMode();

  Future<void> saveCameraOrientationMode(CameraOrientationMode mode);
}

class SharedPreferencesCameraSettingsStore implements CameraSettingsStore {
  SharedPreferencesCameraSettingsStore(this._preferences, {String? platformKey})
    : _preferredCameraIdKey =
          'selfx.kiosk.${platformKey ?? Platform.operatingSystem}.preferredCameraId',
      _captureCountdownSecondsKey =
          'selfx.kiosk.${platformKey ?? Platform.operatingSystem}.captureCountdownSeconds',
      _captureSoundsEnabledKey =
          'selfx.kiosk.${platformKey ?? Platform.operatingSystem}.captureSoundsEnabled',
      _captureAudioProfileKey =
          'selfx.kiosk.${platformKey ?? Platform.operatingSystem}.captureAudioProfile',
      _cameraOrientationModeKey =
          'selfx.kiosk.${platformKey ?? Platform.operatingSystem}.cameraOrientationMode';

  final String _preferredCameraIdKey;
  final String _captureCountdownSecondsKey;
  final String _captureSoundsEnabledKey;
  final String _captureAudioProfileKey;
  final String _cameraOrientationModeKey;

  final SharedPreferencesAsync _preferences;

  @override
  Future<String?> readPreferredCameraId() {
    return _preferences.getString(_preferredCameraIdKey);
  }

  @override
  Future<void> savePreferredCameraId(String cameraId) {
    return _preferences.setString(_preferredCameraIdKey, cameraId);
  }

  @override
  Future<void> clearPreferredCameraId() {
    return _preferences.remove(_preferredCameraIdKey);
  }

  @override
  Future<int> readCaptureCountdownSeconds() async {
    final value = await _preferences.getInt(_captureCountdownSecondsKey);
    return normalizeCaptureCountdownSeconds(value);
  }

  @override
  Future<void> saveCaptureCountdownSeconds(int seconds) {
    return _preferences.setInt(
      _captureCountdownSecondsKey,
      normalizeCaptureCountdownSeconds(seconds),
    );
  }

  @override
  Future<bool> readCaptureSoundsEnabled() async {
    return await _preferences.getBool(_captureSoundsEnabledKey) ?? true;
  }

  @override
  Future<void> saveCaptureSoundsEnabled(bool enabled) {
    return _preferences.setBool(_captureSoundsEnabledKey, enabled);
  }

  @override
  Future<CaptureAudioProfile> readCaptureAudioProfile() async {
    final value = await _preferences.getString(_captureAudioProfileKey);
    return captureAudioProfileFromName(value);
  }

  @override
  Future<void> saveCaptureAudioProfile(CaptureAudioProfile profile) {
    return _preferences.setString(_captureAudioProfileKey, profile.name);
  }

  @override
  Future<CameraOrientationMode> readCameraOrientationMode() async {
    final value = await _preferences.getString(_cameraOrientationModeKey);
    return cameraOrientationModeFromStorage(value);
  }

  @override
  Future<void> saveCameraOrientationMode(CameraOrientationMode mode) {
    return _preferences.setString(_cameraOrientationModeKey, mode.storageValue);
  }
}

class InMemoryCameraSettingsStore implements CameraSettingsStore {
  String? preferredCameraId;
  int? captureCountdownSeconds;
  bool? captureSoundsEnabled;
  CaptureAudioProfile? captureAudioProfile;
  CameraOrientationMode? cameraOrientationMode;

  @override
  Future<String?> readPreferredCameraId() async => preferredCameraId;

  @override
  Future<void> savePreferredCameraId(String cameraId) async {
    preferredCameraId = cameraId;
  }

  @override
  Future<void> clearPreferredCameraId() async {
    preferredCameraId = null;
  }

  @override
  Future<int> readCaptureCountdownSeconds() async {
    return normalizeCaptureCountdownSeconds(captureCountdownSeconds);
  }

  @override
  Future<void> saveCaptureCountdownSeconds(int seconds) async {
    captureCountdownSeconds = normalizeCaptureCountdownSeconds(seconds);
  }

  @override
  Future<bool> readCaptureSoundsEnabled() async {
    return captureSoundsEnabled ?? true;
  }

  @override
  Future<void> saveCaptureSoundsEnabled(bool enabled) async {
    captureSoundsEnabled = enabled;
  }

  @override
  Future<CaptureAudioProfile> readCaptureAudioProfile() async {
    return captureAudioProfile ?? defaultCaptureAudioProfile;
  }

  @override
  Future<void> saveCaptureAudioProfile(CaptureAudioProfile profile) async {
    captureAudioProfile = profile;
  }

  @override
  Future<CameraOrientationMode> readCameraOrientationMode() async {
    return cameraOrientationMode ?? defaultCameraOrientationMode;
  }

  @override
  Future<void> saveCameraOrientationMode(CameraOrientationMode mode) async {
    cameraOrientationMode = mode;
  }
}
