import 'dart:io';

enum KioskGarmentInputSource {
  developmentLocalFile,
  catalogProduct,
  capturedGarment,
  phoneUpload,
  remoteAsset,
}

enum KioskTryOnVertical { garment, jewellery }

enum KioskJewelleryType { ring, bracelet, necklace, earring }

enum KioskGarmentIntent { auto, top, bottom, onePiece, fullOutfit }

enum KioskGarmentPhotoType { auto, flatLay, onModel }

class KioskGarmentInput {
  const KioskGarmentInput({
    required this.source,
    required this.localPath,
    this.tryOnVertical = KioskTryOnVertical.garment,
    this.intent = KioskGarmentIntent.auto,
    this.photoType = KioskGarmentPhotoType.auto,
    this.productId,
    this.jewelleryType,
    this.remoteImageUrl,
    this.name,
    this.displayPrice,
    this.extractedPreviewPath,
  });

  const KioskGarmentInput.catalogProduct({
    required String productId,
    required String name,
    required String imageUrl,
    required KioskGarmentIntent intent,
    required KioskGarmentPhotoType photoType,
    String? displayPrice,
  }) : this(
         source: KioskGarmentInputSource.catalogProduct,
         localPath: '',
         productId: productId,
         name: name,
         displayPrice: displayPrice,
         remoteImageUrl: imageUrl,
         intent: intent,
         photoType: photoType,
       );

  const KioskGarmentInput.jewelleryCatalogProduct({
    required String productId,
    required String name,
    required String imageUrl,
    KioskJewelleryType? jewelleryType,
    String? displayPrice,
  }) : this(
         source: KioskGarmentInputSource.catalogProduct,
         localPath: '',
         tryOnVertical: KioskTryOnVertical.jewellery,
         productId: productId,
         jewelleryType: jewelleryType,
         name: name,
         displayPrice: displayPrice,
         remoteImageUrl: imageUrl,
       );

  final KioskGarmentInputSource source;
  final String localPath;
  final KioskTryOnVertical tryOnVertical;
  final KioskGarmentIntent intent;
  final KioskGarmentPhotoType photoType;
  final String? productId;
  final KioskJewelleryType? jewelleryType;
  final String? remoteImageUrl;
  final String? name;
  final String? displayPrice;
  final String? extractedPreviewPath;

  String get previewPath => extractedPreviewPath ?? localPath;

  bool get isCatalogProduct =>
      source == KioskGarmentInputSource.catalogProduct && productId != null;

  KioskGarmentInput copyWith({
    KioskGarmentInputSource? source,
    String? localPath,
    KioskTryOnVertical? tryOnVertical,
    KioskGarmentIntent? intent,
    KioskGarmentPhotoType? photoType,
    String? productId,
    KioskJewelleryType? jewelleryType,
    String? remoteImageUrl,
    String? name,
    String? displayPrice,
    String? extractedPreviewPath,
  }) {
    return KioskGarmentInput(
      source: source ?? this.source,
      localPath: localPath ?? this.localPath,
      tryOnVertical: tryOnVertical ?? this.tryOnVertical,
      intent: intent ?? this.intent,
      photoType: photoType ?? this.photoType,
      productId: productId ?? this.productId,
      jewelleryType: jewelleryType ?? this.jewelleryType,
      remoteImageUrl: remoteImageUrl ?? this.remoteImageUrl,
      name: name ?? this.name,
      displayPrice: displayPrice ?? this.displayPrice,
      extractedPreviewPath: extractedPreviewPath ?? this.extractedPreviewPath,
    );
  }

  KioskGarmentInput withoutExtractedPreview() {
    return KioskGarmentInput(
      source: source,
      localPath: localPath,
      tryOnVertical: tryOnVertical,
      intent: intent,
      photoType: photoType,
      productId: productId,
      jewelleryType: jewelleryType,
      remoteImageUrl: remoteImageUrl,
      name: name,
      displayPrice: displayPrice,
    );
  }

  String get displayName {
    if (name != null && name!.trim().isNotEmpty) {
      return name!;
    }
    if (isCatalogProduct) {
      return productId!;
    }
    final segments = localPath.split(Platform.pathSeparator);
    return segments.isEmpty ? localPath : segments.last;
  }

  Future<bool> exists() async {
    if (isCatalogProduct) {
      return true;
    }
    return localPath.trim().isNotEmpty && await File(localPath).exists();
  }
}

extension KioskTryOnVerticalLabels on KioskTryOnVertical {
  String get apiValue {
    return switch (this) {
      KioskTryOnVertical.garment => 'GARMENT',
      KioskTryOnVertical.jewellery => 'JEWELLERY',
    };
  }

  String get itemLabel {
    return switch (this) {
      KioskTryOnVertical.garment => 'garment',
      KioskTryOnVertical.jewellery => 'jewellery',
    };
  }

  String get itemLabelTitle {
    return switch (this) {
      KioskTryOnVertical.garment => 'Garment',
      KioskTryOnVertical.jewellery => 'Jewellery',
    };
  }
}

extension KioskJewelleryTypeLabels on KioskJewelleryType {
  String get apiValue {
    return switch (this) {
      KioskJewelleryType.ring => 'RING',
      KioskJewelleryType.bracelet => 'BRACELET',
      KioskJewelleryType.necklace => 'NECKLACE',
      KioskJewelleryType.earring => 'EARRING',
    };
  }

  String get label {
    return switch (this) {
      KioskJewelleryType.ring => 'Ring',
      KioskJewelleryType.bracelet => 'Bracelet',
      KioskJewelleryType.necklace => 'Necklace',
      KioskJewelleryType.earring => 'Earring',
    };
  }
}

KioskTryOnVertical kioskTryOnVerticalFromApi(String value) {
  return switch (value.trim().toUpperCase()) {
    'JEWELLERY' => KioskTryOnVertical.jewellery,
    _ => KioskTryOnVertical.garment,
  };
}

KioskJewelleryType? kioskJewelleryTypeFromApi(String? value) {
  return switch (value?.trim().toUpperCase()) {
    'RING' => KioskJewelleryType.ring,
    'BRACELET' => KioskJewelleryType.bracelet,
    'NECKLACE' => KioskJewelleryType.necklace,
    'EARRING' => KioskJewelleryType.earring,
    _ => null,
  };
}

extension KioskGarmentIntentLabels on KioskGarmentIntent {
  String get label {
    return switch (this) {
      KioskGarmentIntent.auto => 'Auto',
      KioskGarmentIntent.top => 'Top',
      KioskGarmentIntent.bottom => 'Bottom',
      KioskGarmentIntent.onePiece => 'One-piece',
      KioskGarmentIntent.fullOutfit => 'Full outfit',
    };
  }

  String get apiValue {
    return switch (this) {
      KioskGarmentIntent.auto => 'AUTO',
      KioskGarmentIntent.top => 'TOP',
      KioskGarmentIntent.bottom => 'BOTTOM',
      KioskGarmentIntent.onePiece => 'ONE_PIECE',
      KioskGarmentIntent.fullOutfit => 'FULL_OUTFIT',
    };
  }

  String get categoryApiValue {
    return switch (this) {
      KioskGarmentIntent.top => 'TOP',
      KioskGarmentIntent.bottom => 'BOTTOM',
      KioskGarmentIntent.onePiece => 'ONE_PIECE',
      KioskGarmentIntent.auto || KioskGarmentIntent.fullOutfit => 'AUTO',
    };
  }
}

extension KioskGarmentPhotoTypeLabels on KioskGarmentPhotoType {
  String get label {
    return switch (this) {
      KioskGarmentPhotoType.auto => 'Auto photo',
      KioskGarmentPhotoType.flatLay => 'Flat lay',
      KioskGarmentPhotoType.onModel => 'On model',
    };
  }

  String get apiValue {
    return switch (this) {
      KioskGarmentPhotoType.auto => 'AUTO',
      KioskGarmentPhotoType.flatLay => 'FLAT_LAY',
      KioskGarmentPhotoType.onModel => 'ON_MODEL',
    };
  }
}
