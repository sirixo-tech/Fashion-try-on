import 'dart:math' as math;

import 'kiosk_catalog_models.dart';

const maxKioskRecommendedProducts = 7;

/// Local catalog merchandising only; no person-image/inference dependency.
/// Own one instance per kiosk customer-session owner, not a global singleton.
class KioskProductRecommendationService {
  KioskProductRecommendationService({
    required this.cachedProducts,
    int? initialRotation,
  }) : _nextRotation = initialRotation ?? math.Random().nextInt(0x7fffffff);

  /// Reads the already loaded repository snapshot. Must not sync/fetch remotely.
  final Iterable<KioskCatalogProduct> Function() cachedProducts;
  int _nextRotation;
  int _rotation = 0;
  bool _active = false;
  int _sessionRevision = 0;
  KioskProductVertical _vertical = KioskProductVertical.garment;
  KioskCatalogAudience? _audiencePreference;
  List<KioskCatalogProduct>? _selection;

  bool get sessionActive => _active;
  int get sessionRevision => _sessionRevision;
  KioskCatalogAudience? get audiencePreference => _audiencePreference;

  void beginSession({
    KioskProductVertical productVertical = KioskProductVertical.garment,
  }) {
    if (_active) return;
    _sessionRevision++;
    _active = true;
    _vertical = productVertical;
    _rotation = _nextRotation++;
    _audiencePreference = null;
    _selection = null;
  }

  /// Only explicit browsing intent belongs here, never inferred person labels.
  void setAudiencePreference(KioskCatalogAudience? audience) {
    if (!_active) {
      throw StateError('Begin a customer session before setting a preference.');
    }
    if (_audiencePreference == audience) return;
    _audiencePreference = audience;
    _selection = null;
  }

  /// Stable during a session; retries an empty/unavailable cache on next read.
  /// No filesystem/network work, image decoding or backend contract changes.
  List<KioskCatalogProduct> getRecommendations({
    int limit = maxKioskRecommendedProducts,
  }) {
    if (!_active || limit <= 0) return const [];
    final existing = _selection;
    if (existing != null) {
      return List.unmodifiable(
        existing.take(limit.clamp(0, maxKioskRecommendedProducts)),
      );
    }

    final byId = <String, KioskCatalogProduct>{};
    try {
      for (final product in cachedProducts()) {
        if (product.productVertical == _vertical &&
            product.id.trim().isNotEmpty &&
            product.hasUsableImage &&
            _matchesPreference(product.audience)) {
          byId.putIfAbsent(product.id, () => product);
        }
      }
    } catch (_) {
      return const [];
    }
    if (byId.isEmpty) return const [];

    // Interleave audience groups so catalog sorting cannot make ALL look like
    // a single-audience recommendation. UNISEX/ALL remain eligible for MEN/WOMEN.
    final groups = <String, List<KioskCatalogProduct>>{};
    for (final product in byId.values) {
      groups
          .putIfAbsent(product.audience.trim().toUpperCase(), () => [])
          .add(product);
    }
    final names = groups.keys.toList()..sort();
    final pools = [
      for (var index = 0; index < names.length; index++)
        groups[names[(index + _rotation) % names.length]]!,
    ];
    final positions = List<int>.filled(pools.length, 0);
    final selected = <KioskCatalogProduct>[];
    var added = true;
    while (selected.length < maxKioskRecommendedProducts && added) {
      added = false;
      for (var index = 0; index < pools.length; index++) {
        final pool = pools[index];
        final position = positions[index];
        if (position >= pool.length) continue;
        selected.add(pool[(position + _rotation) % pool.length]);
        positions[index]++;
        added = true;
        if (selected.length == maxKioskRecommendedProducts) break;
      }
    }
    _selection = List.unmodifiable(selected);
    return List.unmodifiable(
      selected.take(limit.clamp(0, maxKioskRecommendedProducts)),
    );
  }

  bool _matchesPreference(String audience) {
    final preference = _audiencePreference;
    if (preference == null || preference == KioskCatalogAudience.all) {
      return true;
    }
    final normalized = audience.trim().toUpperCase();
    return normalized == preference.apiValue ||
        normalized == 'UNISEX' ||
        normalized == 'ALL';
  }

  void endSession() {
    _sessionRevision++;
    _active = false;
    _audiencePreference = null;
    _selection = null;
    _vertical = KioskProductVertical.garment;
    _rotation = 0;
    // Only a non-customer rotation counter survives. No preference/products do.
  }
}
