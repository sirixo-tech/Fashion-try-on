import 'dart:async';
import '../shopping/kiosk_purchase_screen.dart';

import 'package:flutter/material.dart';

import '../catalog/kiosk_catalog_gateway.dart';
import '../session/capture_session_controller.dart';
import '../theme/selfx_kiosk_theme.dart';
import '../tryon/garment_extraction_service.dart';
import '../tryon/kiosk_try_on_models.dart';
import '../tryon/kiosk_try_on_session_controller.dart';
import '../upload/kiosk_customer_upload_controller.dart';
import 'capture_review_screen.dart';
import 'generated_try_on_image.dart';
import 'selfx_kiosk_action_card.dart';
import 'selfx_kiosk_button.dart';
import 'selfx_logo.dart';
import 'my_looks_download_sheet.dart';

const _downloadWindow = Duration(minutes: 5);

Future<void> showMyLooksBottomSheet({
  required BuildContext context,
  required CaptureSessionController captureController,
  required KioskTryOnSessionController tryOnController,
  required KioskCustomerUploadController uploadController,
  String? previewImage,
  KioskCatalogGateway catalogGateway = const UnavailableKioskCatalogGateway(),
  GarmentExtractionService extractionService =
      const UnavailableGarmentExtractionService(),
}) => showGeneralDialog<void>(
  context: context,
  barrierDismissible: true,
  barrierLabel: 'Close My Looks',
  barrierColor: Colors.black.withValues(alpha: 0.52),
  transitionBuilder: (_, animation, _, child) => SlideTransition(
    position: Tween(
      begin: const Offset(0, 1),
      end: Offset.zero,
    ).animate(CurvedAnimation(parent: animation, curve: Curves.easeOutCubic)),
    child: child,
  ),
  pageBuilder: (_, _, _) => SafeArea(
    child: MyLooksScreen(
      captureController: captureController,
      tryOnController: tryOnController,
      uploadController: uploadController,
      catalogGateway: catalogGateway,
      extractionService: extractionService,
      asBottomSheet: true,
      previewImage: previewImage,
    ),
  ),
);

/// Creates the same session-wide share used by the gallery, then opens its QR.
Future<void> showMyLooksDownloadDialog({
  required BuildContext context,
  required CaptureSessionController captureController,
  required KioskTryOnSessionController tryOnController,
}) async {
  final revision = tryOnController.customerSessionRevision;
  bool current() =>
      tryOnController.isCustomerSessionCurrent(revision, requireActive: false);
  if (!current() ||
      !tryOnController.saveMyLooksQrEnabled ||
      tryOnController.creatingShare) {
    return;
  }
  final share = await tryOnController.createSessionShare();
  if (!context.mounted ||
      !current() ||
      ModalRoute.of(context)?.isCurrent != true) {
    return;
  }
  if (share == null) {
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => _ShareFailureDialog(
        onRetry: () {
          Navigator.of(dialogContext).pop();
          unawaited(
            showMyLooksDownloadDialog(
              context: context,
              captureController: captureController,
              tryOnController: tryOnController,
            ),
          );
        },
      ),
    );
    return;
  }
  var finishing = false;
  await _showDownloadDialog(
    context: context,
    share: share,
    controller: tryOnController,
    current: () => current() && !finishing,
    onHome: (dialogContext) async {
      if (!current() || finishing) return;
      finishing = true;
      await tryOnController.finish(captureController);
      if (dialogContext.mounted &&
          !tryOnController.customerSessionActive &&
          tryOnController.customerSessionRevision == revision + 1) {
        Navigator.of(dialogContext).popUntil((route) => route.isFirst);
      }
    },
  );
}

Future<void> _showDownloadDialog({
  required BuildContext context,
  required KioskTryOnShare share,
  required KioskTryOnSessionController controller,
  required bool Function() current,
  required Future<void> Function(BuildContext) onHome,
}) => showGeneralDialog<void>(
  context: context,
  barrierDismissible: true,
  barrierLabel: 'Close download',
  barrierColor: Colors.black.withValues(alpha: 0.52),
  pageBuilder: (dialogContext, _, _) => SafeArea(
    child: AnimatedBuilder(
      animation: controller,
      builder: (_, _) => _LooksModalSurface(
        download: true,
        child: MyLooksDownloadSheet(
          share: share,
          sessionCurrent: current(),
          onClose: () => Navigator.of(dialogContext).pop(),
          onSelectMore: () => Navigator.of(dialogContext).pop(),
          onHome: current() ? () => unawaited(onHome(dialogContext)) : null,
        ),
      ),
    ),
  ),
);

class _LooksModalSurface extends StatelessWidget {
  const _LooksModalSurface({required this.download, required this.child});
  final bool download;
  final Widget child;

  @override
  Widget build(BuildContext context) => AnimatedAlign(
    duration: const Duration(milliseconds: 250),
    alignment: download ? Alignment.center : Alignment.bottomCenter,
    child: AnimatedSize(
      duration: const Duration(milliseconds: 250),
      child: SizedBox(
        key: const Key('my-looks-modal-surface'),
        width: (MediaQuery.sizeOf(context).width - (download ? 32 : 0))
            .clamp(0, 640)
            .toDouble(),
        child: Material(
          color: Colors.white,
          borderRadius: download
              ? BorderRadius.circular(28)
              : const BorderRadius.vertical(top: Radius.circular(28)),
          clipBehavior: Clip.antiAlias,
          child: child,
        ),
      ),
    ),
  );
}

class MyLooksScreen extends StatefulWidget {
  const MyLooksScreen({
    super.key,
    required this.captureController,
    required this.tryOnController,
    required this.uploadController,
    this.catalogGateway = const UnavailableKioskCatalogGateway(),
    this.extractionService = const UnavailableGarmentExtractionService(),
    this.asBottomSheet = false,
    this.previewImage,
  });

  final CaptureSessionController captureController;
  final KioskTryOnSessionController tryOnController;
  final KioskCustomerUploadController uploadController;
  final KioskCatalogGateway catalogGateway;
  final GarmentExtractionService extractionService;
  final bool asBottomSheet;
  final String? previewImage;

  @override
  State<MyLooksScreen> createState() => _MyLooksScreenState();
}

class _MyLooksScreenState extends State<MyLooksScreen> {
  late final int _sessionRevision;
  bool get _sessionCurrent => widget.tryOnController.isCustomerSessionCurrent(
    _sessionRevision,
    requireActive: false,
  );
  late final PageController _pageController;
  late final DateTime _downloadExpiresAt;
  Timer? _downloadTimer;
  int _index = 0;
  bool _refreshing = false;
  bool _refreshFailed = false;
  bool _downloadClosed = false;
  KioskTryOnShare? _activeShare;

  @override
  void initState() {
    super.initState();
    _sessionRevision = widget.tryOnController.customerSessionRevision;
    _pageController = PageController();
    _downloadExpiresAt = DateTime.now().add(_downloadWindow);
    _downloadTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) {
        setState(() {});
      }
    });
    unawaited(_refreshLooks());
  }

  @override
  void dispose() {
    _downloadTimer?.cancel();
    _pageController.dispose();
    super.dispose();
  }

  Future<void> _refreshLooks() async {
    if (_refreshing) {
      return;
    }
    setState(() {
      _refreshing = true;
      _refreshFailed = false;
    });
    await widget.tryOnController.refreshLooks();
    if (!mounted) {
      return;
    }
    final looks = widget.tryOnController.looks;
    setState(() {
      _refreshing = false;
      _refreshFailed = widget.tryOnController.sessionMessage != null;
      if (looks.isNotEmpty && _index >= looks.length) {
        _index = looks.length - 1;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    if (widget.asBottomSheet) {
      final share = _activeShare;
      if (share != null) {
        return AnimatedBuilder(
          animation: widget.tryOnController,
          builder: (context, _) => _LooksModalSurface(
            download: true,
            child: MyLooksDownloadSheet(
              share: share,
              sessionCurrent: _sessionCurrent && !_downloadClosed,
              onClose: () => Navigator.of(context).pop(),
              onSelectMore: () => setState(() => _activeShare = null),
              onHome: _downloadClosed || !_sessionCurrent
                  ? null
                  : () => unawaited(_finish(context)),
            ),
          ),
        );
      }
      return _LooksModalSurface(
        download: false,
        child: ConstrainedBox(
          key: const Key('my-looks-bottom-sheet'),
          constraints: BoxConstraints(
            maxHeight: MediaQuery.sizeOf(context).height * 0.92,
          ),
          child: SafeArea(
            top: false,
            child: AnimatedBuilder(
              animation: widget.tryOnController,
              builder: (context, _) => _LooksBottomSheetContent(
                looks: _sessionCurrent
                    ? widget.tryOnController.looks
                    : const [],
                index: _index,
                refreshing: _refreshing,
                refreshFailed: _refreshFailed,
                fallbackImage: _sessionCurrent
                    ? widget.tryOnController.result?.generatedImage ??
                          widget.previewImage
                    : null,
                lookLabel: _lookLabel,
                onSelected: (value) => setState(() => _index = value),
                onBuy: () {
                  final looks = widget.tryOnController.looks;
                  if (looks.isNotEmpty) {
                    unawaited(
                      openKioskPurchase(
                        context,
                        widget.tryOnController,
                        looks[_index.clamp(0, looks.length - 1)].productId,
                      ),
                    );
                  }
                },
                onClose: () => Navigator.of(context).pop(),
                onRetry: () => unawaited(_refreshLooks()),
                onDownload: () => unawaited(_downloadLooks(context)),
                downloadRemaining: _downloadRemaining,
                downloadAvailable:
                    _downloadAvailable &&
                    _sessionCurrent &&
                    widget.tryOnController.saveMyLooksQrEnabled,
                creatingShare: widget.tryOnController.creatingShare,
              ),
            ),
          ),
        ),
      );
    }
    return Scaffold(
      backgroundColor: SelfxKioskTokens.reviewBackground,
      body: Stack(
        children: [
          const Positioned.fill(
            child: IgnorePointer(child: CustomPaint(painter: _LooksBackdrop())),
          ),
          SafeArea(
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 1100),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
                  child: AnimatedBuilder(
                    animation: widget.tryOnController,
                    builder: (context, _) {
                      final looks = widget.tryOnController.looks;
                      if (looks.isEmpty) {
                        return Column(
                          children: [
                            _LooksHeader(
                              current: 0,
                              total: 0,
                              refreshing: false,
                              refreshFailed: false,
                              onRetry: () => unawaited(_refreshLooks()),
                            ),
                            Expanded(
                              child: _refreshing
                                  ? const Center(
                                      child: Text('Getting your looks...'),
                                    )
                                  : SingleChildScrollView(
                                      padding: const EdgeInsets.symmetric(
                                        vertical: 24,
                                      ),
                                      child: _EmptyLooks(
                                        failed: _refreshFailed,
                                        onRetry: () =>
                                            unawaited(_refreshLooks()),
                                        onTryGarment: () =>
                                            _tryAnotherGarment(context),
                                      ),
                                    ),
                            ),
                          ],
                        );
                      }
                      return _LooksCarousel(
                        looks: looks,
                        index: _index.clamp(0, looks.length - 1),
                        pageController: _pageController,
                        refreshFailed: _refreshFailed,
                        refreshing: _refreshing,
                        creatingShare: widget.tryOnController.creatingShare,
                        downloadRemaining: _downloadRemaining,
                        downloadAvailable: _downloadAvailable,
                        onPageChanged: (value) =>
                            setState(() => _index = value),
                        onPrevious: _index > 0 ? _previous : null,
                        onNext: _index < looks.length - 1 ? _next : null,
                        onRetry: () => unawaited(_refreshLooks()),
                        onDownload: () => unawaited(_downloadLooks(context)),
                        onFinish: () => _finish(context),
                      );
                    },
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  String _lookLabel(KioskTryOnLook look, int index) {
    for (final pick in widget.tryOnController.garmentPicks) {
      if (pick.garmentInput.productId == look.productId &&
          look.productId != null) {
        return pick.displayName;
      }
    }
    if (look.runId == widget.tryOnController.result?.run.id) {
      return widget.tryOnController.garmentInput?.displayName ??
          'Look ${index + 1}';
    }
    return 'Look ${index + 1}';
  }

  Duration get _downloadRemaining {
    if (_downloadClosed) {
      return Duration.zero;
    }
    final remaining = _downloadExpiresAt.difference(DateTime.now());
    if (remaining <= Duration.zero) {
      return Duration.zero;
    }
    return remaining;
  }

  bool get _downloadAvailable => _downloadRemaining > Duration.zero;

  void _previous() {
    _pageController.previousPage(
      duration: const Duration(milliseconds: 240),
      curve: Curves.easeOut,
    );
  }

  void _next() {
    _pageController.nextPage(
      duration: const Duration(milliseconds: 240),
      curve: Curves.easeOut,
    );
  }

  void _tryAnotherGarment(BuildContext context) {
    widget.tryOnController.tryAnotherGarment();
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute<void>(
        builder: (_) => CaptureReviewScreen(
          controller: widget.captureController,
          tryOnController: widget.tryOnController,
          uploadController: widget.uploadController,
          catalogGateway: widget.catalogGateway,
          extractionService: widget.extractionService,
        ),
      ),
      (route) => route.isFirst,
    );
  }

  Future<void> _finish(BuildContext context) async {
    if (_downloadClosed || !_sessionCurrent) return;
    final revision = _sessionRevision;
    setState(() => _downloadClosed = true);
    await widget.tryOnController.finish(widget.captureController);
    if (context.mounted &&
        !widget.tryOnController.customerSessionActive &&
        widget.tryOnController.customerSessionRevision == revision + 1) {
      Navigator.of(context).popUntil((route) => route.isFirst);
    }
  }

  Future<void> _downloadLooks(BuildContext context) async {
    if (!_downloadAvailable || !_sessionCurrent) {
      return;
    }
    final revision = widget.tryOnController.customerSessionRevision;
    final share = await widget.tryOnController.createSessionShare();
    if (!context.mounted ||
        !_downloadAvailable ||
        revision != widget.tryOnController.customerSessionRevision ||
        ModalRoute.of(context)?.isCurrent != true) {
      return;
    }
    if (share == null) {
      await showDialog<void>(
        context: context,
        builder: (dialogContext) => _ShareFailureDialog(
          onRetry: () {
            Navigator.of(dialogContext).pop();
            unawaited(_downloadLooks(context));
          },
        ),
      );
      return;
    }
    if (widget.asBottomSheet) {
      setState(() => _activeShare = share);
      return;
    }
    await _showDownloadDialog(
      context: context,
      share: share,
      controller: widget.tryOnController,
      current: () => _sessionCurrent && !_downloadClosed,
      onHome: _finish,
    );
  }
}

class _LooksBottomSheetContent extends StatelessWidget {
  const _LooksBottomSheetContent({
    required this.looks,
    required this.index,
    required this.refreshing,
    required this.refreshFailed,
    required this.fallbackImage,
    required this.lookLabel,
    required this.onSelected,
    this.onBuy,
    required this.onClose,
    required this.onRetry,
    required this.onDownload,
    required this.downloadRemaining,
    required this.downloadAvailable,
    required this.creatingShare,
  });
  final List<KioskTryOnLook> looks;
  final int index;
  final bool refreshing;
  final bool refreshFailed;
  final String? fallbackImage;
  final String Function(KioskTryOnLook, int) lookLabel;
  final ValueChanged<int> onSelected;
  final VoidCallback? onBuy;
  final VoidCallback onClose;
  final VoidCallback onRetry;
  final VoidCallback onDownload;
  final Duration downloadRemaining;
  final bool downloadAvailable;
  final bool creatingShare;

  @override
  Widget build(BuildContext context) {
    final selected = looks.isEmpty ? 0 : index.clamp(0, looks.length - 1);
    final preview = looks.isEmpty
        ? fallbackImage
        : looks[selected].resultReadUrl;
    return ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 900),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(18, 8, 18, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'My Looks',
                        style: Theme.of(context).textTheme.headlineSmall
                            ?.copyWith(
                              color: SelfxKioskTokens.homeNavy,
                              fontWeight: FontWeight.w900,
                            ),
                      ),
                      const SizedBox(height: 4),
                      Container(
                        width: 40,
                        height: 3,
                        decoration: BoxDecoration(
                          color: SelfxKioskTokens.primary,
                          borderRadius: BorderRadius.circular(999),
                        ),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  key: const Key('close-my-looks'),
                  tooltip: 'Close My Looks',
                  onPressed: onClose,
                  style: IconButton.styleFrom(
                    backgroundColor: SelfxKioskTokens.background,
                    foregroundColor: SelfxKioskTokens.textPrimary,
                  ),
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Flexible(
              fit: FlexFit.loose,
              child: SingleChildScrollView(
                key: const Key('my-looks-sheet-gallery'),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (preview != null)
                      AspectRatio(
                        aspectRatio: 4 / 3,
                        child: GeneratedTryOnImage(
                          key: const Key('my-looks-selected-preview'),
                          src: preview,
                          borderRadius: BorderRadius.circular(18),
                        ),
                      ),
                    if (refreshing)
                      const Padding(
                        padding: EdgeInsets.all(16),
                        child: Center(child: Text('Getting your looks...')),
                      ),
                    if (refreshFailed || (!refreshing && looks.isEmpty))
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        child: Column(
                          children: [
                            Text(
                              refreshFailed
                                  ? 'Could not refresh your looks.'
                                  : 'No downloadable looks yet.',
                            ),
                            TextButton.icon(
                              onPressed: refreshing ? null : onRetry,
                              icon: const Icon(Icons.refresh),
                              label: const Text('Retry'),
                            ),
                          ],
                        ),
                      ),
                    if (looks.length > 1) ...[
                      const SizedBox(height: 12),
                      LayoutBuilder(
                        builder: (context, constraints) {
                          final columns = looks.length == 2 || looks.length == 4
                              ? 2
                              : 3;
                          final cardWidth = (constraints.maxWidth - 16) / 3;
                          return Center(
                            child: SizedBox(
                              width: cardWidth * columns + 8 * (columns - 1),
                              child: GridView.builder(
                                key: const Key('my-looks-thumbnails'),
                                padding: EdgeInsets.zero,
                                shrinkWrap: true,
                                physics: const NeverScrollableScrollPhysics(),
                                itemCount: looks.length,
                                gridDelegate:
                                    SliverGridDelegateWithFixedCrossAxisCount(
                                      crossAxisCount: columns,
                                      crossAxisSpacing: 8,
                                      mainAxisSpacing: 8,
                                      childAspectRatio: 0.92,
                                    ),
                                itemBuilder: (context, i) => Semantics(
                                  selected: i == selected,
                                  child: Material(
                                    key: ValueKey(
                                      'my-looks-thumbnail-${looks[i].lookId}',
                                    ),
                                    color: i == selected
                                        ? SelfxKioskTokens.primary.withValues(
                                            alpha: 0.08,
                                          )
                                        : Colors.white,
                                    shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(12),
                                      side: BorderSide(
                                        color: i == selected
                                            ? SelfxKioskTokens.primary
                                            : SelfxKioskTokens.border,
                                        width: i == selected ? 2 : 1,
                                      ),
                                    ),
                                    clipBehavior: Clip.antiAlias,
                                    child: InkWell(
                                      onTap: () => onSelected(i),
                                      child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.stretch,
                                        children: [
                                          Expanded(
                                            child: Stack(
                                              fit: StackFit.expand,
                                              children: [
                                                GeneratedTryOnImage(
                                                  src: looks[i].resultReadUrl,
                                                  fit: BoxFit.cover,
                                                ),
                                                if (i == selected)
                                                  Positioned(
                                                    top: 6,
                                                    right: 6,
                                                    child: Container(
                                                      padding:
                                                          const EdgeInsets.all(
                                                            3,
                                                          ),
                                                      decoration:
                                                          const BoxDecoration(
                                                            color:
                                                                SelfxKioskTokens
                                                                    .primary,
                                                            shape:
                                                                BoxShape.circle,
                                                          ),
                                                      child: const Icon(
                                                        Icons.check,
                                                        color: Colors.white,
                                                        size: 15,
                                                      ),
                                                    ),
                                                  ),
                                              ],
                                            ),
                                          ),
                                          Padding(
                                            padding: const EdgeInsets.all(6),
                                            child: Text(
                                              lookLabel(looks[i], i),
                                              maxLines: 1,
                                              overflow: TextOverflow.ellipsis,
                                              textAlign: TextAlign.center,
                                              style: const TextStyle(
                                                fontSize: 12,
                                                fontWeight: FontWeight.w800,
                                              ),
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          );
                        },
                      ),
                    ],
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
            _DownloadCountdown(remaining: downloadRemaining),
            const SizedBox(height: 12),
            LayoutBuilder(
              builder: (context, constraints) {
                final buy = SelfxKioskButton(
                  key: const Key('buy-this-look'),
                  label: 'Buy This Look',
                  icon: Icons.shopping_bag_outlined,
                  onPressed: onBuy,
                  minHeight: 54,
                  borderRadius: 12,
                  mainAxisAlignment: MainAxisAlignment.center,
                );
                final download = SelfxKioskButton(
                  key: const Key('download-my-looks'),
                  label: creatingShare
                      ? 'Preparing...'
                      : downloadAvailable
                      ? 'Download My Looks'
                      : 'Download Unavailable',
                  icon: Icons.file_download_outlined,
                  onPressed:
                      downloadAvailable && looks.isNotEmpty && !creatingShare
                      ? onDownload
                      : null,
                  backgroundColor: SelfxKioskTokens.primary,
                  foregroundColor: Colors.white,
                  minHeight: 54,
                  borderRadius: 12,
                  mainAxisAlignment: MainAxisAlignment.center,
                );
                if (constraints.maxWidth < 380) {
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [download, const SizedBox(height: 8), buy],
                  );
                }
                return Row(
                  children: [
                    Expanded(child: buy),
                    const SizedBox(width: 10),
                    Expanded(child: download),
                  ],
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _LooksCarousel extends StatelessWidget {
  const _LooksCarousel({
    required this.looks,
    required this.index,
    required this.pageController,
    required this.refreshFailed,
    required this.refreshing,
    required this.creatingShare,
    required this.downloadRemaining,
    required this.downloadAvailable,
    required this.onPageChanged,
    required this.onPrevious,
    required this.onNext,
    required this.onRetry,
    required this.onDownload,
    required this.onFinish,
  });

  final List<KioskTryOnLook> looks;
  final int index;
  final PageController pageController;
  final bool refreshFailed;
  final bool refreshing;
  final bool creatingShare;
  final Duration downloadRemaining;
  final bool downloadAvailable;
  final ValueChanged<int> onPageChanged;
  final VoidCallback? onPrevious;
  final VoidCallback? onNext;
  final VoidCallback onRetry;
  final VoidCallback onDownload;
  final VoidCallback onFinish;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        // Give short windows a scrollable canvas rather than shrinking the photo
        // or clipping the download and session actions.
        final minimumHeight = constraints.maxWidth < 400 ? 800.0 : 860.0;
        final height = constraints.maxHeight < minimumHeight
            ? minimumHeight
            : constraints.maxHeight;
        final content = SizedBox(
          height: height,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _LooksHeader(
                current: index + 1,
                total: looks.length,
                refreshing: refreshing,
                refreshFailed: refreshFailed,
                onRetry: onRetry,
              ),
              const SizedBox(height: 12),
              Expanded(
                child: Stack(
                  alignment: Alignment.center,
                  children: [
                    Positioned.fill(
                      child: Container(
                        key: const Key('my-looks-image-card'),
                        margin: const EdgeInsets.symmetric(horizontal: 10),
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(32),
                          boxShadow: SelfxKioskTokens.cardShadow,
                        ),
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(22),
                          child: PageView.builder(
                            controller: pageController,
                            itemCount: looks.length,
                            onPageChanged: onPageChanged,
                            itemBuilder: (context, itemIndex) =>
                                GeneratedTryOnImage(
                                  src: looks[itemIndex].resultReadUrl,
                                ),
                          ),
                        ),
                      ),
                    ),
                    Align(
                      alignment: Alignment.centerLeft,
                      child: _CarouselNavButton(
                        icon: Icons.chevron_left,
                        onPressed: onPrevious,
                        tooltip: 'Previous look',
                      ),
                    ),
                    Align(
                      alignment: Alignment.centerRight,
                      child: _CarouselNavButton(
                        icon: Icons.chevron_right,
                        onPressed: onNext,
                        tooltip: 'Next look',
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              _Dots(count: looks.length, index: index),
              const SizedBox(height: 18),
              _MyLooksActions(
                creatingShare: creatingShare,
                downloadRemaining: downloadRemaining,
                downloadAvailable: downloadAvailable,
                onDownload: creatingShare ? null : onDownload,
                onBack: () => Navigator.of(context).pop(),
                onFinish: onFinish,
              ),
            ],
          ),
        );
        return constraints.maxHeight < minimumHeight
            ? SingleChildScrollView(child: content)
            : content;
      },
    );
  }
}

class _LooksHeader extends StatelessWidget {
  const _LooksHeader({
    required this.current,
    required this.total,
    required this.refreshing,
    required this.refreshFailed,
    required this.onRetry,
  });

  final int current;
  final int total;
  final bool refreshing;
  final bool refreshFailed;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final narrow = constraints.maxWidth < 400;
        return Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox(
              height: narrow ? 68 : 100,
              child: Stack(
                alignment: Alignment.topCenter,
                children: [
                  Padding(
                    padding: EdgeInsets.only(top: narrow ? 10 : 0),
                    child: SelfxLogo(
                      height: narrow ? 52 : 86,
                      maxWidth: constraints.maxWidth * (narrow ? 0.40 : 0.48),
                    ),
                  ),
                  Align(
                    alignment: Alignment.topLeft,
                    child: TextButton.icon(
                      key: const Key('my-looks-back'),
                      onPressed: () => Navigator.of(context).pop(),
                      icon: const Icon(Icons.arrow_back),
                      label: const Text('Back'),
                      style: TextButton.styleFrom(
                        foregroundColor: SelfxKioskTokens.homeNavy,
                        backgroundColor: Colors.white.withValues(alpha: 0.85),
                        minimumSize: const Size(48, 48),
                        padding: const EdgeInsets.symmetric(horizontal: 10),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            Text(
              'My Looks',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.displaySmall?.copyWith(
                fontSize: narrow ? 32 : 48,
                color: SelfxKioskTokens.homeNavy,
                fontWeight: FontWeight.w900,
              ),
            ),
            const SizedBox(height: 8),
            Container(
              width: 64,
              height: 6,
              decoration: BoxDecoration(
                color: SelfxKioskTokens.primary,
                borderRadius: BorderRadius.circular(999),
              ),
            ),
            if (total > 0) ...[
              const SizedBox(height: 8),
              Text(
                '$current of $total',
                key: const Key('my-looks-counter'),
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  color: SelfxKioskTokens.homeNavy,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ],
            if (refreshing) ...[
              const SizedBox(height: 6),
              const Text('Getting your looks...'),
            ] else if (refreshFailed) ...[
              TextButton.icon(
                onPressed: onRetry,
                icon: const Icon(Icons.refresh),
                label: const Text('Retry'),
              ),
            ],
          ],
        );
      },
    );
  }
}

class _Dots extends StatelessWidget {
  const _Dots({required this.count, required this.index});

  final int count;
  final int index;

  @override
  Widget build(BuildContext context) {
    // Keep large galleries within narrow windows while retaining the active dot.
    final first = (index - 3).clamp(0, (count - 7).clamp(0, count));
    final end = (first + 7).clamp(0, count);
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        for (var i = first; i < end; i++)
          AnimatedContainer(
            duration: const Duration(milliseconds: 180),
            width: i == index ? 24 : 10,
            height: 10,
            margin: const EdgeInsets.symmetric(horizontal: 4),
            decoration: BoxDecoration(
              color: i == index
                  ? Theme.of(context).colorScheme.primary
                  : Theme.of(
                      context,
                    ).colorScheme.outline.withValues(alpha: 0.5),
              borderRadius: BorderRadius.circular(999),
            ),
          ),
      ],
    );
  }
}

class _CarouselNavButton extends StatelessWidget {
  const _CarouselNavButton({
    required this.icon,
    required this.onPressed,
    required this.tooltip,
  });

  final IconData icon;
  final VoidCallback? onPressed;
  final String tooltip;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: SizedBox.square(
        dimension: 54,
        child: IconButton(
          onPressed: onPressed,
          icon: Icon(icon, size: 32),
          color: SelfxKioskTokens.primary,
          disabledColor: Theme.of(context).colorScheme.outline,
          style: IconButton.styleFrom(
            backgroundColor: Colors.white.withValues(alpha: 0.94),
            side: BorderSide(
              color: SelfxKioskTokens.primary.withValues(alpha: 0.12),
            ),
            shape: const StadiumBorder(),
          ),
        ),
      ),
    );
  }
}

class _DownloadCountdown extends StatelessWidget {
  const _DownloadCountdown({required this.remaining});

  final Duration remaining;

  @override
  Widget build(BuildContext context) {
    final expired = remaining <= Duration.zero;
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(999),
        color: Theme.of(context).colorScheme.primary.withValues(alpha: 0.08),
        border: Border.all(
          color: Theme.of(context).colorScheme.primary.withValues(alpha: 0.18),
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              expired ? Icons.lock_clock_outlined : Icons.timer_outlined,
              size: 18,
              color: Theme.of(context).colorScheme.primary,
            ),
            const SizedBox(width: 8),
            Flexible(
              child: Text.rich(
                TextSpan(
                  text: expired ? 'Download expired' : 'Download available ',
                  children: expired
                      ? null
                      : [
                          TextSpan(
                            text: _mmss(remaining),
                            style: const TextStyle(
                              color: SelfxKioskTokens.primary,
                            ),
                          ),
                        ],
                ),
                key: const Key('download-my-looks-countdown'),
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: SelfxKioskTokens.textSecondary,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _MyLooksActions extends StatelessWidget {
  const _MyLooksActions({
    required this.creatingShare,
    required this.downloadRemaining,
    required this.downloadAvailable,
    required this.onDownload,
    required this.onBack,
    required this.onFinish,
  });

  final bool creatingShare;
  final Duration downloadRemaining;
  final bool downloadAvailable;
  final VoidCallback? onDownload;
  final VoidCallback onBack;
  final VoidCallback onFinish;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final back = SelfxKioskActionCard(
          key: const Key('back-to-result'),
          label: 'Back to Result',
          icon: Icons.arrow_back,
          iconColor: const Color(0xFF2384D6),
          subtitle: 'View look',
          minHeight: 82,
          backgroundColor: Colors.white,
          titleColor: SelfxKioskTokens.homeNavy,
          borderColor: SelfxKioskTokens.border,
          maxLabelLines: 2,
          maxSubtitleLines: 2,
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
          onPressed: onBack,
        );
        final finish = SelfxKioskActionCard(
          key: const Key('finish-from-my-looks'),
          label: 'Finish',
          icon: Icons.home_outlined,
          iconColor: const Color(0xFF2FAE75),
          subtitle: 'Go home',
          minHeight: 82,
          backgroundColor: Colors.white,
          titleColor: SelfxKioskTokens.homeNavy,
          borderColor: SelfxKioskTokens.border,
          maxLabelLines: 2,
          maxSubtitleLines: 2,
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
          onPressed: onFinish,
        );
        return Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _DownloadCountdown(remaining: downloadRemaining),
            const SizedBox(height: 10),
            SelfxKioskButton(
              key: const Key('download-my-looks'),
              label: creatingShare
                  ? 'Preparing...'
                  : downloadAvailable
                  ? 'Download My Looks'
                  : 'Download Expired',
              icon: Icons.file_download_outlined,
              variant: SelfxKioskButtonVariant.primary,
              minHeight: 72,
              wrapLabel: true,
              textAlign: TextAlign.center,
              mainAxisAlignment: MainAxisAlignment.center,
              onPressed: downloadAvailable ? onDownload : null,
            ),
            const SizedBox(height: 12),

            if (constraints.maxWidth < 440) ...[
              back,
              const SizedBox(height: 12),
              finish,
            ] else
              Row(
                children: [
                  Expanded(child: back),
                  const SizedBox(width: 12),
                  Expanded(child: finish),
                ],
              ),
          ],
        );
      },
    );
  }
}

class _ShareFailureDialog extends StatelessWidget {
  const _ShareFailureDialog({required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Dialog(
      child: Padding(
        padding: const EdgeInsets.all(26),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Icon(
              Icons.wifi_off_outlined,
              size: 46,
              color: Theme.of(context).colorScheme.primary,
            ),
            const SizedBox(height: 16),
            Text(
              "Couldn't prepare your looks.",
              textAlign: TextAlign.center,
              style: Theme.of(
                context,
              ).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: 8),
            Text(
              'Please try again.',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyLarge,
            ),
            const SizedBox(height: 22),
            SelfxKioskButton(
              key: const Key('retry-download-my-looks'),
              label: 'Retry',
              icon: Icons.refresh,
              variant: SelfxKioskButtonVariant.primary,
              textAlign: TextAlign.center,
              mainAxisAlignment: MainAxisAlignment.center,
              onPressed: onRetry,
            ),
            const SizedBox(height: 12),
            SelfxKioskButton(
              key: const Key('back-download-my-looks-error'),
              label: 'Back',
              icon: Icons.arrow_back,
              variant: SelfxKioskButtonVariant.secondary,
              textAlign: TextAlign.center,
              mainAxisAlignment: MainAxisAlignment.center,
              onPressed: () => Navigator.of(context).pop(),
            ),
          ],
        ),
      ),
    );
  }
}

class _EmptyLooks extends StatelessWidget {
  const _EmptyLooks({
    required this.failed,
    required this.onRetry,
    required this.onTryGarment,
  });

  final bool failed;
  final VoidCallback onRetry;
  final VoidCallback onTryGarment;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 620),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Icon(
              failed ? Icons.wifi_off_outlined : Icons.auto_awesome_outlined,
              size: 58,
              color: Theme.of(context).colorScheme.primary,
            ),
            const SizedBox(height: 18),
            Text(
              failed ? 'Looks could not be refreshed' : 'No looks yet',
              textAlign: TextAlign.center,
              style: Theme.of(
                context,
              ).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: 10),
            Text(
              failed
                  ? 'Try again or create another look.'
                  : 'Try on a garment to create your first look.',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyLarge,
            ),
            const SizedBox(height: 24),
            if (failed) ...[
              SelfxKioskButton(
                key: const Key('retry-my-looks'),
                label: 'Retry',
                icon: Icons.refresh,
                variant: SelfxKioskButtonVariant.primary,
                textAlign: TextAlign.center,
                mainAxisAlignment: MainAxisAlignment.center,
                onPressed: onRetry,
              ),
              const SizedBox(height: 12),
            ],
            SelfxKioskButton(
              key: const Key('empty-try-garment'),
              label: 'Try a Garment',
              icon: Icons.checkroom_outlined,
              variant: SelfxKioskButtonVariant.primary,
              textAlign: TextAlign.center,
              mainAxisAlignment: MainAxisAlignment.center,
              onPressed: onTryGarment,
            ),
          ],
        ),
      ),
    );
  }
}

String _mmss(Duration duration) {
  final seconds = duration.inSeconds.clamp(0, _downloadWindow.inSeconds);
  final minutes = (seconds ~/ 60).toString().padLeft(2, '0');
  final rest = (seconds % 60).toString().padLeft(2, '0');
  return '$minutes:$rest';
}

class _LooksBackdrop extends CustomPainter {
  const _LooksBackdrop();

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = const Color(0xFFFF7119).withValues(alpha: 0.10);
    canvas.drawCircle(Offset(size.width * 1.03, 0), size.width * 0.25, paint);
    canvas.drawCircle(
      Offset(-size.width * 0.15, size.height * 0.55),
      size.width * 0.35,
      paint,
    );
    canvas.drawCircle(
      Offset(size.width * 0.95, size.height * 1.12),
      size.width * 0.45,
      paint,
    );
  }

  @override
  bool shouldRepaint(_LooksBackdrop oldDelegate) => false;
}
