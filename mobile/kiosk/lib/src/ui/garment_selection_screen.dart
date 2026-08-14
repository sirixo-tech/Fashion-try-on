import 'dart:io';

import 'package:flutter/material.dart';

import '../session/capture_session_controller.dart';
import '../tryon/kiosk_garment_input.dart';
import '../tryon/kiosk_try_on_session_controller.dart';
import 'capture_scope_screen.dart';
import 'kiosk_chrome.dart';

class GarmentSelectionScreen extends StatefulWidget {
  const GarmentSelectionScreen({
    super.key,
    required this.captureController,
    required this.tryOnController,
  });

  final CaptureSessionController captureController;
  final KioskTryOnSessionController tryOnController;

  @override
  State<GarmentSelectionScreen> createState() => _GarmentSelectionScreenState();
}

class _GarmentSelectionScreenState extends State<GarmentSelectionScreen> {
  late final TextEditingController _pathController;
  KioskGarmentIntent _intent = KioskGarmentIntent.auto;
  KioskGarmentPhotoType _photoType = KioskGarmentPhotoType.auto;
  String? _error;

  @override
  void initState() {
    super.initState();
    final existing = widget.tryOnController.garmentInput;
    _pathController = TextEditingController(text: existing?.localPath ?? '');
    _intent = existing?.intent ?? KioskGarmentIntent.auto;
    _photoType = existing?.photoType ?? KioskGarmentPhotoType.auto;
  }

  @override
  void dispose() {
    _pathController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return KioskScaffold(
      title: 'SelfX Kiosk',
      subtitle: 'Choose garment image',
      leading: IconButton(
        onPressed: () => Navigator.of(context).pop(),
        icon: const Icon(Icons.arrow_back),
      ),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 860),
          child: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(28),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text(
                          'Select a garment for this Try-On',
                          style: Theme.of(context).textTheme.displaySmall,
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: 14),
                        Text(
                          'KIOSK-3A uses a temporary development image path before Product Catalog and physical garment capture are connected.',
                          style: Theme.of(context).textTheme.bodyLarge,
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: 28),
                        TextField(
                          key: const Key('garment-image-path'),
                          controller: _pathController,
                          decoration: InputDecoration(
                            labelText: 'Garment image path',
                            hintText: Platform.isWindows
                                ? r'C:\SelfX\demo\jacket.jpg'
                                : '/sdcard/Download/jacket.jpg',
                            errorText: _error,
                          ),
                          textInputAction: TextInputAction.done,
                          onSubmitted: (_) => _continue(),
                        ),
                        const SizedBox(height: 24),
                        Text(
                          'Garment type',
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                        const SizedBox(height: 10),
                        Wrap(
                          spacing: 10,
                          runSpacing: 10,
                          children: [
                            for (final intent in KioskGarmentIntent.values)
                              ChoiceChip(
                                label: Text(intent.label),
                                selected: _intent == intent,
                                onSelected: (_) =>
                                    setState(() => _intent = intent),
                              ),
                          ],
                        ),
                        const SizedBox(height: 24),
                        Text(
                          'Photo style',
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                        const SizedBox(height: 10),
                        Wrap(
                          spacing: 10,
                          runSpacing: 10,
                          children: [
                            for (final type in KioskGarmentPhotoType.values)
                              ChoiceChip(
                                label: Text(type.label),
                                selected: _photoType == type,
                                onSelected: (_) =>
                                    setState(() => _photoType = type),
                              ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 22),
                ElevatedButton.icon(
                  key: const Key('continue-to-capture-scope'),
                  onPressed: _continue,
                  icon: const Icon(Icons.arrow_forward),
                  label: const Text('Continue'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _continue() async {
    final path = _pathController.text.trim();
    if (path.isEmpty) {
      setState(() => _error = 'Enter a garment image path.');
      return;
    }
    if (!await File(path).exists()) {
      setState(() => _error = 'Garment image was not found.');
      return;
    }
    widget.tryOnController.selectGarment(
      KioskGarmentInput(
        source: KioskGarmentInputSource.developmentLocalFile,
        localPath: path,
        intent: _intent,
        photoType: _photoType,
      ),
    );
    if (!mounted) {
      return;
    }
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => CaptureScopeScreen(
          controller: widget.captureController,
          tryOnController: widget.tryOnController,
        ),
      ),
    );
  }
}
