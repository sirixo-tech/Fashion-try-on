import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../experience/customer_experience.dart';
import '../experience/customer_media.dart';
import '../l10n/customer_copy.dart';
import 'customer_demo_catalog.dart';
import 'customer_experience_screens.dart';
import 'customer_generating_look.dart';
import 'customer_result_suggestions.dart';
import 'customer_theme.dart';

/// A compact entry point for personal Try-On; the shared experience owns all
/// session, consent, upload, credit and generation rules.
class CustomerQuickTryOn extends StatefulWidget {
  final CustomerExperience experience;
  final CustomerPhotoPicker picker;
  final VoidCallback onChooseProduct;
  final VoidCallback onViewSaved;
  const CustomerQuickTryOn({
    super.key,
    required this.experience,
    required this.picker,
    required this.onChooseProduct,
    required this.onViewSaved,
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

  Future<void> pick(String purpose, CustomerPhotoSource source) =>
      run(() async {
        if (purpose == 'GARMENT' && exp.storeMode) {
          widget.onChooseProduct();
          return;
        }
        if (!await ensureSession() || !mounted) return;
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

  Future<void> chooseSample(Json item, {required bool person}) => run(() async {
    if (!await ensureSession() || !mounted) return;
    if (person) {
      await exp.chooseDemoModel(item['id'] as String);
    } else {
      await exp.chooseDemoProduct(item['id'] as String);
    }
  });

  Widget sampleRail(String title, List<Json> items, {required bool person}) =>
      Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(bottom: 7),
            child: CustomerText(
              title,
              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700),
            ),
          ),
          SizedBox(
            height: 105,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: items.length,
              separatorBuilder: (_, _) => const SizedBox(width: 8),
              itemBuilder: (context, index) {
                final item = items[index];
                final id = item['id'] as String;
                final image = person
                    ? demoModelImage(id)
                    : demoProductImage(id);
                final selected = person
                    ? exp.demoModelId == id
                    : exp.demoProduct?['id'] == id;
                return InkWell(
                  onTap:
                      working ||
                          exp.busy ||
                          exp.generating ||
                          exp.hasUncertainRequest
                      ? null
                      : () => chooseSample(item, person: person),
                  borderRadius: BorderRadius.circular(12),
                  child: Container(
                    width: 78,
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: selected
                            ? CustomerColors.orange
                            : CustomerColors.line,
                        width: selected ? 2 : 1,
                      ),
                    ),
                    clipBehavior: Clip.antiAlias,
                    child: Stack(
                      fit: StackFit.expand,
                      children: [
                        if (image != null)
                          Image.asset(
                            image,
                            fit: person ? BoxFit.cover : BoxFit.contain,
                          ),
                        Align(
                          alignment: Alignment.bottomCenter,
                          child: Container(
                            width: double.infinity,
                            color: Colors.black54,
                            padding: const EdgeInsets.symmetric(
                              horizontal: 3,
                              vertical: 4,
                            ),
                            child: CustomerText(
                              item['name'] as String,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              textAlign: TextAlign.center,
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 10,
                              ),
                            ),
                          ),
                        ),
                        if (selected)
                          const Align(
                            alignment: Alignment.topRight,
                            child: Icon(
                              Icons.check_circle,
                              color: CustomerColors.orange,
                              size: 19,
                            ),
                          ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      );

  Future<void> primaryAction() => run(() async {
    if (exp.run?['status'] == 'COMPLETED' ||
        exp.run?['status'] == 'FAILED' ||
        exp.session == null) {
      await prepareCustomerStudio(context, exp);
    } else {
      await exp.generate();
    }
  });

  Future<void> trySuggested(Json item) => run(() async {
    await prepareCustomerStudio(
      context,
      exp,
      product: exp.storeMode ? item : null,
      demoProduct: exp.storeMode ? null : item,
    );
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
          final models = exp.demoModels;
          final products = exp.demoProducts;
          return Padding(
            padding: completed
                ? EdgeInsets.zero
                : EdgeInsets.fromLTRB(16, tight ? 6 : 10, 16, 10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (!completed) ...[
                  CustomerText(
                    'Try-On',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  SizedBox(height: tight ? 8 : 12),
                ],
                Expanded(
                  child: exp.generating
                      ? CustomerGeneratingLook(experience: exp)
                      : completed && result is Json
                      ? Stack(
                          children: [
                            Positioned.fill(
                              child: ColoredBox(
                                color: const Color(0xFF202329),
                                child: CustomerAssetImage(
                                  experience: exp,
                                  photo: CustomerPhoto.fromJson(result),
                                  fit: BoxFit.contain,
                                  backgroundColor: const Color(0xFF202329),
                                ),
                              ),
                            ),
                            Positioned.fill(
                              child: IgnorePointer(
                                child: DecoratedBox(
                                  decoration: const BoxDecoration(
                                    gradient: LinearGradient(
                                      begin: Alignment.topCenter,
                                      end: Alignment.bottomCenter,
                                      stops: [0, .35, .65, 1],
                                      colors: [
                                        Color(0x66000000),
                                        Colors.transparent,
                                        Color(0x44000000),
                                        Color(0xE6000000),
                                      ],
                                    ),
                                  ),
                                ),
                              ),
                            ),
                            const Positioned(
                              top: 14,
                              left: 16,
                              child: CustomerText(
                                'Your look',
                                style: TextStyle(
                                  color: Colors.white,
                                  fontSize: 19,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ),
                            Positioned(
                              left: 12,
                              right: 12,
                              bottom: 12,
                              child: Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  CustomerResultSuggestions(
                                    experience: exp,
                                    onSelect: trySuggested,
                                    disabled: blocked,
                                    compact: true,
                                  ),
                                  const SizedBox(height: 8),
                                  Row(
                                    children: [
                                      Expanded(
                                        child: FilledButton.tonalIcon(
                                          onPressed: blocked
                                              ? null
                                              : () => run(() async {
                                                  await downloadCustomerResult(
                                                    exp,
                                                    CustomerPhoto.fromJson(
                                                      result,
                                                    ),
                                                  );
                                                  if (context.mounted) {
                                                    ScaffoldMessenger.of(
                                                      context,
                                                    ).showSnackBar(
                                                      const SnackBar(
                                                        content: CustomerText(
                                                          'Look downloaded.',
                                                        ),
                                                      ),
                                                    );
                                                  }
                                                }),
                                          icon: const Icon(
                                            Icons.download_rounded,
                                            size: 18,
                                          ),
                                          label: const CustomerText('Download'),
                                        ),
                                      ),
                                      const SizedBox(width: 8),
                                      Expanded(
                                        child: FilledButton.tonalIcon(
                                          onPressed: widget.onViewSaved,
                                          icon: const Icon(
                                            Icons.bookmark_outline_rounded,
                                            size: 18,
                                          ),
                                          label: const CustomerText(
                                            'View in Saved',
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                  const SizedBox(height: 8),
                                  SizedBox(
                                    width: double.infinity,
                                    child: FilledButton.icon(
                                      onPressed: blocked ? null : primaryAction,
                                      icon: const Icon(
                                        Icons.auto_awesome_rounded,
                                      ),
                                      label: const CustomerText('New Try-On'),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        )
                      : Column(
                          children: [
                            SizedBox(
                              height: (size.maxHeight * .42).clamp(
                                180.0,
                                290.0,
                              ),
                              child: Row(
                                children: [
                                  Expanded(
                                    child: _PreviewCard(
                                      label: 'Person photo',
                                      experience: exp,
                                      photo: exp.person,
                                      bytes: exp.personPreview,
                                      icon: Icons.person_outline_rounded,
                                      assetPath: exp.demoModelId == null
                                          ? null
                                          : demoModelImage(exp.demoModelId!),
                                      onRemove: blocked || exp.person == null
                                          ? null
                                          : () => exp.clearSelectedPhoto(
                                              'PERSON',
                                            ),
                                      onUpload: blocked
                                          ? null
                                          : () => pick(
                                              'PERSON',
                                              CustomerPhotoSource.gallery,
                                            ),
                                      onCamera: blocked
                                          ? null
                                          : () => pick(
                                              'PERSON',
                                              CustomerPhotoSource.camera,
                                            ),
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
                                          (exp.product?['image']
                                                  as Map?)?['url']
                                              as String?,
                                      assetPath: exp.demoProduct == null
                                          ? null
                                          : demoProductImage(
                                              exp.demoProduct!['id'] as String,
                                            ),
                                      onRemove:
                                          blocked ||
                                              exp.outfit == null ||
                                              exp.storeMode
                                          ? null
                                          : () => exp.clearSelectedPhoto(
                                              'GARMENT',
                                            ),
                                      onUpload: blocked
                                          ? null
                                          : () => pick(
                                              'GARMENT',
                                              CustomerPhotoSource.gallery,
                                            ),
                                      onCamera: blocked || exp.storeMode
                                          ? null
                                          : () => pick(
                                              'GARMENT',
                                              CustomerPhotoSource.camera,
                                            ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            if (!exp.storeMode) ...[
                              const SizedBox(height: 12),
                              Expanded(
                                child: ListView(
                                  children: [
                                    if (exp.demoLoading)
                                      const LinearProgressIndicator(),
                                    if (exp.demoError != null)
                                      CustomerText(exp.demoError!),
                                    if (models.isNotEmpty ||
                                        products.isNotEmpty) ...[
                                      const CustomerText(
                                        'Try our samples',
                                        style: TextStyle(
                                          fontWeight: FontWeight.w700,
                                          fontSize: 14,
                                        ),
                                      ),
                                      const SizedBox(height: 8),
                                      if (models.isNotEmpty)
                                        sampleRail(
                                          'People',
                                          models,
                                          person: true,
                                        ),
                                      const SizedBox(height: 12),
                                      if (products.isNotEmpty)
                                        sampleRail(
                                          'Garments',
                                          products,
                                          person: false,
                                        ),
                                    ],
                                  ],
                                ),
                              ),
                            ],
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
                if (!completed) ...[
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
  final String? assetPath;
  final VoidCallback? onUpload, onCamera;
  final VoidCallback? onRemove;
  const _PreviewCard({
    required this.label,
    required this.experience,
    required this.photo,
    required this.bytes,
    required this.icon,
    this.fallback,
    this.imageUrl,
    this.assetPath,
    this.onUpload,
    this.onCamera,
    this.onRemove,
  });

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(7),
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
        const SizedBox(height: 5),
        Expanded(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: Stack(
              fit: StackFit.expand,
              children: [
                bytes != null
                    ? Image.memory(bytes!, fit: BoxFit.cover)
                    : assetPath != null
                    ? Image.asset(assetPath!, fit: BoxFit.cover)
                    : photo != null
                    ? CustomerAssetImage(
                        experience: experience,
                        photo: photo!,
                        fit: BoxFit.cover,
                      )
                    : imageUrl != null
                    ? Image.network(
                        imageUrl!,
                        fit: BoxFit.cover,
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
                if (onRemove != null)
                  Align(
                    alignment: Alignment.topRight,
                    child: IconButton.filledTonal(
                      onPressed: onRemove,
                      tooltip: 'Remove from this Try-On',
                      icon: const Icon(Icons.close_rounded, size: 18),
                      style: IconButton.styleFrom(
                        minimumSize: const Size(30, 30),
                        padding: EdgeInsets.zero,
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
        if (onUpload != null || onCamera != null) ...[
          const SizedBox(height: 5),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: [
              Expanded(
                child: TextButton.icon(
                  onPressed: onUpload,
                  style: TextButton.styleFrom(
                    padding: const EdgeInsets.symmetric(horizontal: 2),
                    minimumSize: const Size(0, 32),
                  ),
                  icon: const Icon(Icons.file_upload_outlined, size: 15),
                  label: CustomerText(
                    imageUrl != null ? 'Choose' : 'Upload',
                    maxLines: 1,
                    style: const TextStyle(fontSize: 10),
                  ),
                ),
              ),
              if (onCamera != null)
                Expanded(
                  child: TextButton.icon(
                    onPressed: onCamera,
                    style: TextButton.styleFrom(
                      padding: const EdgeInsets.symmetric(horizontal: 2),
                      minimumSize: const Size(0, 32),
                    ),
                    icon: const Icon(Icons.camera_alt_outlined, size: 15),
                    label: const CustomerText(
                      'Camera',
                      maxLines: 1,
                      style: TextStyle(fontSize: 10),
                    ),
                  ),
                ),
            ],
          ),
        ],
      ],
    ),
  );
}
