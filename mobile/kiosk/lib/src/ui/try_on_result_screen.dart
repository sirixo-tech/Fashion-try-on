import 'package:flutter/material.dart';

import '../acquisition/photo_acquisition.dart';
import '../catalog/kiosk_catalog_gateway.dart';
import '../session/capture_session_controller.dart';
import '../tryon/garment_extraction_service.dart';
import '../tryon/kiosk_try_on_session_controller.dart';
import '../upload/kiosk_customer_upload_controller.dart';
import 'camera_capture_screen.dart';
import 'capture_review_screen.dart';
import 'generated_try_on_image.dart';
import 'my_looks_screen.dart';

class TryOnResultScreen extends StatelessWidget {
  const TryOnResultScreen({
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
  Widget build(BuildContext context) {
    final result = tryOnController.result;
    return Scaffold(
      backgroundColor: _ResultTokens.background,
      body: SafeArea(
        child: result == null
            ? const Center(child: Text('Try-On result unavailable.'))
            : _ResultPage(
                imageSrc: result.generatedImage,
                onTryAnotherGarment: () => _tryAnotherGarment(context),
                onRetakePhoto: () => _retakePhoto(context),
                onGetMyLooks: () => _getMyLooks(context),
                onFinish: () => _finish(context),
              ),
      ),
    );
  }

  void _tryAnotherGarment(BuildContext context) {
    tryOnController.tryAnotherGarment();
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute<void>(
        builder: (_) => CaptureReviewScreen(
          controller: captureController,
          tryOnController: tryOnController,
          uploadController: uploadController,
          catalogGateway: catalogGateway,
          extractionService: extractionService,
        ),
      ),
      (route) => route.isFirst,
    );
  }

  Future<void> _retakePhoto(BuildContext context) async {
    await tryOnController.retakePhoto(captureController);
    if (!context.mounted) {
      return;
    }
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute<void>(
        builder: (_) => CameraCaptureScreen(
          controller: captureController,
          tryOnController: tryOnController,
          uploadController: uploadController,
          catalogGateway: catalogGateway,
          extractionService: extractionService,
          purpose: PhotoAcquisitionPurpose.model,
        ),
      ),
      (route) => route.isFirst,
    );
  }

  Future<void> _getMyLooks(BuildContext context) async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => MyLooksScreen(
          captureController: captureController,
          tryOnController: tryOnController,
          uploadController: uploadController,
          catalogGateway: catalogGateway,
          extractionService: extractionService,
        ),
      ),
    );
  }

  Future<void> _finish(BuildContext context) async {
    await tryOnController.finish(captureController);
    if (context.mounted) {
      Navigator.of(context).popUntil((route) => route.isFirst);
    }
  }
}

class _ResultPage extends StatelessWidget {
  const _ResultPage({
    required this.imageSrc,
    required this.onTryAnotherGarment,
    required this.onRetakePhoto,
    required this.onGetMyLooks,
    required this.onFinish,
  });

  final String imageSrc;
  final VoidCallback onTryAnotherGarment;
  final VoidCallback onRetakePhoto;
  final VoidCallback onGetMyLooks;
  final VoidCallback onFinish;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final viewportHeight = constraints.maxHeight.isFinite
            ? constraints.maxHeight
            : 1200.0;
        final viewportWidth = constraints.maxWidth.isFinite
            ? constraints.maxWidth
            : 760.0;
        final compact = viewportWidth < 560;
        final stackActions = viewportWidth < 440;
        final horizontalPadding = compact ? 18.0 : 36.0;
        final maxContentWidth = compact ? 520.0 : 760.0;
        final imageHeight = (viewportHeight * (compact ? 0.48 : 0.52)).clamp(
          compact ? 330.0 : 450.0,
          compact ? 560.0 : 720.0,
        );

        return DecoratedBox(
          decoration: BoxDecoration(
            color: _ResultTokens.background,
            border: Border.all(color: _ResultTokens.outerBorder, width: 2),
            borderRadius: BorderRadius.circular(34),
          ),
          child: SingleChildScrollView(
            child: ConstrainedBox(
              constraints: BoxConstraints(minHeight: viewportHeight),
              child: Padding(
                padding: EdgeInsets.fromLTRB(
                  horizontalPadding,
                  compact ? 30 : 46,
                  horizontalPadding,
                  compact ? 24 : 36,
                ),
                child: Center(
                  child: ConstrainedBox(
                    constraints: BoxConstraints(maxWidth: maxContentWidth),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const _ResultHeader(),
                        SizedBox(height: compact ? 22 : 30),
                        SizedBox(
                          height: imageHeight,
                          child: _ResultImageCard(imageSrc: imageSrc),
                        ),
                        SizedBox(height: compact ? 22 : 30),
                        _ActionGrid(
                          stackActions: stackActions,
                          compact: compact,
                          topLeft: _ResultTileAction(
                            key: const Key('try-another-garment'),
                            icon: Icons.texture_outlined,
                            iconColor: _ResultTokens.orangeDeep,
                            title: 'Try Another',
                            subtitle: 'Choose fabric',
                            background: _ResultTokens.primarySurface,
                            onPressed: onTryAnotherGarment,
                          ),
                          topRight: _ResultTileAction(
                            key: const Key('get-my-looks'),
                            icon: Icons.collections_outlined,
                            iconColor: _ResultTokens.gold,
                            title: 'Get My Looks',
                            subtitle: 'Explore styles',
                            background: _ResultTokens.looksSurface,
                            onPressed: onGetMyLooks,
                          ),
                          bottomLeft: _ResultTileAction(
                            key: const Key('result-retake-photo'),
                            icon: Icons.camera_alt_outlined,
                            iconColor: _ResultTokens.orangeDeep,
                            title: 'Retake Photo',
                            subtitle: 'Capture again',
                            background: _ResultTokens.retakeSurface,
                            onPressed: onRetakePhoto,
                          ),
                          bottomRight: _ResultTileAction(
                            key: const Key('finish-try-on'),
                            icon: Icons.home_outlined,
                            iconColor: _ResultTokens.ink,
                            title: 'Finish',
                            subtitle: 'Go to home',
                            background: _ResultTokens.finishSurface,
                            onPressed: onFinish,
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
    );
  }
}

class _ResultHeader extends StatelessWidget {
  const _ResultHeader();

  @override
  Widget build(BuildContext context) {
    return Stack(
      alignment: Alignment.topCenter,
      clipBehavior: Clip.none,
      children: [
        Column(
          children: [
            const SizedBox(height: 10),
            Text(
              'Your Look',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.displaySmall?.copyWith(
                color: _ResultTokens.ink,
                fontSize: 48,
                fontWeight: FontWeight.w900,
                height: 1,
              ),
            ),
          ],
        ),
        const Positioned(
          top: -6,
          right: 92,
          child: Icon(
            Icons.auto_awesome,
            color: _ResultTokens.orangeDeep,
            size: 22,
          ),
        ),
        const Positioned(
          top: 14,
          right: 48,
          child: Icon(
            Icons.auto_awesome,
            color: _ResultTokens.orangeDeep,
            size: 32,
          ),
        ),
        const Positioned(
          top: 24,
          right: 16,
          child: Icon(Icons.star, color: _ResultTokens.orangeDeep, size: 12),
        ),
      ],
    );
  }
}

class _ResultImageCard extends StatelessWidget {
  const _ResultImageCard({required this.imageSrc});

  final String imageSrc;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(28),
        boxShadow: const [
          BoxShadow(
            color: Color(0x240F172A),
            blurRadius: 34,
            offset: Offset(0, 14),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.all(6),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(22),
          child: ColoredBox(
            color: Colors.white,
            child: GeneratedTryOnImage(src: imageSrc),
          ),
        ),
      ),
    );
  }
}

class _ActionGrid extends StatelessWidget {
  const _ActionGrid({
    required this.stackActions,
    required this.compact,
    required this.topLeft,
    required this.topRight,
    required this.bottomLeft,
    required this.bottomRight,
  });

  final bool stackActions;
  final bool compact;
  final Widget topLeft;
  final Widget topRight;
  final Widget bottomLeft;
  final Widget bottomRight;

  @override
  Widget build(BuildContext context) {
    if (stackActions) {
      return Column(
        children: [
          topLeft,
          const SizedBox(height: 12),
          topRight,
          const SizedBox(height: 12),
          bottomLeft,
          const SizedBox(height: 12),
          bottomRight,
        ],
      );
    }

    final gap = compact ? 12.0 : 18.0;
    return Column(
      children: [
        Row(
          children: [
            Expanded(child: topLeft),
            SizedBox(width: gap),
            Expanded(child: topRight),
          ],
        ),
        SizedBox(height: gap),
        Row(
          children: [
            Expanded(child: bottomLeft),
            SizedBox(width: gap),
            Expanded(child: bottomRight),
          ],
        ),
      ],
    );
  }
}

class _ResultTileAction extends StatelessWidget {
  const _ResultTileAction({
    super.key,
    required this.icon,
    required this.iconColor,
    required this.title,
    required this.subtitle,
    required this.background,
    required this.onPressed,
  });

  final IconData icon;
  final Color iconColor;
  final String title;
  final String subtitle;
  final Color background;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return _ResultPressable(
      onPressed: onPressed,
      borderRadius: 26,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: background,
          border: Border.all(color: _ResultTokens.tileBorder),
          borderRadius: BorderRadius.circular(26),
          boxShadow: const [
            BoxShadow(
              color: Color(0x0D0F172A),
              blurRadius: 14,
              offset: Offset(0, 6),
            ),
          ],
        ),
        child: SizedBox(
          height: 104,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 18),
            child: Row(
              children: [
                _IconBubble(icon: icon, color: iconColor),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: _ResultTokens.ink,
                          fontFamily: 'Manrope',
                          fontSize: 21,
                          fontWeight: FontWeight.w900,
                          height: 1.05,
                        ),
                      ),
                      const SizedBox(height: 7),
                      Text(
                        subtitle,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: _ResultTokens.muted,
                          fontFamily: 'Inter',
                          fontSize: 16,
                          fontWeight: FontWeight.w500,
                          height: 1.05,
                        ),
                      ),
                    ],
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

class _IconBubble extends StatelessWidget {
  const _IconBubble({required this.icon, required this.color});

  final IconData icon;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 54,
      height: 54,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(color: Colors.white, width: 3),
        color: color.withValues(alpha: 0.08),
      ),
      child: Icon(icon, color: color, size: 28),
    );
  }
}

class _ResultPressable extends StatelessWidget {
  const _ResultPressable({
    required this.onPressed,
    required this.borderRadius,
    required this.child,
  });

  final VoidCallback onPressed;
  final double borderRadius;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(borderRadius),
      clipBehavior: Clip.antiAlias,
      child: InkWell(onTap: onPressed, child: child),
    );
  }
}

class _ResultTokens {
  const _ResultTokens._();

  static const background = Color(0xFFFFFCF8);
  static const outerBorder = Color(0xFFEEDFD4);
  static const ink = Color(0xFF141A21);
  static const muted = Color(0xFF5D6169);
  static const orangeDeep = Color(0xFFE86610);
  static const gold = Color(0xFFC88913);
  static const primarySurface = Color(0xFFFFE7DA);
  static const retakeSurface = Color(0xFFFFEEE6);
  static const looksSurface = Color(0xFFFFF1D9);
  static const finishSurface = Color(0xFFFFF7F0);
  static const tileBorder = Color(0xFFF4DED0);
}
