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
    this.busy = false,
    this.retakeLabel = 'Retake Photo',
    this.onUploadPhoto,
    this.catalogProductSelected = false,
    this.onContinue,
    this.continueLabel = 'Continue',
    this.continueKey = const Key('continue-selected-product-try-on'),
    this.retakeKey = const Key('retake-photo'),
  });
  final Widget status;
  final VoidCallback? onTakeGarmentPhoto;
  final VoidCallback? onRetake;
  final bool busy;
  final String retakeLabel;
  final VoidCallback? onUploadPhoto;
  final bool catalogProductSelected;
  final VoidCallback? onContinue;
  final String continueLabel;
  final Key continueKey;
  final Key retakeKey;

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
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: SelfxKioskButton(
                  key: retakeKey,
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
                      catalogProductSelected &&
                      continueLabel == 'Continue' &&
                      onContinue != null,
                  borderRadius: 24,
                  child: SelfxKioskButton(
                    key: onUploadPhoto != null
                        ? const Key('upload-model-photo')
                        : catalogProductSelected
                        ? continueKey
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
                        ? continueLabel
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

class PersonPhotoStatus extends StatelessWidget {
  const PersonPhotoStatus({
    super.key,
    required this.isLoading,
    required this.result,
    this.instruction,
  });

  final bool isLoading;
  final ImageUsabilityResult? result;
  final String? instruction;

  @override
  Widget build(BuildContext context) {
    final result = this.result;
    final isSuccess = !isLoading && result?.isUsable == true;
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
              if (isLoading)
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
                  backgroundColor: result.isUsable
                      ? successColor
                      : const Color(0xFFC53030),
                  iconColor: Colors.white,
                  textColor: SelfxKioskTokens.textPrimary,
                  text: result.isUsable ? instruction : result.message,
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _UsabilityLine extends StatelessWidget {
  const _UsabilityLine({
    required this.icon,
    required this.backgroundColor,
    required this.iconColor,
    required this.textColor,
    required this.text,
    this.title,
  });

  final IconData icon;
  final Color backgroundColor;
  final Color iconColor;
  final Color textColor;
  final String? text;
  final String? title;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          DecoratedBox(
            decoration: BoxDecoration(
              color: backgroundColor,
              shape: BoxShape.circle,
            ),
            child: Padding(
              padding: EdgeInsets.all(title != null ? 9 : 5),
              child: Icon(
                icon,
                size: title != null ? 26 : 18,
                color: iconColor,
              ),
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
                  if (text != null) const SizedBox(height: 4),
                ],
                if (text != null)
                  Text(
                    text!,
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
          SizedBox(width: (title != null ? 44 : 28) + 12),
        ],
      ),
    );
  }
}
