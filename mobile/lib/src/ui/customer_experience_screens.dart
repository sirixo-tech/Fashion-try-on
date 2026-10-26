import '../l10n/customer_copy.dart';
import 'dart:async';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import '../experience/customer_experience.dart';
import '../experience/customer_media.dart';
import '../experience/result_export.dart';
import 'customer_theme.dart';
import 'customer_skeleton.dart';

Future<void> openCustomerStudio(
  BuildContext context,
  CustomerExperience experience,
  CustomerPhotoPicker picker, {
  Json? product,
}) async {
  if (!experience.generating && !experience.hasUncertainRequest) {
    if (!experience.available) {
      await customerInfo(
        context,
        'Your fitting room',
        'Try-On is temporarily unavailable. Refresh Home and try again shortly.',
      );
      return;
    }
    if (!experience.storeMode && (experience.remaining ?? 0) < 1) {
      await Navigator.push<void>(
        context,
        MaterialPageRoute(
          builder: (_) => CustomerPlansScreen(experience: experience),
        ),
      );
      return;
    }
    final accepted = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(24, 8, 24, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              CustomerText(
                'Your photos. Your choice.',
                style: Theme.of(context).textTheme.headlineLarge,
              ),
              const SizedBox(height: 16),
              CustomerText(experience.summary!['consentStatement'] as String),
              if (experience.storeMode) ...[
                const SizedBox(height: 16),
                CustomerNotice(
                  experience.summary!['storeConsentStatement'] as String,
                ),
              ],
              const SizedBox(height: 16),
              const CustomerText(
                'Choose photos you own or have permission to use. Virtual Try-On is a visual preview; fit and detail can vary.',
              ),
              const SizedBox(height: 24),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: () => Navigator.pop(context, true),
                  child: const CustomerText('Agree & continue'),
                ),
              ),
              Center(
                child: TextButton(
                  onPressed: () => Navigator.pop(context, false),
                  child: const CustomerText('Not now'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
    if (accepted != true || !context.mounted) return;
    await experience.begin(storeProduct: product);
  }
  if (!context.mounted || experience.session == null) return;
  await Navigator.push<void>(
    context,
    MaterialPageRoute(
      builder: (_) => CustomerStudio(experience: experience, picker: picker),
    ),
  );
}

class CustomerPlansScreen extends StatelessWidget {
  final CustomerExperience experience;
  const CustomerPlansScreen({super.key, required this.experience});
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const CustomerText('Plans & credits')),
    body: ListenableBuilder(
      listenable: experience,
      builder: (context, _) {
        final trial = experience.summary?['trial'] as Map?;
        return RefreshIndicator(
          onRefresh: experience.refresh,
          child: ListView(
            padding: const EdgeInsets.all(24),
            children: [
              CustomerText(
                'A little more possibility.',
                style: Theme.of(context).textTheme.headlineLarge,
              ),
              const SizedBox(height: 12),
              const CustomerText(
                'Your personal allowance stays with your SelfX account.',
              ),
              const SizedBox(height: 28),
              PremiumPanel(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(
                      Icons.auto_awesome_rounded,
                      color: CustomerColors.orange,
                      size: 32,
                    ),
                    const SizedBox(height: 20),
                    CustomerText(
                      'Free trial',
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                    const SizedBox(height: 8),
                    CustomerText(
                      '${experience.remaining ?? '—'} Try-Ons left',
                      style: Theme.of(context).textTheme.headlineLarge,
                    ),
                    const SizedBox(height: 16),
                    CustomerText(
                      '${trial?['used'] ?? 0} used · ${trial?['reserved'] ?? 0} in progress · ${trial?['granted'] ?? '—'} granted',
                    ),
                    const SizedBox(height: 18),
                    const CustomerText(
                      'One credit creates one saved look. Failed generations return the reserved credit. This free trial is granted once per account.',
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 20),
              const CustomerNotice(
                'Personal paid plans are not available in this version. Store subscriptions do not apply to your personal account.',
              ),
              const SizedBox(height: 24),
              const CustomerText(
                'Visiting a participating Store?',
                style: TextStyle(fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 8),
              const CustomerText(
                'Scan its QR from Home to explore its products. The Store pays for eligible Try-Ons in that session; your own credits stay separate.',
              ),
              if (experience.error != null) ...[
                const SizedBox(height: 18),
                CustomerNotice(experience.error!, error: true),
              ],
            ],
          ),
        );
      },
    ),
  );
}

class CustomerStudio extends StatefulWidget {
  final CustomerExperience experience;
  final CustomerPhotoPicker picker;
  const CustomerStudio({
    super.key,
    required this.experience,
    required this.picker,
  });
  @override
  State<CustomerStudio> createState() => _CustomerStudioState();
}

class _CustomerStudioState extends State<CustomerStudio> {
  bool picking = false;
  String? error;
  CustomerExperience get exp => widget.experience;
  Future<void> action(Future<void> Function() operation) async {
    if (picking || exp.busy) return;
    setState(() {
      picking = true;
      error = null;
    });
    try {
      await operation();
    } catch (e) {
      if (mounted) setState(() => error = CustomerExperience.message(e));
    } finally {
      if (mounted) setState(() => picking = false);
    }
  }

  Future<void> pick(String purpose) => action(() async {
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
  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: exp,
    builder: (context, _) {
      final result = exp.run?['result'];
      return Scaffold(
        appBar: AppBar(title: const CustomerText('Your fitting room')),
        body: ListView(
          padding: const EdgeInsets.fromLTRB(24, 8, 24, 30),
          children: [
            if (exp.generating) ...[
              const SizedBox(height: 24),
              const Center(
                child: SizedBox(
                  width: 70,
                  height: 70,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              ),
              const SizedBox(height: 32),
              CustomerText(
                'Creating your look…',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.headlineLarge,
              ),
              const SizedBox(height: 16),
              const CustomerText(
                'You can return to Home. Your result will appear in Saved when it is ready.',
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 24),
              _payer(exp),
              if (exp.pollError != null) ...[
                const SizedBox(height: 16),
                CustomerNotice(exp.pollError!, error: true),
                TextButton(
                  onPressed: exp.checkRun,
                  child: const CustomerText('Check progress'),
                ),
              ],
            ] else if (result is Json) ...[
              CustomerText(
                'Still entirely you.',
                style: Theme.of(context).textTheme.headlineLarge,
              ),
              const SizedBox(height: 16),
              ClipRRect(
                borderRadius: BorderRadius.circular(28),
                child: AspectRatio(
                  aspectRatio: .72,
                  child: CustomerAssetImage(
                    experience: exp,
                    photo: CustomerPhoto.fromJson(result),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              const CustomerNotice(
                'Saved automatically for 30 days. Download a copy to keep it on your device.',
              ),
              if (exp.person != null &&
                  exp.person!.expiresAt.isAfter(DateTime.now())) ...[
                const SizedBox(height: 20),
                const CustomerText(
                  'Your original',
                  style: TextStyle(fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 10),
                SizedBox(
                  height: 160,
                  child: CustomerAssetImage(
                    experience: exp,
                    photo: exp.person!,
                    fit: BoxFit.contain,
                  ),
                ),
              ],
              const SizedBox(height: 20),
              FilledButton.icon(
                onPressed: picking
                    ? null
                    : () => action(() async {
                        await downloadCustomerResult(
                          exp,
                          CustomerPhoto.fromJson(result),
                        );
                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                              content: CustomerText('Look downloaded.'),
                            ),
                          );
                        }
                      }),
                icon: const Icon(Icons.download_rounded),
                label: const CustomerText('Download look'),
              ),
              TextButton(
                onPressed: () => Navigator.pop(context),
                child: const CustomerText('Back to Home'),
              ),
            ] else if (exp.run?['status'] == 'FAILED' &&
                exp.person == null) ...[
              CustomerNotice(
                exp.run!['message'] as String? ??
                    'This Try-On did not finish. Start again from Home.',
                error: true,
              ),
              const SizedBox(height: 24),
              FilledButton(
                onPressed: () => Navigator.pop(context),
                child: const CustomerText('Back to Home'),
              ),
            ] else ...[
              CustomerText(
                'Make it your own.',
                style: Theme.of(context).textTheme.headlineLarge,
              ),
              const SizedBox(height: 12),
              const CustomerText(
                'A clear photo of you. One outfit you love. A new possibility.',
              ),
              const SizedBox(height: 20),
              _payer(exp),
              const SizedBox(height: 20),
              _PhotoCard(
                label: 'Your photo',
                hint:
                    'Face the camera, with the area you want to try on visible.',
                bytes: exp.personPreview,
                disabled: picking || exp.busy || exp.hasUncertainRequest,
                onTap: () => pick('PERSON'),
              ),
              const SizedBox(height: 16),
              if (exp.storeMode)
                PremiumPanel(
                  child: Row(
                    children: [
                      const Icon(Icons.storefront_outlined),
                      const SizedBox(width: 12),
                      Expanded(
                        child: CustomerText(
                          exp.product?['name'] as String? ?? 'Store product',
                        ),
                      ),
                    ],
                  ),
                )
              else
                _PhotoCard(
                  label: 'Your outfit',
                  hint:
                      'Choose a clear clothing photo or photograph an outfit.',
                  bytes: exp.outfitPreview,
                  disabled: picking || exp.busy || exp.hasUncertainRequest,
                  onTap: () => pick('GARMENT'),
                ),
              const SizedBox(height: 16),
              const CustomerText(
                'Use good light and a plain background. Original photos expire within 7 days.',
                style: TextStyle(fontSize: 12, color: CustomerColors.muted),
              ),
              if (exp.run?['status'] == 'FAILED') ...[
                const SizedBox(height: 16),
                CustomerNotice(exp.run!['message'] as String, error: true),
              ],
              if (exp.hasUncertainRequest) ...[
                const SizedBox(height: 16),
                const CustomerNotice(
                  'Your request may already be processing. Check it again to continue safely; we will reuse the same request.',
                ),
              ],
              const SizedBox(height: 24),
              FilledButton.icon(
                onPressed:
                    picking || (!exp.canGenerate && !exp.hasUncertainRequest)
                    ? null
                    : () => action(exp.generate),
                icon: const Icon(Icons.auto_awesome_rounded),
                label: CustomerText(
                  exp.hasUncertainRequest
                      ? 'Check my request'
                      : 'Try on this outfit',
                ),
              ),
            ],
            if (exp.busy) ...[
              const SizedBox(height: 16),
              const LinearProgressIndicator(),
              const SizedBox(height: 8),
              const CustomerText('Please wait…', textAlign: TextAlign.center),
            ],
            if (error != null) ...[
              const SizedBox(height: 16),
              CustomerNotice(error!, error: true),
            ],
          ],
        ),
      );
    },
  );
}

Widget _payer(CustomerExperience exp) => CustomerNotice(
  exp.run?['payer'] == 'STORE' && !exp.storeMode
      ? 'Store-sponsored Try-On. The Store pays; your personal credits are not used.'
      : exp.storeMode
      ? '${(exp.storeVisit!['store'] as Map)['name']} pays for this Try-On. Your personal credits will not be used.'
      : 'Personal Try-On · ${exp.remaining ?? 0} free trial credits left. One credit is used when a result is saved.',
);

class _PhotoCard extends StatelessWidget {
  final String label, hint;
  final Uint8List? bytes;
  final bool disabled;
  final VoidCallback onTap;
  const _PhotoCard({
    required this.label,
    required this.hint,
    required this.bytes,
    required this.disabled,
    required this.onTap,
  });
  @override
  Widget build(BuildContext context) => PremiumPanel(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (bytes != null) ...[
          ClipRRect(
            borderRadius: BorderRadius.circular(18),
            child: Image.memory(
              bytes!,
              height: 200,
              width: double.infinity,
              fit: BoxFit.contain,
              gaplessPlayback: true,
            ),
          ),
          const SizedBox(height: 12),
        ],
        CustomerText(label, style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 6),
        CustomerText(
          hint,
          style: const TextStyle(fontSize: 13, color: CustomerColors.muted),
        ),
        const SizedBox(height: 14),
        OutlinedButton.icon(
          onPressed: disabled ? null : onTap,
          icon: const Icon(Icons.add_a_photo_outlined, size: 20),
          label: CustomerText(bytes == null ? 'Add $label' : 'Change $label'),
        ),
      ],
    ),
  );
}

Future<void> downloadCustomerResult(
  CustomerExperience exp,
  CustomerPhoto photo,
) async {
  final bytes = await exp.auth.authorizedDownload(
    '/try-on/assets/${photo.id}/download',
  );
  await exportResult(bytes, 'SelfX-${photo.id}');
}

class CustomerAssetImage extends StatefulWidget {
  final CustomerExperience experience;
  final CustomerPhoto photo;
  final BoxFit fit;
  const CustomerAssetImage({
    super.key,
    required this.experience,
    required this.photo,
    this.fit = BoxFit.cover,
  });
  @override
  State<CustomerAssetImage> createState() => _CustomerAssetImageState();
}

class _CustomerAssetImageState extends State<CustomerAssetImage> {
  String? url;
  bool failed = false;
  int request = 0;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) unawaited(load());
    });
  }

  @override
  void didUpdateWidget(CustomerAssetImage old) {
    super.didUpdateWidget(old);
    if (old.photo.id != widget.photo.id) {
      url = null;
      unawaited(load());
    }
  }

  Future<void> load() async {
    final id = ++request;
    try {
      final data = await widget.experience.auth.authorized(
        '/try-on/assets/${widget.photo.id}',
      );
      if (mounted && id == request) {
        setState(() {
          url = data['url'] as String;
          failed = false;
        });
      }
    } catch (_) {
      if (mounted && id == request) setState(() => failed = true);
    }
  }

  @override
  Widget build(BuildContext context) => ColoredBox(
    color: const Color(0xFFF0E7DA),
    child: failed
        ? Center(
            child: TextButton.icon(
              onPressed: () {
                setState(() {
                  failed = false;
                  url = null;
                });
                unawaited(load());
              },
              icon: const Icon(Icons.refresh),
              label: const CustomerText('Reload photo'),
            ),
          )
        : url == null
        ? const Center(child: CircularProgressIndicator(strokeWidth: 2))
        : Image.network(
            url!,
            fit: widget.fit,
            gaplessPlayback: true,
            loadingBuilder: (context, child, progress) => progress == null
                ? child
                : const Center(
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
            errorBuilder: (_, e, stack) => Center(
              child: TextButton.icon(
                onPressed: () {
                  setState(() => url = null);
                  unawaited(load());
                },
                icon: const Icon(Icons.refresh),
                label: const CustomerText('Reload photo'),
              ),
            ),
          ),
  );
}

class CustomerSavedScreen extends StatefulWidget {
  final CustomerExperience experience;
  final VoidCallback onHome;
  const CustomerSavedScreen({
    super.key,
    required this.experience,
    required this.onHome,
  });
  @override
  State<CustomerSavedScreen> createState() => _CustomerSavedScreenState();
}

class _CustomerSavedScreenState extends State<CustomerSavedScreen> {
  String? error;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) unawaited(load());
    });
  }

  Future<void> load({bool more = false}) async {
    try {
      await widget.experience.loadSaved(more: more);
      if (mounted) setState(() => error = null);
    } catch (e) {
      if (mounted) setState(() => error = CustomerExperience.message(e));
    }
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: widget.experience,
    builder: (context, _) {
      final exp = widget.experience;
      if (exp.savedLoading && exp.looks.isEmpty) {
        return const CustomerContentSkeleton(
          layout: CustomerSkeletonLayout.home,
        );
      }
      return RefreshIndicator(
        onRefresh: load,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(24, 10, 24, 28),
          children: [
            CustomerText(
              'A collection of you.',
              style: Theme.of(context).textTheme.headlineLarge,
            ),
            const SizedBox(height: 12),
            const CustomerText(
              'Your tried-on outfits and results. Yours for 30 days.',
              style: TextStyle(color: CustomerColors.muted),
            ),
            const SizedBox(height: 24),
            if (error != null) ...[
              CustomerNotice(error!, error: true),
              TextButton(
                onPressed: load,
                child: const CustomerText('Try again'),
              ),
            ],
            if (exp.looks.isEmpty && error == null) ...[
              const SizedBox(height: 40),
              const Center(
                child: Icon(
                  Icons.bookmarks_outlined,
                  size: 54,
                  color: CustomerColors.orange,
                ),
              ),
              const SizedBox(height: 24),
              CustomerText(
                'Your first look\nis yet to come.',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.headlineLarge,
              ),
              const SizedBox(height: 16),
              const CustomerText(
                'Create a Try-On to start your collection. Download favourite results before they expire.',
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 24),
              OutlinedButton(
                onPressed: widget.onHome,
                child: const CustomerText('Back to Home'),
              ),
            ],
            for (final look in exp.looks)
              Padding(
                padding: const EdgeInsets.only(bottom: 20),
                child: PremiumPanel(
                  padding: EdgeInsets.zero,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      ClipRRect(
                        borderRadius: const BorderRadius.vertical(
                          top: Radius.circular(26),
                        ),
                        child: AspectRatio(
                          aspectRatio: .9,
                          child: CustomerAssetImage(
                            experience: exp,
                            photo: look.result,
                          ),
                        ),
                      ),
                      Padding(
                        padding: const EdgeInsets.all(18),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              look.nameIsDefault
                                  ? tr(context, 'Your look')
                                  : look.name,
                              style: Theme.of(context).textTheme.titleLarge,
                            ),
                            const SizedBox(height: 6),
                            CustomerText(
                              'Expires ${_date(context, look.expiresAt)} · ${look.payer == 'STORE' ? 'Store sponsored' : 'Personal'}',
                              style: const TextStyle(
                                fontSize: 12,
                                color: CustomerColors.muted,
                              ),
                            ),
                            const SizedBox(height: 12),
                            OutlinedButton(
                              onPressed: () async {
                                await Navigator.push<void>(
                                  context,
                                  MaterialPageRoute(
                                    builder: (_) => CustomerSavedLookScreen(
                                      experience: exp,
                                      look: look,
                                    ),
                                  ),
                                );
                                await load();
                              },
                              child: const CustomerText('View look'),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            if (exp.hasMoreLooks)
              OutlinedButton(
                onPressed: exp.savedLoading ? null : () => load(more: true),
                child: CustomerText(
                  exp.savedLoading ? 'Loading…' : 'Load more looks',
                ),
              ),
          ],
        ),
      );
    },
  );
}

class CustomerSavedLookScreen extends StatefulWidget {
  final CustomerExperience experience;
  final CustomerLook look;
  const CustomerSavedLookScreen({
    super.key,
    required this.experience,
    required this.look,
  });
  @override
  State<CustomerSavedLookScreen> createState() =>
      _CustomerSavedLookScreenState();
}

class _CustomerSavedLookScreenState extends State<CustomerSavedLookScreen> {
  bool busy = false;
  String? error;
  Future<void> action(Future<void> Function() operation) async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await operation();
    } catch (e) {
      if (mounted) setState(() => error = CustomerExperience.message(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: Text(
        widget.look.nameIsDefault ? tr(context, 'Your look') : widget.look.name,
      ),
    ),
    body: ListView(
      padding: const EdgeInsets.all(24),
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(28),
          child: AspectRatio(
            aspectRatio: .72,
            child: CustomerAssetImage(
              experience: widget.experience,
              photo: widget.look.result,
            ),
          ),
        ),
        const SizedBox(height: 16),
        CustomerText(
          'Available until ${_date(context, widget.look.expiresAt)}',
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 24),
        if (widget.look.person != null || widget.look.outfit != null) ...[
          CustomerText(
            'The starting point',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              for (final photo in [
                widget.look.person,
                widget.look.outfit,
              ].whereType<CustomerPhoto>())
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.all(4),
                    child: SizedBox(
                      height: 170,
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(20),
                        child: CustomerAssetImage(
                          experience: widget.experience,
                          photo: photo,
                          fit: BoxFit.contain,
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 12),
          const CustomerText(
            'Original photos are available for up to 7 days.',
            style: TextStyle(fontSize: 12, color: CustomerColors.muted),
          ),
          const SizedBox(height: 24),
        ],
        FilledButton.icon(
          onPressed: busy
              ? null
              : () => action(() async {
                  await downloadCustomerResult(
                    widget.experience,
                    widget.look.result,
                  );
                  if (context.mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: CustomerText('Look downloaded.')),
                    );
                  }
                }),
          icon: const Icon(Icons.download_rounded),
          label: const CustomerText('Download look'),
        ),
        TextButton(
          onPressed: busy
              ? null
              : () => action(() async {
                  final confirmed = await showDialog<bool>(
                    context: context,
                    builder: (context) => AlertDialog(
                      title: const CustomerText('Delete this look?'),
                      content: const CustomerText(
                        'This removes the saved result. Used credits are not restored.',
                      ),
                      actions: [
                        TextButton(
                          onPressed: () => Navigator.pop(context, false),
                          child: const CustomerText('Cancel'),
                        ),
                        TextButton(
                          onPressed: () => Navigator.pop(context, true),
                          child: const CustomerText('Delete'),
                        ),
                      ],
                    ),
                  );
                  if (confirmed == true) {
                    await widget.experience.deleteLook(widget.look);
                    if (context.mounted) Navigator.pop(context);
                  }
                }),
          child: const CustomerText('Delete look'),
        ),
        if (error != null) CustomerNotice(error!, error: true),
      ],
    ),
  );
}

String _date(BuildContext context, DateTime value) =>
    CustomerCopy.of(context).date(value);

class CustomerStoreCatalog extends StatelessWidget {
  final CustomerExperience experience;
  final void Function(Json) onTryOn;
  final VoidCallback onLeave;
  final Future<void> Function() onRefresh;
  final VoidCallback onMore;
  const CustomerStoreCatalog({
    super.key,
    required this.experience,
    required this.onTryOn,
    required this.onLeave,
    required this.onRefresh,
    required this.onMore,
  });
  @override
  Widget build(BuildContext context) {
    final store = experience.storeVisit!['store'] as Map;
    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          const CustomerText(
            'YOUR STORE VISIT',
            style: TextStyle(
              fontSize: 10,
              letterSpacing: 2,
              color: CustomerColors.muted,
            ),
          ),
          const SizedBox(height: 12),
          Text(
            store['name'] as String,
            style: Theme.of(context).textTheme.headlineLarge,
          ),
          const SizedBox(height: 16),
          CustomerNotice(
            'The Store pays · Up to ${experience.storeVisit!['dailyCustomerLimit']} Try-Ons per day. Your personal credits will not be used.',
          ),
          TextButton(
            onPressed: onLeave,
            child: const CustomerText('Leave Store session'),
          ),
          const SizedBox(height: 16),
          if (experience.generating || experience.hasUncertainRequest)
            FilledButton(
              onPressed: () => onTryOn({}),
              child: const CustomerText('Open current Try-On'),
            ),
          if (experience.productsLoading && experience.products.isEmpty)
            const LinearProgressIndicator(),
          if (experience.productsError != null) ...[
            CustomerNotice(experience.productsError!, error: true),
            TextButton(
              onPressed: onRefresh,
              child: const CustomerText('Reload products'),
            ),
          ],
          if (!experience.productsLoading &&
              experience.productsError == null &&
              experience.products.isEmpty)
            const PremiumPanel(
              child: CustomerText(
                'No eligible products are available yet. Ask the Store to enable its products for Try-On.',
              ),
            ),
          for (final product in experience.products)
            Padding(
              padding: const EdgeInsets.only(bottom: 20),
              child: PremiumPanel(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if ((product['image'] as Map?)?['url']
                        case final String url)
                      ClipRRect(
                        borderRadius: BorderRadius.circular(20),
                        child: Image.network(
                          url,
                          height: 240,
                          width: double.infinity,
                          fit: BoxFit.contain,
                          errorBuilder: (_, e, stack) => const SizedBox(
                            height: 120,
                            child: Center(
                              child: Icon(Icons.checkroom_rounded, size: 48),
                            ),
                          ),
                        ),
                      ),
                    const SizedBox(height: 12),
                    Text(
                      product['name'] as String,
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                    const SizedBox(height: 14),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton.icon(
                        onPressed: () => onTryOn(product),
                        icon: const Icon(Icons.auto_awesome_outlined),
                        label: const CustomerText('Try on me'),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          if (experience.hasMoreProducts)
            OutlinedButton(
              onPressed: experience.productsLoading ? null : onMore,
              child: const CustomerText('Load more products'),
            ),
        ],
      ),
    );
  }
}

class CustomerStoreScanner extends StatefulWidget {
  const CustomerStoreScanner({super.key});
  @override
  State<CustomerStoreScanner> createState() => _CustomerStoreScannerState();
}

class _CustomerStoreScannerState extends State<CustomerStoreScanner>
    with WidgetsBindingObserver {
  final text = TextEditingController();
  final scanner = MobileScannerController(
    formats: [BarcodeFormat.qrCode],
    autoStart: false,
  );
  bool camera = false, returned = false;
  String? error;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (!camera) return;
    if (state == AppLifecycleState.resumed) {
      unawaited(startCamera());
    } else {
      unawaited(scanner.stop());
    }
  }

  Future<void> startCamera() async {
    try {
      await scanner.start();
    } catch (_) {
      if (mounted) {
        setState(
          () => error =
              'Camera access is unavailable. Allow it in device settings, or paste the Store code below.',
        );
      }
    }
  }

  void accept(String value) {
    if (!mounted || returned) return;
    final raw = value.trim();
    final uri = Uri.tryParse(raw);
    if (!RegExp(r'^[A-Za-z0-9_-]{43}$').hasMatch(raw) &&
        !(uri?.scheme == 'selfx' && uri?.host == 'store')) {
      setState(() => error = 'Use a SelfX Store QR code.');
      return;
    }
    returned = true;
    unawaited(scanner.stop());
    Navigator.pop(context, raw);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    unawaited(scanner.dispose());
    text.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const CustomerText('Visit a Store')),
    body: ListView(
      padding: const EdgeInsets.all(24),
      children: [
        CustomerText(
          'Scan. Discover.\nMake it yours.',
          style: Theme.of(context).textTheme.headlineLarge,
        ),
        const SizedBox(height: 16),
        const CustomerText(
          'Scan a participating Store’s SelfX QR. Its products and sponsorship will appear before you try on.',
        ),
        const SizedBox(height: 24),
        if (camera)
          ClipRRect(
            borderRadius: BorderRadius.circular(26),
            child: SizedBox(
              height: 300,
              child: MobileScanner(
                controller: scanner,
                onDetect: (capture) {
                  for (final barcode in capture.barcodes) {
                    if (barcode.rawValue != null) {
                      accept(barcode.rawValue!);
                      break;
                    }
                  }
                },
                errorBuilder: (_, e) => const Center(
                  child: Padding(
                    padding: EdgeInsets.all(24),
                    child: CustomerText(
                      'Camera unavailable. Allow camera access in device settings or paste the Store code below.',
                    ),
                  ),
                ),
              ),
            ),
          )
        else
          PremiumPanel(
            child: Column(
              children: [
                const Icon(
                  Icons.qr_code_scanner_rounded,
                  size: 64,
                  color: CustomerColors.orange,
                ),
                const SizedBox(height: 16),
                const CustomerText(
                  'The camera scans on your device. Camera frames are not uploaded.',
                ),
                const SizedBox(height: 16),
                OutlinedButton(
                  onPressed: () {
                    setState(() => camera = true);
                    WidgetsBinding.instance.addPostFrameCallback(
                      (_) => unawaited(startCamera()),
                    );
                  },
                  child: const CustomerText('Open camera'),
                ),
              ],
            ),
          ),
        const SizedBox(height: 24),
        TextField(
          controller: text,
          textDirection: TextDirection.ltr,
          autocorrect: false,
          enableSuggestions: false,
          decoration: InputDecoration(
            labelText: tr(context, 'Or paste the SelfX Store code'),
          ),
        ),
        const SizedBox(height: 16),
        FilledButton(
          onPressed: () => accept(text.text),
          child: const CustomerText('Open Store'),
        ),
        if (error != null) ...[
          const SizedBox(height: 16),
          CustomerNotice(error!, error: true),
        ],
      ],
    ),
  );
}

class PremiumPanel extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  const PremiumPanel({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(22),
  });
  @override
  Widget build(BuildContext context) => Container(
    padding: padding,
    decoration: BoxDecoration(
      color: Colors.white.withValues(alpha: .86),
      borderRadius: BorderRadius.circular(26),
      border: Border.all(color: CustomerColors.line),
      boxShadow: const [
        BoxShadow(
          color: Color(0x06A45A23),
          blurRadius: 24,
          offset: Offset(0, 8),
        ),
      ],
    ),
    child: child,
  );
}
