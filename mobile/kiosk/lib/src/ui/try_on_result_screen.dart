import 'dart:io';

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
import 'responsive_kiosk_layout.dart';
import 'selfx_kiosk_action_card.dart';
import 'try_on_generation_screen.dart';

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
                hasNextPick: tryOnController.hasNextGarmentPick,
                upcomingPick: tryOnController.upcomingGarmentPick,
                upcomingPickPosition:
                    tryOnController.upcomingGarmentPickPosition,
                totalPickCount: tryOnController.garmentPicks.length,
                saveMyLooksQrEnabled: tryOnController.saveMyLooksQrEnabled,
                onTryAnotherGarment: () => _tryAnotherGarment(context),
                onRetakePhoto: () => _retakePhoto(context),
                onGetMyLooks: () => _getMyLooks(context),
                onFinish: () => _finish(context),
              ),
      ),
    );
  }

  void _tryAnotherGarment(BuildContext context) {
    if (tryOnController.selectNextGarmentPick()) {
      Navigator.of(context).pushReplacement(
        MaterialPageRoute<void>(
          builder: (_) => TryOnGenerationScreen(
            captureController: captureController,
            tryOnController: tryOnController,
            uploadController: uploadController,
            catalogGateway: catalogGateway,
            extractionService: extractionService,
          ),
        ),
      );
      return;
    }
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
    required this.hasNextPick,
    required this.upcomingPick,
    required this.upcomingPickPosition,
    required this.totalPickCount,
    required this.saveMyLooksQrEnabled,
    required this.onTryAnotherGarment,
    required this.onRetakePhoto,
    required this.onGetMyLooks,
    required this.onFinish,
  });

  final String imageSrc;
  final bool hasNextPick;
  final KioskTryOnPick? upcomingPick;
  final int? upcomingPickPosition;
  final int totalPickCount;
  final bool saveMyLooksQrEnabled;
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
        final layout = KioskLayoutMetrics.fromConstraints(constraints);
        final compact = layout.isSmall || viewportWidth < 560;
        final stackActions = viewportWidth < 440;
        final horizontalPadding = layout.scaled(
          30,
          small: 18,
          large: 42,
          extraLarge: 56,
        );
        final verticalPadding = layout.scaled(
          30,
          small: 20,
          large: 38,
          extraLarge: 48,
        );
        final maxContentWidth = (layout.portrait ? viewportWidth : 1040.0)
            .clamp(
              compact ? 520.0 : 760.0,
              layout.isExtraLarge ? 1180.0 : 960.0,
            )
            .toDouble();
        final headerGap = layout.scaled(22, small: 16, large: 26);
        final actionGap = layout.scaled(20, small: 14, large: 24);
        final actionTileHeight = layout.scaled(
          96,
          small: 82,
          large: 112,
          extraLarge: 124,
        );
        final minimumImageHeight = layout.scaled(
          360,
          small: 280,
          large: 620,
          extraLarge: 820,
        );
        final actionRows = stackActions ? 4 : 2;
        final actionHeight =
            (actionRows * actionTileHeight) + ((actionRows - 1) * actionGap);
        final hasUpcomingPick = upcomingPick != null;
        final upcomingPreviewHeight = hasUpcomingPick
            ? layout.scaled(82, small: 74, large: 92, extraLarge: 104) +
                  actionGap
            : 0.0;
        final minimumContentHeight =
            verticalPadding * 2 +
            layout.scaled(64, small: 50, large: 72) +
            headerGap +
            minimumImageHeight +
            actionGap +
            upcomingPreviewHeight +
            actionHeight;
        final scroll = viewportHeight < minimumContentHeight;

        return DecoratedBox(
          decoration: BoxDecoration(
            color: _ResultTokens.background,
            border: Border.all(color: _ResultTokens.outerBorder, width: 2),
            borderRadius: BorderRadius.circular(34),
          ),
          child: SingleChildScrollView(
            physics: scroll ? null : const NeverScrollableScrollPhysics(),
            child: ConstrainedBox(
              constraints: BoxConstraints(minHeight: viewportHeight),
              child: Padding(
                padding: EdgeInsets.fromLTRB(
                  horizontalPadding,
                  verticalPadding,
                  horizontalPadding,
                  verticalPadding,
                ),
                child: Center(
                  child: ConstrainedBox(
                    constraints: BoxConstraints(maxWidth: maxContentWidth),
                    child: SizedBox(
                      height: scroll
                          ? null
                          : viewportHeight - verticalPadding * 2,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          _ResultHeader(layout: layout),
                          SizedBox(height: headerGap),
                          if (scroll)
                            SizedBox(
                              height: minimumImageHeight,
                              child: _ResultImageCard(imageSrc: imageSrc),
                            )
                          else
                            Expanded(
                              child: _ResultImageCard(imageSrc: imageSrc),
                            ),
                          SizedBox(height: actionGap),
                          if (hasUpcomingPick) ...[
                            _UpcomingPickPreview(
                              pick: upcomingPick!,
                              position: upcomingPickPosition,
                              totalCount: totalPickCount,
                              compact: compact,
                            ),
                            SizedBox(height: actionGap),
                          ],
                          _ActionGrid(
                            stackActions: stackActions,
                            compact: compact,
                            gap: actionGap,
                            topLeft: SelfxKioskActionCard(
                              key: const Key('try-another-garment'),
                              icon: Icons.shuffle_rounded,
                              iconColor: _ResultTokens.gold,
                              label: 'Try Another',
                              subtitle: hasNextPick
                                  ? 'Next pick'
                                  : 'Choose fabric',
                              disabledBackgroundColor:
                                  _ResultTokens.primarySurface,
                              minHeight: actionTileHeight,
                              onPressed: onTryAnotherGarment,
                            ),
                            topRight: SelfxKioskActionCard(
                              key: const Key('get-my-looks'),
                              icon: Icons.checkroom_outlined,
                              iconColor: _ResultTokens.orangeDeep,
                              label: 'Get My Looks',
                              subtitle: saveMyLooksQrEnabled
                                  ? 'Explore styles'
                                  : 'QR disabled',
                              disabledBackgroundColor:
                                  _ResultTokens.looksSurface,
                              minHeight: actionTileHeight,
                              onPressed: saveMyLooksQrEnabled
                                  ? onGetMyLooks
                                  : null,
                            ),
                            bottomLeft: SelfxKioskActionCard(
                              key: const Key('result-retake-photo'),
                              icon: Icons.camera_alt_outlined,
                              iconColor: _ResultTokens.blue,
                              label: 'Retake Photo',
                              subtitle: 'Capture again',
                              disabledBackgroundColor:
                                  _ResultTokens.retakeSurface,
                              minHeight: actionTileHeight,
                              onPressed: onRetakePhoto,
                            ),
                            bottomRight: SelfxKioskActionCard(
                              key: const Key('finish-try-on'),
                              icon: Icons.home_outlined,
                              iconColor: _ResultTokens.green,
                              label: 'Finish',
                              subtitle: 'Go to home',
                              disabledBackgroundColor:
                                  _ResultTokens.finishSurface,
                              minHeight: actionTileHeight,
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
          ),
        );
      },
    );
  }
}

class _ResultHeader extends StatelessWidget {
  const _ResultHeader({required this.layout});

  final KioskLayoutMetrics layout;

  @override
  Widget build(BuildContext context) {
    final titleSize = layout.scaled(42, small: 32, large: 50, extraLarge: 58);
    final iconScale = layout.scaled(1, small: 0.72, large: 1.14);
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
                fontSize: titleSize,
                fontWeight: FontWeight.w900,
                height: 1,
              ),
            ),
          ],
        ),
        Positioned(
          top: -6,
          right: 92,
          child: Icon(
            Icons.auto_awesome,
            color: _ResultTokens.orangeDeep,
            size: 22 * iconScale,
          ),
        ),
        Positioned(
          top: 14,
          right: 48,
          child: Icon(
            Icons.auto_awesome,
            color: _ResultTokens.orangeDeep,
            size: 32 * iconScale,
          ),
        ),
        Positioned(
          top: 24,
          right: 16,
          child: Icon(
            Icons.star,
            color: _ResultTokens.orangeDeep,
            size: 12 * iconScale,
          ),
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

class _UpcomingPickPreview extends StatelessWidget {
  const _UpcomingPickPreview({
    required this.pick,
    required this.position,
    required this.totalCount,
    required this.compact,
  });

  final KioskTryOnPick pick;
  final int? position;
  final int totalCount;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final indexLabel = position == null || totalCount <= 0
        ? null
        : '$position of $totalCount';
    return DecoratedBox(
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.94),
        border: Border.all(color: _ResultTokens.tileBorder),
        borderRadius: BorderRadius.circular(18),
        boxShadow: const [
          BoxShadow(
            color: Color(0x120F172A),
            blurRadius: 18,
            offset: Offset(0, 8),
          ),
        ],
      ),
      child: Padding(
        padding: EdgeInsets.all(compact ? 10 : 12),
        child: Row(
          children: [
            _UpcomingPickThumbnail(pick: pick, size: compact ? 54 : 62),
            SizedBox(width: compact ? 10 : 12),
            Expanded(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Icon(
                        Icons.next_plan_outlined,
                        size: 15,
                        color: _ResultTokens.orangeDeep,
                      ),
                      const SizedBox(width: 6),
                      Text(
                        'Up next',
                        style: TextStyle(
                          color: _ResultTokens.orangeDeep,
                          fontFamily: 'Inter',
                          fontSize: compact ? 12 : 13,
                          fontWeight: FontWeight.w900,
                          height: 1,
                        ),
                      ),
                      if (indexLabel != null) ...[
                        const SizedBox(width: 8),
                        Text(
                          indexLabel,
                          style: TextStyle(
                            color: _ResultTokens.muted,
                            fontFamily: 'Inter',
                            fontSize: compact ? 11 : 12,
                            fontWeight: FontWeight.w700,
                            height: 1,
                          ),
                        ),
                      ],
                    ],
                  ),
                  const SizedBox(height: 7),
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          pick.displayName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: _ResultTokens.ink,
                            fontFamily: 'Manrope',
                            fontSize: compact ? 16 : 18,
                            fontWeight: FontWeight.w900,
                            height: 1.05,
                          ),
                        ),
                      ),
                      if (pick.displayPrice != null) ...[
                        const SizedBox(width: 10),
                        Text(
                          pick.displayPrice!,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: _ResultTokens.orangeDeep,
                            fontFamily: 'Inter',
                            fontSize: compact ? 13 : 14,
                            fontWeight: FontWeight.w900,
                            height: 1.05,
                          ),
                        ),
                      ],
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _UpcomingPickThumbnail extends StatelessWidget {
  const _UpcomingPickThumbnail({required this.pick, required this.size});

  final KioskTryOnPick pick;
  final double size;

  @override
  Widget build(BuildContext context) {
    final localPath = pick.localImagePath;
    final imageUrl = pick.imageUrl;
    Widget child;
    if (localPath != null && localPath.isNotEmpty) {
      child = Image.file(
        File(localPath),
        fit: BoxFit.cover,
        errorBuilder: (_, _, _) => const _UpcomingPickThumbnailFallback(),
      );
    } else if (imageUrl != null && imageUrl.isNotEmpty) {
      child = Image.network(
        imageUrl,
        fit: BoxFit.cover,
        errorBuilder: (_, _, _) => const _UpcomingPickThumbnailFallback(),
      );
    } else {
      child = const _UpcomingPickThumbnailFallback();
    }

    return ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: SizedBox.square(
        dimension: size,
        child: ColoredBox(color: _ResultTokens.finishSurface, child: child),
      ),
    );
  }
}

class _UpcomingPickThumbnailFallback extends StatelessWidget {
  const _UpcomingPickThumbnailFallback();

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Icon(
        Icons.checkroom_outlined,
        color: _ResultTokens.orangeDeep,
        size: 28,
      ),
    );
  }
}

class _ActionGrid extends StatelessWidget {
  const _ActionGrid({
    required this.stackActions,
    required this.compact,
    required this.gap,
    required this.topLeft,
    required this.topRight,
    required this.bottomLeft,
    required this.bottomRight,
  });

  final bool stackActions;
  final bool compact;
  final double gap;
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
          SizedBox(height: gap),
          topRight,
          SizedBox(height: gap),
          bottomLeft,
          SizedBox(height: gap),
          bottomRight,
        ],
      );
    }

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

class _ResultTokens {
  const _ResultTokens._();

  static const background = Color(0xFFFFFCF8);
  static const outerBorder = Color(0xFFEEDFD4);
  static const ink = Color(0xFF141A21);
  static const muted = Color(0xFF5D6169);
  static const orangeDeep = Color(0xFFE86610);
  static const gold = Color(0xFFC88913);
  static const blue = Color(0xFF2384D6);
  static const green = Color(0xFF2FAE75);
  static const primarySurface = Color(0xFFFFE7DA);
  static const retakeSurface = Color(0xFFFFEEE6);
  static const looksSurface = Color(0xFFFFF1D9);
  static const finishSurface = Color(0xFFFFF7F0);
  static const tileBorder = Color(0xFFF4DED0);
}
