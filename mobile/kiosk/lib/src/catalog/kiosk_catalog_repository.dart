import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:path/path.dart' as path;
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'kiosk_catalog_gateway.dart';
import 'kiosk_catalog_models.dart';

const defaultCatalogRefreshInterval = Duration(minutes: 5);
const defaultCatalogImageCacheMaxBytes = 1024 * 1024 * 1024;

abstract class KioskCatalogCache {
  Future<String?> readSnapshotJson();

  Future<void> writeSnapshotJson(String json);

  Future<void> clearSnapshotJson();
}

class SharedPreferencesKioskCatalogCache implements KioskCatalogCache {
  SharedPreferencesKioskCatalogCache(this.preferences);

  static const _snapshotKey = 'selfx_kiosk_catalog_snapshot';

  final SharedPreferencesAsync preferences;

  @override
  Future<String?> readSnapshotJson() => preferences.getString(_snapshotKey);

  @override
  Future<void> writeSnapshotJson(String json) {
    return preferences.setString(_snapshotKey, json);
  }

  @override
  Future<void> clearSnapshotJson() {
    return preferences.remove(_snapshotKey);
  }
}

class KioskCatalogRepository extends ChangeNotifier
    implements KioskCatalogGateway {
  KioskCatalogRepository({
    required this.remote,
    SharedPreferencesAsync? preferences,
    KioskCatalogCache? cache,
    this.cacheDirectoryProvider,
    http.Client? client,
    this.refreshInterval = defaultCatalogRefreshInterval,
    this.maxImageCacheBytes = defaultCatalogImageCacheMaxBytes,
    this.canApplyUpdates,
  }) : _cache =
           cache ??
           SharedPreferencesKioskCatalogCache(
             preferences ?? SharedPreferencesAsync(),
           ),
       _client = client ?? http.Client();

  final KioskCatalogGateway remote;
  final KioskCatalogCache _cache;
  final Future<Directory> Function()? cacheDirectoryProvider;
  final http.Client _client;
  final Duration refreshInterval;
  final int maxImageCacheBytes;
  final bool Function()? canApplyUpdates;

  KioskCatalogSnapshot? snapshot;
  String statusLabel = 'No catalog cache';
  String? lastErrorCode;
  bool syncing = false;

  Timer? _refreshTimer;
  bool _disposed = false;

  Future<void> loadCachedOrDefault() async {
    final cached = await _cache.readSnapshotJson();
    if (cached == null || cached.trim().isEmpty) {
      statusLabel = 'No catalog cache';
      notifyListeners();
      return;
    }
    try {
      final decoded = jsonDecode(cached);
      if (decoded is Map<String, dynamic>) {
        snapshot = KioskCatalogSnapshot.fromJson(decoded);
        statusLabel = 'Cached catalog';
        notifyListeners();
      }
    } catch (_) {
      await _cache.clearSnapshotJson();
      snapshot = null;
      statusLabel = 'No catalog cache';
      notifyListeners();
    }
  }

  void startAutoRefresh() {
    _refreshTimer?.cancel();
    _refreshTimer = Timer.periodic(
      refreshInterval,
      (_) => unawaited(syncIfNeeded()),
    );
  }

  void stopAutoRefresh() {
    _refreshTimer?.cancel();
    _refreshTimer = null;
  }

  Future<void> syncIfNeeded({bool force = false}) async {
    if (!force && canApplyUpdates != null && !canApplyUpdates!()) {
      return;
    }
    if (syncing) {
      return;
    }
    syncing = true;
    notifyListeners();
    try {
      final revision = await remote.getCatalogRevision();
      final needsImageRepair = await _hasMissingCachedImages();
      if (!force &&
          snapshot?.revision == revision.revision &&
          !needsImageRepair) {
        statusLabel = 'Catalog up to date';
        lastErrorCode = null;
        return;
      }
      final remoteSnapshot = await remote.getCatalogSnapshot();
      final prepared = await _prepareSnapshot(remoteSnapshot);
      await _cache.writeSnapshotJson(jsonEncode(prepared.toJson()));
      snapshot = prepared;
      statusLabel = 'Catalog synced';
      lastErrorCode = null;
    } on KioskCatalogException catch (error) {
      lastErrorCode = error.code;
      statusLabel = snapshot == null ? 'Catalog unavailable' : 'Using cache';
    } on TimeoutException {
      lastErrorCode = 'CATALOG_NETWORK_TIMEOUT';
      statusLabel = snapshot == null ? 'Catalog unavailable' : 'Using cache';
    } on SocketException {
      lastErrorCode = 'CATALOG_NETWORK_UNAVAILABLE';
      statusLabel = snapshot == null ? 'Catalog unavailable' : 'Using cache';
    } catch (_) {
      lastErrorCode = 'CATALOG_SYNC_FAILED';
      statusLabel = snapshot == null ? 'Catalog unavailable' : 'Using cache';
    } finally {
      syncing = false;
      notifyListeners();
    }
  }

  @override
  Future<KioskCatalogRevision> getCatalogRevision() async {
    final current = snapshot;
    if (current != null) {
      return current;
    }
    return remote.getCatalogRevision();
  }

  @override
  Future<KioskCatalogSnapshot> getCatalogSnapshot() async {
    await _ensureSnapshot();
    final current = snapshot;
    if (current == null) {
      throw const KioskCatalogException(
        'CATALOG_UNAVAILABLE',
        'SelfX catalog is unavailable.',
      );
    }
    return current;
  }

  @override
  Future<List<KioskCatalogCategory>> getCatalogCategories({
    required KioskCatalogAudience audience,
  }) async {
    await _ensureSnapshot();
    final products = _filteredProducts(audience: audience);
    final categoryCounts = <String, int>{};
    for (final product in products) {
      categoryCounts[product.category.slug] =
          (categoryCounts[product.category.slug] ?? 0) + 1;
    }
    final categories = snapshot?.categories ?? const <KioskCatalogCategory>[];
    return categories
        .where((category) => (categoryCounts[category.slug] ?? 0) > 0)
        .map(
          (category) => KioskCatalogCategory(
            id: category.id,
            name: category.name,
            slug: category.slug,
            audience: category.audience,
            productCount: categoryCounts[category.slug] ?? 0,
          ),
        )
        .toList(growable: false);
  }

  @override
  Future<KioskCatalogPage> getCatalogProducts({
    required KioskCatalogAudience audience,
    String? categorySlug,
    required int page,
    required int pageSize,
  }) async {
    await _ensureSnapshot();
    final products = _filteredProducts(
      audience: audience,
      categorySlug: categorySlug,
    );
    final boundedPage = page < 1 ? 1 : page;
    final boundedPageSize = pageSize.clamp(1, 100).toInt();
    final start = ((boundedPage - 1) * boundedPageSize).clamp(
      0,
      products.length,
    );
    final end = (start + boundedPageSize).clamp(0, products.length);
    return KioskCatalogPage(
      products: products.sublist(start, end),
      pagination: KioskCatalogPagination(
        page: boundedPage,
        pageSize: boundedPageSize,
        total: products.length,
        totalPages: products.isEmpty
            ? 1
            : ((products.length + boundedPageSize - 1) ~/ boundedPageSize),
        hasMore: end < products.length,
      ),
    );
  }

  Future<void> _ensureSnapshot() async {
    if (snapshot != null) {
      return;
    }
    await syncIfNeeded(force: true);
  }

  List<KioskCatalogProduct> _filteredProducts({
    required KioskCatalogAudience audience,
    String? categorySlug,
  }) {
    final products = snapshot?.products ?? const <KioskCatalogProduct>[];
    return products
        .where((product) {
          if (!_matchesAudience(product.audience, audience)) {
            return false;
          }
          if (categorySlug != null &&
              categorySlug.trim().isNotEmpty &&
              product.category.slug != categorySlug.trim()) {
            return false;
          }
          return true;
        })
        .toList(growable: false);
  }

  bool _matchesAudience(String productAudience, KioskCatalogAudience audience) {
    final normalized = productAudience.trim().toUpperCase();
    return normalized == audience.apiValue ||
        normalized == KioskCatalogAudience.unisex.apiValue ||
        normalized == 'ALL';
  }

  Future<KioskCatalogSnapshot> _prepareSnapshot(
    KioskCatalogSnapshot remoteSnapshot,
  ) async {
    final preparedProducts = <KioskCatalogProduct>[];
    for (final product in remoteSnapshot.products) {
      final localPath = await _prepareProductImage(product);
      preparedProducts.add(
        product.copyWith(image: product.image.copyWith(localPath: localPath)),
      );
    }
    await _cleanupImageCache(
      preparedProducts
          .map((product) => product.image.localPath)
          .whereType<String>()
          .toSet(),
    );
    return KioskCatalogSnapshot(
      revision: remoteSnapshot.revision,
      scope: remoteSnapshot.scope,
      storeTenantId: remoteSnapshot.storeTenantId,
      productCount: remoteSnapshot.productCount,
      categoryCount: remoteSnapshot.categoryCount,
      updatedAt: remoteSnapshot.updatedAt,
      categories: remoteSnapshot.categories,
      products: preparedProducts,
    );
  }

  Future<bool> _hasMissingCachedImages() async {
    final current = snapshot;
    if (current == null) {
      return true;
    }
    for (final product in current.products) {
      if (!product.hasUsableImage) {
        continue;
      }
      final localPath = product.image.localPath;
      if (localPath == null || localPath.trim().isEmpty) {
        return true;
      }
      if (!await File(localPath).exists()) {
        return true;
      }
    }
    return false;
  }

  Future<String?> _prepareProductImage(KioskCatalogProduct product) async {
    final url = product.image.url;
    if (url == null || url.trim().isEmpty) {
      return null;
    }
    final directory = await _imageCacheDirectory();
    final file = File(path.join(directory.path, _imageFileName(product)));
    if (await file.exists()) {
      return file.path;
    }
    final uri = Uri.tryParse(url);
    if (uri == null || !uri.hasScheme) {
      return null;
    }
    try {
      final response = await _client
          .get(uri)
          .timeout(const Duration(seconds: 30));
      if (response.statusCode < 200 || response.statusCode >= 300) {
        return null;
      }
      await file.writeAsBytes(response.bodyBytes, flush: true);
      return file.path;
    } catch (_) {
      return null;
    }
  }

  Future<Directory> _imageCacheDirectory() async {
    final provider = cacheDirectoryProvider;
    final base = provider == null
        ? await getApplicationSupportDirectory()
        : await provider();
    final directory = Directory(path.join(base.path, 'catalog-images'));
    if (!await directory.exists()) {
      await directory.create(recursive: true);
    }
    return directory;
  }

  String _imageFileName(KioskCatalogProduct product) {
    final digest = sha256
        .convert(utf8.encode(product.image.cacheKey))
        .toString();
    return '${product.id}-$digest${_extensionFor(product)}';
  }

  String _extensionFor(KioskCatalogProduct product) {
    final contentType = product.image.contentType?.toLowerCase();
    if (contentType == 'image/png') {
      return '.png';
    }
    if (contentType == 'image/webp') {
      return '.webp';
    }
    return '.jpg';
  }

  Future<void> _cleanupImageCache(Set<String> activePaths) async {
    final directory = await _imageCacheDirectory();
    final files = directory.listSync().whereType<File>().toList(
      growable: false,
    );
    for (final file in files) {
      if (!activePaths.contains(file.path)) {
        await _deleteQuietly(file);
      }
    }
    final remainingFiles =
        directory.listSync().whereType<File>().toList(growable: false)..sort(
          (left, right) =>
              left.statSync().modified.compareTo(right.statSync().modified),
        );
    var totalBytes = 0;
    for (final file in remainingFiles) {
      totalBytes += file.lengthSync();
    }
    for (final file in remainingFiles) {
      if (totalBytes <= maxImageCacheBytes || activePaths.contains(file.path)) {
        continue;
      }
      final size = file.lengthSync();
      await _deleteQuietly(file);
      totalBytes -= size;
    }
  }

  Future<void> _deleteQuietly(File file) async {
    try {
      if (await file.exists()) {
        await file.delete();
      }
    } catch (_) {}
  }

  @override
  void dispose() {
    _disposed = true;
    stopAutoRefresh();
    super.dispose();
  }

  @override
  void notifyListeners() {
    if (!_disposed) {
      super.notifyListeners();
    }
  }
}
