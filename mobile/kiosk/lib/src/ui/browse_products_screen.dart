import 'dart:async';

import 'package:flutter/material.dart';

import '../catalog/kiosk_catalog_gateway.dart';
import '../catalog/kiosk_catalog_models.dart';
import '../session/capture_session_controller.dart';
import '../theme/selfx_kiosk_theme.dart';
import '../tryon/garment_extraction_service.dart';
import '../tryon/kiosk_try_on_session_controller.dart';
import '../upload/kiosk_customer_upload_controller.dart';
import 'kiosk_chrome.dart';
import 'try_on_generation_screen.dart';

class BrowseProductsScreen extends StatefulWidget {
  const BrowseProductsScreen({
    super.key,
    required this.captureController,
    required this.tryOnController,
    required this.uploadController,
    required this.catalogGateway,
    this.extractionService = const UnavailableGarmentExtractionService(),
  });

  final CaptureSessionController captureController;
  final KioskTryOnSessionController tryOnController;
  final KioskCustomerUploadController uploadController;
  final KioskCatalogGateway catalogGateway;
  final GarmentExtractionService extractionService;

  @override
  State<BrowseProductsScreen> createState() => _BrowseProductsScreenState();
}

class _BrowseProductsScreenState extends State<BrowseProductsScreen> {
  static const _pageSize = 12;

  KioskCatalogAudience _audience = KioskCatalogAudience.men;
  String? _categorySlug;
  List<KioskCatalogCategory> _categories = const [];
  List<KioskCatalogProduct> _products = const [];
  KioskCatalogPagination? _pagination;
  bool _loading = true;
  bool _loadingMore = false;
  bool _selecting = false;
  String? _message;
  int _requestSerial = 0;

  @override
  void initState() {
    super.initState();
    unawaited(_load(reset: true));
  }

  Future<void> _load({required bool reset}) async {
    final requestId = ++_requestSerial;
    setState(() {
      _message = null;
      if (reset) {
        _loading = true;
        _products = const [];
        _pagination = null;
      } else {
        _loadingMore = true;
      }
    });

    try {
      if (reset) {
        _categories = await widget.catalogGateway.getCatalogCategories(
          audience: _audience,
        );
      }
      final page = await widget.catalogGateway.getCatalogProducts(
        audience: _audience,
        categorySlug: _categorySlug,
        page: reset ? 1 : ((_pagination?.page ?? 1) + 1),
        pageSize: _pageSize,
      );
      if (!mounted || requestId != _requestSerial) {
        return;
      }
      setState(() {
        _products = reset ? page.products : [..._products, ...page.products];
        _pagination = page.pagination;
        _loading = false;
        _loadingMore = false;
      });
    } catch (_) {
      if (!mounted || requestId != _requestSerial) {
        return;
      }
      setState(() {
        _message = 'Unable to load garments';
        _loading = false;
        _loadingMore = false;
      });
    }
  }

  void _selectAudience(KioskCatalogAudience audience) {
    if (_audience == audience || _selecting) {
      return;
    }
    setState(() {
      _audience = audience;
      _categorySlug = null;
      _categories = const [];
    });
    unawaited(_load(reset: true));
  }

  void _selectCategory(String? slug) {
    if (_categorySlug == slug || _selecting) {
      return;
    }
    setState(() => _categorySlug = slug);
    unawaited(_load(reset: true));
  }

  Future<void> _tryProduct(KioskCatalogProduct product) async {
    if (_selecting) {
      return;
    }
    setState(() => _selecting = true);
    widget.tryOnController.selectGarment(product.toGarmentInput());
    if (!mounted) {
      return;
    }
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => TryOnGenerationScreen(
          captureController: widget.captureController,
          tryOnController: widget.tryOnController,
          uploadController: widget.uploadController,
          catalogGateway: widget.catalogGateway,
          extractionService: widget.extractionService,
        ),
      ),
    );
    if (mounted) {
      setState(() => _selecting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return KioskScaffold(
      title: 'Catalog',
      subtitle: 'Browse products',
      showBrandHeader: false,
      leading: IconButton(
        onPressed: () => Navigator.of(context).pop(),
        icon: const Icon(Icons.arrow_back),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Choose a Garment',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.headlineMedium,
          ),
          const SizedBox(height: 18),
          _AudienceTabs(selected: _audience, onSelected: _selectAudience),
          const SizedBox(height: 18),
          _CategoryStrip(
            categories: _categories,
            selectedSlug: _categorySlug,
            onSelected: _selectCategory,
          ),
          const SizedBox(height: 18),
          Expanded(child: _catalogBody()),
        ],
      ),
    );
  }

  Widget _catalogBody() {
    if (_loading) {
      return const Center(child: Text('Loading products...'));
    }
    if (_message != null) {
      return _CatalogMessage(
        title: _message!,
        actionLabel: 'Retry',
        onAction: () => unawaited(_load(reset: true)),
      );
    }
    if (_products.isEmpty) {
      return const _CatalogMessage(title: 'No garments available');
    }
    return LayoutBuilder(
      builder: (context, constraints) {
        final columns = constraints.maxWidth >= 1040
            ? 4
            : constraints.maxWidth >= 760
            ? 3
            : 2;
        return Column(
          children: [
            Expanded(
              child: GridView.builder(
                itemCount: _products.length,
                gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: columns,
                  mainAxisSpacing: 14,
                  crossAxisSpacing: 14,
                  childAspectRatio: 0.72,
                ),
                itemBuilder: (context, index) {
                  final product = _products[index];
                  return _ProductCard(
                    product: product,
                    onTry: _selecting ? null : () => _tryProduct(product),
                  );
                },
              ),
            ),
            if (_pagination?.hasMore == true) ...[
              const SizedBox(height: 14),
              SizedBox(
                height: 58,
                child: ElevatedButton.icon(
                  key: const Key('load-more-products'),
                  onPressed: _loadingMore
                      ? null
                      : () => unawaited(_load(reset: false)),
                  icon: _loadingMore
                      ? const SizedBox.square(
                          dimension: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.expand_more),
                  label: const Text('Load More'),
                ),
              ),
            ],
          ],
        );
      },
    );
  }
}

class _AudienceTabs extends StatelessWidget {
  const _AudienceTabs({required this.selected, required this.onSelected});

  final KioskCatalogAudience selected;
  final ValueChanged<KioskCatalogAudience> onSelected;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: SegmentedButton<KioskCatalogAudience>(
        segments: const [
          ButtonSegment(value: KioskCatalogAudience.men, label: Text('MEN')),
          ButtonSegment(
            value: KioskCatalogAudience.women,
            label: Text('WOMEN'),
          ),
        ],
        selected: {selected},
        showSelectedIcon: false,
        onSelectionChanged: (selection) => onSelected(selection.first),
      ),
    );
  }
}

class _CategoryStrip extends StatelessWidget {
  const _CategoryStrip({
    required this.categories,
    required this.selectedSlug,
    required this.onSelected,
  });

  final List<KioskCatalogCategory> categories;
  final String? selectedSlug;
  final ValueChanged<String?> onSelected;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 46,
      child: ListView(
        scrollDirection: Axis.horizontal,
        children: [
          Padding(
            padding: const EdgeInsets.only(right: 10),
            child: ChoiceChip(
              key: const Key('catalog-category-all'),
              label: const Text('All'),
              selected: selectedSlug == null,
              onSelected: (_) => onSelected(null),
            ),
          ),
          for (final category in categories)
            Padding(
              padding: const EdgeInsets.only(right: 10),
              child: ChoiceChip(
                key: Key('catalog-category-${category.slug}'),
                label: Text(category.name),
                selected: selectedSlug == category.slug,
                onSelected: (_) => onSelected(category.slug),
              ),
            ),
        ],
      ),
    );
  }
}

class _ProductCard extends StatelessWidget {
  const _ProductCard({required this.product, required this.onTry});

  final KioskCatalogProduct product;
  final VoidCallback? onTry;

  @override
  Widget build(BuildContext context) {
    return Card(
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Expanded(
            child: ColoredBox(
              color: SelfxKioskTokens.background,
              child: Image.network(
                product.image.url!,
                fit: BoxFit.contain,
                errorBuilder: (_, _, _) {
                  return const Center(child: Icon(Icons.broken_image_outlined));
                },
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                SizedBox(
                  height: 44,
                  child: Text(
                    product.name,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.labelLarge,
                  ),
                ),
                const SizedBox(height: 10),
                ElevatedButton(
                  key: Key('try-catalog-product-${product.id}'),
                  onPressed: onTry,
                  child: const Text('Try'),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _CatalogMessage extends StatelessWidget {
  const _CatalogMessage({required this.title, this.actionLabel, this.onAction});

  final String title;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(title, style: Theme.of(context).textTheme.titleLarge),
          if (actionLabel != null && onAction != null) ...[
            const SizedBox(height: 18),
            ElevatedButton.icon(
              onPressed: onAction,
              icon: const Icon(Icons.refresh),
              label: Text(actionLabel!),
            ),
          ],
        ],
      ),
    );
  }
}
