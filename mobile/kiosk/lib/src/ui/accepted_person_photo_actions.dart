import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../session/capture_session_controller.dart';
import 'kiosk_attention_animations.dart';

import '../theme/selfx_kiosk_theme.dart';
import 'selfx_kiosk_button.dart';

/// Shared footer for camera and phone accepted-person previews.
class AcceptedPersonPhotoActions extends StatelessWidget {
  const AcceptedPersonPhotoActions({
    super.key,
    required this.status,
    required this.onTakeGarmentPhoto,
    required this.onRetake,
    this.instruction,
    this.busy = false,
    this.retakeLabel = 'Retake Photo',
    this.onUploadPhoto,
    this.catalogProductSelected = false,
    this.onContinue,
  });
  final Widget status;
  final VoidCallback? onTakeGarmentPhoto;
  final VoidCallback? onRetake;
  final String? instruction;
  final bool busy;
  final String retakeLabel;
  final VoidCallback? onUploadPhoto;
  final bool catalogProductSelected;
  final VoidCallback? onContinue;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Theme(
      data: MediaQuery.sizeOf(context).width < 420
          ? theme.copyWith(
              textTheme: theme.textTheme.copyWith(
                titleMedium: theme.textTheme.titleMedium?.copyWith(
                  fontSize: 14,
                ),
              ),
            )
          : theme,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          status,
          if (instruction != null)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 5),
              child: Text(
                instruction!,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: SelfxKioskTokens.textSecondary,
                ),
              ),
            ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: SelfxKioskButton(
                  key: const Key('retake-photo'),
                  onPressed: onRetake,
                  label: retakeLabel,
                  icon: Icons.replay,
                  backgroundColor: Colors.white,
                  foregroundColor: SelfxKioskTokens.textPrimary,
                  borderColor: SelfxKioskTokens.homeGold,
                  borderRadius: 24,
                  minHeight: 60,
                  wrapLabel: true,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 12,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: SelfxActionPulse(
                  key: const Key('accepted-person-next-step-pulse'),
                  enabled:
                      !busy &&
                      onUploadPhoto == null &&
                      (catalogProductSelected
                          ? onContinue != null
                          : onTakeGarmentPhoto != null),
                  borderRadius: 24,
                  child: SelfxKioskButton(
                    key: onUploadPhoto != null
                        ? const Key('upload-model-photo')
                        : catalogProductSelected
                        ? const Key('continue-selected-product-try-on')
                        : const Key('take-garment-photo'),
                    onPressed:
                        onUploadPhoto ??
                        (catalogProductSelected
                            ? onContinue
                            : onTakeGarmentPhoto),
                    label: busy
                        ? 'Preparing...'
                        : onUploadPhoto != null
                        ? 'Upload Photo'
                        : catalogProductSelected
                        ? 'Continue'
                        : 'Take Garment Photo',
                    icon: onUploadPhoto != null
                        ? Icons.file_upload_outlined
                        : catalogProductSelected
                        ? Icons.play_arrow_rounded
                        : Icons.camera_alt_outlined,
                    backgroundColor: SelfxKioskTokens.primary,
                    foregroundColor: Colors.white,
                    borderRadius: 24,
                    minHeight: 60,
                    wrapLabel: true,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 12,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class PersonPhotoStatus extends StatefulWidget {
  const PersonPhotoStatus({
    super.key,
    required this.isLoading,
    required this.result,
  });

  final bool isLoading;
  final ImageUsabilityResult? result;

  @override
  State<PersonPhotoStatus> createState() => _PersonPhotoStatusState();
}

class _PersonPhotoStatusState extends State<PersonPhotoStatus> {
  static final math.Random _random = math.Random();

  _SuccessReviewMessage? _successMessage;

  @override
  void initState() {
    super.initState();
    _syncSuccessMessage();
  }

  @override
  void didUpdateWidget(covariant PersonPhotoStatus oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.result?.isUsable != oldWidget.result?.isUsable ||
        widget.result?.message != oldWidget.result?.message) {
      _syncSuccessMessage();
    }
  }

  void _syncSuccessMessage() {
    final result = widget.result;
    if (result?.isUsable != true) {
      _successMessage = null;
      return;
    }
    _successMessage =
        _successReviewMessages[_random.nextInt(_successReviewMessages.length)];
  }

  @override
  Widget build(BuildContext context) {
    final result = widget.result;
    final isSuccess = !widget.isLoading && result?.isUsable == true;
    const successColor = SelfxKioskTokens.reviewSuccess;
    return Semantics(
      liveRegion: true,
      child: DecoratedBox(
        key: const Key('capture-review-status'),
        decoration: BoxDecoration(
          color: isSuccess
              ? SelfxKioskTokens.reviewSuccessSurface
              : Colors.white,
          borderRadius: BorderRadius.circular(28),
          border: Border.all(
            color: isSuccess
                ? SelfxKioskTokens.reviewSuccessBorder
                : SelfxKioskTokens.border,
            width: 1.5,
          ),
        ),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (widget.isLoading)
                const Row(
                  children: [
                    SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(strokeWidth: 3),
                    ),
                    SizedBox(width: 12),
                    Expanded(child: Text('Checking image usability...')),
                  ],
                )
              else if (result == null)
                const Text('Checking image usability...')
              else
                _UsabilityLine(
                  title: result.isUsable ? 'You’re Ready!' : null,
                  icon: result.isUsable
                      ? Icons.check_rounded
                      : Icons.error_outline,
                  animateIcon: result.isUsable,
                  backgroundColor: result.isUsable
                      ? successColor
                      : const Color(0xFFC53030),
                  iconColor: Colors.white,
                  textColor: SelfxKioskTokens.textPrimary,
                  text: result.isUsable
                      ? _successMessage?.text ?? result.message
                      : result.message,
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SuccessReviewMessage {
  const _SuccessReviewMessage({required this.text});

  final String text;
}

const _successReviewMessages = [
  _SuccessReviewMessage(text: 'Perfect capture - you\'re looking great!'),
  _SuccessReviewMessage(text: 'Great photo - you\'re ready to shine!'),
  _SuccessReviewMessage(text: 'Photo confirmed - looking sharp!'),
  _SuccessReviewMessage(text: 'Excellent capture - you look amazing!'),
  _SuccessReviewMessage(text: 'Picture looks perfect - so do you!'),
  _SuccessReviewMessage(text: 'Great shot - you\'re all set!'),
  _SuccessReviewMessage(text: 'Capture approved - looking fantastic!'),
  _SuccessReviewMessage(text: 'Perfect shot - looking your best!'),
  _SuccessReviewMessage(text: 'Photo is spot on - you\'re looking great!'),
  _SuccessReviewMessage(text: 'Great capture - ready for your new look!'),
];

class _UsabilityLine extends StatelessWidget {
  const _UsabilityLine({
    required this.icon,
    this.animateIcon = false,
    required this.backgroundColor,
    required this.iconColor,
    required this.textColor,
    required this.text,
    this.title,
  });

  final IconData icon;
  final bool animateIcon;
  final Color backgroundColor;
  final Color iconColor;
  final Color textColor;
  final String text;
  final String? title;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          if (animateIcon)
            SelfxSuccessIconPulse(
              icon: icon,
              backgroundColor: backgroundColor,
              iconColor: iconColor,
              iconSize: 26,
              padding: const EdgeInsets.all(9),
            )
          else
            DecoratedBox(
              decoration: BoxDecoration(
                color: backgroundColor,
                shape: BoxShape.circle,
              ),
              child: Padding(
                padding: const EdgeInsets.all(5),
                child: Icon(icon, size: 18, color: iconColor),
              ),
            ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              mainAxisSize: MainAxisSize.min,
              children: [
                if (title != null) ...[
                  Text(
                    title!,
                    key: const Key('person-photo-status-title'),
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      color: textColor,
                      fontWeight: FontWeight.w900,
                      fontSize:
                          MediaQuery.orientationOf(context) ==
                                  Orientation.portrait &&
                              MediaQuery.sizeOf(context).width >= 760
                          ? 26
                          : 22,
                    ),
                  ),
                  const SizedBox(height: 4),
                ],
                Text(
                  text,
                  key: const Key('person-photo-status-message'),
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    color: title != null
                        ? SelfxKioskTokens.textSecondary
                        : textColor,
                    fontWeight: title != null
                        ? FontWeight.w600
                        : FontWeight.w900,
                  ),
                ),
              ],
            ),
          ),
          // Balance the icon and gap so text centers within the entire panel.
          SizedBox(width: (animateIcon ? 44 : 28) + 12),
        ],
      ),
    );
  }
}
