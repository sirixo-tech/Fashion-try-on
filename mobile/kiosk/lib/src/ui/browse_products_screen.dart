import 'dart:async';
import 'dart:io';

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
  bool _continuing = false;
  String? _selectedProductId;
  String? _message;
  int _requestSerial = 0;

  KioskCatalogProduct? get _selectedProduct {
    final selectedId = _selectedProductId;
    if (selectedId == null) {
      return null;
    }
    for (final product in _products) {
      if (product.id == selectedId) {
        return product;
      }
    }
    return null;
  }

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
    if (_audience == audience || _continuing) {
      return;
    }
    setState(() {
      _audience = audience;
      _categorySlug = null;
      _categories = const [];
      _selectedProductId = null;
    });
    unawaited(_load(reset: true));
  }

  void _selectCategory(String? slug) {
    if (_categorySlug == slug || _continuing) {
      return;
    }
    setState(() {
      _categorySlug = slug;
      _selectedProductId = null;
    });
    unawaited(_load(reset: true));
  }

  void _selectProduct(KioskCatalogProduct product) {
    if (_continuing) {
      return;
    }
    setState(() => _selectedProductId = product.id);
  }

  Future<void> _continueWithSelectedProduct() async {
    if (_continuing) {
      return;
    }
    final product = _selectedProduct;
    if (product == null) {
      return;
    }
    setState(() => _continuing = true);
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
      setState(() => _continuing = false);
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
                    selected: product.id == _selectedProductId,
                    enabled: !_continuing,
                    onSelected: () => _selectProduct(product),
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
            const SizedBox(height: 14),
            _SelectedProductAction(
              product: _selectedProduct,
              continuing: _continuing,
              onContinue: _selectedProduct == null || _continuing
                  ? null
                  : () => unawaited(_continueWithSelectedProduct()),
            ),
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
  const _ProductCard({
    required this.product,
    required this.selected,
    required this.enabled,
    required this.onSelected,
  });

  final KioskCatalogProduct product;
  final bool selected;
  final bool enabled;
  final VoidCallback onSelected;

  @override
  Widget build(BuildContext context) {
    final borderColor = selected
        ? SelfxKioskTokens.primary
        : SelfxKioskTokens.border;
    final imageUrl = product.image.url?.trim();
    final localImagePath = product.image.localPath?.trim();
    return Semantics(
      button: true,
      selected: selected,
      label: product.name,
      child: Card(
        clipBehavior: Clip.antiAlias,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(8),
          side: BorderSide(color: borderColor, width: selected ? 3 : 1),
        ),
        child: InkWell(
          key: Key('catalog-product-${product.id}'),
          onTap: enabled ? onSelected : null,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(
                flex: 8,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    ColoredBox(
                      color: SelfxKioskTokens.background,
                      child: _CatalogProductImage(
                        localPath: localImagePath,
                        imageUrl: imageUrl,
                      ),
                    ),
                    if (selected)
                      Positioned(
                        top: 10,
                        right: 10,
                        child: DecoratedBox(
                          decoration: BoxDecoration(
                            color: SelfxKioskTokens.primary,
                            shape: BoxShape.circle,
                            boxShadow: const [
                              BoxShadow(
                                color: Color(0x33000000),
                                blurRadius: 10,
                                offset: Offset(0, 3),
                              ),
                            ],
                          ),
                          child: const Padding(
                            padding: EdgeInsets.all(7),
                            child: Icon(
                              Icons.check,
                              color: Colors.white,
                              size: 20,
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
                child: SizedBox(
                  height: 40,
                  child: Text(
                    product.name,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.labelLarge,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CatalogProductImage extends StatelessWidget {
  const _CatalogProductImage({required this.localPath, required this.imageUrl});

  final String? localPath;
  final String? imageUrl;

  @override
  Widget build(BuildContext context) {
    final local = localPath;
    if (local != null && local.isNotEmpty && File(local).existsSync()) {
      return Image.file(
        File(local),
        fit: BoxFit.contain,
        errorBuilder: (_, _, _) => _brokenImage(),
      );
    }
    final remote = imageUrl;
    if (remote != null && remote.isNotEmpty) {
      return Image.network(
        remote,
        fit: BoxFit.contain,
        errorBuilder: (_, _, _) => _brokenImage(),
      );
    }
    return _brokenImage();
  }

  Widget _brokenImage() {
    return const Center(child: Icon(Icons.broken_image_outlined));
  }
}

class _SelectedProductAction extends StatelessWidget {
  const _SelectedProductAction({
    required this.product,
    required this.continuing,
    required this.onContinue,
  });

  final KioskCatalogProduct? product;
  final bool continuing;
  final VoidCallback? onContinue;

  @override
  Widget build(BuildContext context) {
    final selectedName = product?.name;
    return SafeArea(
      top: false,
      child: Row(
        children: [
          Expanded(
            child: Text(
              selectedName ?? 'Select a garment to continue',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.titleMedium,
            ),
          ),
          const SizedBox(width: 16),
          SizedBox(
            height: 58,
            width: 220,
            child: ElevatedButton.icon(
              key: const Key('continue-selected-product'),
              onPressed: onContinue,
              icon: continuing
                  ? const SizedBox.square(
                      dimension: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.check_circle_outline),
              label: Text(continuing ? 'Starting' : 'Continue'),
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
