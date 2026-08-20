import 'dart:async';
import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../acquisition/photo_acquisition.dart';
import '../catalog/kiosk_catalog_gateway.dart';
import '../session/capture_session_controller.dart';
import '../tryon/garment_extraction_service.dart';
import '../tryon/kiosk_garment_input.dart';
import '../tryon/kiosk_try_on_session_controller.dart';
import '../upload/kiosk_customer_upload_controller.dart';
import '../upload/kiosk_customer_upload_models.dart';
import 'garment_review_screen.dart';
import 'garment_selection_screen.dart';
import 'kiosk_chrome.dart';

class MobileUploadScreen extends StatefulWidget {
  const MobileUploadScreen({
    super.key,
    required this.captureController,
    required this.tryOnController,
    required this.uploadController,
    this.catalogGateway = const UnavailableKioskCatalogGateway(),
    this.purpose = PhotoAcquisitionPurpose.model,
    this.garmentIntent,
    this.extractionService = const UnavailableGarmentExtractionService(),
  });

  final CaptureSessionController captureController;
  final KioskTryOnSessionController tryOnController;
  final KioskCustomerUploadController uploadController;
  final KioskCatalogGateway catalogGateway;
  final PhotoAcquisitionPurpose purpose;
  final KioskGarmentIntent? garmentIntent;
  final GarmentExtractionService extractionService;

  @override
  State<MobileUploadScreen> createState() => _MobileUploadScreenState();
}

class _MobileUploadScreenState extends State<MobileUploadScreen> {
  Timer? _tickTimer;

  @override
  void initState() {
    super.initState();
    unawaited(widget.uploadController.createSession(purpose: widget.purpose));
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
              widget.uploadController.message ?? 'Preparing secure upload...';
          if (session?.status == KioskCustomerUploadStatus.ready &&
              session?.photo != null) {
            return _ReadyPhotoPanel(
              controller: widget.uploadController,
              captureController: widget.captureController,
              tryOnController: widget.tryOnController,
              catalogGateway: widget.catalogGateway,
              purpose: widget.purpose,
              garmentIntent: widget.garmentIntent,
              extractionService: widget.extractionService,
              session: session!,
            );
          }
          if (widget.uploadController.flowState ==
              KioskCustomerUploadFlowState.failed) {
            return _UploadFailurePanel(
              controller: widget.uploadController,
              onRetry: () => widget.uploadController.createSession(
                purpose: widget.purpose,
              ),
              onCancel: () async {
                await widget.uploadController.cancel();
                if (context.mounted) {
                  Navigator.of(context).pop();
                }
              },
            );
          }
          return _QrPanel(
            controller: widget.uploadController,
            session: session,
            message: message,
            purpose: widget.purpose,
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
    required this.purpose,
    required this.onCancel,
  });

  final KioskCustomerUploadController controller;
  final KioskCustomerUploadSession? session;
  final String message;
  final PhotoAcquisitionPurpose purpose;
  final Future<void> Function() onCancel;

  @override
  Widget build(BuildContext context) {
    final session = this.session;
    final publicUploadUrl = session?.publicUploadUrl;
    final hasValidSession = session != null && publicUploadUrl != null;
    final remaining = session == null ? null : controller.remainingFor(session);
    return LayoutBuilder(
      builder: (context, constraints) {
        final minHeight = constraints.maxHeight.isFinite
            ? constraints.maxHeight
            : 0.0;
        final compact =
            constraints.maxWidth < 640 || constraints.maxHeight < 560;
        final padding = compact ? 18.0 : 30.0;
        final qrDimension = _qrDimensionFor(constraints, hasValidSession);

        return SingleChildScrollView(
          child: ConstrainedBox(
            constraints: BoxConstraints(minHeight: minHeight),
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 820),
                child: Card(
                  child: Padding(
                    padding: EdgeInsets.all(padding),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text(
                          hasValidSession
                              ? purpose.uploadTitle
                              : 'Preparing secure upload...',
                          textAlign: TextAlign.center,
                          style: compact
                              ? Theme.of(context).textTheme.headlineMedium
                              : Theme.of(context).textTheme.displaySmall,
                        ),
                        SizedBox(height: compact ? 14 : 18),
                        Center(
                          child: Container(
                            key: const Key('mobile-upload-qr-frame'),
                            width: qrDimension,
                            height: qrDimension,
                            padding: EdgeInsets.all(compact ? 12 : 18),
                            color: Colors.white,
                            child: hasValidSession
                                ? QrImageView(
                                    key: const Key('mobile-upload-qr'),
                                    data: publicUploadUrl,
                                    version: QrVersions.auto,
                                    gapless: false,
                                    backgroundColor: Colors.white,
                                  )
                                : const Center(
                                    child: CircularProgressIndicator(),
                                  ),
                          ),
                        ),
                        if (hasValidSession && remaining != null) ...[
                          SizedBox(height: compact ? 16 : 22),
                          Text(
                            _mmss(remaining),
                            key: const Key('mobile-upload-countdown'),
                            textAlign: TextAlign.center,
                            style: compact
                                ? Theme.of(context).textTheme.headlineMedium
                                : Theme.of(context).textTheme.displaySmall,
                          ),
                          const SizedBox(height: 12),
                          LinearProgressIndicator(
                            value: controller.progressFor(session),
                          ),
                        ],
                        SizedBox(height: compact ? 14 : 18),
                        Text(message, textAlign: TextAlign.center),
                        SizedBox(height: compact ? 18 : 24),
                        ElevatedButton.icon(
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
            ),
          ),
        );
      },
    );
  }
}

class _UploadFailurePanel extends StatelessWidget {
  const _UploadFailurePanel({
    required this.controller,
    required this.onRetry,
    required this.onCancel,
  });

  final KioskCustomerUploadController controller;
  final Future<void> Function() onRetry;
  final Future<void> Function() onCancel;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final minHeight = constraints.maxHeight.isFinite
            ? constraints.maxHeight
            : 0.0;
        return SingleChildScrollView(
          child: ConstrainedBox(
            constraints: BoxConstraints(minHeight: minHeight),
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 620),
                child: Card(
                  child: Padding(
                    padding: const EdgeInsets.all(28),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Icon(
                          Icons.wifi_off_outlined,
                          size: 48,
                          color: Theme.of(context).colorScheme.primary,
                        ),
                        const SizedBox(height: 18),
                        Text(
                          'Unable to start phone upload',
                          textAlign: TextAlign.center,
                          style: Theme.of(context).textTheme.headlineMedium,
                        ),
                        const SizedBox(height: 12),
                        Text(
                          controller.message ??
                              'SelfX could not prepare a secure upload link.',
                          textAlign: TextAlign.center,
                        ),
                        if (controller.errorCode != null) ...[
                          const SizedBox(height: 10),
                          Text(
                            'Code: ${controller.errorCode}',
                            key: const Key('mobile-upload-error-code'),
                            textAlign: TextAlign.center,
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                        ],
                        const SizedBox(height: 24),
                        ElevatedButton.icon(
                          key: const Key('retry-mobile-upload'),
                          onPressed: controller.isBusy
                              ? null
                              : () => unawaited(onRetry()),
                          icon: const Icon(Icons.refresh),
                          label: const Text('Try Again'),
                        ),
                        const SizedBox(height: 14),
                        OutlinedButton.icon(
                          key: const Key('cancel-mobile-upload'),
                          onPressed: () => unawaited(onCancel()),
                          icon: const Icon(Icons.close),
                          label: const Text('Cancel'),
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

class _ReadyPhotoPanel extends StatelessWidget {
  const _ReadyPhotoPanel({
    required this.controller,
    required this.captureController,
    required this.tryOnController,
    required this.catalogGateway,
    required this.purpose,
    required this.extractionService,
    this.garmentIntent,
    required this.session,
  });

  final KioskCustomerUploadController controller;
  final CaptureSessionController captureController;
  final KioskTryOnSessionController tryOnController;
  final KioskCatalogGateway catalogGateway;
  final PhotoAcquisitionPurpose purpose;
  final GarmentExtractionService extractionService;
  final KioskGarmentIntent? garmentIntent;
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
            if (!compact) const Spacer(),
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
                      if (purpose == PhotoAcquisitionPurpose.garment) {
                        final input = await controller.useReadyGarment(
                          intent:
                              garmentIntent ?? KioskGarmentIntent.fullOutfit,
                        );
                        if (input == null || !context.mounted) {
                          return;
                        }
                        await Navigator.of(context).pushReplacement(
                          MaterialPageRoute<void>(
                            builder: (_) => GarmentReviewScreen(
                              captureController: captureController,
                              tryOnController: tryOnController,
                              uploadController: controller,
                              catalogGateway: catalogGateway,
                              garmentInput: input,
                              extractionService: extractionService,
                            ),
                          ),
                        );
                        return;
                      }
                      final accepted = await controller.useReadyPhoto(
                        captureController,
                      );
                      if (!accepted || !context.mounted) {
                        return;
                      }
                      final attached = await tryOnController
                          .attachAcceptedPerson(captureController);
                      if (!context.mounted) {
                        return;
                      }
                      if (!attached) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(
                            content: Text(
                              tryOnController.sessionMessage ??
                                  'SelfX could not save this photo for reuse.',
                            ),
                          ),
                        );
                        return;
                      }
                      await Navigator.of(context).pushReplacement(
                        MaterialPageRoute<void>(
                          builder: (_) => GarmentSelectionScreen(
                            captureController: captureController,
                            tryOnController: tryOnController,
                            uploadController: controller,
                            catalogGateway: catalogGateway,
                            extractionService: extractionService,
                          ),
                        ),
                      );
                    },
              icon: const Icon(Icons.check_circle_outline),
              label: const Text('Continue'),
            ),
          ],
        );

        if (compact) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(child: preview),
              const SizedBox(height: 12),
              actions,
            ],
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

double _qrDimensionFor(BoxConstraints constraints, bool hasValidSession) {
  final maxWidth = constraints.maxWidth.isFinite ? constraints.maxWidth : 820.0;
  final maxHeight = constraints.maxHeight.isFinite
      ? constraints.maxHeight
      : 760.0;
  final reservedHeight = hasValidSession ? 310.0 : 220.0;
  final widthBound = maxWidth - 96.0;
  final heightBound = maxHeight - reservedHeight;
  final maxQr = hasValidSession ? 360.0 : 300.0;
  final candidate = widthBound < heightBound ? widthBound : heightBound;
  return candidate.clamp(176.0, maxQr).toDouble();
}
