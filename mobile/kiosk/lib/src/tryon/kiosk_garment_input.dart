import 'dart:io';

enum KioskGarmentInputSource {
  developmentLocalFile,
  catalogProduct,
  capturedGarment,
  phoneUpload,
  remoteAsset,
}

enum KioskGarmentIntent { auto, top, bottom, onePiece, fullOutfit }

enum KioskGarmentPhotoType { auto, flatLay, onModel }

class KioskGarmentInput {
  const KioskGarmentInput({
    required this.source,
    required this.localPath,
    this.intent = KioskGarmentIntent.auto,
    this.photoType = KioskGarmentPhotoType.auto,
    this.productId,
    this.remoteImageUrl,
    this.name,
    this.extractedPreviewPath,
  });

  const KioskGarmentInput.catalogProduct({
    required String productId,
    required String name,
    required String imageUrl,
    required KioskGarmentIntent intent,
    required KioskGarmentPhotoType photoType,
  }) : this(
         source: KioskGarmentInputSource.catalogProduct,
         localPath: '',
         productId: productId,
         name: name,
         remoteImageUrl: imageUrl,
         intent: intent,
         photoType: photoType,
       );

  final KioskGarmentInputSource source;
  final String localPath;
  final KioskGarmentIntent intent;
  final KioskGarmentPhotoType photoType;
  final String? productId;
  final String? remoteImageUrl;
  final String? name;
  final String? extractedPreviewPath;

  String get previewPath => extractedPreviewPath ?? localPath;

  bool get isCatalogProduct =>
      source == KioskGarmentInputSource.catalogProduct && productId != null;

  KioskGarmentInput copyWith({
    KioskGarmentInputSource? source,
    String? localPath,
    KioskGarmentIntent? intent,
    KioskGarmentPhotoType? photoType,
    String? productId,
    String? remoteImageUrl,
    String? name,
    String? extractedPreviewPath,
  }) {
    return KioskGarmentInput(
      source: source ?? this.source,
      localPath: localPath ?? this.localPath,
      intent: intent ?? this.intent,
      photoType: photoType ?? this.photoType,
      productId: productId ?? this.productId,
      remoteImageUrl: remoteImageUrl ?? this.remoteImageUrl,
      name: name ?? this.name,
      extractedPreviewPath: extractedPreviewPath ?? this.extractedPreviewPath,
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
