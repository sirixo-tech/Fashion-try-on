import 'dart:io';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../quality/image_quality.dart';
import '../session/capture_session_controller.dart';
import '../tryon/kiosk_try_on_session_controller.dart';
import '../upload/kiosk_customer_upload_controller.dart';
import 'garment_selection_screen.dart';
import 'kiosk_chrome.dart';
import 'try_on_generation_screen.dart';

class CaptureReviewScreen extends StatelessWidget {
  const CaptureReviewScreen({
    super.key,
    required this.controller,
    required this.tryOnController,
    required this.uploadController,
  });

  final CaptureSessionController controller;
  final KioskTryOnSessionController tryOnController;
  final KioskCustomerUploadController uploadController;

  @override
  Widget build(BuildContext context) {
    return KioskScaffold(
      title: 'Review Capture',
      subtitle: 'Retake or use this local session photo',
      leading: IconButton(
        onPressed: () async {
          await controller.retake();
          if (context.mounted) {
            Navigator.of(context).pop();
          }
        },
        icon: const Icon(Icons.arrow_back),
      ),
      child: AnimatedBuilder(
        animation: controller,
        builder: (context, _) {
          final capture = controller.capture;
          if (capture == null) {
            return const Center(child: Text('No capture available.'));
          }

          final quality = controller.qualityResult;
          return LayoutBuilder(
            builder: (context, constraints) {
              final portrait =
                  constraints.maxHeight > constraints.maxWidth * 1.12;
              final compact =
                  constraints.maxWidth < 940 ||
                  constraints.maxHeight < 620 ||
                  portrait;
              final imagePreview = Card(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: Image.file(
                    File(capture.originalPath),
                    fit: BoxFit.contain,
                    errorBuilder: (_, _, _) {
                      return const Center(
                        child: Text('Captured image unavailable'),
                      );
                    },
                  ),
                ),
              );
              final actions = _ReviewActions(
                controller: controller,
                tryOnController: tryOnController,
                uploadController: uploadController,
                quality: quality,
                compact: compact,
              );

              if (compact) {
                final previewHeight = math.max(
                  portrait ? 520.0 : 280.0,
                  math.min(
                    portrait ? constraints.maxHeight * 0.54 : 480.0,
                    portrait
                        ? constraints.maxHeight * 0.6
                        : constraints.maxWidth * 0.62,
                  ),
                );
                return SingleChildScrollView(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      SizedBox(height: previewHeight, child: imagePreview),
                      const SizedBox(height: 16),
                      actions,
                    ],
                  ),
                );
              }

              return Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Expanded(child: imagePreview),
                  const SizedBox(width: 24),
                  SizedBox(width: 420, child: actions),
                ],
              );
            },
          );
        },
      ),
    );
  }
}

class _ReviewActions extends StatelessWidget {
  const _ReviewActions({
    required this.controller,
    required this.tryOnController,
    required this.uploadController,
    required this.quality,
    required this.compact,
  });

  final CaptureSessionController controller;
  final KioskTryOnSessionController tryOnController;
  final KioskCustomerUploadController uploadController;
  final ImageQualityResult? quality;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: compact ? MainAxisSize.min : MainAxisSize.max,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _QualitySummary(
          isLoading: controller.isAnalyzingQuality,
          result: quality,
        ),
        if (compact) const SizedBox(height: 20) else const Spacer(),
        OutlinedButton.icon(
          key: const Key('retake-photo'),
          onPressed: () async {
            await controller.retake();
            if (context.mounted) {
              Navigator.of(context).pop();
            }
          },
          icon: const Icon(Icons.replay),
          label: const Text('Retake'),
        ),
        const SizedBox(height: 16),
        ElevatedButton.icon(
          key: const Key('use-photo'),
          onPressed: quality != null && !quality!.isBlocked
              ? () async {
                  final accepted = controller.usePhoto();
                  if (!accepted || !context.mounted) {
                    return;
                  }
                  if (tryOnController.garmentInput == null &&
                      tryOnController.pendingGarmentIntent != null) {
                    await Navigator.of(context).pushReplacement(
                      MaterialPageRoute<void>(
                        builder: (_) => GarmentSelectionScreen(
                          captureController: controller,
                          tryOnController: tryOnController,
                          uploadController: uploadController,
                        ),
                      ),
                    );
                    return;
                  }
                  await Navigator.of(context).pushReplacement(
                    MaterialPageRoute<void>(
                      builder: (_) => TryOnGenerationScreen(
                        captureController: controller,
                        tryOnController: tryOnController,
                        uploadController: uploadController,
                      ),
                    ),
                  );
                }
              : null,
          icon: const Icon(Icons.check_circle_outline),
          label: const Text('Use Photo'),
        ),
      ],
    );
  }
}

class _QualitySummary extends StatelessWidget {
  const _QualitySummary({required this.isLoading, required this.result});

  final bool isLoading;
  final ImageQualityResult? result;

  @override
  Widget build(BuildContext context) {
    final result = this.result;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Quality Summary',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 16),
            if (isLoading)
              const Row(
                children: [
                  SizedBox(
                    width: 22,
                    height: 22,
                    child: CircularProgressIndicator(strokeWidth: 3),
                  ),
                  SizedBox(width: 12),
                  Text('Checking your photo'),
                ],
              )
            else if (result == null)
              const Text('Quality check has not completed.')
            else ...[
              Text(
                qualityStatusLabel(result.status),
                style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                  color: _statusColor(result.status),
                ),
              ),
              const SizedBox(height: 12),
              _MetricRows(metrics: result.metrics),
              const SizedBox(height: 20),
              if (result.issues.isEmpty)
                const _QualityLine(icon: Icons.check, text: 'Photo looks clear')
              else
                for (final issue in result.issues)
                  _QualityLine(
                    icon: issue.severity == ImageQualityIssueSeverity.blocking
                        ? Icons.error_outline
                        : Icons.warning_amber_outlined,
                    text: issue.message,
                  ),
            ],
          ],
        ),
      ),
    );
  }

  Color _statusColor(ImageQualityStatus status) {
    return switch (status) {
      ImageQualityStatus.pass => const Color(0xFF2F855A),
      ImageQualityStatus.warning => const Color(0xFFB7791F),
      ImageQualityStatus.blocked => const Color(0xFFC53030),
    };
  }
}

class _MetricRows extends StatelessWidget {
  const _MetricRows({required this.metrics});

  final ImageQualityMetrics metrics;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        _MetricRow(label: 'Resolution', value: _resolutionLabel()),
        _MetricRow(label: 'Sharpness', value: _metric(metrics.sharpness)),
        _MetricRow(label: 'Brightness', value: _metric(metrics.brightness)),
        _MetricRow(label: 'Contrast', value: _metric(metrics.contrast)),
      ],
    );
  }

  String _resolutionLabel() {
    if (metrics.width == null || metrics.height == null) {
      return 'Unavailable';
    }
    return '${metrics.width} x ${metrics.height}';
  }

  String _metric(double? value) =>
      value == null ? 'Unavailable' : value.toStringAsFixed(2);
}

class _MetricRow extends StatelessWidget {
  const _MetricRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Expanded(child: Text(label, overflow: TextOverflow.ellipsis)),
          const SizedBox(width: 12),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.end,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
          ),
        ],
      ),
    );
  }
}

class _QualityLine extends StatelessWidget {
  const _QualityLine({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 22),
          const SizedBox(width: 10),
          Expanded(child: Text(text)),
        ],
      ),
    );
  }
}
