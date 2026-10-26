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

  Future<bool> readMultiGarmentSelectionEnabled();

  Future<void> saveMultiGarmentSelectionEnabled(bool enabled);

  Future<int> readMaxTryOnPicks();

  Future<void> saveMaxTryOnPicks(int count);

  Future<bool> readShowMyPicksCounter();

  Future<void> saveShowMyPicksCounter(bool enabled);

  Future<bool> readSaveMyLooksQrEnabled();

  Future<void> saveSaveMyLooksQrEnabled(bool enabled);
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
          'selfx.kiosk.${platformKey ?? Platform.operatingSystem}.cameraOrientationMode',
      _multiGarmentSelectionEnabledKey =
          'selfx.kiosk.${platformKey ?? Platform.operatingSystem}.multiGarmentSelectionEnabled',
      _maxTryOnPicksKey =
          'selfx.kiosk.${platformKey ?? Platform.operatingSystem}.maxTryOnPicks',
      _showMyPicksCounterKey =
          'selfx.kiosk.${platformKey ?? Platform.operatingSystem}.showMyPicksCounter',
      _saveMyLooksQrEnabledKey =
          'selfx.kiosk.${platformKey ?? Platform.operatingSystem}.saveMyLooksQrEnabled';

  final String _preferredCameraIdKey;
  final String _captureCountdownSecondsKey;
  final String _captureSoundsEnabledKey;
  final String _captureAudioProfileKey;
  final String _cameraOrientationModeKey;
  final String _multiGarmentSelectionEnabledKey;
  final String _maxTryOnPicksKey;
  final String _showMyPicksCounterKey;
  final String _saveMyLooksQrEnabledKey;

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

  @override
  Future<bool> readMultiGarmentSelectionEnabled() async {
    return await _preferences.getBool(_multiGarmentSelectionEnabledKey) ?? true;
  }

  @override
  Future<void> saveMultiGarmentSelectionEnabled(bool enabled) {
    return _preferences.setBool(_multiGarmentSelectionEnabledKey, enabled);
  }

  @override
  Future<int> readMaxTryOnPicks() async {
    final value = await _preferences.getInt(_maxTryOnPicksKey);
    return normalizeMaxTryOnPicks(value);
  }

  @override
  Future<void> saveMaxTryOnPicks(int count) {
    return _preferences.setInt(
      _maxTryOnPicksKey,
      normalizeMaxTryOnPicks(count),
    );
  }

  @override
  Future<bool> readShowMyPicksCounter() async {
    return await _preferences.getBool(_showMyPicksCounterKey) ?? true;
  }

  @override
  Future<void> saveShowMyPicksCounter(bool enabled) {
    return _preferences.setBool(_showMyPicksCounterKey, enabled);
  }

  @override
  Future<bool> readSaveMyLooksQrEnabled() async {
    return await _preferences.getBool(_saveMyLooksQrEnabledKey) ?? true;
  }

  @override
  Future<void> saveSaveMyLooksQrEnabled(bool enabled) {
    return _preferences.setBool(_saveMyLooksQrEnabledKey, enabled);
  }
}

class InMemoryCameraSettingsStore implements CameraSettingsStore {
  String? preferredCameraId;
  int? captureCountdownSeconds;
  bool? captureSoundsEnabled;
  CaptureAudioProfile? captureAudioProfile;
  CameraOrientationMode? cameraOrientationMode;
  bool? multiGarmentSelectionEnabled;
  int? maxTryOnPicks;
  bool? showMyPicksCounter;
  bool? saveMyLooksQrEnabled;

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

  @override
  Future<bool> readMultiGarmentSelectionEnabled() async {
    return multiGarmentSelectionEnabled ?? true;
  }

  @override
  Future<void> saveMultiGarmentSelectionEnabled(bool enabled) async {
    multiGarmentSelectionEnabled = enabled;
  }

  @override
  Future<int> readMaxTryOnPicks() async {
    return normalizeMaxTryOnPicks(maxTryOnPicks);
  }

  @override
  Future<void> saveMaxTryOnPicks(int count) async {
    maxTryOnPicks = normalizeMaxTryOnPicks(count);
  }

  @override
  Future<bool> readShowMyPicksCounter() async {
    return showMyPicksCounter ?? true;
  }

  @override
  Future<void> saveShowMyPicksCounter(bool enabled) async {
    showMyPicksCounter = enabled;
  }

  @override
  Future<bool> readSaveMyLooksQrEnabled() async {
    return saveMyLooksQrEnabled ?? true;
  }

  @override
  Future<void> saveSaveMyLooksQrEnabled(bool enabled) async {
    saveMyLooksQrEnabled = enabled;
  }
}

int normalizeMaxTryOnPicks(int? count) {
  return (count ?? 5).clamp(1, 20).toInt();
}
