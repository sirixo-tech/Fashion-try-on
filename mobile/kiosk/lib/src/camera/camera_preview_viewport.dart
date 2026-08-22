import 'package:flutter/material.dart';

import 'camera_models.dart';

class CameraPreviewViewport extends StatelessWidget {
  const CameraPreviewViewport({
    super.key,
    required this.state,
    required this.preview,
    this.fit = BoxFit.cover,
    this.fallbackAspectRatio = 16 / 9,
  });

  final CameraState state;
  final Widget preview;
  final BoxFit fit;
  final double fallbackAspectRatio;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final width = state.capabilities.displayPreviewWidth;
        final height = state.capabilities.displayPreviewHeight;
        final rawAspectRatio = width == null || height == null || height == 0
            ? fallbackAspectRatio
            : width / height;
        final aspectRatio = _viewportAwareAspectRatio(
          rawAspectRatio,
          constraints,
        );
        final size = _previewSizeFor(
          constraints: constraints,
          aspectRatio: aspectRatio,
          fit: fit,
        );

        return ClipRect(
          child: Center(
            child: SizedBox(
              width: size.width,
              height: size.height,
              child: preview,
            ),
          ),
        );
      },
    );
  }
}

double _viewportAwareAspectRatio(
  double rawAspectRatio,
  BoxConstraints constraints,
) {
  final safeRaw = rawAspectRatio <= 0 ? 16 / 9 : rawAspectRatio;
  if (!constraints.hasBoundedWidth || !constraints.hasBoundedHeight) {
    return safeRaw;
  }
  final viewportIsPortrait = constraints.maxHeight > constraints.maxWidth;
  if (viewportIsPortrait && safeRaw > 1) {
    return 1 / safeRaw;
  }
  if (!viewportIsPortrait && safeRaw < 1) {
    return 1 / safeRaw;
  }
  return safeRaw;
}

Size _previewSizeFor({
  required BoxConstraints constraints,
  required double aspectRatio,
  required BoxFit fit,
}) {
  final maxWidth = constraints.hasBoundedWidth ? constraints.maxWidth : 1280.0;
  final maxHeight = constraints.hasBoundedHeight
      ? constraints.maxHeight
      : 720.0;
  final viewportAspect = maxWidth / maxHeight;
  final cover = fit == BoxFit.cover;
  final useWidth = cover
      ? viewportAspect > aspectRatio
      : viewportAspect < aspectRatio;
  if (useWidth) {
    return Size(maxWidth, maxWidth / aspectRatio);
  }
  return Size(maxHeight * aspectRatio, maxHeight);
}
