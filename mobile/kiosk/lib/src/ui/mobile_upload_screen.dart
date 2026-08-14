import 'dart:async';
import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../session/capture_session_controller.dart';
import '../tryon/kiosk_try_on_session_controller.dart';
import '../upload/kiosk_customer_upload_controller.dart';
import '../upload/kiosk_customer_upload_models.dart';
import 'kiosk_chrome.dart';
import 'try_on_generation_screen.dart';

class MobileUploadScreen extends StatefulWidget {
  const MobileUploadScreen({
    super.key,
    required this.captureController,
    required this.tryOnController,
    required this.uploadController,
  });

  final CaptureSessionController captureController;
  final KioskTryOnSessionController tryOnController;
  final KioskCustomerUploadController uploadController;

  @override
  State<MobileUploadScreen> createState() => _MobileUploadScreenState();
}

class _MobileUploadScreenState extends State<MobileUploadScreen> {
  Timer? _tickTimer;

  @override
  void initState() {
    super.initState();
    unawaited(widget.uploadController.createSession());
    _tickTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) {
        setState(() {});
      }
    });
  }

  @override
  void dispose() {
    _tickTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return KioskScaffold(
      title: 'SelfX Kiosk',
      subtitle: 'Use your phone',
      leading: IconButton(
        onPressed: () async {
          await widget.uploadController.cancel();
          if (context.mounted) {
            Navigator.of(context).pop();
          }
        },
        icon: const Icon(Icons.arrow_back),
      ),
      child: AnimatedBuilder(
        animation: widget.uploadController,
        builder: (context, _) {
          final session = widget.uploadController.session;
          final message =
              widget.uploadController.message ?? 'Creating upload QR...';
          if (session?.status == KioskCustomerUploadStatus.ready &&
              session?.photo != null) {
            return _ReadyPhotoPanel(
              controller: widget.uploadController,
              captureController: widget.captureController,
              tryOnController: widget.tryOnController,
              session: session!,
            );
          }
          return _QrPanel(
            controller: widget.uploadController,
            session: session,
            message: message,
            onCancel: () async {
              await widget.uploadController.cancel();
              if (context.mounted) {
                Navigator.of(context).pop();
              }
            },
          );
        },
      ),
    );
  }
}

class _QrPanel extends StatelessWidget {
  const _QrPanel({
    required this.controller,
    required this.session,
    required this.message,
    required this.onCancel,
  });

  final KioskCustomerUploadController controller;
  final KioskCustomerUploadSession? session;
  final String message;
  final Future<void> Function() onCancel;

  @override
  Widget build(BuildContext context) {
    final session = this.session;
    final publicUploadUrl = session?.publicUploadUrl;
    final remaining = session == null ? Duration.zero : controller.remainingFor(session);
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 820),
        child: Card(
          child: Padding(
            padding: const EdgeInsets.all(30),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  'Scan to add your photo',
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.displaySmall,
                ),
                const SizedBox(height: 18),
                Center(
                  child: Container(
                    width: 360,
                    height: 360,
                    padding: const EdgeInsets.all(18),
                    color: Colors.white,
                    child: publicUploadUrl == null
                        ? const Center(child: CircularProgressIndicator())
                        : QrImageView(
                            key: const Key('mobile-upload-qr'),
                            data: publicUploadUrl,
                            version: QrVersions.auto,
                            gapless: false,
                            backgroundColor: Colors.white,
                          ),
                  ),
                ),
                const SizedBox(height: 22),
                Text(
                  _mmss(remaining),
                  key: const Key('mobile-upload-countdown'),
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.displaySmall,
                ),
                const SizedBox(height: 12),
                LinearProgressIndicator(
                  value: session == null ? null : controller.progressFor(session),
                ),
                const SizedBox(height: 18),
                Text(message, textAlign: TextAlign.center),
                const SizedBox(height: 24),
                OutlinedButton.icon(
                  key: const Key('cancel-mobile-upload'),
                  onPressed: onCancel,
                  icon: const Icon(Icons.close),
                  label: const Text('Cancel'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _ReadyPhotoPanel extends StatelessWidget {
  const _ReadyPhotoPanel({
    required this.controller,
    required this.captureController,
    required this.tryOnController,
    required this.session,
  });

  final KioskCustomerUploadController controller;
  final CaptureSessionController captureController;
  final KioskTryOnSessionController tryOnController;
  final KioskCustomerUploadSession session;

  @override
  Widget build(BuildContext context) {
    final photo = session.photo!;
    return LayoutBuilder(
      builder: (context, constraints) {
        final compact = constraints.maxWidth < 900;
        final preview = Card(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: Image.network(
              photo.readUrl,
              fit: BoxFit.contain,
              errorBuilder: (_, _, _) =>
                  const Center(child: Text('Uploaded photo unavailable')),
            ),
          ),
        );
        final actions = Column(
          mainAxisSize: compact ? MainAxisSize.min : MainAxisSize.max,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Photo received',
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                    const SizedBox(height: 12),
                    Text('${photo.width} x ${photo.height}'),
                    if (controller.message != null) ...[
                      const SizedBox(height: 12),
                      Text(controller.message!),
                    ],
                  ],
                ),
              ),
            ),
            if (compact) const SizedBox(height: 18) else const Spacer(),
            OutlinedButton.icon(
              key: const Key('upload-another-photo'),
              onPressed: controller.isBusy
                  ? null
                  : () => unawaited(controller.uploadAnother()),
              icon: const Icon(Icons.qr_code_2),
              label: const Text('Upload Another'),
            ),
            const SizedBox(height: 16),
            ElevatedButton.icon(
              key: const Key('use-mobile-photo'),
              onPressed: controller.isBusy
                  ? null
                  : () async {
                      final accepted = await controller.useReadyPhoto(
                        captureController,
                      );
                      if (!accepted || !context.mounted) {
                        return;
                      }
                      await Navigator.of(context).pushReplacement(
                        MaterialPageRoute<void>(
                          builder: (_) => TryOnGenerationScreen(
                            captureController: captureController,
                            tryOnController: tryOnController,
                            uploadController: controller,
                          ),
                        ),
                      );
                    },
              icon: const Icon(Icons.check_circle_outline),
              label: const Text('Use This Photo'),
            ),
          ],
        );

        if (compact) {
          return SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                SizedBox(height: 460, child: preview),
                const SizedBox(height: 16),
                actions,
              ],
            ),
          );
        }
        return Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(child: preview),
            const SizedBox(width: 24),
            SizedBox(width: 420, child: actions),
          ],
        );
      },
    );
  }
}

String _mmss(Duration duration) {
  final seconds = duration.inSeconds.clamp(0, 5 * 60);
  final minutes = (seconds ~/ 60).toString().padLeft(2, '0');
  final rest = (seconds % 60).toString().padLeft(2, '0');
  return '$minutes:$rest';
}
