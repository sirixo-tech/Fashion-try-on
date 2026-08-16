import 'package:flutter/material.dart';

import '../session/capture_session_controller.dart';
import '../tryon/kiosk_try_on_models.dart';
import '../tryon/kiosk_try_on_session_controller.dart';
import '../upload/kiosk_customer_upload_controller.dart';
import 'garment_selection_screen.dart';
import 'kiosk_chrome.dart';
import 'photo_source_choice_screen.dart';
import 'try_on_result_screen.dart';

class TryOnGenerationScreen extends StatefulWidget {
  const TryOnGenerationScreen({
    super.key,
    required this.captureController,
    required this.tryOnController,
    required this.uploadController,
  });

  final CaptureSessionController captureController;
  final KioskTryOnSessionController tryOnController;
  final KioskCustomerUploadController uploadController;

  @override
  State<TryOnGenerationScreen> createState() => _TryOnGenerationScreenState();
}

class _TryOnGenerationScreenState extends State<TryOnGenerationScreen> {
  bool _submitted = false;
  bool _navigatedToResult = false;

  @override
  void initState() {
    super.initState();
    widget.tryOnController.addListener(_handleTryOnChanged);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_submitted) {
        _submitted = true;
        widget.tryOnController.submitFromCapture(widget.captureController);
      }
    });
  }

  @override
  void dispose() {
    widget.tryOnController.removeListener(_handleTryOnChanged);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return KioskScaffold(
      title: 'Creating Try-On',
      subtitle: 'Generating securely through SelfX',
      leading: IconButton(
        onPressed: () => Navigator.of(context).maybePop(),
        icon: const Icon(Icons.arrow_back),
      ),
      child: AnimatedBuilder(
        animation: widget.tryOnController,
        builder: (context, _) {
          final status = widget.tryOnController.status;
          final failed =
              status == KioskTryOnStatus.failed ||
              status == KioskTryOnStatus.timedOut;
          final compatibilityFailure =
              widget.tryOnController.failureCode ==
              KioskTryOnFailureCode.modelImageIncompatibleWithGarment;
          return Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 720),
              child: Card(
                child: Padding(
                  padding: const EdgeInsets.all(32),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Icon(
                        failed
                            ? Icons.error_outline
                            : Icons.auto_awesome_outlined,
                        size: 78,
                        color: failed
                            ? Theme.of(context).colorScheme.error
                            : Theme.of(context).colorScheme.primary,
                      ),
                      const SizedBox(height: 22),
                      Text(
                        failed
                            ? widget.tryOnController.customerTitle ??
                                  'Try-On needs attention'
                            : _titleFor(status),
                        style: Theme.of(context).textTheme.displaySmall,
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 14),
                      Text(
                        widget.tryOnController.customerMessage ??
                            'Preparing your look',
                        style: Theme.of(context).textTheme.bodyLarge,
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 28),
                      if (!failed) ...[
                        LinearProgressIndicator(value: _progressFor(status)),
                        const SizedBox(height: 26),
                        Text(
                          _stepLabelFor(status),
                          textAlign: TextAlign.center,
                        ),
                      ] else if (compatibilityFailure) ...[
                        ElevatedButton.icon(
                          key: const Key('try-on-update-photo'),
                          onPressed: () => _retakePhoto(context),
                          icon: const Icon(Icons.photo_camera_outlined),
                          label: const Text('Update My Photo'),
                        ),
                        const SizedBox(height: 14),
                        OutlinedButton.icon(
                          key: const Key('try-on-choose-category'),
                          onPressed: () => _chooseAnotherGarment(context),
                          icon: const Icon(Icons.checkroom_outlined),
                          label: const Text('Choose Another Category'),
                        ),
                      ] else ...[
                        ElevatedButton.icon(
                          key: const Key('try-on-retry-polling'),
                          onPressed: widget.tryOnController.run != null
                              ? widget.tryOnController.retryPolling
                              : () => widget.tryOnController.submitFromCapture(
                                  widget.captureController,
                                ),
                          icon: const Icon(Icons.refresh),
                          label: const Text('Try Again'),
                        ),
                        const SizedBox(height: 14),
                        OutlinedButton.icon(
                          key: const Key('try-on-retake-photo'),
                          onPressed: () => _retakePhoto(context),
                          icon: const Icon(Icons.replay),
                          label: const Text('Retake Photo'),
                        ),
                        const SizedBox(height: 14),
                        OutlinedButton.icon(
                          key: const Key('try-on-choose-garment'),
                          onPressed: () => _chooseAnotherGarment(context),
                          icon: const Icon(Icons.checkroom_outlined),
                          label: const Text('Choose Another Garment'),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  void _handleTryOnChanged() {
    final result = widget.tryOnController.result;
    if (result == null || _navigatedToResult || !mounted) {
      return;
    }
    _navigatedToResult = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) {
        return;
      }
      Navigator.of(context).pushReplacement(
        MaterialPageRoute<void>(
          builder: (_) => TryOnResultScreen(
            captureController: widget.captureController,
            tryOnController: widget.tryOnController,
            uploadController: widget.uploadController,
          ),
        ),
      );
    });
  }

  Future<void> _retakePhoto(BuildContext context) async {
    await widget.tryOnController.retakePhoto(widget.captureController);
    if (!context.mounted) {
      return;
    }
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute<void>(
        builder: (_) => PhotoSourceChoiceScreen(
          captureController: widget.captureController,
          tryOnController: widget.tryOnController,
          uploadController: widget.uploadController,
        ),
      ),
      (route) => route.isFirst,
    );
  }

  Future<void> _chooseAnotherGarment(BuildContext context) async {
    widget.tryOnController.tryAnotherGarment();
    if (!context.mounted) {
      return;
    }
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute<void>(
        builder: (_) => GarmentSelectionScreen(
          captureController: widget.captureController,
          tryOnController: widget.tryOnController,
          uploadController: widget.uploadController,
        ),
      ),
      (route) => route.isFirst,
    );
  }
}

String _titleFor(KioskTryOnStatus status) {
  return switch (status) {
    KioskTryOnStatus.preparing => 'Preparing your look',
    KioskTryOnStatus.uploading => 'Uploading securely',
    KioskTryOnStatus.queued => 'Creating your Try-On',
    KioskTryOnStatus.processing => 'Generating your look',
    KioskTryOnStatus.succeeded => 'Finishing',
    _ => 'Preparing your look',
  };
}

String _stepLabelFor(KioskTryOnStatus status) {
  return switch (status) {
    KioskTryOnStatus.preparing => 'Step 1 of 5',
    KioskTryOnStatus.uploading => 'Step 2 of 5',
    KioskTryOnStatus.queued => 'Step 3 of 5',
    KioskTryOnStatus.processing => 'Step 4 of 5',
    KioskTryOnStatus.succeeded => 'Step 5 of 5',
    _ => 'Starting',
  };
}

double? _progressFor(KioskTryOnStatus status) {
  return switch (status) {
    KioskTryOnStatus.preparing => 0.18,
    KioskTryOnStatus.uploading => 0.34,
    KioskTryOnStatus.queued => 0.52,
    KioskTryOnStatus.processing => 0.78,
    KioskTryOnStatus.succeeded => 1,
    _ => null,
  };
}
