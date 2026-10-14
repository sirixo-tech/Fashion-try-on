import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../theme/selfx_kiosk_theme.dart';
import '../tryon/kiosk_try_on_models.dart';
import 'selfx_kiosk_button.dart';
import 'selfx_logo.dart';

/// Presents the existing session share; this view never creates another link.
class MyLooksDownloadSheet extends StatefulWidget {
  const MyLooksDownloadSheet({
    super.key,
    required this.share,
    required this.sessionCurrent,
    required this.onClose,
    required this.onSelectMore,
    required this.onHome,
    this.now = DateTime.now,
  });

  final KioskTryOnShare share;
  final bool sessionCurrent;
  final VoidCallback onClose;
  final VoidCallback onSelectMore;
  final VoidCallback? onHome;
  final DateTime Function() now;

  @override
  State<MyLooksDownloadSheet> createState() => _MyLooksDownloadSheetState();
}

class _MyLooksDownloadSheetState extends State<MyLooksDownloadSheet> {
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final wide = constraints.maxWidth >= 440;
      const padding = 20.0;
      final contentWidth = constraints.maxWidth - padding * 2;
      final qrWidth = math.min(340.0, contentWidth);
      final remaining = widget.share.expiresAt.difference(widget.now());
      final available = widget.sessionCurrent && remaining > Duration.zero;
      final height = math.min(MediaQuery.sizeOf(context).height * 0.88, 850.0);
      return SizedBox(
        key: const Key('my-looks-download-sheet'),
        height: height,
        child: SafeArea(
          top: false,
          child: Padding(
            padding: EdgeInsets.all(padding),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                SizedBox(
                  height: 72,
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      const Padding(
                        padding: EdgeInsets.symmetric(horizontal: 56),
                        child: SelfxLogo(height: 64, maxWidth: 220),
                      ),
                      Align(
                        alignment: Alignment.topRight,
                        child: IconButton(
                          key: const Key('close-download-my-looks'),
                          tooltip: 'Close download',
                          onPressed: widget.onClose,
                          style: IconButton.styleFrom(
                            backgroundColor: const Color(0xFFF1F2F5),
                            foregroundColor: SelfxKioskTokens.danger,
                          ),
                          icon: const Icon(Icons.close, size: 28),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                Expanded(
                  child: SingleChildScrollView(
                    key: const Key('download-my-looks-content'),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Center(child: _qr(qrWidth, available)),
                        const SizedBox(height: 20),
                        _instructions(context),
                        if (available) ...[
                          const SizedBox(height: 12),
                          Text(
                            'Link expires in ${_remaining(remaining)}',
                            key: const Key('download-my-looks-link-expiry'),
                            textAlign: TextAlign.center,
                            style: const TextStyle(
                              color: SelfxKioskTokens.primary,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                        const SizedBox(height: 24),
                        if (wide)
                          Row(
                            children: [
                              Expanded(child: _selectMore()),
                              const SizedBox(width: 12),
                              Expanded(child: _home()),
                            ],
                          )
                        else ...[
                          _selectMore(),
                          const SizedBox(height: 12),
                          _home(),
                        ],
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    },
  );

  Widget _instructions(BuildContext context) => Column(
    key: const Key('download-my-looks-instructions'),
    crossAxisAlignment: CrossAxisAlignment.center,
    children: [
      Text(
        'Download My Looks',
        textAlign: TextAlign.center,
        style: Theme.of(context).textTheme.headlineSmall?.copyWith(
          color: SelfxKioskTokens.homeNavy,
          fontWeight: FontWeight.w900,
        ),
      ),
      const SizedBox(height: 10),
      Container(width: 54, height: 4, color: SelfxKioskTokens.primary),
      const SizedBox(height: 18),
      const Text(
        'Scan this QR code with your phone to download your looks.',
        textAlign: TextAlign.center,
        style: TextStyle(
          color: SelfxKioskTokens.textSecondary,
          fontSize: 17,
          height: 1.4,
        ),
      ),
    ],
  );

  Widget _qr(double width, bool available) => SizedBox(
    width: width,
    child: Container(
      key: const Key('download-my-looks-qr-frame'),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: SelfxKioskTokens.primary, width: 2),
        boxShadow: SelfxKioskTokens.softShadow,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (available)
            QrImageView(
              key: const Key('download-my-looks-qr'),
              data: widget.share.shareUrl,
              size: width - 36,
              version: QrVersions.auto,
              gapless: false,
              backgroundColor: Colors.white,
            )
          else
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 40),
              child: Icon(
                Icons.timer_off_outlined,
                size: 64,
                color: SelfxKioskTokens.textMuted,
              ),
            ),
          const SizedBox(height: 10),
          Text(
            available ? 'Scan QR Code' : 'Download link expired',
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w800,
              color: SelfxKioskTokens.homeNavy,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            available
                ? 'to download your looks'
                : 'Return to the kiosk for a new download link.',
            textAlign: TextAlign.center,
            style: const TextStyle(color: SelfxKioskTokens.textSecondary),
          ),
        ],
      ),
    ),
  );

  Widget _selectMore() => SelfxKioskButton(
    key: const Key('select-more-looks'),
    label: 'Select More Looks',
    icon: Icons.arrow_back,
    backgroundColor: Colors.white,
    foregroundColor: SelfxKioskTokens.primary,
    borderColor: SelfxKioskTokens.primary,
    minHeight: 64,
    borderRadius: 12,
    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
    wrapLabel: true,
    onPressed: widget.onSelectMore,
  );

  Widget _home() => SelfxKioskButton(
    key: const Key('download-back-to-home'),
    label: 'Back to Home',
    icon: Icons.home_outlined,
    backgroundColor: SelfxKioskTokens.primary,
    foregroundColor: Colors.white,
    minHeight: 64,
    borderRadius: 12,
    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
    wrapLabel: true,
    onPressed: widget.onHome,
  );
}

String _remaining(Duration duration) {
  final seconds = duration.inSeconds.clamp(0, 86400);
  return '${(seconds ~/ 60).toString().padLeft(2, '0')}:${(seconds % 60).toString().padLeft(2, '0')}';
}
