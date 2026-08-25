import '../tryon/kiosk_garment_input.dart';

enum KioskCatalogAudience { men, women, unisex }

extension KioskCatalogAudienceApi on KioskCatalogAudience {
  String get apiValue {
    return switch (this) {
      KioskCatalogAudience.men => 'MEN',
      KioskCatalogAudience.women => 'WOMEN',
      KioskCatalogAudience.unisex => 'UNISEX',
    };
  }

  String get label {
    return switch (this) {
      KioskCatalogAudience.men => 'MEN',
      KioskCatalogAudience.women => 'WOMEN',
      KioskCatalogAudience.unisex => 'UNISEX',
    };
  }
}

class KioskCatalogCategory {
  const KioskCatalogCategory({
    required this.id,
    required this.name,
    required this.slug,
    required this.productCount,
    this.audience,
  });

  final String id;
  final String name;
  final String slug;
  final String? audience;
  final int productCount;

  factory KioskCatalogCategory.fromJson(Map<String, dynamic> json) {
    return KioskCatalogCategory(
      id: _string(json, 'id'),
      name: _string(json, 'name'),
      slug: _string(json, 'slug'),
      audience: json['audience'] is String ? json['audience'] as String : null,
      productCount: _int(json, 'productCount'),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'slug': slug,
      'audience': audience,
      'productCount': productCount,
    };
  }
}

class KioskCatalogProductCategory {
  const KioskCatalogProductCategory({
    required this.id,
    required this.name,
    required this.slug,
    this.audience,
  });

  final String id;
  final String name;
  final String slug;
  final String? audience;

  factory KioskCatalogProductCategory.fromJson(Map<String, dynamic> json) {
    return KioskCatalogProductCategory(
      id: _string(json, 'id'),
      name: _string(json, 'name'),
      slug: _string(json, 'slug'),
      audience: json['audience'] is String ? json['audience'] as String : null,
    );
  }

  Map<String, dynamic> toJson() {
    return {'id': id, 'name': name, 'slug': slug, 'audience': audience};
  }
}

class KioskCatalogProductImage {
  const KioskCatalogProductImage({
    required this.url,
    required this.cacheKey,
    this.contentType,
    this.width,
    this.height,
    this.localPath,
  });

  final String? url;
  final String cacheKey;
  final String? contentType;
  final int? width;
  final int? height;
  final String? localPath;

  factory KioskCatalogProductImage.fromJson(Map<String, dynamic> json) {
    return KioskCatalogProductImage(
      url: json['url'] is String ? json['url'] as String : null,
      cacheKey: json['cacheKey'] is String
          ? json['cacheKey'] as String
          : (json['url'] is String ? json['url'] as String : ''),
      contentType: json['contentType'] is String
          ? json['contentType'] as String
          : null,
      width: json['width'] is num ? (json['width'] as num).toInt() : null,
      height: json['height'] is num ? (json['height'] as num).toInt() : null,
      localPath: json['localPath'] is String
          ? json['localPath'] as String
          : null,
    );
  }

  KioskCatalogProductImage copyWith({String? localPath}) {
    return KioskCatalogProductImage(
      url: url,
      cacheKey: cacheKey,
      contentType: contentType,
      width: width,
      height: height,
      localPath: localPath ?? this.localPath,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'url': url,
      'cacheKey': cacheKey,
      'contentType': contentType,
      'width': width,
      'height': height,
      'localPath': localPath,
    };
  }
}

class KioskCatalogProduct {
  const KioskCatalogProduct({
    required this.id,
    required this.name,
    required this.audience,
    required this.category,
    required this.garmentIntent,
    required this.garmentCategory,
    required this.garmentPhotoType,
    required this.image,
    required this.updatedAt,
    this.description,
  });

  final String id;
  final String name;
  final String? description;
  final String audience;
  final KioskCatalogProductCategory category;
  final KioskGarmentIntent garmentIntent;
  final String garmentCategory;
  final KioskGarmentPhotoType garmentPhotoType;
  final KioskCatalogProductImage image;
  final String updatedAt;

  bool get hasUsableImage => image.url != null && image.url!.trim().isNotEmpty;

  KioskGarmentInput toGarmentInput() {
    return KioskGarmentInput.catalogProduct(
      productId: id,
      name: name,
      imageUrl: image.localPath ?? image.url ?? '',
      intent: garmentIntent,
      photoType: garmentPhotoType,
    );
  }

  factory KioskCatalogProduct.fromJson(Map<String, dynamic> json) {
    final category = json['category'];
    final image = json['image'];
    if (category is! Map<String, dynamic> || image is! Map<String, dynamic>) {
      throw const KioskCatalogException(
        'CATALOG_RESPONSE_INVALID',
        'SelfX returned an unexpected catalog response.',
      );
    }
    return KioskCatalogProduct(
      id: _string(json, 'id'),
      name: _string(json, 'name'),
      description: json['description'] is String
          ? json['description'] as String
          : null,
      audience: _string(json, 'audience'),
      category: KioskCatalogProductCategory.fromJson(category),
      garmentIntent: kioskGarmentIntentFromApi(_string(json, 'garmentIntent')),
      garmentCategory: _string(json, 'garmentCategory'),
      garmentPhotoType: kioskGarmentPhotoTypeFromApi(
        _string(json, 'garmentPhotoType'),
      ),
      image: KioskCatalogProductImage.fromJson(image),
      updatedAt: _string(json, 'updatedAt'),
    );
  }

  KioskCatalogProduct copyWith({KioskCatalogProductImage? image}) {
    return KioskCatalogProduct(
      id: id,
      name: name,
      description: description,
      audience: audience,
      category: category,
      garmentIntent: garmentIntent,
      garmentCategory: garmentCategory,
      garmentPhotoType: garmentPhotoType,
      image: image ?? this.image,
      updatedAt: updatedAt,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'description': description,
      'audience': audience,
      'category': category.toJson(),
      'garmentIntent': garmentIntent.apiValue,
      'garmentCategory': garmentCategory,
      'garmentPhotoType': garmentPhotoType.apiValue,
      'image': image.toJson(),
      'updatedAt': updatedAt,
    };
  }
}

class KioskCatalogRevision {
  const KioskCatalogRevision({
    required this.revision,
    required this.scope,
    required this.productCount,
    required this.categoryCount,
    this.storeTenantId,
    this.updatedAt,
  });

  final String revision;
  final String scope;
  final String? storeTenantId;
  final int productCount;
  final int categoryCount;
  final String? updatedAt;

  factory KioskCatalogRevision.fromJson(Map<String, dynamic> json) {
    return KioskCatalogRevision(
      revision: _string(json, 'revision'),
      scope: _string(json, 'scope'),
      storeTenantId: json['storeTenantId'] is String
          ? json['storeTenantId'] as String
          : null,
      productCount: _int(json, 'productCount'),
      categoryCount: _int(json, 'categoryCount'),
      updatedAt: json['updatedAt'] is String
          ? json['updatedAt'] as String
          : null,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'revision': revision,
      'scope': scope,
      'storeTenantId': storeTenantId,
      'productCount': productCount,
      'categoryCount': categoryCount,
      'updatedAt': updatedAt,
    };
  }
}

class KioskCatalogSnapshot extends KioskCatalogRevision {
  const KioskCatalogSnapshot({
    required super.revision,
    required super.scope,
    required super.productCount,
    required super.categoryCount,
    required this.categories,
    required this.products,
    super.storeTenantId,
    super.updatedAt,
  });

  final List<KioskCatalogCategory> categories;
  final List<KioskCatalogProduct> products;

  factory KioskCatalogSnapshot.fromJson(Map<String, dynamic> json) {
    final categories = json['categories'];
    final products = json['products'];
    if (categories is! List || products is! List) {
      throw const KioskCatalogException(
        'CATALOG_RESPONSE_INVALID',
        'SelfX returned an unexpected catalog response.',
      );
    }
    final revision = KioskCatalogRevision.fromJson(json);
    return KioskCatalogSnapshot(
      revision: revision.revision,
      scope: revision.scope,
      storeTenantId: revision.storeTenantId,
      productCount: revision.productCount,
      categoryCount: revision.categoryCount,
      updatedAt: revision.updatedAt,
      categories: categories
          .map((item) {
            if (item is! Map<String, dynamic>) {
              throw const KioskCatalogException(
                'CATALOG_RESPONSE_INVALID',
                'SelfX returned an unexpected catalog response.',
              );
            }
            return KioskCatalogCategory.fromJson(item);
          })
          .toList(growable: false),
      products: products
          .map((item) {
            if (item is! Map<String, dynamic>) {
              throw const KioskCatalogException(
                'CATALOG_RESPONSE_INVALID',
                'SelfX returned an unexpected catalog response.',
              );
            }
            return KioskCatalogProduct.fromJson(item);
          })
          .where((product) => product.hasUsableImage)
          .toList(growable: false),
    );
  }

  @override
  Map<String, dynamic> toJson() {
    return {
      ...super.toJson(),
      'categories': categories.map((category) => category.toJson()).toList(),
      'products': products.map((product) => product.toJson()).toList(),
    };
  }
}

class KioskCatalogPagination {
  const KioskCatalogPagination({
    required this.page,
    required this.pageSize,
    required this.total,
    required this.totalPages,
    required this.hasMore,
  });

  final int page;
  final int pageSize;
  final int total;
  final int totalPages;
  final bool hasMore;

  factory KioskCatalogPagination.fromJson(Map<String, dynamic> json) {
    return KioskCatalogPagination(
      page: _int(json, 'page'),
      pageSize: _int(json, 'pageSize'),
      total: _int(json, 'total'),
      totalPages: _int(json, 'totalPages'),
      hasMore: json['hasMore'] == true,
    );
  }
}

class KioskCatalogPage {
  const KioskCatalogPage({required this.products, required this.pagination});

  final List<KioskCatalogProduct> products;
  final KioskCatalogPagination pagination;

  factory KioskCatalogPage.fromJson(Map<String, dynamic> json) {
    final data = json['data'];
    final pagination = json['pagination'];
    if (data is! List || pagination is! Map<String, dynamic>) {
      throw const KioskCatalogException(
        'CATALOG_RESPONSE_INVALID',
        'SelfX returned an unexpected catalog response.',
      );
    }
    return KioskCatalogPage(
      products: data
          .map((item) {
            if (item is! Map<String, dynamic>) {
              throw const KioskCatalogException(
                'CATALOG_RESPONSE_INVALID',
                'SelfX returned an unexpected catalog response.',
              );
            }
            return KioskCatalogProduct.fromJson(item);
          })
          .where((product) => product.hasUsableImage)
          .toList(growable: false),
      pagination: KioskCatalogPagination.fromJson(pagination),
    );
  }
}

class KioskCatalogException implements Exception {
  const KioskCatalogException(this.code, this.message);

  final String code;
  final String message;

  @override
  String toString() => message;
}

KioskGarmentIntent kioskGarmentIntentFromApi(String value) {
  return switch (value) {
    'TOP' => KioskGarmentIntent.top,
    'BOTTOM' => KioskGarmentIntent.bottom,
    'ONE_PIECE' => KioskGarmentIntent.onePiece,
    'FULL_OUTFIT' => KioskGarmentIntent.fullOutfit,
    _ => KioskGarmentIntent.auto,
  };
}

KioskGarmentPhotoType kioskGarmentPhotoTypeFromApi(String value) {
  return switch (value) {
    'FLAT_LAY' => KioskGarmentPhotoType.flatLay,
    'ON_MODEL' => KioskGarmentPhotoType.onModel,
    _ => KioskGarmentPhotoType.auto,
  };
}

String _string(Map<String, dynamic> json, String key) {
  final value = json[key];
  if (value is String) {
    return value;
  }
  throw const KioskCatalogException(
    'CATALOG_RESPONSE_INVALID',
    'SelfX returned an unexpected catalog response.',
  );
}

int _int(Map<String, dynamic> json, String key) {
  final value = json[key];
  if (value is num) {
    return value.toInt();
  }
  throw const KioskCatalogException(
    'CATALOG_RESPONSE_INVALID',
    'SelfX returned an unexpected catalog response.',
  );
}
