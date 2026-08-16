import 'dart:ui';

import '../idle/kiosk_idle_presentation.dart';
import '../session/capture_audio_service.dart';
import '../tryon/kiosk_garment_input.dart';

enum RuntimeKioskIdleMode { static, slideshow }

enum RuntimeKioskSoundProfile {
  selfxSignature,
  soft,
  studio,
  minimal,
  muted,
}

enum RuntimeKioskAssetType { bundledImage, remoteImage }

class KioskRuntimeConfiguration {
  const KioskRuntimeConfiguration({
    required this.version,
    required this.idleMode,
    required this.slideDurationSeconds,
    required this.title,
    required this.subtitle,
    required this.ctaLabel,
    required this.assets,
    required this.countdownSeconds,
    required this.soundEnabled,
    required this.soundProfile,
    required this.guidanceAudioEnabled,
    required this.enabledGarmentIntents,
    required this.sessionIdleTimeoutSeconds,
    required this.updatedAt,
  });

  factory KioskRuntimeConfiguration.fromJson(Map<String, dynamic> json) {
    final display = _map(json, 'display');
    final capture = _map(json, 'capture');
    final experience = _map(json, 'experience');
    final assets = (display['assets'] as List? ?? const [])
        .whereType<Map<String, dynamic>>()
        .map(KioskRuntimeAsset.fromJson)
        .toList(growable: false);
    final intents = (experience['enabledGarmentIntents'] as List? ?? const [])
        .whereType<String>()
        .map(garmentIntentFromApiValue)
        .where((intent) => intent != KioskGarmentIntent.auto)
        .toList(growable: false);
    return KioskRuntimeConfiguration(
      version: _int(json, 'version', 1),
      idleMode: _idleMode(display['idleMode'] as String?),
      slideDurationSeconds: _int(display, 'slideDurationSeconds', 6),
      title: _nullableString(display['title']) ?? 'SelfX Virtual Try-On',
      subtitle:
          _nullableString(display['subtitle']) ?? 'Find your perfect fit in seconds.',
      ctaLabel: _nullableString(display['ctaLabel']) ?? 'Start Try-On',
      assets: assets.isEmpty ? defaultRuntimeConfiguration.assets : assets,
      countdownSeconds: _int(capture, 'countdownSeconds', 10),
      soundEnabled: capture['soundEnabled'] is bool
          ? capture['soundEnabled'] as bool
          : true,
      soundProfile: _soundProfile(capture['soundProfile'] as String?),
      guidanceAudioEnabled: capture['guidanceAudioEnabled'] is bool
          ? capture['guidanceAudioEnabled'] as bool
          : false,
      enabledGarmentIntents: intents.isEmpty
          ? defaultRuntimeConfiguration.enabledGarmentIntents
          : intents,
      sessionIdleTimeoutSeconds: _int(
        experience,
        'sessionIdleTimeoutSeconds',
        120,
      ),
      updatedAt: DateTime.tryParse(_string(json, 'updatedAt', '')) ??
          DateTime.fromMillisecondsSinceEpoch(0),
    );
  }

  final int version;
  final RuntimeKioskIdleMode idleMode;
  final int slideDurationSeconds;
  final String title;
  final String subtitle;
  final String ctaLabel;
  final List<KioskRuntimeAsset> assets;
  final int countdownSeconds;
  final bool soundEnabled;
  final RuntimeKioskSoundProfile soundProfile;
  final bool guidanceAudioEnabled;
  final List<KioskGarmentIntent> enabledGarmentIntents;
  final int sessionIdleTimeoutSeconds;
  final DateTime updatedAt;

  KioskIdlePresentation toIdlePresentation() {
    final presentationAssets = assets
        .map(
          (asset) => KioskIdleAsset(
            id: asset.id,
            label: asset.label,
            colors: const [Color(0xFF101828), Color(0xFFFF7119)],
            localImagePath: asset.localImagePath,
            assetImagePath: asset.assetImagePath,
          ),
        )
        .toList(growable: false);
    return KioskIdlePresentation(
      mode: idleMode == RuntimeKioskIdleMode.slideshow
          ? KioskIdlePresentationMode.slideshow
          : KioskIdlePresentationMode.static,
      assets: presentationAssets.isEmpty
          ? defaultIdlePresentation.assets
          : presentationAssets,
      slideDuration: Duration(seconds: slideDurationSeconds.clamp(3, 60)),
      title: title,
      subtitle: subtitle,
      ctaLabel: ctaLabel,
    );
  }

  CaptureAudioProfile get captureAudioProfile {
    return switch (soundProfile) {
      RuntimeKioskSoundProfile.selfxSignature => CaptureAudioProfile.soft,
      RuntimeKioskSoundProfile.soft => CaptureAudioProfile.soft,
      RuntimeKioskSoundProfile.studio => CaptureAudioProfile.classic,
      RuntimeKioskSoundProfile.minimal => CaptureAudioProfile.minimal,
      RuntimeKioskSoundProfile.muted => CaptureAudioProfile.minimal,
    };
  }

  bool get effectiveSoundEnabled =>
      soundEnabled && soundProfile != RuntimeKioskSoundProfile.muted;

  Map<String, dynamic> toJson() {
    return {
      'version': version,
      'display': {
        'idleMode': idleMode == RuntimeKioskIdleMode.slideshow
            ? 'SLIDESHOW'
            : 'STATIC',
        'slideDurationSeconds': slideDurationSeconds,
        'title': title,
        'subtitle': subtitle,
        'ctaLabel': ctaLabel,
        'assets': assets.map((asset) => asset.toJson()).toList(),
      },
      'capture': {
        'countdownSeconds': countdownSeconds,
        'soundEnabled': soundEnabled,
        'soundProfile': _soundProfileApiValue(soundProfile),
        'guidanceAudioEnabled': guidanceAudioEnabled,
      },
      'experience': {
        'enabledGarmentIntents': enabledGarmentIntents
            .map((intent) => intent.apiValue)
            .toList(),
        'sessionIdleTimeoutSeconds': sessionIdleTimeoutSeconds,
      },
      'updatedAt': updatedAt.toIso8601String(),
    };
  }
}

class KioskRuntimeAsset {
  const KioskRuntimeAsset({
    required this.id,
    required this.type,
    required this.label,
    this.url,
    this.bundledAssetKey,
    this.localImagePath,
    this.assetImagePath,
  });

  factory KioskRuntimeAsset.fromJson(Map<String, dynamic> json) {
    final bundledAssetKey = _nullableString(json['bundledAssetKey']);
    final localImagePath = _nullableString(json['localImagePath']);
    return KioskRuntimeAsset(
      id: _string(json, 'id', bundledAssetKey ?? 'presentation-asset'),
      type: (json['type'] as String?) == 'REMOTE_IMAGE'
          ? RuntimeKioskAssetType.remoteImage
          : RuntimeKioskAssetType.bundledImage,
      label: _string(json, 'label', 'Kiosk presentation image'),
      url: _nullableString(json['url']),
      bundledAssetKey: bundledAssetKey,
      localImagePath: localImagePath,
      assetImagePath: localImagePath == null
          ? assetPathForBundledKey(bundledAssetKey)
          : null,
    );
  }

  final String id;
  final RuntimeKioskAssetType type;
  final String label;
  final String? url;
  final String? bundledAssetKey;
  final String? localImagePath;
  final String? assetImagePath;

  KioskRuntimeAsset copyWithLocalImagePath(String path) {
    return KioskRuntimeAsset(
      id: id,
      type: type,
      label: label,
      url: url,
      bundledAssetKey: bundledAssetKey,
      localImagePath: path,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'type': type == RuntimeKioskAssetType.remoteImage
          ? 'REMOTE_IMAGE'
          : 'BUNDLED_IMAGE',
      'label': label,
      'url': url,
      'bundledAssetKey': bundledAssetKey,
      'localImagePath': localImagePath,
    };
  }
}

final defaultRuntimeConfiguration = KioskRuntimeConfiguration(
  version: 1,
  idleMode: RuntimeKioskIdleMode.static,
  slideDurationSeconds: 6,
  title: 'SelfX Virtual Try-On',
  subtitle: 'Find your perfect fit in seconds.',
  ctaLabel: 'Start Try-On',
  assets: [
    KioskRuntimeAsset(
      id: 'selfx-default-kiosk-wallpaper',
      type: RuntimeKioskAssetType.bundledImage,
      label: 'SelfX default wallpaper',
      bundledAssetKey: 'selfx-default-kiosk-wallpaper',
      assetImagePath: 'assets/wallpapers/selfx-default-kiosk-wallpaper.png',
    ),
  ],
  countdownSeconds: 10,
  soundEnabled: true,
  soundProfile: RuntimeKioskSoundProfile.selfxSignature,
  guidanceAudioEnabled: false,
  enabledGarmentIntents: [
    KioskGarmentIntent.top,
    KioskGarmentIntent.bottom,
    KioskGarmentIntent.fullOutfit,
  ],
  sessionIdleTimeoutSeconds: 120,
  updatedAt: DateTime.fromMillisecondsSinceEpoch(0),
);

KioskGarmentIntent garmentIntentFromApiValue(String value) {
  return switch (value) {
    'TOP' => KioskGarmentIntent.top,
    'BOTTOM' => KioskGarmentIntent.bottom,
    'FULL_OUTFIT' => KioskGarmentIntent.fullOutfit,
    _ => KioskGarmentIntent.auto,
  };
}

String? assetPathForBundledKey(String? key) {
  return switch (key) {
    'selfx-default-kiosk-wallpaper' =>
      'assets/wallpapers/selfx-default-kiosk-wallpaper.png',
    _ => null,
  };
}

Map<String, dynamic> _map(Map<String, dynamic> json, String key) {
  final value = json[key];
  return value is Map<String, dynamic> ? value : <String, dynamic>{};
}

int _int(Map<String, dynamic> json, String key, int fallback) {
  final value = json[key];
  return value is int ? value : fallback;
}

String _string(Map<String, dynamic> json, String key, String fallback) {
  final value = json[key];
  return value is String && value.trim().isNotEmpty ? value : fallback;
}

String? _nullableString(Object? value) {
  return value is String && value.trim().isNotEmpty ? value : null;
}

RuntimeKioskIdleMode _idleMode(String? value) {
  return value == 'SLIDESHOW'
      ? RuntimeKioskIdleMode.slideshow
      : RuntimeKioskIdleMode.static;
}

RuntimeKioskSoundProfile _soundProfile(String? value) {
  return switch (value) {
    'SOFT' => RuntimeKioskSoundProfile.soft,
    'STUDIO' => RuntimeKioskSoundProfile.studio,
    'MINIMAL' => RuntimeKioskSoundProfile.minimal,
    'MUTED' => RuntimeKioskSoundProfile.muted,
    _ => RuntimeKioskSoundProfile.selfxSignature,
  };
}

String _soundProfileApiValue(RuntimeKioskSoundProfile profile) {
  return switch (profile) {
    RuntimeKioskSoundProfile.selfxSignature => 'SELFX_SIGNATURE',
    RuntimeKioskSoundProfile.soft => 'SOFT',
    RuntimeKioskSoundProfile.studio => 'STUDIO',
    RuntimeKioskSoundProfile.minimal => 'MINIMAL',
    RuntimeKioskSoundProfile.muted => 'MUTED',
  };
}
