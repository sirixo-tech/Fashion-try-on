import 'dart:async';
import 'dart:io';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../catalog/kiosk_catalog_gateway.dart';
import '../catalog/kiosk_catalog_models.dart';
import '../theme/selfx_kiosk_theme.dart';
import '../tryon/kiosk_try_on_session_controller.dart';
import 'catalog_filter_icon.dart';
import 'kiosk_attention_animations.dart';
import 'selfx_kiosk_button.dart';
import 'selfx_logo.dart';

/// Browsing state stays local until Continue commits a garment to the session.
class GarmentResultCatalog extends StatefulWidget {
  const GarmentResultCatalog({
    super.key,
    required this.catalog,
    required this.image,
    required this.isCurrent,
    required this.sessionIdentity,
    required this.onContinue,
    required this.onShowAll,
    required this.onBack,
    required this.onRetake,
    required this.onGetMyLooks,
    required this.onFinish,
    required this.downloadEnabled,
    this.nextPick,
    required this.onContinueNextPick,
  });

  final KioskCatalogGateway catalog;
  final Widget image;
  final bool Function() isCurrent;
  final Object sessionIdentity;
  final Future<void> Function(KioskCatalogProduct) onContinue;
  final Future<void> Function() onShowAll;
  final VoidCallback onBack;
  final Future<void> Function() onRetake;
  final Future<void> Function() onGetMyLooks;
  final Future<void> Function() onFinish;
  final bool downloadEnabled;
  final KioskTryOnPick? nextPick;
  final Future<void> Function() onContinueNextPick;

  @override
  State<GarmentResultCatalog> createState() => _GarmentResultCatalogState();
}

class _GarmentResultCatalogState extends State<GarmentResultCatalog> {
  List<KioskCatalogCategory> _categories = const [];
  List<KioskCatalogProduct> _products = const [];
  KioskCatalogPagination? _pagination;
  KioskCatalogProduct? _selected;
  String? _category;
  String? _error;
  bool _nextSelected = false;
  bool _loading = true;
  bool _busy = false;
  int _request = 0;

  bool get _current => mounted && widget.isCurrent();
  bool get _hasSelection => _selected != null || _nextSelected;

  @override
  void initState() {
    super.initState();
    unawaited(_load(reset: true));
  }

  @override
  void didUpdateWidget(covariant GarmentResultCatalog oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.sessionIdentity != widget.sessionIdentity ||
        oldWidget.catalog != widget.catalog) {
      ++_request;
      _categories = const [];
      _selected = null;
      _nextSelected = false;
      _category = null;
      unawaited(_load(reset: true));
    }
  }

  Future<void> _load({required bool reset}) async {
    if (!_current) return;
    final request = ++_request;
    final category = _category;
    setState(() {
      _loading = true;
      _error = null;
      if (reset) {
        _products = const [];
        _pagination = null;
      }
    });
    try {
      final categories = await widget.catalog.getCatalogCategories(
        audience: KioskCatalogAudience.all,
      );
      if (!_current || request != _request) return;
      final page = await widget.catalog.getCatalogProducts(
        audience: KioskCatalogAudience.all,
        categorySlug: category,
        page: reset ? 1 : (_pagination?.page ?? 1) + 1,
        pageSize: 12,
      );
      if (!_current || request != _request) return;
      setState(() {
        _categories = dedupeKioskCatalogCategories(categories);
        final unique = <String, KioskCatalogProduct>{
          if (!reset)
            for (final product in _products) product.id: product,
          for (final product in page.products)
            if (product.productVertical == KioskProductVertical.garment)
              product.id: product,
        };
        _products = unique.values.toList();
        _pagination = page.pagination;
        _loading = false;
      });
    } catch (_) {
      if (!_current || request != _request) return;
      setState(() {
        _loading = false;
        _error = 'Garments unavailable. Try again or Show All.';
      });
    }
  }

  Future<void> _run(Future<void> Function() action) async {
    if (_busy || !_current) return;
    setState(() => _busy = true);
    try {
      await action();
    } catch (_) {
      if (mounted && widget.isCurrent()) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Please try again.')));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final height = constraints.maxHeight;
      final headerHeight = (height * 0.075).clamp(56.0, 96.0);
      final pagePadding = constraints.maxWidth < 560 ? 12.0 : 24.0;
      final cardWidth = ((constraints.maxWidth - pagePadding * 2) / 4.5).clamp(
        132.0,
        184.0,
      );
      final garmentHeight = cardWidth + 38;
      const categoriesHeight = 60.0;
      const footerHeight = 72.0;
      const gaps = 24.0;
      final imageHeight = math.max(
        260.0,
        height -
            headerHeight -
            garmentHeight -
            categoriesHeight -
            footerHeight -
            gaps,
      );
      final scroll =
          headerHeight +
              imageHeight +
              garmentHeight +
              categoriesHeight +
              footerHeight +
              gaps >
          height;
      final disabled = _busy || !widget.isCurrent();
      final page = Padding(
        padding: EdgeInsets.symmetric(horizontal: pagePadding),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SizedBox(
              height: headerHeight,
              child: Stack(
                alignment: Alignment.center,
                children: [
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 112),
                    child: SelfxLogo(height: headerHeight - 12, maxWidth: 310),
                  ),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: TextButton.icon(
                      key: const Key('result-back'),
                      onPressed: disabled ? null : widget.onBack,
                      icon: const Icon(Icons.arrow_back),
                      label: const Text('Back'),
                      style: TextButton.styleFrom(
                        backgroundColor: const Color(0xFFECECEC),
                        foregroundColor: SelfxKioskTokens.textPrimary,
                        padding: const EdgeInsets.symmetric(horizontal: 10),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            SizedBox(
              key: const Key('result-preview-area'),
              height: imageHeight,
              child: widget.image,
            ),
            const SizedBox(height: 8),
            SizedBox(
              height: categoriesHeight,
              child: LayoutBuilder(
                builder: (context, categoryConstraints) =>
                    SingleChildScrollView(
                      key: const Key('result-categories'),
                      scrollDirection: Axis.horizontal,
                      child: Row(
                        spacing: 8,
                        children: [
                          for (final (slug, name) in [
                            (null, 'All'),
                            for (final category in _categories)
                              (category.slug, category.name),
                          ])
                            SizedBox(
                              width: math.max(
                                104,
                                (categoryConstraints.maxWidth -
                                        _categories.length * 8) /
                                    (_categories.length + 1),
                              ),
                              child: _categoryButton(slug, name),
                            ),
                        ],
                      ),
                    ),
              ),
            ),
            const SizedBox(height: 8),
            SizedBox(
              height: garmentHeight,
              child: _garments(disabled, cardWidth),
            ),
            const SizedBox(height: 8),
            SizedBox(
              key: const Key('result-footer'),
              height: footerHeight,
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Row(
                  children: [
                    if (_hasSelection)
                      const Spacer()
                    else
                      Expanded(
                        child: SelfxKioskButton(
                          key: const Key('get-my-looks'),
                          label: 'Get My Looks',
                          icon: Icons.download_outlined,
                          minHeight: 56,
                          padding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 10,
                          ),
                          variant: SelfxKioskButtonVariant.secondary,
                          backgroundColor: const Color(0xFFFFFCF8),
                          foregroundColor: const Color(0xFFE86610),
                          onPressed: disabled || !widget.downloadEnabled
                              ? null
                              : () => unawaited(_run(widget.onGetMyLooks)),
                        ),
                      ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: SelfxActionPulse(
                        enabled: _hasSelection && !disabled,
                        child: SelfxKioskButton(
                          key: Key(
                            _hasSelection ? 'result-continue' : 'finish-try-on',
                          ),
                          label: _hasSelection ? 'Continue' : 'Back to Home',
                          icon: _hasSelection
                              ? Icons.arrow_forward
                              : Icons.home_outlined,
                          backgroundColor: _hasSelection
                              ? SelfxKioskTokens.primary
                              : Colors.white,
                          foregroundColor: _hasSelection
                              ? Colors.white
                              : SelfxKioskTokens.textPrimary,
                          minHeight: 56,
                          padding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 10,
                          ),
                          onPressed: disabled
                              ? null
                              : () => unawaited(
                                  _run(
                                    _nextSelected
                                        ? widget.onContinueNextPick
                                        : _selected != null
                                        ? () => widget.onContinue(_selected!)
                                        : widget.onFinish,
                                  ),
                                ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      );
      return scroll ? SingleChildScrollView(child: page) : page;
    },
  );

  Widget _categoryButton(String? slug, String name) {
    final selected = _category == slug;
    return TextButton(
      key: ValueKey('result-category-${slug ?? 'all'}'),
      onPressed: _busy || !widget.isCurrent()
          ? null
          : () {
              if (_busy || !_current) return;
              if (_category == slug) return;
              setState(() {
                _category = slug;
                _selected = null;
                _nextSelected = false;
              });
              unawaited(_load(reset: true));
            },
      style: TextButton.styleFrom(
        backgroundColor: selected
            ? SelfxKioskTokens.catalogSelectedSurface
            : Colors.white,
        foregroundColor: selected
            ? SelfxKioskTokens.primary
            : SelfxKioskTokens.textPrimary,
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          CatalogFilterIcon(
            type: categoryFilterIconType(slug ?? ''),
            size: 24,
            color: selected
                ? SelfxKioskTokens.primary
                : SelfxKioskTokens.textPrimary,
          ),
          const SizedBox(height: 2),
          Text(
            name,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
          ),
        ],
      ),
    );
  }

  Widget _garments(bool disabled, double cardWidth) => ListView(
    key: const Key('result-garments'),
    scrollDirection: Axis.horizontal,
    children: [
      if (widget.nextPick != null)
        _GarmentTile(
          key: const Key('result-next-pick'),
          width: cardWidth,
          name: 'Try Next Pick',
          detail: 'Up next',
          localPath: widget.nextPick!.localImagePath,
          imageUrl: widget.nextPick!.imageUrl,
          selected: _nextSelected,
          onTap: disabled
              ? null
              : () => setState(() {
                  if (_busy || !_current) return;
                  _nextSelected = !_nextSelected;
                  _selected = null;
                }),
        ),
      for (final product in _products)
        _GarmentTile(
          key: ValueKey('result-product-${product.id}'),
          width: cardWidth,
          name: product.name,
          detail: product.displayPrice,
          localPath: product.image.localPath,
          imageUrl: product.image.url,
          selected: _selected?.id == product.id,
          onTap: disabled
              ? null
              : () => setState(() {
                  if (_busy || !_current) return;
                  _selected = _selected?.id == product.id ? null : product;
                  _nextSelected = false;
                }),
        ),
      if (_loading)
        const SizedBox(
          width: 100,
          child: Center(child: CircularProgressIndicator()),
        ),
      if (_error != null || (!_loading && _products.isEmpty))
        SizedBox(
          width: 180,
          child: Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  _error ?? 'No garments in this category.',
                  textAlign: TextAlign.center,
                ),
                if (_error != null)
                  TextButton(
                    onPressed: disabled
                        ? null
                        : () => unawaited(_load(reset: _products.isEmpty)),
                    child: const Text('Retry'),
                  ),
              ],
            ),
          ),
        ),
      if (!_loading && _pagination?.hasMore == true)
        SizedBox(
          width: 110,
          child: TextButton(
            onPressed: disabled ? null : () => unawaited(_load(reset: false)),
            child: const Text('Load More'),
          ),
        ),
      SizedBox(
        width: 120,
        child: TextButton.icon(
          key: const Key('result-show-all'),
          onPressed: disabled ? null : () => unawaited(_run(widget.onShowAll)),
          icon: const Icon(Icons.grid_view_rounded),
          label: const Text('Show All'),
        ),
      ),
    ],
  );
}

class _GarmentTile extends StatelessWidget {
  const _GarmentTile({
    super.key,
    required this.name,
    required this.width,
    this.detail,
    this.localPath,
    this.imageUrl,
    required this.selected,
    required this.onTap,
  });
  final String name;
  final double width;
  final String? detail;
  final String? localPath;
  final String? imageUrl;
  final bool selected;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    Widget placeholder() =>
        const Center(child: Icon(Icons.checkroom_outlined, size: 40));
    final image = localPath != null && localPath!.isNotEmpty
        ? Image.file(
            File(localPath!),
            fit: BoxFit.cover,
            cacheWidth: 360,
            errorBuilder: (_, _, _) => placeholder(),
          )
        : imageUrl != null && imageUrl!.isNotEmpty
        ? Image.network(
            imageUrl!,
            fit: BoxFit.cover,
            cacheWidth: 360,
            errorBuilder: (_, _, _) => placeholder(),
          )
        : placeholder();
    return Semantics(
      button: true,
      selected: selected,
      child: Container(
        width: width,
        margin: const EdgeInsets.only(right: 8, bottom: 2),
        child: Material(
          color: Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
            side: BorderSide(
              color: selected
                  ? SelfxKioskTokens.primary
                  : SelfxKioskTokens.border,
              width: selected ? 3 : 1,
            ),
          ),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: onTap,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      image,
                      if (selected)
                        const Positioned(
                          top: 6,
                          right: 6,
                          child: ExcludeSemantics(
                            child: DecoratedBox(
                              key: Key('result-product-selected-tick'),
                              decoration: BoxDecoration(
                                color: SelfxKioskTokens.primary,
                                shape: BoxShape.circle,
                              ),
                              child: Padding(
                                padding: EdgeInsets.all(4),
                                child: Icon(
                                  Icons.check_rounded,
                                  color: Colors.white,
                                  size: 16,
                                ),
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
                SizedBox(
                  height: 36,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 4,
                      vertical: 2,
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text(
                          name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 14,
                            height: 1.1,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        if (detail != null)
                          Text(
                            detail!,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 12,
                              height: 1.1,
                              color: SelfxKioskTokens.primary,
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
