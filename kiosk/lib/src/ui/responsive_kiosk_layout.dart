import 'dart:math' as math;

import 'package:flutter/widgets.dart';

enum KioskDisplayClass { small, medium, large, extraLarge }

class KioskLayoutMetrics {
  const KioskLayoutMetrics({
    required this.size,
    required this.displayClass,
    required this.portrait,
  });

  final Size size;
  final KioskDisplayClass displayClass;
  final bool portrait;

  factory KioskLayoutMetrics.fromConstraints(BoxConstraints constraints) {
    final width = constraints.maxWidth.isFinite ? constraints.maxWidth : 720.0;
    final height = constraints.maxHeight.isFinite
        ? constraints.maxHeight
        : 1280.0;
    return KioskLayoutMetrics.fromSize(Size(width, height));
  }

  factory KioskLayoutMetrics.fromSize(Size size) {
    final shortest = math.min(size.width, size.height);
    final longest = math.max(size.width, size.height);
    final displayClass = switch (shortest) {
      < 600 => KioskDisplayClass.small,
      < 900 =>
        longest >= 1500 ? KioskDisplayClass.large : KioskDisplayClass.medium,
      < 1200 => KioskDisplayClass.large,
      _ => KioskDisplayClass.extraLarge,
    };
    return KioskLayoutMetrics(
      size: size,
      displayClass: displayClass,
      portrait: size.height >= size.width,
    );
  }

  double get width => size.width;

  double get height => size.height;

  bool get isSmall => displayClass == KioskDisplayClass.small;

  bool get isMedium => displayClass == KioskDisplayClass.medium;

  bool get isLarge => displayClass == KioskDisplayClass.large;

  bool get isExtraLarge => displayClass == KioskDisplayClass.extraLarge;

  bool get stackPanels => portrait || width < 940;

  bool get tightHeight => height < 720;

  double get pagePadding {
    return switch (displayClass) {
      KioskDisplayClass.small => 16,
      KioskDisplayClass.medium => 24,
      KioskDisplayClass.large => 36,
      KioskDisplayClass.extraLarge => 48,
    };
  }

  double get panelGap {
    return switch (displayClass) {
      KioskDisplayClass.small => 12,
      KioskDisplayClass.medium => 18,
      KioskDisplayClass.large => 24,
      KioskDisplayClass.extraLarge => 32,
    };
  }

  double get sidePanelWidth {
    final base = switch (displayClass) {
      KioskDisplayClass.small => 340.0,
      KioskDisplayClass.medium => 420.0,
      KioskDisplayClass.large => 480.0,
      KioskDisplayClass.extraLarge => 560.0,
    };
    return base.clamp(320.0, width * 0.36);
  }

  double scaled(
    double medium, {
    double? small,
    double? large,
    double? extraLarge,
  }) {
    return switch (displayClass) {
      KioskDisplayClass.small => small ?? medium * 0.86,
      KioskDisplayClass.medium => medium,
      KioskDisplayClass.large => large ?? medium * 1.12,
      KioskDisplayClass.extraLarge => extraLarge ?? medium * 1.28,
    };
  }
}
