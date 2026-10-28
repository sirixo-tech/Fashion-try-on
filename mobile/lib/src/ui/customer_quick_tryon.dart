import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../experience/customer_experience.dart';
import '../experience/customer_media.dart';
import '../l10n/customer_copy.dart';
import 'customer_experience_screens.dart';
import 'customer_theme.dart';

/// A compact entry point for personal Try-On; the shared experience owns all
/// session, consent, upload, credit and generation rules.
class CustomerQuickTryOn extends StatefulWidget {
  final CustomerExperience experience;
  final CustomerPhotoPicker picker;
  final VoidCallback onChooseProduct;
  const CustomerQuickTryOn({
    super.key,
    required this.experience,
    required this.picker,
    required this.onChooseProduct,
  });

  @override
  State<CustomerQuickTryOn> createState() => _CustomerQuickTryOnState();
}

class _CustomerQuickTryOnState extends State<CustomerQuickTryOn> {
  bool working = false;
  String? error;
  CustomerExperience get exp => widget.experience;

  Future<void> run(Future<void> Function() action) async {
    if (working || exp.busy) return;
    setState(() {
      working = true;
      error = null;
    });
    try {
      await action();
    } catch (caught) {
      if (mounted) setState(() => error = CustomerExperience.message(caught));
    } finally {
      if (mounted) setState(() => working = false);
    }
  }

  Future<bool> ensureSession() async {
    if (exp.session != null &&
        exp.run?['status'] != 'COMPLETED' &&
        exp.run?['status'] != 'FAILED') {
      return true;
    }
    return prepareCustomerStudio(context, exp);
  }

  Future<void> pick(String purpose) => run(() async {
    if (purpose == 'GARMENT' && exp.storeMode) {
      widget.onChooseProduct();
      return;
    }
    if (!await ensureSession() || !mounted) return;
    final source = await showModalBottomSheet<CustomerPhotoSource>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: const CustomerText('Choose from photos'),
              onTap: () => Navigator.pop(context, CustomerPhotoSource.gallery),
            ),
            ListTile(
              leading: const Icon(Icons.camera_alt_outlined),
              title: const CustomerText('Take a photo'),
              onTap: () => Navigator.pop(context, CustomerPhotoSource.camera),
            ),
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
    if (source == null || !mounted) return;
    final sessionId = exp.session?['id'];
    final photo = await widget.picker.pick(source);
    if (photo == null ||
        !mounted ||
        sessionId == null ||
        exp.session?['id'] != sessionId) {
      return;
    }
    await exp.upload(purpose, photo.bytes, photo.mime);
  });

  Future<void> primaryAction() => run(() async {
    if (exp.run?['status'] == 'COMPLETED' ||
        exp.run?['status'] == 'FAILED' ||
        exp.session == null) {
      await prepareCustomerStudio(context, exp);
    } else {
      await exp.generate();
    }
  });

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: exp,
    builder: (context, _) {
      final result = exp.run?['result'];
      final completed = exp.run?['status'] == 'COMPLETED';
      final failed = exp.run?['status'] == 'FAILED';
      final blocked =
          working || exp.busy || exp.generating || exp.hasUncertainRequest;
      return LayoutBuilder(
        builder: (context, size) {
          final tight = size.maxHeight < 550;
          return Padding(
            padding: EdgeInsets.fromLTRB(20, tight ? 8 : 16, 20, 14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                CustomerText(
                  'Try-On',
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.headlineMedium,
                ),
                SizedBox(height: tight ? 8 : 14),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        style: OutlinedButton.styleFrom(
                          padding: const EdgeInsets.symmetric(horizontal: 6),
                          minimumSize: const Size(0, 44),
                        ),
                        onPressed: blocked ? null : () => pick('PERSON'),
                        icon: const Icon(
                          Icons.person_outline_rounded,
                          size: 19,
                        ),
                        label: const CustomerText(
                          'Person photo',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(fontSize: 12),
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: OutlinedButton.icon(
                        style: OutlinedButton.styleFrom(
                          padding: const EdgeInsets.symmetric(horizontal: 6),
                          minimumSize: const Size(0, 44),
                        ),
                        onPressed: blocked ? null : () => pick('GARMENT'),
                        icon: const Icon(Icons.checkroom_outlined, size: 19),
                        label: CustomerText(
                          exp.storeMode ? 'Choose product' : 'Garment photo',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 12),
                        ),
                      ),
                    ),
                  ],
                ),
                SizedBox(height: tight ? 10 : 16),
                Expanded(
                  child: exp.generating
                      ? Center(
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const CircularProgressIndicator(),
                              const SizedBox(height: 18),
                              const CustomerText('Creating your look…'),
                            ],
                          ),
                        )
                      : completed && result is Json
                      ? _PreviewCard(
                          label: 'Your look',
                          experience: exp,
                          photo: CustomerPhoto.fromJson(result),
                          bytes: null,
                          icon: Icons.auto_awesome_rounded,
                        )
                      : Row(
                          children: [
                            Expanded(
                              child: _PreviewCard(
                                label: 'Person photo',
                                experience: exp,
                                photo: exp.person,
                                bytes: exp.personPreview,
                                icon: Icons.person_outline_rounded,
                              ),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: _PreviewCard(
                                label: exp.storeMode
                                    ? 'Store product'
                                    : 'Garment photo',
                                experience: exp,
                                photo: exp.outfit,
                                bytes: exp.outfitPreview,
                                icon: Icons.checkroom_outlined,
                                fallback: exp.product?['name'] as String?,
                                imageUrl:
                                    (exp.product?['image'] as Map?)?['url']
                                        as String?,
                              ),
                            ),
                          ],
                        ),
                ),
                if (error != null || exp.avatarError != null || failed) ...[
                  const SizedBox(height: 8),
                  Text(
                    error ??
                        exp.avatarError ??
                        exp.run?['message'] as String? ??
                        'This Try-On did not finish.',
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: Color(0xFF9A3025)),
                  ),
                ],
                SizedBox(height: tight ? 8 : 14),
                FilledButton.icon(
                  onPressed:
                      working ||
                          exp.busy ||
                          exp.generating ||
                          (!completed &&
                              !failed &&
                              exp.session != null &&
                              !exp.canGenerate &&
                              !exp.hasUncertainRequest)
                      ? null
                      : primaryAction,
                  icon: const Icon(Icons.auto_awesome_rounded),
                  label: CustomerText(
                    completed || failed
                        ? 'New Try-On'
                        : exp.hasUncertainRequest
                        ? 'Check my request'
                        : 'Try it on',
                  ),
                ),
              ],
            ),
          );
        },
      );
    },
  );
}

class _PreviewCard extends StatelessWidget {
  final String label;
  final CustomerExperience experience;
  final CustomerPhoto? photo;
  final Uint8List? bytes;
  final IconData icon;
  final String? fallback;
  final String? imageUrl;
  const _PreviewCard({
    required this.label,
    required this.experience,
    required this.photo,
    required this.bytes,
    required this.icon,
    this.fallback,
    this.imageUrl,
  });

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(10),
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(20),
      border: Border.all(color: CustomerColors.line),
    ),
    child: Column(
      children: [
        CustomerText(
          label,
          textAlign: TextAlign.center,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 12),
        ),
        const SizedBox(height: 8),
        Expanded(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: SizedBox.expand(
              child: bytes != null
                  ? Image.memory(bytes!, fit: BoxFit.contain)
                  : photo != null
                  ? CustomerAssetImage(
                      experience: experience,
                      photo: photo!,
                      fit: BoxFit.contain,
                    )
                  : imageUrl != null
                  ? Image.network(
                      imageUrl!,
                      fit: BoxFit.contain,
                      errorBuilder: (_, _, _) => Center(
                        child: Icon(icon, color: CustomerColors.muted),
                      ),
                    )
                  : Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(icon, size: 40, color: CustomerColors.muted),
                          if (fallback != null) ...[
                            const SizedBox(height: 8),
                            Text(
                              fallback!,
                              maxLines: 2,
                              textAlign: TextAlign.center,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ],
                        ],
                      ),
                    ),
            ),
          ),
        ),
      ],
    ),
  );
}
