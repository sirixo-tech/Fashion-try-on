import 'dart:io';

import 'package:flutter/material.dart';

import '../session/capture_session_controller.dart';
import 'kiosk_chrome.dart';
import 'responsive_kiosk_layout.dart';

class PhotoReadyScreen extends StatefulWidget {
  const PhotoReadyScreen({super.key, required this.controller});

  final CaptureSessionController controller;

  @override
  State<PhotoReadyScreen> createState() => _PhotoReadyScreenState();
}

class _PhotoReadyScreenState extends State<PhotoReadyScreen> {
  bool _continued = false;

  @override
  Widget build(BuildContext context) {
    final capture = widget.controller.acceptedCapture;
    return KioskScaffold(
      title: 'Photo Ready',
      subtitle: 'Local session only',
      child: capture == null
          ? const Center(child: Text('No accepted photo available.'))
          : LayoutBuilder(
              builder: (context, constraints) {
                final layout = KioskLayoutMetrics.fromConstraints(constraints);
                final compact = layout.stackPanels || layout.tightHeight;
                final preview = Card(
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: Image.file(
                      File(capture.originalPath),
                      fit: BoxFit.contain,
                      errorBuilder: (_, _, _) {
                        return const Center(
                          child: Text('Accepted photo unavailable'),
                        );
                      },
                    ),
                  ),
                );
                final content = _PhotoReadyActions(
                  continued: _continued,
                  compact: compact,
                  onContinue: () => setState(() => _continued = true),
                  onRetake: _retake,
                );

                if (compact) {
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Expanded(child: preview),
                      SizedBox(height: layout.panelGap),
                      Flexible(
                        fit: FlexFit.loose,
                        child: SingleChildScrollView(child: content),
                      ),
                    ],
                  );
                }

                return Row(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Expanded(child: preview),
                    SizedBox(width: layout.panelGap),
                    SizedBox(
                      width: layout.sidePanelWidth,
                      child: SingleChildScrollView(child: content),
                    ),
                  ],
                );
              },
            ),
    );
  }

  Future<void> _retake() async {
    await widget.controller.retake();
    if (mounted) {
      Navigator.of(context).pop();
    }
  }
}

class _PhotoReadyActions extends StatelessWidget {
  const _PhotoReadyActions({
    required this.continued,
    required this.compact,
    required this.onContinue,
    required this.onRetake,
  });

  final bool continued;
  final bool compact;
  final VoidCallback onContinue;
  final VoidCallback onRetake;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(28),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(
                  Icons.check_circle,
                  color: Theme.of(context).colorScheme.secondary,
                  size: 72,
                ),
                const SizedBox(height: 18),
                Text(
                  'Photo Ready',
                  style: Theme.of(context).textTheme.displaySmall,
                ),
                const SizedBox(height: 14),
                Text(
                  continued
                      ? 'Photo saved for this session. Garment selection will be connected in the next Try-On phase.'
                      : 'Your photo is ready for this Try-On session.',
                  style: Theme.of(context).textTheme.bodyLarge,
                ),
              ],
            ),
          ),
        ),
        if (compact) const SizedBox(height: 20) else const Spacer(),
        OutlinedButton.icon(
          key: const Key('photo-ready-retake'),
          onPressed: onRetake,
          icon: const Icon(Icons.replay),
          label: const Text('Retake'),
        ),
        const SizedBox(height: 16),
        ElevatedButton.icon(
          key: const Key('photo-ready-continue'),
          onPressed: continued ? null : onContinue,
          icon: const Icon(Icons.arrow_forward),
          label: const Text('Continue'),
        ),
      ],
    );
  }
}
