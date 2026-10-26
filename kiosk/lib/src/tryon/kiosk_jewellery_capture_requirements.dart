import '../catalog/kiosk_catalog_models.dart';
import 'kiosk_garment_input.dart';

enum KioskJewelleryCaptureTargetRegion {
  hand,
  wristAndLowerForearm,
  neckShouldersAndUpperChest,
  faceAndEars,
}

enum KioskJewelleryCaptureGuide {
  handCloseUp,
  wristCloseUp,
  neckAndUpperChest,
  faceAndEars,
}

class KioskJewelleryCaptureRequirements {
  const KioskJewelleryCaptureRequirements({
    required this.schemaVersion,
    required this.jewelleryType,
    required this.productId,
    required this.targetRegion,
    required this.guide,
    required this.title,
    required this.instruction,
    required this.checklist,
    required this.requiredChecks,
  });

  final int schemaVersion;
  final KioskJewelleryType jewelleryType;
  final String productId;
  final KioskJewelleryCaptureTargetRegion targetRegion;
  final KioskJewelleryCaptureGuide guide;
  final String title;
  final String instruction;
  final List<String> checklist;
  final List<String> requiredChecks;

  factory KioskJewelleryCaptureRequirements.fromJson(
    Map<String, dynamic> json,
  ) {
    final schemaVersion = json['schemaVersion'];
    final tryOnVertical = json['tryOnVertical'];
    final channel = json['channel'];
    final productId = json['productId'];
    final jewelleryType = kioskJewelleryTypeFromApi(
      json['jewelleryType'] is String ? json['jewelleryType'] as String : null,
    );
    final targetRegion = _targetRegionFromApi(json['targetRegion']);
    final guide = _guideFromApi(json['guide']);
    if (schemaVersion != 1 ||
        tryOnVertical != 'JEWELLERY' ||
        channel != 'KIOSK' ||
        productId is! String ||
        productId.trim().isEmpty ||
        jewelleryType == null ||
        targetRegion == null ||
        guide == null) {
      throw const KioskCatalogException(
        'CATALOG_RESPONSE_INVALID',
        'SelfX returned unexpected jewellery capture guidance.',
      );
    }

    return KioskJewelleryCaptureRequirements(
      schemaVersion: schemaVersion as int,
      jewelleryType: jewelleryType,
      productId: productId,
      targetRegion: targetRegion,
      guide: guide,
      title: _requiredString(json, 'title'),
      instruction: _requiredString(json, 'instruction'),
      checklist: _requiredStringList(json, 'checklist'),
      requiredChecks: _requiredStringList(json, 'requiredChecks'),
    );
  }
}

KioskJewelleryCaptureTargetRegion? _targetRegionFromApi(Object? value) {
  return switch (value) {
    'HAND' => KioskJewelleryCaptureTargetRegion.hand,
    'WRIST_AND_LOWER_FOREARM' =>
      KioskJewelleryCaptureTargetRegion.wristAndLowerForearm,
    'NECK_SHOULDERS_AND_UPPER_CHEST' =>
      KioskJewelleryCaptureTargetRegion.neckShouldersAndUpperChest,
    'FACE_AND_EARS' => KioskJewelleryCaptureTargetRegion.faceAndEars,
    _ => null,
  };
}

KioskJewelleryCaptureGuide? _guideFromApi(Object? value) {
  return switch (value) {
    'HAND_CLOSE_UP' => KioskJewelleryCaptureGuide.handCloseUp,
    'WRIST_CLOSE_UP' => KioskJewelleryCaptureGuide.wristCloseUp,
    'NECK_AND_UPPER_CHEST' => KioskJewelleryCaptureGuide.neckAndUpperChest,
    'FACE_AND_EARS' => KioskJewelleryCaptureGuide.faceAndEars,
    _ => null,
  };
}

String _requiredString(Map<String, dynamic> json, String key) {
  final value = json[key];
  if (value is String && value.trim().isNotEmpty) {
    return value;
  }
  throw const KioskCatalogException(
    'CATALOG_RESPONSE_INVALID',
    'SelfX returned unexpected jewellery capture guidance.',
  );
}

List<String> _requiredStringList(Map<String, dynamic> json, String key) {
  final value = json[key];
  if (value is List && value.every((item) => item is String)) {
    return value.cast<String>().toList(growable: false);
  }
  throw const KioskCatalogException(
    'CATALOG_RESPONSE_INVALID',
    'SelfX returned unexpected jewellery capture guidance.',
  );
}
