import 'dart:async';

import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';

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

const _downloadWindow = Duration(minutes: 5);

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
  late final DateTime _downloadExpiresAt;
  Timer? _downloadTimer;
  int _index = 0;
  bool _refreshing = false;
  bool _refreshFailed = false;
  bool _downloadClosed = false;

  @override
  void initState() {
    super.initState();
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
    setState(() => _downloadClosed = true);
    await widget.tryOnController.finish(widget.captureController);
    if (context.mounted) {
      Navigator.of(context).popUntil((route) => route.isFirst);
    }
  }

  Future<void> _downloadLooks(BuildContext context) async {
    if (!_downloadAvailable) {
      return;
    }
    final share = await widget.tryOnController.createSessionShare();
    if (!context.mounted || !_downloadAvailable) {
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
