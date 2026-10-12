import 'dart:io';

import 'package:flutter/material.dart';

import '../catalog/kiosk_catalog_gateway.dart';
import '../catalog/kiosk_catalog_models.dart';
import '../catalog/kiosk_catalog_repository.dart';
import '../session/capture_session_controller.dart';
import '../theme/selfx_kiosk_theme.dart';
import '../tryon/kiosk_try_on_session_controller.dart';
import '../tryon/kiosk_garment_input.dart';

/// Reads cached recommendations only; never awaits inference or fetches images.
class ProductRecommendationCarousel extends StatefulWidget {
  const ProductRecommendationCarousel({
    super.key,
    required this.captureController,
    required this.tryOnController,
    required this.catalogGateway,
    required this.onShowAll,
    required this.onOpenPicks,
    required this.onContinue,
    required this.onSingleProduct,
    this.busy = false,
  });
  final CaptureSessionController captureController;
  final KioskTryOnSessionController tryOnController;
  final KioskCatalogGateway catalogGateway;
  final VoidCallback onShowAll;
  final VoidCallback onOpenPicks;
  final VoidCallback onContinue;
  final ValueChanged<KioskCatalogProduct> onSingleProduct;
  final bool busy;

  @override
  State<ProductRecommendationCarousel> createState() =>
      _ProductRecommendationCarouselState();
}

class _ProductRecommendationCarouselState
    extends State<ProductRecommendationCarousel> {
  final _scroll = ScrollController();
  List<KioskCatalogProduct> _products = const [];
  int? _revision;
  KioskCatalogAudience? _preference;
  KioskCatalogRepository? get _repository =>
      widget.catalogGateway is KioskCatalogRepository
      ? widget.catalogGateway as KioskCatalogRepository
      : null;

  @override
  void initState() {
    super.initState();
    widget.tryOnController.addListener(_changed);
    _repository?.addListener(_catalogChanged);
    _read();
  }

  void _read() {
    final service = widget.tryOnController.recommendations;
    _revision = service?.sessionRevision;
    _preference = service?.audiencePreference;
    _products = service?.getRecommendations() ?? const [];
  }

  void _changed() {
    if (!mounted) return;
    final service = widget.tryOnController.recommendations;
    setState(() {
      if (_revision != service?.sessionRevision ||
          _preference != service?.audiencePreference) {
        _read();
      }
    });
  }

  void _catalogChanged() {
    if (!mounted || _products.isNotEmpty) return;
    setState(_read);
  }

  @override
  void didUpdateWidget(covariant ProductRecommendationCarousel oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.tryOnController != widget.tryOnController ||
        oldWidget.catalogGateway != widget.catalogGateway) {
      oldWidget.tryOnController.removeListener(_changed);
      if (oldWidget.catalogGateway
          case final KioskCatalogRepository repository) {
        repository.removeListener(_catalogChanged);
      }
      widget.tryOnController.addListener(_changed);
      _repository?.addListener(_catalogChanged);
      _read();
    }
  }

  @override
  void dispose() {
    widget.tryOnController.removeListener(_changed);
    _repository?.removeListener(_catalogChanged);
    _scroll.dispose();
    super.dispose();
  }

  bool get _enabled {
    final service = widget.tryOnController.recommendations;
    return !widget.busy &&
        widget.captureController.activeAcceptedPersonPhoto != null &&
        (service == null ||
            (service.sessionActive && service.sessionRevision == _revision));
  }

  bool get _multi =>
      widget.tryOnController.multiGarmentSelectionEnabled &&
      widget.tryOnController.activeTryOnVertical == KioskTryOnVertical.garment;

  void _select(KioskCatalogProduct product, int? revision) {
    if (!_enabled || revision != _revision) return;
    if (!_multi) {
      widget.onSingleProduct(product);
      return;
    }
    if (!widget.tryOnController.toggleCatalogProductPick(product)) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            widget.tryOnController.sessionMessage ??
                'My Picks is full. Remove one item to add another.',
          ),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final controller = widget.tryOnController;
    final revision = _revision;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                'Recommended for you',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
            TextButton(
              key: const Key('recommendations-show-all'),
              onPressed: _enabled
                  ? () {
                      if (_enabled && revision == _revision) widget.onShowAll();
                    }
                  : null,
              child: const Text('Show All'),
            ),
            IconButton(
              tooltip: 'Next products',
              onPressed: _products.isEmpty
                  ? null
                  : () {
                      _scroll.animateTo(
                        (_scroll.offset + 260).clamp(
                          0,
                          _scroll.position.maxScrollExtent,
                        ),
                        duration: const Duration(milliseconds: 220),
                        curve: Curves.easeOut,
                      );
                    },
              icon: const Icon(Icons.chevron_right),
            ),
          ],
        ),
        SizedBox(
          height: 164,
          child: ListView.separated(
            key: const Key('recommendation-products'),
            controller: _scroll,
            scrollDirection: Axis.horizontal,
            itemCount: _products.length + 1,
            separatorBuilder: (_, _) => const SizedBox(width: 10),
            itemBuilder: (context, index) {
              if (index == _products.length) {
                return SizedBox(
                  width: 136,
                  child: Card(
                    color: SelfxKioskTokens.surface,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                      side: const BorderSide(color: SelfxKioskTokens.primary),
                    ),
                    child: InkWell(
                      key: const Key('recommendations-show-all-tile'),
                      onTap: _enabled
                          ? () {
                              if (_enabled && revision == _revision) {
                                widget.onShowAll();
                              }
                            }
                          : null,
                      borderRadius: BorderRadius.circular(12),
                      child: const Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(
                            Icons.grid_view_rounded,
                            color: SelfxKioskTokens.primary,
                            size: 32,
                          ),
                          SizedBox(height: 10),
                          Text('Show All'),
                        ],
                      ),
                    ),
                  ),
                );
              }
              final product = _products[index];
              final picked = _multi
                  ? controller.isPicked(product.id)
                  : controller.garmentInput?.productId == product.id;
              return SizedBox(
                width: 136,
                child: Card(
                  color: SelfxKioskTokens.surface,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                    side: BorderSide(
                      color: picked
                          ? SelfxKioskTokens.primary
                          : SelfxKioskTokens.border,
                      width: picked ? 2 : 1,
                    ),
                  ),
                  child: InkWell(
                    key: ValueKey('recommendation-${product.id}'),
                    onTap: _enabled ? () => _select(product, revision) : null,
                    borderRadius: BorderRadius.circular(12),
                    child: Padding(
                      padding: const EdgeInsets.all(6),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Expanded(
                            child: Stack(
                              fit: StackFit.expand,
                              children: [
                                ClipRRect(
                                  borderRadius: BorderRadius.circular(8),
                                  child: _Thumbnail(product.image.localPath),
                                ),
                                Positioned(
                                  right: 3,
                                  top: 3,
                                  child: Icon(
                                    picked
                                        ? Icons.check_circle
                                        : Icons.add_circle,
                                    color: SelfxKioskTokens.primary,
                                    size: 24,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 5),
                          Text(
                            product.name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          if (product.displayPrice != null)
                            Text(
                              product.displayPrice!,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 13,
                                color: SelfxKioskTokens.primary,
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                ),
              );
            },
          ),
        ),
        if (_multi)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    key: const Key('recommendations-my-picks'),
                    onPressed: _enabled
                        ? () {
                            if (_enabled && revision == _revision) {
                              widget.onOpenPicks();
                            }
                          }
                        : null,
                    icon: const Icon(Icons.checkroom_outlined),
                    label: Text(
                      controller.showMyPicksCounter
                          ? 'My Picks (${controller.garmentPicks.length}/${controller.maxTryOnPicks})'
                          : 'My Picks',
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: FilledButton(
                    key: const Key('recommendations-continue'),
                    onPressed: _enabled && controller.garmentPicks.isNotEmpty
                        ? () {
                            if (!_enabled || revision != _revision) return;
                            controller.selectFirstGarmentPick();
                            widget.onContinue();
                          }
                        : null,
                    child: const Text('Continue'),
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

class _Thumbnail extends StatelessWidget {
  const _Thumbnail(this.path);
  final String? path;
  @override
  Widget build(BuildContext context) {
    const fallback = ColoredBox(
      color: SelfxKioskTokens.background,
      child: Center(
        child: Icon(
          Icons.checkroom_outlined,
          color: SelfxKioskTokens.textSecondary,
        ),
      ),
    );
    if (path == null || path!.trim().isEmpty) return fallback;
    return Image.file(
      File(path!),
      cacheWidth: 256,
      cacheHeight: 256,
      fit: BoxFit.cover,
      errorBuilder: (_, _, _) => fallback,
    );
  }
}
