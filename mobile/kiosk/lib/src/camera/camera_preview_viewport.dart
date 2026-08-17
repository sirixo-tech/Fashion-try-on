import 'dart:math' as math;

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
    final width = state.capabilities.displayPreviewWidth;
    final height = state.capabilities.displayPreviewHeight;
    final aspectRatio = width == null || height == null || height == 0
        ? fallbackAspectRatio
        : width / height;
    final childWidth = width ?? 1280;
    final childHeight = height ?? math.max(1, childWidth / aspectRatio);

    return ClipRect(
      child: FittedBox(
        fit: fit,
        clipBehavior: Clip.hardEdge,
        child: SizedBox(
          width: childWidth.toDouble(),
          height: childHeight.toDouble(),
          child: preview,
        ),
      ),
    );
  }
}
