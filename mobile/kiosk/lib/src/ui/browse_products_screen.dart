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
import 'selfx_kiosk_button.dart';
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

  KioskCatalogAudience _audience = KioskCatalogAudience.all;
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
    widget.tryOnController.addListener(_handleTryOnControllerChanged);
    unawaited(_load(reset: true));
  }

  @override
  void dispose() {
    widget.tryOnController.removeListener(_handleTryOnControllerChanged);
    super.dispose();
  }

  void _handleTryOnControllerChanged() {
    if (mounted) {
      setState(() {});
    }
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
    if (widget.tryOnController.multiGarmentSelectionEnabled) {
      final changed = widget.tryOnController.toggleGarmentPick(
        _pickFromProduct(product),
      );
      if (!changed) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              widget.tryOnController.sessionMessage ??
                  'My Picks is full. Remove one garment to add another.',
            ),
          ),
        );
        return;
      }
      setState(() {
        _selectedProductId = product.id;
      });
      return;
    }
    setState(() => _selectedProductId = product.id);
  }

  Future<void> _continueWithSelectedProduct() async {
    if (_continuing) {
      return;
    }
    final multiSelectEnabled =
        widget.tryOnController.multiGarmentSelectionEnabled;
    final product = _selectedProduct;
    if (multiSelectEnabled) {
      if (widget.tryOnController.garmentPicks.isEmpty) {
        return;
      }
      widget.tryOnController.selectFirstGarmentPick();
    } else {
      if (product == null) {
        return;
      }
      widget.tryOnController.selectGarment(product.toGarmentInput());
    }
    setState(() => _continuing = true);
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

  KioskTryOnPick _pickFromProduct(KioskCatalogProduct product) {
    return KioskTryOnPick(
      id: product.id,
      displayName: product.name,
      displayPrice: product.displayPrice,
      imageUrl: product.image.url,
      localImagePath: product.image.localPath,
      garmentInput: product.toGarmentInput(),
    );
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
          _CatalogFilterBar(
            audience: _audience,
            categories: _categories,
            selectedSlug: _categorySlug,
            onAudienceSelected: _selectAudience,
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
        final multiSelectEnabled =
            widget.tryOnController.multiGarmentSelectionEnabled;
        final pickCount = widget.tryOnController.garmentPicks.length;
        final maxPickCount = widget.tryOnController.maxTryOnPicks;
        return Column(
          children: [
            Expanded(
              child: GridView.builder(
                itemCount: _products.length,
                gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: columns,
                  mainAxisSpacing: 14,
                  crossAxisSpacing: 14,
                  childAspectRatio: 0.68,
                ),
                itemBuilder: (context, index) {
                  final product = _products[index];
                  final picked = widget.tryOnController.isPicked(product.id);
                  return _ProductCard(
                    product: product,
                    selected: multiSelectEnabled
                        ? picked
                        : product.id == _selectedProductId,
                    picked: picked,
                    multiSelectEnabled: multiSelectEnabled,
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
              multiSelectEnabled: multiSelectEnabled,
              pickCount: pickCount,
              maxPickCount: maxPickCount,
              showPickCounter: widget.tryOnController.showMyPicksCounter,
              continuing: _continuing,
              onOpenPicks: pickCount == 0 || _continuing
                  ? null
                  : () => _openMyPicks(context),
              onContinue:
                  ((multiSelectEnabled
                          ? pickCount == 0
                          : _selectedProduct == null) ||
                      _continuing)
                  ? null
                  : () => unawaited(_continueWithSelectedProduct()),
            ),
          ],
        );
      },
    );
  }

  void _openMyPicks(BuildContext context) {
    unawaited(
      showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        useSafeArea: true,
        builder: (_) => _MyPicksSheet(tryOnController: widget.tryOnController),
      ),
    );
  }
}

class _CatalogFilterBar extends StatelessWidget {
  const _CatalogFilterBar({
    required this.audience,
    required this.categories,
    required this.selectedSlug,
    required this.onAudienceSelected,
    required this.onSelected,
  });

  final KioskCatalogAudience audience;
  final List<KioskCatalogCategory> categories;
  final String? selectedSlug;
  final ValueChanged<KioskCatalogAudience> onAudienceSelected;
  final ValueChanged<String?> onSelected;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: SelfxKioskTokens.surface,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: SelfxKioskTokens.border),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Icon(
                  Icons.tune,
                  size: 22,
                  color: Theme.of(context).colorScheme.primary,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: SegmentedButton<KioskCatalogAudience>(
                    segments: const [
                      ButtonSegment(
                        value: KioskCatalogAudience.all,
                        label: Text('All'),
                      ),
                      ButtonSegment(
                        value: KioskCatalogAudience.men,
                        label: Text('Men'),
                      ),
                      ButtonSegment(
                        value: KioskCatalogAudience.women,
                        label: Text('Women'),
                      ),
                    ],
                    selected: {audience},
                    showSelectedIcon: false,
                    onSelectionChanged: (selection) =>
                        onAudienceSelected(selection.first),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            _CategoryStrip(
              categories: categories,
              selectedSlug: selectedSlug,
              onSelected: onSelected,
            ),
          ],
        ),
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
      height: 44,
      child: ListView(
        scrollDirection: Axis.horizontal,
        children: [
          Padding(
            padding: const EdgeInsets.only(right: 10),
            child: ChoiceChip(
              key: const Key('catalog-category-all'),
              label: const Text('All categories'),
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
    required this.picked,
    required this.multiSelectEnabled,
    required this.enabled,
    required this.onSelected,
  });

  final KioskCatalogProduct product;
  final bool selected;
  final bool picked;
  final bool multiSelectEnabled;
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
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(12),
        clipBehavior: Clip.antiAlias,
        child: Ink(
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: borderColor, width: selected ? 3 : 1),
            boxShadow: const [
              BoxShadow(
                color: Color(0x120F172A),
                blurRadius: 14,
                offset: Offset(0, 6),
              ),
            ],
          ),
          child: InkWell(
            key: Key('catalog-product-${product.id}'),
            onTap: enabled ? onSelected : null,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      _CatalogProductImage(
                        localPath: localImagePath,
                        imageUrl: imageUrl,
                      ),
                      if (multiSelectEnabled)
                        Positioned(
                          top: 10,
                          right: 10,
                          child: _PickToggleButton(
                            picked: picked,
                            enabled: enabled,
                            onPressed: onSelected,
                          ),
                        )
                      else if (selected)
                        Positioned(top: 10, right: 10, child: _SelectedBadge()),
                    ],
                  ),
                ),
                DecoratedBox(
                  decoration: const BoxDecoration(
                    color: Color(0xFFFFFCF8),
                    border: Border(
                      top: BorderSide(color: SelfxKioskTokens.border),
                    ),
                  ),
                  child: SizedBox(
                    height: 64,
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.center,
                        children: [
                          Expanded(
                            child: Text(
                              product.name,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              textAlign: TextAlign.left,
                              style: Theme.of(context).textTheme.labelLarge
                                  ?.copyWith(
                                    color: SelfxKioskTokens.textPrimary,
                                    fontWeight: FontWeight.w900,
                                    height: 1.08,
                                  ),
                            ),
                          ),
                          if (product.displayPrice != null) ...[
                            const SizedBox(width: 8),
                            Flexible(
                              flex: 0,
                              child: Text(
                                product.displayPrice!,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                textAlign: TextAlign.right,
                                style: Theme.of(context).textTheme.labelMedium
                                    ?.copyWith(
                                      color: SelfxKioskTokens.primary,
                                      fontWeight: FontWeight.w900,
                                      height: 1,
                                    ),
                              ),
                            ),
                          ],
                        ],
                      ),
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
        fit: BoxFit.cover,
        errorBuilder: (_, _, _) => _brokenImage(),
      );
    }
    final remote = imageUrl;
    if (remote != null && remote.isNotEmpty) {
      return Image.network(
        remote,
        fit: BoxFit.cover,
        errorBuilder: (_, _, _) => _brokenImage(),
      );
    }
    return _brokenImage();
  }

  Widget _brokenImage() {
    return const Center(child: Icon(Icons.broken_image_outlined));
  }
}

class _PickToggleButton extends StatelessWidget {
  const _PickToggleButton({
    required this.picked,
    required this.enabled,
    required this.onPressed,
  });

  final bool picked;
  final bool enabled;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: picked ? SelfxKioskTokens.primary : Colors.white,
      elevation: 4,
      shadowColor: const Color(0x33000000),
      shape: const CircleBorder(),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: enabled ? onPressed : null,
        child: Padding(
          padding: const EdgeInsets.all(8),
          child: Icon(
            picked ? Icons.check : Icons.add,
            color: picked ? Colors.white : SelfxKioskTokens.primary,
            size: 21,
          ),
        ),
      ),
    );
  }
}

class _SelectedBadge extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
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
        child: Icon(Icons.check, color: Colors.white, size: 20),
      ),
    );
  }
}

class _SelectedProductAction extends StatelessWidget {
  const _SelectedProductAction({
    required this.product,
    required this.multiSelectEnabled,
    required this.pickCount,
    required this.maxPickCount,
    required this.showPickCounter,
    required this.continuing,
    required this.onOpenPicks,
    required this.onContinue,
  });

  final KioskCatalogProduct? product;
  final bool multiSelectEnabled;
  final int pickCount;
  final int maxPickCount;
  final bool showPickCounter;
  final bool continuing;
  final VoidCallback? onOpenPicks;
  final VoidCallback? onContinue;

  @override
  Widget build(BuildContext context) {
    if (multiSelectEnabled) {
      return SafeArea(
        top: false,
        child: Row(
          children: [
            Expanded(
              child: SizedBox(
                height: 58,
                child: OutlinedButton.icon(
                  key: const Key('open-my-picks'),
                  onPressed: onOpenPicks,
                  icon: const Icon(Icons.checkroom_outlined),
                  label: FittedBox(
                    fit: BoxFit.scaleDown,
                    child: Text(
                      showPickCounter
                          ? 'My Picks ($pickCount/$maxPickCount)'
                          : 'My Picks',
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: SelfxKioskButton(
                key: const Key('continue-selected-product'),
                onPressed: onContinue,
                icon: continuing ? null : Icons.check_circle_outline,
                trailing: continuing
                    ? const SizedBox.square(
                        dimension: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : null,
                label: continuing ? 'Starting' : 'Continue',
                variant: SelfxKioskButtonVariant.primary,
                minHeight: 58,
                textAlign: TextAlign.center,
                mainAxisAlignment: MainAxisAlignment.center,
                padding: const EdgeInsets.symmetric(
                  horizontal: 18,
                  vertical: 12,
                ),
              ),
            ),
          ],
        ),
      );
    }
    final selectedName = product?.name;
    final selectedPrice = product?.displayPrice;
    return SafeArea(
      top: false,
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  selectedName ?? 'Select a garment to continue',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w900,
                  ),
                ),
                if (selectedPrice != null) ...[
                  const SizedBox(height: 2),
                  Text(
                    selectedPrice,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.labelLarge?.copyWith(
                      color: SelfxKioskTokens.primary,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: 16),
          SizedBox(
            height: 58,
            width: 220,
            child: SelfxKioskButton(
              key: const Key('continue-selected-product'),
              onPressed: onContinue,
              icon: continuing ? null : Icons.check_circle_outline,
              trailing: continuing
                  ? const SizedBox.square(
                      dimension: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : null,
              label: continuing ? 'Starting' : 'Continue',
              variant: SelfxKioskButtonVariant.primary,
              minHeight: 58,
              textAlign: TextAlign.center,
              mainAxisAlignment: MainAxisAlignment.center,
              padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
            ),
          ),
        ],
      ),
    );
  }
}

class _MyPicksSheet extends StatelessWidget {
  const _MyPicksSheet({required this.tryOnController});

  final KioskTryOnSessionController tryOnController;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: tryOnController,
      builder: (context, _) {
        final picks = tryOnController.garmentPicks;
        return SizedBox(
          height: MediaQuery.sizeOf(context).height * 0.74,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(22, 18, 22, 22),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            'My Picks',
                            style: Theme.of(context).textTheme.headlineSmall
                                ?.copyWith(fontWeight: FontWeight.w900),
                          ),
                          Text(
                            '${picks.length} of ${tryOnController.maxTryOnPicks} selected',
                            style: Theme.of(context).textTheme.bodyMedium
                                ?.copyWith(
                                  color: SelfxKioskTokens.textSecondary,
                                ),
                          ),
                        ],
                      ),
                    ),
                    Material(
                      color: SelfxKioskTokens.primary,
                      borderRadius: BorderRadius.circular(8),
                      clipBehavior: Clip.antiAlias,
                      child: IconButton(
                        key: const Key('close-my-picks'),
                        tooltip: 'Close My Picks',
                        onPressed: () => Navigator.of(context).pop(),
                        color: Colors.white,
                        icon: const Icon(Icons.close),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                Expanded(
                  child: picks.isEmpty
                      ? const Center(
                          child: Text('No garments added to My Picks yet.'),
                        )
                      : ReorderableListView.builder(
                          itemCount: picks.length,
                          onReorderItem: tryOnController.reorderGarmentPick,
                          itemBuilder: (context, index) {
                            final pick = picks[index];
                            return _MyPickListItem(
                              key: ValueKey(pick.id),
                              pick: pick,
                              onRemove: () =>
                                  tryOnController.removeGarmentPick(pick.id),
                            );
                          },
                        ),
                ),
                if (picks.isNotEmpty) ...[
                  const SizedBox(height: 14),
                  Align(
                    alignment: Alignment.centerRight,
                    child: TextButton.icon(
                      key: const Key('clear-my-picks'),
                      onPressed: tryOnController.clearGarmentPicks,
                      style: TextButton.styleFrom(
                        foregroundColor: SelfxKioskTokens.danger,
                        padding: const EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 12,
                        ),
                        textStyle: Theme.of(context).textTheme.labelLarge
                            ?.copyWith(fontWeight: FontWeight.w900),
                      ),
                      icon: const Icon(Icons.delete_outline),
                      label: const Text('Clear All'),
                    ),
                  ),
                ],
              ],
            ),
          ),
        );
      },
    );
  }
}

class _MyPickListItem extends StatelessWidget {
  const _MyPickListItem({
    super.key,
    required this.pick,
    required this.onRemove,
  });

  final KioskTryOnPick pick;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        leading: ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: SizedBox(
            width: 56,
            height: 64,
            child: _CatalogProductImage(
              localPath: pick.localImagePath,
              imageUrl: pick.imageUrl,
            ),
          ),
        ),
        title: Text(
          pick.displayName,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: Theme.of(
            context,
          ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w900),
        ),
        subtitle: pick.displayPrice == null
            ? null
            : Text(
                pick.displayPrice!,
                style: Theme.of(context).textTheme.labelLarge?.copyWith(
                  color: SelfxKioskTokens.primary,
                  fontWeight: FontWeight.w900,
                ),
              ),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            IconButton(
              tooltip: 'Remove',
              onPressed: onRemove,
              icon: const Icon(Icons.close),
            ),
            const Icon(Icons.drag_handle),
          ],
        ),
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
