import 'dart:ui';

enum KioskIdlePresentationMode { static, slideshow }

class KioskIdlePresentation {
  const KioskIdlePresentation({
    required this.mode,
    required this.assets,
    required this.slideDuration,
    this.title = 'SelfX Virtual Try-On',
    this.subtitle = 'Find your perfect fit in seconds.',
    this.brandLabel = 'SelfX',
    this.ctaLabel = 'Start Try-On',
  });

  final KioskIdlePresentationMode mode;
  final List<KioskIdleAsset> assets;
  final Duration slideDuration;
  final String title;
  final String subtitle;
  final String brandLabel;
  final String ctaLabel;

  KioskIdleAsset assetAt(int index) {
    if (assets.isEmpty) {
      return fallbackIdleAsset;
    }
    return assets[index % assets.length];
  }

  bool get isSlideshow =>
      mode == KioskIdlePresentationMode.slideshow && assets.length > 1;
}

class KioskIdleAsset {
  const KioskIdleAsset({
    required this.id,
    required this.label,
    required this.colors,
    this.localImagePath,
    this.assetImagePath,
    this.assetVideoPath,
  });

  final String id;
  final String label;
  final List<Color> colors;
  final String? localImagePath;
  final String? assetImagePath;
  final String? assetVideoPath;
}

const fallbackIdleAsset = KioskIdleAsset(
  id: 'selfx-fallback',
  label: 'SelfX default video',
  colors: [Color(0xFF102A43), Color(0xFF0F766E), Color(0xFFBAE6FD)],
  assetVideoPath: 'assets/videos/selfx-default-kiosk-video.mp4',
  assetImagePath: 'assets/wallpapers/selfx-default-kiosk-wallpaper.png',
);

const defaultIdlePresentation = KioskIdlePresentation(
  mode: KioskIdlePresentationMode.static,
  slideDuration: Duration(seconds: 6),
  assets: [fallbackIdleAsset],
);
