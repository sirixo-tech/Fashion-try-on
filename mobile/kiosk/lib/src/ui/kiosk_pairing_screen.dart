import 'dart:async';

import 'package:flutter/material.dart';

import '../device/kiosk_device_session_controller.dart';
import 'kiosk_chrome.dart';

class KioskPairingScreen extends StatefulWidget {
  const KioskPairingScreen({super.key, required this.controller});

  final KioskDeviceSessionController controller;

  @override
  State<KioskPairingScreen> createState() => _KioskPairingScreenState();
}

class _KioskPairingScreenState extends State<KioskPairingScreen> {
  Timer? _ticker;

  @override
  void initState() {
    super.initState();
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) {
        setState(() {});
      }
    });
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final session = widget.controller.pairingSession;
    return KioskScaffold(
      title: 'Pair this kiosk',
      subtitle: 'Use SelfX Admin to connect this physical kiosk.',
      child: AnimatedBuilder(
        animation: widget.controller,
        builder: (context, _) {
          final current = widget.controller.pairingSession ?? session;
          if (current == null) {
            return _StatusPanel(
              title: 'Requesting pairing code',
              message: widget.controller.message ?? 'Connecting to SelfX...',
              actionLabel: 'Retry',
              onAction: () {
                unawaited(widget.controller.requestPairingSession());
              },
            );
          }

          final remaining = widget.controller.remainingFor(current);
          final safeRemaining = remaining.isNegative ? Duration.zero : remaining;
          final progress = widget.controller.progressFor(current);
          return LayoutBuilder(
            builder: (context, constraints) {
              final compact =
                  constraints.maxWidth < 720 || constraints.maxHeight < 620;
              return Center(
                child: ConstrainedBox(
                  constraints: BoxConstraints(
                    maxWidth: compact ? 560 : 760,
                    minHeight: compact ? 0 : 500,
                  ),
                  child: SingleChildScrollView(
                    child: Card(
                      child: Padding(
                        padding: EdgeInsets.all(compact ? 28 : 42),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                          Text(
                            'Pairing Code',
                            textAlign: TextAlign.center,
                            style: Theme.of(context).textTheme.titleLarge,
                          ),
                          const SizedBox(height: 18),
                          FittedBox(
                            fit: BoxFit.scaleDown,
                            child: Text(
                              current.displayCode,
                              style: Theme.of(context)
                                  .textTheme
                                  .displayLarge
                                  ?.copyWith(
                                    fontSize: compact ? 74 : 104,
                                    fontWeight: FontWeight.w800,
                                    letterSpacing: 6,
                                  ),
                            ),
                          ),
                          const SizedBox(height: 22),
                          LinearProgressIndicator(
                            value: progress,
                            minHeight: 12,
                            borderRadius: BorderRadius.circular(999),
                          ),
                          const SizedBox(height: 14),
                          Text(
                            '${_formatRemaining(safeRemaining)} remaining',
                            textAlign: TextAlign.center,
                            style: Theme.of(context).textTheme.headlineSmall,
                          ),
                          const SizedBox(height: 28),
                          Text(
                            'In SelfX Admin, open Kiosks, choose Pair New Kiosk, then enter this code.',
                            textAlign: TextAlign.center,
                            style: Theme.of(context).textTheme.bodyLarge,
                          ),
                          if (widget.controller.message != null) ...[
                            const SizedBox(height: 18),
                            Text(
                              widget.controller.message!,
                              textAlign: TextAlign.center,
                              style: Theme.of(context).textTheme.bodyMedium,
                            ),
                          ],
                          const SizedBox(height: 26),
                          OutlinedButton.icon(
                            onPressed: () {
                              unawaited(
                                widget.controller.requestPairingSession(),
                              );
                            },
                            icon: const Icon(Icons.refresh),
                            label: const Text('Request New Code'),
                          ),
                          const SizedBox(height: 18),
                          Text(
                            '${widget.controller.platformLabel} / ${widget.controller.appVersion}',
                            textAlign: TextAlign.center,
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }
}

class _StatusPanel extends StatelessWidget {
  const _StatusPanel({
    required this.title,
    required this.message,
    required this.actionLabel,
    required this.onAction,
  });

  final String title;
  final String message;
  final String actionLabel;
  final VoidCallback onAction;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const CircularProgressIndicator(),
              const SizedBox(height: 22),
              Text(title, style: Theme.of(context).textTheme.headlineSmall),
              const SizedBox(height: 12),
              Text(message, textAlign: TextAlign.center),
              const SizedBox(height: 22),
              OutlinedButton(onPressed: onAction, child: Text(actionLabel)),
            ],
          ),
        ),
      ),
    );
  }
}

String _formatRemaining(Duration remaining) {
  final minutes = remaining.inMinutes.remainder(60).toString().padLeft(2, '0');
  final seconds = remaining.inSeconds.remainder(60).toString().padLeft(2, '0');
  return '$minutes:$seconds';
}
