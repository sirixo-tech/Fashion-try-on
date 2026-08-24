import 'dart:async';

import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../catalog/kiosk_catalog_gateway.dart';
import '../session/capture_session_controller.dart';
import '../tryon/garment_extraction_service.dart';
import '../tryon/kiosk_try_on_models.dart';
import '../tryon/kiosk_try_on_session_controller.dart';
import '../upload/kiosk_customer_upload_controller.dart';
import 'capture_review_screen.dart';
import 'generated_try_on_image.dart';
import 'kiosk_chrome.dart';
import 'selfx_kiosk_button.dart';

class MyLooksScreen extends StatefulWidget {
  const MyLooksScreen({
    super.key,
    required this.captureController,
    required this.tryOnController,
    required this.uploadController,
    this.catalogGateway = const UnavailableKioskCatalogGateway(),
    this.extractionService = const UnavailableGarmentExtractionService(),
  });

  final CaptureSessionController captureController;
  final KioskTryOnSessionController tryOnController;
  final KioskCustomerUploadController uploadController;
  final KioskCatalogGateway catalogGateway;
  final GarmentExtractionService extractionService;

  @override
  State<MyLooksScreen> createState() => _MyLooksScreenState();
}

class _MyLooksScreenState extends State<MyLooksScreen> {
  late final PageController _pageController;
  int _index = 0;
  bool _refreshing = false;
  bool _refreshFailed = false;

  @override
  void initState() {
    super.initState();
    _pageController = PageController();
    unawaited(_refreshLooks());
  }

  @override
  void dispose() {
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
    return KioskScaffold(
      title: 'My Looks',
      subtitle: 'Session gallery',
      showBrandHeader: false,
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 14),
      leading: IconButton(
        onPressed: () => Navigator.of(context).pop(),
        icon: const Icon(Icons.arrow_back),
      ),
      child: AnimatedBuilder(
        animation: widget.tryOnController,
        builder: (context, _) {
          final looks = widget.tryOnController.looks;
          if (_refreshing && looks.isEmpty) {
            return const Center(child: Text('Getting your looks...'));
          }
          if (looks.isEmpty) {
            return _EmptyLooks(
              failed: _refreshFailed,
              onRetry: () => unawaited(_refreshLooks()),
              onTryGarment: () => _tryAnotherGarment(context),
            );
          }
          return _LooksCarousel(
            looks: looks,
            index: _index.clamp(0, looks.length - 1),
            pageController: _pageController,
            refreshFailed: _refreshFailed,
            refreshing: _refreshing,
            creatingShare: widget.tryOnController.creatingShare,
            onPageChanged: (value) => setState(() => _index = value),
            onPrevious: _index > 0 ? _previous : null,
            onNext: _index < looks.length - 1 ? _next : null,
            onRetry: () => unawaited(_refreshLooks()),
            onDownload: () => unawaited(_downloadLooks(context)),
            onFinish: () => _finish(context),
          );
        },
      ),
    );
  }

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
    await widget.tryOnController.finish(widget.captureController);
    if (context.mounted) {
      Navigator.of(context).popUntil((route) => route.isFirst);
    }
  }

  Future<void> _downloadLooks(BuildContext context) async {
    final share = await widget.tryOnController.createSessionShare();
    if (!context.mounted) {
      return;
    }
    if (share == null) {
      await showDialog<void>(
        context: context,
        builder: (_) => _ShareFailureDialog(
          onRetry: () {
            Navigator.of(context).pop();
            unawaited(_downloadLooks(context));
          },
        ),
      );
      return;
    }
    await showDialog<void>(
      context: context,
      builder: (_) => _LooksShareQrDialog(share: share),
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
        final portrait = constraints.maxHeight > constraints.maxWidth * 1.12;
        final compact =
            constraints.maxWidth < 900 ||
            constraints.maxHeight < 680 ||
            portrait;
        final imageArea = PageView.builder(
          controller: pageController,
          itemCount: looks.length,
          onPageChanged: onPageChanged,
          itemBuilder: (context, itemIndex) {
            final look = looks[itemIndex];
            return Padding(
              padding: EdgeInsets.symmetric(
                horizontal: compact ? 4 : 14,
                vertical: 4,
              ),
              child: Card(
                clipBehavior: Clip.antiAlias,
                child: GeneratedTryOnImage(src: look.resultReadUrl),
              ),
            );
          },
        );
        final sliderControls = _CarouselControls(
          onPrevious: onPrevious,
          onNext: onNext,
        );
        final actions = _MyLooksActions(
          compact: compact,
          creatingShare: creatingShare,
          onDownload: creatingShare ? null : onDownload,
          onBack: () => Navigator.of(context).pop(),
          onFinish: onFinish,
        );
        final header = _LooksHeader(
          current: index + 1,
          total: looks.length,
          refreshing: refreshing,
          refreshFailed: refreshFailed,
          onRetry: onRetry,
        );

        if (compact) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              header,
              const SizedBox(height: 10),
              Expanded(child: imageArea),
              const SizedBox(height: 8),
              sliderControls,
              const SizedBox(height: 8),
              _Dots(count: looks.length, index: index),
              const SizedBox(height: 12),
              actions,
            ],
          );
        }

        return Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(
              child: Column(
                children: [
                  header,
                  const SizedBox(height: 12),
                  Expanded(child: imageArea),
                  const SizedBox(height: 10),
                  sliderControls,
                  const SizedBox(height: 10),
                  _Dots(count: looks.length, index: index),
                ],
              ),
            ),
            const SizedBox(width: 24),
            SizedBox(width: 420, child: actions),
          ],
        );
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
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          'My Looks',
          textAlign: TextAlign.center,
          style: Theme.of(
            context,
          ).textTheme.displaySmall?.copyWith(fontWeight: FontWeight.w900),
        ),
        const SizedBox(height: 6),
        Text(
          '$current of $total',
          textAlign: TextAlign.center,
          style: Theme.of(
            context,
          ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900),
        ),
        if (refreshing) ...[
          const SizedBox(height: 6),
          const Text(
            'Getting your looks...',
            style: TextStyle(fontWeight: FontWeight.w800),
          ),
        ] else if (refreshFailed) ...[
          const SizedBox(height: 8),
          TextButton.icon(
            onPressed: onRetry,
            icon: const Icon(Icons.refresh),
            label: const Text('Retry'),
          ),
        ],
      ],
    );
  }
}

class _Dots extends StatelessWidget {
  const _Dots({required this.count, required this.index});

  final int count;
  final int index;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        for (var i = 0; i < count; i++)
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

class _CarouselControls extends StatelessWidget {
  const _CarouselControls({required this.onPrevious, required this.onNext});

  final VoidCallback? onPrevious;
  final VoidCallback? onNext;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        _CarouselNavButton(
          icon: Icons.chevron_left,
          onPressed: onPrevious,
          tooltip: 'Previous look',
        ),
        const SizedBox(width: 18),
        _CarouselNavButton(
          icon: Icons.chevron_right,
          onPressed: onNext,
          tooltip: 'Next look',
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
          color: Theme.of(context).colorScheme.onSurface,
          disabledColor: Theme.of(context).colorScheme.outline,
          style: IconButton.styleFrom(
            backgroundColor: Theme.of(context).colorScheme.surface,
            side: BorderSide(color: Theme.of(context).colorScheme.outline),
            shape: const StadiumBorder(),
          ),
        ),
      ),
    );
  }
}

class _MyLooksActions extends StatelessWidget {
  const _MyLooksActions({
    required this.compact,
    required this.creatingShare,
    required this.onDownload,
    required this.onBack,
    required this.onFinish,
  });

  final bool compact;
  final bool creatingShare;
  final VoidCallback? onDownload;
  final VoidCallback onBack;
  final VoidCallback onFinish;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: compact ? MainAxisSize.min : MainAxisSize.max,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (!compact) const Spacer(),
        SelfxKioskButton(
          key: const Key('download-my-looks'),
          label: creatingShare ? 'Preparing...' : 'Download My Looks',
          icon: Icons.file_download_outlined,
          variant: SelfxKioskButtonVariant.primary,
          minHeight: 64,
          textAlign: TextAlign.center,
          mainAxisAlignment: MainAxisAlignment.center,
          onPressed: onDownload,
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: SelfxKioskButton(
                key: const Key('back-to-result'),
                label: 'Back to Result',
                icon: Icons.arrow_back,
                variant: SelfxKioskButtonVariant.secondary,
                minHeight: 64,
                textAlign: TextAlign.center,
                mainAxisAlignment: MainAxisAlignment.center,
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 12,
                ),
                onPressed: onBack,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: SelfxKioskButton(
                key: const Key('finish-from-my-looks'),
                label: 'Finish',
                icon: Icons.home_outlined,
                variant: SelfxKioskButtonVariant.secondary,
                minHeight: 64,
                textAlign: TextAlign.center,
                mainAxisAlignment: MainAxisAlignment.center,
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 12,
                ),
                onPressed: onFinish,
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _LooksShareQrDialog extends StatelessWidget {
  const _LooksShareQrDialog({required this.share});

  final KioskTryOnShare share;

  @override
  Widget build(BuildContext context) {
    return Dialog(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 460),
        child: Builder(
          builder: (context) {
            final width = MediaQuery.of(context).size.width;
            final qrDimension = (width - 96).clamp(220.0, 360.0).toDouble();
            return Padding(
              padding: const EdgeInsets.all(26),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Icon(
                    Icons.qr_code_2,
                    size: 46,
                    color: Theme.of(context).colorScheme.primary,
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'Get Your Looks',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Scan with your phone',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const SizedBox(height: 18),
                  Center(
                    child: Container(
                      key: const Key('download-my-looks-qr-frame'),
                      width: qrDimension,
                      height: qrDimension,
                      padding: const EdgeInsets.all(16),
                      color: Colors.white,
                      child: QrImageView(
                        key: const Key('download-my-looks-qr'),
                        data: share.shareUrl,
                        version: QrVersions.auto,
                        gapless: false,
                        backgroundColor: Colors.white,
                      ),
                    ),
                  ),
                  const SizedBox(height: 18),
                  Text(
                    'Your looks will be available for a limited time.',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.bodyLarge,
                  ),
                  const SizedBox(height: 22),
                  SelfxKioskButton(
                    key: const Key('done-download-my-looks'),
                    label: 'Done',
                    icon: Icons.check,
                    variant: SelfxKioskButtonVariant.primary,
                    textAlign: TextAlign.center,
                    mainAxisAlignment: MainAxisAlignment.center,
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                ],
              ),
            );
          },
        ),
      ),
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
