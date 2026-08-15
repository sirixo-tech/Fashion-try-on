import 'dart:io';

import 'package:flutter/material.dart';

import '../session/capture_scope.dart';
import '../session/capture_session_controller.dart';
import '../tryon/garment_image_picker.dart';
import '../tryon/kiosk_garment_input.dart';
import '../tryon/kiosk_try_on_session_controller.dart';
import '../theme/selfx_kiosk_theme.dart';
import '../upload/kiosk_customer_upload_controller.dart';
import 'kiosk_chrome.dart';
import 'photo_source_choice_screen.dart';

class GarmentSelectionScreen extends StatefulWidget {
  const GarmentSelectionScreen({
    super.key,
    required this.captureController,
    required this.tryOnController,
    required this.uploadController,
    this.garmentPicker = const FileSelectorGarmentImagePicker(),
  });

  final CaptureSessionController captureController;
  final KioskTryOnSessionController tryOnController;
  final KioskCustomerUploadController uploadController;
  final GarmentImagePicker garmentPicker;

  @override
  State<GarmentSelectionScreen> createState() => _GarmentSelectionScreenState();
}

class _GarmentSelectionScreenState extends State<GarmentSelectionScreen> {
  PickedGarmentImage? _selectedImage;
  String? _error;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    final existing = widget.tryOnController.garmentInput;
    if (existing != null) {
      _selectedImage = PickedGarmentImage(
        path: existing.localPath,
        fileName: existing.displayName,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final selectedImage = _selectedImage;
    return KioskScaffold(
      title: 'SelfX Kiosk',
      subtitle: 'Select garment',
      leading: IconButton(
        onPressed: () => Navigator.of(context).pop(),
        icon: const Icon(Icons.arrow_back),
      ),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 900),
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
                          'Select your garment',
                          style: Theme.of(context).textTheme.displaySmall,
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: 14),
                        Text(
                          'Choose a clear photo of the clothing you want to try on.',
                          style: Theme.of(context).textTheme.bodyLarge,
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: 28),
                        if (selectedImage == null)
                          _EmptyGarmentPicker(
                            busy: _busy,
                            onChoose: _chooseGarment,
                          )
                        else
                          _SelectedGarmentPreview(
                            image: selectedImage,
                            busy: _busy,
                            onChooseAnother: _chooseGarment,
                          ),
                        if (_error != null) ...[
                          const SizedBox(height: 18),
                          _GarmentError(message: _error!),
                        ],
                      ],
                    ),
                  ),
                ),
                if (selectedImage != null) ...[
                  const SizedBox(height: 22),
                  ElevatedButton.icon(
                    key: const Key('continue-to-photo-source'),
                    onPressed: _busy ? null : _continue,
                    icon: const Icon(Icons.arrow_forward),
                    label: const Text('Continue'),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _chooseGarment() async {
    if (_busy) {
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final picked = await widget.garmentPicker.pickGarmentImage();
      if (!mounted) {
        return;
      }
      if (picked == null) {
        setState(() => _busy = false);
        return;
      }
      final validation = await validateGarmentImagePath(picked.path);
      if (!mounted) {
        return;
      }
      setState(() {
        _busy = false;
        if (validation.valid) {
          _selectedImage = picked;
          _error = null;
        } else {
          _error = validation.message;
        }
      });
    } catch (_) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = 'Garment image could not be opened. Choose another image.';
        });
      }
    }
  }

  Future<void> _continue() async {
    final selectedImage = _selectedImage;
    if (selectedImage == null) {
      setState(() => _error = 'Choose a garment image to continue.');
      return;
    }
    final validation = await validateGarmentImagePath(selectedImage.path);
    if (!mounted) {
      return;
    }
    if (!validation.valid) {
      setState(() => _error = validation.message);
      return;
    }

    const intent = KioskGarmentIntent.auto;
    widget.tryOnController.selectGarment(
      KioskGarmentInput(
        source: KioskGarmentInputSource.developmentLocalFile,
        localPath: selectedImage.path,
        intent: intent,
        photoType: KioskGarmentPhotoType.auto,
      ),
    );
    widget.captureController.selectCaptureScope(captureScopeForIntent(intent));

    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => PhotoSourceChoiceScreen(
          captureController: widget.captureController,
          tryOnController: widget.tryOnController,
          uploadController: widget.uploadController,
        ),
      ),
    );
  }
}

class _EmptyGarmentPicker extends StatelessWidget {
  const _EmptyGarmentPicker({required this.busy, required this.onChoose});

  final bool busy;
  final VoidCallback onChoose;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: SelfxKioskTokens.background,
        border: Border.all(color: Theme.of(context).colorScheme.outline),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          children: [
            Icon(
              Icons.checkroom_outlined,
              size: 72,
              color: Theme.of(context).colorScheme.primary,
            ),
            const SizedBox(height: 18),
            Text(
              'Add a garment image',
              style: Theme.of(context).textTheme.titleLarge,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 10),
            Text(
              'JPEG, PNG and WebP images are supported.',
              style: Theme.of(context).textTheme.bodyMedium,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            ElevatedButton.icon(
              key: const Key('choose-garment-image'),
              onPressed: busy ? null : onChoose,
              icon: const Icon(Icons.image_search_outlined),
              label: Text(busy ? 'Opening' : 'Choose Garment Image'),
            ),
          ],
        ),
      ),
    );
  }
}

class _SelectedGarmentPreview extends StatelessWidget {
  const _SelectedGarmentPreview({
    required this.image,
    required this.busy,
    required this.onChooseAnother,
  });

  final PickedGarmentImage image;
  final bool busy;
  final VoidCallback onChooseAnother;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(10),
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: SelfxKioskTokens.background,
              border: Border.all(color: Theme.of(context).colorScheme.outline),
            ),
            child: SizedBox(
              height: 420,
              child: Image.file(
                File(image.path),
                key: const Key('selected-garment-preview'),
                fit: BoxFit.contain,
                errorBuilder: (_, _, _) {
                  return const Center(
                    child: Text('Garment image could not be previewed.'),
                  );
                },
              ),
            ),
          ),
        ),
        const SizedBox(height: 12),
        Text(
          image.fileName,
          textAlign: TextAlign.center,
          overflow: TextOverflow.ellipsis,
          style: Theme.of(context).textTheme.bodyMedium,
        ),
        const SizedBox(height: 18),
        OutlinedButton.icon(
          key: const Key('choose-another-garment'),
          onPressed: busy ? null : onChooseAnother,
          icon: const Icon(Icons.image_search_outlined),
          label: const Text('Choose Another'),
        ),
      ],
    );
  }
}

class _GarmentError extends StatelessWidget {
  const _GarmentError({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.errorContainer,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Text(
          message,
          textAlign: TextAlign.center,
          style: TextStyle(
            color: Theme.of(context).colorScheme.onErrorContainer,
          ),
        ),
      ),
    );
  }
}

CaptureScope captureScopeForIntent(KioskGarmentIntent intent) {
  return switch (intent) {
    KioskGarmentIntent.top => CaptureScope.top,
    KioskGarmentIntent.bottom => CaptureScope.bottom,
    KioskGarmentIntent.onePiece ||
    KioskGarmentIntent.fullOutfit ||
    KioskGarmentIntent.auto => CaptureScope.fullBody,
  };
}
