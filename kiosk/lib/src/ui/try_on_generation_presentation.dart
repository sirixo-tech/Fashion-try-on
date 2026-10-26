import 'dart:io';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../theme/selfx_kiosk_theme.dart';
import '../tryon/kiosk_garment_input.dart';
import '../tryon/kiosk_try_on_models.dart';
import 'selfx_logo.dart';
import 'try_on_experience_config.dart';

@visibleForTesting
const generationInputPreviewImageFitForTesting = BoxFit.cover;

/// Presentation only. Percentages and steps illustrate existing workflow states,
/// not measured provider completion or additional image analysis.
class TryOnGenerationPresentation extends StatelessWidget {
  const TryOnGenerationPresentation({
    super.key,
    required this.status,
    required this.motion,
    required this.onBack,
    required this.experience,
    this.personImagePath,
    this.garmentImagePath,
    this.garmentName,
    this.garmentPrice,
    this.processingMessage,
  });
  final KioskTryOnStatus status;
  final Animation<double> motion;
  final VoidCallback onBack;
  final TryOnExperienceConfig experience;
  final String? personImagePath;
  final String? garmentImagePath;
  final String? garmentName;
  final String? garmentPrice;
  final String? processingMessage;

  double get _progress => switch (status) {
    KioskTryOnStatus.idle => 0.06,
    KioskTryOnStatus.preparing => 0.18,
    KioskTryOnStatus.uploading => 0.34,
    KioskTryOnStatus.queued => 0.52,
    KioskTryOnStatus.processing => 0.78,
    KioskTryOnStatus.succeeded => 1.0,
    _ => 0.06,
  };

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(10),
        child: Container(
          key: const Key('generation-page-card'),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(32),
            boxShadow: SelfxKioskTokens.softShadow,
          ),
          clipBehavior: Clip.antiAlias,
          child: LayoutBuilder(
            builder: (context, constraints) {
              // Preserve readable messages and steps on short windows.
              final height = math.max(1000.0, constraints.maxHeight);
              final padding = constraints.maxWidth < 560 ? 12.0 : 28.0;
              final page = SizedBox(
                height: height,
                child: Padding(
                  padding: EdgeInsets.symmetric(horizontal: padding),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Expanded(
                        flex: 1,
                        child: SizedBox(
                          key: const Key('generation-logo-section'),
                          child: Stack(
                            alignment: Alignment.center,
                            children: [
                              Padding(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 104,
                                ),
                                child: SelfxLogo(
                                  height: (height * 0.065).clamp(40.0, 90.0),
                                  maxWidth: 310,
                                ),
                              ),
                              Align(
                                alignment: Alignment.centerLeft,
                                child: TextButton.icon(
                                  key: const Key('generation-back'),
                                  onPressed: onBack,
                                  style: TextButton.styleFrom(
                                    backgroundColor: const Color(0xFFECECEC),
                                    foregroundColor:
                                        SelfxKioskTokens.textPrimary,
                                    minimumSize: const Size(76, 44),
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 10,
                                    ),
                                    shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(12),
                                    ),
                                  ),
                                  icon: const Icon(Icons.arrow_back),
                                  label: const Text('Back'),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                      Expanded(
                        flex: 6,
                        child: Padding(
                          key: const Key('generation-preview-section'),
                          padding: const EdgeInsets.symmetric(vertical: 8),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              Expanded(
                                child: _InputCard(
                                  key: const Key('generation-person-card'),
                                  label: 'Your Photo',
                                  icon: Icons.person_outline,
                                  imagePath: personImagePath,
                                  imageKey: const Key(
                                    'generation-person-image',
                                  ),
                                ),
                              ),
                              SizedBox(
                                width: constraints.maxWidth < 560 ? 12 : 20,
                              ),
                              Expanded(
                                child: _InputCard(
                                  key: const Key('generation-garment-card'),
                                  label:
                                      experience.vertical ==
                                          KioskTryOnVertical.jewellery
                                      ? 'Jewellery Photo'
                                      : 'Garment Photo',
                                  icon: experience.icon,
                                  imagePath: garmentImagePath,
                                  imageKey: const Key(
                                    'generation-garment-image',
                                  ),
                                  subtitle: garmentName,
                                  price: garmentPrice,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                      Expanded(
                        flex: 3,
                        child: TweenAnimationBuilder<double>(
                          tween: Tween<double>(
                            begin: _progress,
                            end: _progress,
                          ),
                          duration: const Duration(milliseconds: 600),
                          curve: Curves.easeInOutCubic,
                          builder: (context, progress, _) => Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              Expanded(
                                flex: 2,
                                child: SizedBox(
                                  key: const Key('generation-status-section'),
                                  child: _StatusContent(
                                    status: status,
                                    progress: progress,
                                    experience: experience,
                                    message: processingMessage,
                                  ),
                                ),
                              ),
                              Expanded(
                                child: SizedBox(
                                  key: const Key(
                                    'generation-animation-section',
                                  ),
                                  child: _ProcessingSteps(
                                    progress: progress,
                                    motion: motion,
                                    experience: experience,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              );
              return height > constraints.maxHeight
                  ? SingleChildScrollView(child: page)
                  : page;
            },
          ),
        ),
      ),
    );
  }
}

class _InputCard extends StatelessWidget {
  const _InputCard({
    super.key,
    required this.label,
    required this.icon,
    required this.imageKey,
    this.imagePath,
    this.subtitle,
    this.price,
  });
  final String label;
  final IconData icon;
  final Key imageKey;
  final String? imagePath;
  final String? subtitle;
  final String? price;

  @override
  Widget build(BuildContext context) {
    final narrow = MediaQuery.sizeOf(context).width < 560;
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: SelfxKioskTokens.border),
        boxShadow: SelfxKioskTokens.cardShadow,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Expanded(
            child: ClipRRect(
              borderRadius: const BorderRadius.vertical(
                top: Radius.circular(24),
              ),
              child: ColoredBox(
                color: SelfxKioskTokens.background,
                child: _PreviewImage(key: imageKey, path: imagePath),
              ),
            ),
          ),
          Padding(
            padding: EdgeInsets.fromLTRB(
              narrow ? 10 : 20,
              narrow ? 8 : 14,
              narrow ? 10 : 20,
              narrow ? 16 : 22,
            ),
            child: Row(
              children: [
                DecoratedBox(
                  decoration: const BoxDecoration(
                    color: SelfxKioskTokens.primary,
                    shape: BoxShape.circle,
                  ),
                  child: Padding(
                    padding: EdgeInsets.all(narrow ? 7 : 12),
                    child: Icon(
                      icon,
                      color: Colors.white,
                      size: narrow ? 20 : 30,
                    ),
                  ),
                ),
                SizedBox(width: narrow ? 6 : 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        label,
                        maxLines: 2,
                        style: TextStyle(
                          fontSize: narrow ? 14 : 22,
                          fontWeight: FontWeight.w800,
                          color: SelfxKioskTokens.textPrimary,
                        ),
                      ),
                      if (subtitle != null && subtitle!.isNotEmpty)
                        Text(
                          [subtitle!, ?price].join(' · '),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: narrow ? 11 : 14,
                            color: SelfxKioskTokens.textSecondary,
                          ),
                        ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _PreviewImage extends StatelessWidget {
  const _PreviewImage({super.key, this.path});
  final String? path;
  @override
  Widget build(BuildContext context) {
    const placeholder = Center(
      child: Icon(
        Icons.image_not_supported_outlined,
        color: SelfxKioskTokens.textMuted,
        size: 36,
      ),
    );
    final value = path?.trim();
    if (value == null || value.isEmpty) return placeholder;
    final uri = Uri.tryParse(value);
    if (uri?.scheme == 'http' || uri?.scheme == 'https') {
      return Image.network(
        value,
        cacheWidth: 1024,
        fit: generationInputPreviewImageFitForTesting,
        errorBuilder: (_, _, _) => placeholder,
      );
    }
    return Image.file(
      File(value),
      cacheWidth: 1024,
      fit: generationInputPreviewImageFitForTesting,
      errorBuilder: (_, _, _) => placeholder,
    );
  }
}

class _StatusContent extends StatelessWidget {
  const _StatusContent({
    required this.status,
    required this.progress,
    required this.experience,
    this.message,
  });
  final KioskTryOnStatus status;
  final double progress;
  final TryOnExperienceConfig experience;
  final String? message;

  @override
  Widget build(BuildContext context) {
    final (prefix, title) = switch (status) {
      KioskTryOnStatus.preparing => ('Preparing ', 'Your Images'),
      KioskTryOnStatus.uploading => ('Sending ', 'to SelfX'),
      KioskTryOnStatus.queued ||
      KioskTryOnStatus.processing => ('Creating ', 'Your Look'),
      KioskTryOnStatus.succeeded => ('Your Look ', 'is Ready'),
      _ => ('Starting ', 'Your Try-On'),
    };
    final support =
        message ??
        switch (status) {
          KioskTryOnStatus.preparing =>
            'Checking your photo and ${experience.title.toLowerCase()} before generation starts.',
          KioskTryOnStatus.uploading =>
            'Sending everything securely. Please keep this screen open.',
          KioskTryOnStatus.queued || KioskTryOnStatus.processing =>
            'SelfX is fitting this style to your photo.',
          KioskTryOnStatus.succeeded => 'Your result is ready. Opening it now.',
          _ => 'Getting everything ready for your virtual try-on.',
        };
    final stage = switch (status) {
      KioskTryOnStatus.preparing => 'Setting your look in motion...',
      KioskTryOnStatus.uploading => 'Preparing your style...',
      KioskTryOnStatus.queued => 'Bringing your style to life...',
      KioskTryOnStatus.processing => 'Adding the final touch...',
      KioskTryOnStatus.succeeded => 'Your look awaits!',
      _ => 'Getting started...',
    };
    return LayoutBuilder(
      builder: (context, constraints) {
        final narrow = constraints.maxWidth < 560;
        final width = constraints.maxWidth.clamp(1.0, 1100.0);
        return Center(
          child: FittedBox(
            fit: BoxFit.scaleDown,
            child: SizedBox(
              width: width,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text.rich(
                    key: const Key('generation-heading'),
                    TextSpan(
                      children: [
                        TextSpan(text: prefix),
                        TextSpan(
                          text: title,
                          style: const TextStyle(
                            color: SelfxKioskTokens.primary,
                          ),
                        ),
                      ],
                    ),
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: narrow ? 20 : 28,
                      height: 1.1,
                      fontWeight: FontWeight.w900,
                      color: SelfxKioskTokens.homeNavy,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    support,
                    key: const Key('generation-processing-message'),
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: narrow ? 12 : 14,
                      height: 1.2,
                      color: SelfxKioskTokens.textSecondary,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      Expanded(
                        child: Semantics(
                          label: 'Estimated progress',
                          value: '${(progress * 100).round()} percent',
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(999),
                            child: SizedBox(
                              height: narrow ? 8 : 10,
                              child: Stack(
                                fit: StackFit.expand,
                                children: [
                                  const ColoredBox(color: Color(0xFFE1E4E9)),
                                  Align(
                                    alignment: Alignment.centerLeft,
                                    child: FractionallySizedBox(
                                      key: const Key(
                                        'generation-progress-fill',
                                      ),
                                      widthFactor: progress,
                                      heightFactor: 1,
                                      child: DecoratedBox(
                                        decoration: BoxDecoration(
                                          borderRadius: BorderRadius.circular(
                                            999,
                                          ),
                                          gradient: const LinearGradient(
                                            colors: [
                                              SelfxKioskTokens.homeOrangeStart,
                                              SelfxKioskTokens
                                                  .primaryGradientEnd,
                                            ],
                                          ),
                                        ),
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Text(
                        '${(progress * 100).round()}%',
                        key: const Key('generation-percentage'),
                        style: TextStyle(
                          fontSize: narrow ? 22 : 26,
                          height: 1.1,
                          color: SelfxKioskTokens.primary,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 3),
                  Text(
                    stage,
                    key: const Key('generation-stage-message'),
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: narrow ? 11 : 12,
                      height: 1.2,
                      fontWeight: FontWeight.w600,
                      color: SelfxKioskTokens.textSecondary,
                    ),
                  ),
                  const SizedBox(height: 1),
                  const Text(
                    'Estimated progress',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 10,
                      height: 1.1,
                      color: SelfxKioskTokens.textMuted,
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}

class _ProcessingSteps extends StatelessWidget {
  const _ProcessingSteps({
    required this.progress,
    required this.motion,
    required this.experience,
  });
  final double progress;
  final Animation<double> motion;
  final TryOnExperienceConfig experience;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final narrow = constraints.maxWidth < 560;
        final diameter = narrow ? 36.0 : 48.0;
        final active = progress < 0.34
            ? 0
            : progress < 0.67
            ? 1
            : 2;
        final titles = ['Analyzing', 'Fitting', 'Creating'];
        final subtitles = [
          'your photo',
          'the ${experience.vertical == KioskTryOnVertical.jewellery ? 'jewellery' : 'garment'}',
          'your look',
        ];
        final icons = [
          Icons.image_outlined,
          experience.icon,
          Icons.auto_awesome_outlined,
        ];
        return Center(
          child: FittedBox(
            fit: BoxFit.scaleDown,
            child: SizedBox(
              width: constraints.maxWidth.clamp(1.0, 1000.0),
              child: AnimatedBuilder(
                animation: motion,
                builder: (context, _) {
                  final pulse = progress >= 1
                      ? 1.0
                      : 1 + math.sin(motion.value * math.pi * 4) * 0.06;
                  return Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      for (var index = 0; index < 3; index++) ...[
                        Expanded(
                          flex: 3,
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Semantics(
                                label: '${titles[index]} ${subtitles[index]}',
                                value: progress >= 1 || index < active
                                    ? 'Complete'
                                    : index == active
                                    ? 'Current step'
                                    : 'Upcoming',
                                child: Transform.scale(
                                  key: ValueKey('generation-step-scale-$index'),
                                  scale: index == active ? pulse : 1,
                                  child: AnimatedContainer(
                                    key: ValueKey('generation-step-$index'),
                                    duration: const Duration(milliseconds: 250),
                                    width: diameter,
                                    height: diameter,
                                    decoration: BoxDecoration(
                                      shape: BoxShape.circle,
                                      color: index <= active
                                          ? SelfxKioskTokens.primary
                                          : const Color(0xFFE1E4E9),
                                      boxShadow: index == active && progress < 1
                                          ? SelfxKioskTokens.primaryActionShadow
                                          : const [],
                                    ),
                                    child: Icon(
                                      icons[index],
                                      size: narrow ? 20 : 26,
                                      color: index <= active
                                          ? Colors.white
                                          : SelfxKioskTokens.textSecondary,
                                    ),
                                  ),
                                ),
                              ),
                              const SizedBox(height: 5),
                              Text(
                                titles[index],
                                textAlign: TextAlign.center,
                                maxLines: 1,
                                style: TextStyle(
                                  fontSize: narrow ? 12 : 16,
                                  height: 1.1,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                              Text(
                                subtitles[index],
                                textAlign: TextAlign.center,
                                maxLines: 2,
                                style: TextStyle(
                                  fontSize: narrow ? 11 : 12,
                                  height: 1.2,
                                  color: SelfxKioskTokens.textSecondary,
                                ),
                              ),
                            ],
                          ),
                        ),
                        if (index < 2)
                          Expanded(
                            child: Padding(
                              padding: EdgeInsets.only(top: diameter / 2 - 1.5),
                              child: SizedBox(
                                height: 3,
                                child: Stack(
                                  fit: StackFit.expand,
                                  children: [
                                    const ColoredBox(color: Color(0xFFE1E4E9)),
                                    Align(
                                      alignment: Alignment.centerLeft,
                                      child: FractionallySizedBox(
                                        key: ValueKey(
                                          'generation-step-connector-$index',
                                        ),
                                        widthFactor:
                                            ((progress - 0.34 - index * 0.33) /
                                                    0.33)
                                                .clamp(0.0, 1.0),
                                        heightFactor: 1,
                                        child: const ColoredBox(
                                          color: SelfxKioskTokens.primary,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ),
                      ],
                    ],
                  );
                },
              ),
            ),
          ),
        );
      },
    );
  }
}
