import 'dart:async';
import 'package:flutter/material.dart';
import '../auth/customer_controller.dart';
import '../experience/customer_media.dart';
import '../l10n/customer_copy.dart';
import '../services/customer_avatar.dart';
import 'customer_entry_theme.dart';
import 'customer_theme.dart';
import 'customer_home_back.dart';

class CustomerAvatarScreen extends StatefulWidget {
  final CustomerController controller;
  final CustomerPhotoPicker? picker;
  final bool setup;
  const CustomerAvatarScreen({
    super.key,
    required this.controller,
    this.picker,
    this.setup = false,
  });
  @override
  State<CustomerAvatarScreen> createState() => _CustomerAvatarScreenState();
}

class _CustomerAvatarScreenState extends State<CustomerAvatarScreen> {
  static const _availableInterests = {'WOMEN', 'MEN'};
  late final CustomerAvatar avatar;
  late final CustomerPhotoPicker picker;
  late int step;
  final selected = <String>{};
  bool choosing = false;
  bool get busy => choosing || avatar.busy;
  @override
  void initState() {
    super.initState();
    avatar = CustomerAvatar(widget.controller);
    picker = widget.picker ?? NativeCustomerPhotoPicker();
    _restoreInterest();
    step = selected.isEmpty ? 0 : 1;
    unawaited(
      avatar.load().then((_) {
        if (mounted) {
          setState(() {
            _restoreInterest();
            if (selected.isEmpty) step = 0;
          });
        }
      }),
    );
    unawaited(picker.discardLost());
  }

  @override
  void dispose() {
    avatar.dispose();
    super.dispose();
  }

  void _restoreInterest() {
    selected.clear();
    for (final interest in avatar.interests) {
      if (_availableInterests.contains(interest)) {
        selected.add(interest);
        break;
      }
    }
  }

  Future<void> next() async {
    if (busy || selected.isEmpty) return;
    if (await avatar.saveInterests(selected.toList())) {
      if (mounted) setState(() => step = 1);
    }
  }

  Future<void> finish() async {
    if (busy) return;
    if (await avatar.saveInterests(selected.toList(), complete: true)) {
      if (mounted && !widget.setup) Navigator.pop(context);
    }
  }

  Future<void> choose(String kind) async {
    if (busy) return;
    setState(() => choosing = true);
    try {
      final source = await showModalBottomSheet<String>(
        context: context,
        showDragHandle: true,
        isScrollControlled: true,
        builder: (context) => SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(24, 4, 24, 20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                CustomerText(
                  kind == 'SELFIE' ? 'Your selfie' : 'Your full-body photo',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 12),
                const CustomerText(
                  customerAvatarConsent,
                  style: TextStyle(fontSize: 13, height: 1.5),
                ),
                const SizedBox(height: 12),
                ListTile(
                  leading: const Icon(Icons.photo_library_outlined),
                  title: const CustomerText('Choose from photos'),
                  onTap: () => Navigator.pop(context, 'gallery'),
                ),
                ListTile(
                  leading: const Icon(Icons.camera_alt_outlined),
                  title: const CustomerText('Take a photo'),
                  onTap: () => Navigator.pop(context, 'camera'),
                ),
                if (avatar.ids.containsKey(kind))
                  ListTile(
                    leading: const Icon(Icons.delete_outline),
                    title: const CustomerText('Remove photo'),
                    onTap: () => Navigator.pop(context, 'remove'),
                  ),
                Center(
                  child: TextButton(
                    onPressed: () => Navigator.pop(context),
                    child: const CustomerText('Cancel'),
                  ),
                ),
              ],
            ),
          ),
        ),
      );
      if (source == null || !mounted) return;
      if (source == 'remove') {
        await avatar.remove(kind);
        return;
      }
      final photo = await picker.pick(
        source == 'camera'
            ? CustomerPhotoSource.camera
            : CustomerPhotoSource.gallery,
      );
      if (photo != null &&
          mounted &&
          widget.controller.stage == CustomerStage.ready) {
        await avatar.upload(kind, photo);
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: CustomerText('Unable to complete that. Please try again.'),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => choosing = false);
    }
  }

  @override
  Widget build(BuildContext context) => Theme(
    data: customerEntryTheme(context),
    child: ListenableBuilder(
      listenable: avatar,
      builder: (context, _) => Scaffold(
        body: SafeArea(
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 4, 12, 0),
                child: Row(
                  children: [
                    IconButton(
                      tooltip: tr(context, 'Back'),
                      onPressed: busy
                          ? null
                          : () {
                              if (!widget.setup) {
                                final goHome = CustomerHomeScope.maybeOf(
                                  context,
                                );
                                if (goHome != null) {
                                  goHome();
                                } else {
                                  Navigator.pop(context);
                                }
                                return;
                              }
                              if (step == 1) {
                                setState(() => step = 0);
                              } else {
                                unawaited(widget.controller.signOut());
                              }
                            },
                      icon: const Icon(Icons.arrow_back_rounded),
                    ),
                    Expanded(
                      child: Align(
                        alignment: AlignmentDirectional.centerEnd,
                        child: step == 1 && widget.setup
                            ? TextButton(
                                onPressed: busy || !avatar.loaded
                                    ? null
                                    : finish,
                                child: const CustomerText('Skip for now'),
                              )
                            : const SizedBox.shrink(),
                      ),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: LayoutBuilder(
                  builder: (context, constraints) {
                    final compact = constraints.maxHeight < 720;
                    final largeText =
                        MediaQuery.textScalerOf(context).scale(14) > 18;
                    final photoAspectRatio = compact || largeText ? .9 : .78;
                    return SingleChildScrollView(
                      padding: EdgeInsets.fromLTRB(
                        24,
                        compact ? 2 : 8,
                        24,
                        compact ? 10 : 16,
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Center(child: CustomerBrand()),
                          SizedBox(height: compact ? 12 : 16),
                          if (widget.setup)
                            Row(
                              children: [
                                for (var i = 0; i < 2; i++)
                                  Expanded(
                                    child: Container(
                                      margin: EdgeInsetsDirectional.only(
                                        end: i == 0 ? 6 : 0,
                                      ),
                                      height: 3,
                                      decoration: BoxDecoration(
                                        color: i <= step
                                            ? CustomerColors.orange
                                            : CustomerColors.line,
                                        borderRadius: BorderRadius.circular(4),
                                      ),
                                    ),
                                  ),
                              ],
                            ),
                          SizedBox(height: widget.setup ? 18 : 6),
                          CustomerText(
                            step == 0
                                ? 'I want to try on'
                                : 'Create your avatar',
                            style: Theme.of(context).textTheme.headlineLarge,
                          ),
                          const SizedBox(height: 10),
                          CustomerText(
                            step == 0
                                ? 'Choose one or more interests.'
                                : 'Save two photos for easier Try-Ons.',
                            style: const TextStyle(
                              color: CustomerColors.muted,
                              height: 1.5,
                            ),
                          ),
                          SizedBox(height: compact ? 12 : 18),
                          if (step == 0) ...[
                            LayoutBuilder(
                              builder: (context, constraints) {
                                return Wrap(
                                  spacing: 12,
                                  runSpacing: 12,
                                  children: [
                                    for (final entry in const [
                                      ('WOMEN', 'Women', 'demo-model-maya'),
                                      ('MEN', 'Men', 'demo-model-arjun'),
                                    ])
                                      SizedBox(
                                        width: (constraints.maxWidth - 12) / 2,
                                        child: _InterestCard(
                                          value: entry.$2,
                                          asset: entry.$3,
                                          selected: selected.contains(entry.$1),
                                          onTap: busy
                                              ? null
                                              : () => setState(() {
                                                  selected
                                                    ..clear()
                                                    ..add(entry.$1);
                                                }),
                                        ),
                                      ),
                                  ],
                                );
                              },
                            ),
                          ] else ...[
                            Row(
                              children: [
                                Expanded(
                                  child: _photo(
                                    'SELFIE',
                                    'Selfie',
                                    selected.contains('MEN')
                                        ? 'avatar-selfie-example-man-v1'
                                        : 'avatar-selfie-example-v1',
                                    true,
                                    photoAspectRatio,
                                  ),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: _photo(
                                    'FULL_BODY',
                                    'Full body',
                                    selected.contains('MEN')
                                        ? 'demo-model-arjun'
                                        : 'demo-model-maya',
                                    false,
                                    photoAspectRatio,
                                  ),
                                ),
                              ],
                            ),
                            SizedBox(height: compact ? 12 : 14),
                            Container(
                              width: double.infinity,
                              padding: const EdgeInsets.symmetric(
                                horizontal: 14,
                                vertical: 10,
                              ),
                              decoration: BoxDecoration(
                                color: const Color(0xFFFFF0E4),
                                borderRadius: BorderRadius.circular(14),
                              ),
                              child: const Row(
                                children: [
                                  Icon(
                                    Icons.lightbulb_outline_rounded,
                                    color: CustomerColors.orange,
                                    size: 20,
                                  ),
                                  SizedBox(width: 9),
                                  Expanded(
                                    child: CustomerText(
                                      'Clear photos. Good light. Plain background.',
                                      style: TextStyle(
                                        fontSize: 12,
                                        color: CustomerColors.ink,
                                        height: 1.45,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            SizedBox(height: compact ? 12 : 14),
                            Container(
                              padding: const EdgeInsets.all(12),
                              decoration: BoxDecoration(
                                color: Colors.white,
                                borderRadius: BorderRadius.circular(14),
                                border: Border.all(color: CustomerColors.line),
                              ),
                              child: const Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Padding(
                                    padding: EdgeInsets.only(top: 2),
                                    child: Icon(
                                      Icons.lock_outline_rounded,
                                      size: 17,
                                      color: CustomerColors.orange,
                                    ),
                                  ),
                                  SizedBox(width: 8),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        CustomerText(
                                          'Use your saved full-body photo by default. Change it for any Try-On.',
                                          style: TextStyle(
                                            fontSize: 12,
                                            height: 1.4,
                                          ),
                                        ),
                                        SizedBox(height: 4),
                                        CustomerText(
                                          'Saved until you replace or delete them, or delete your account.',
                                          style: TextStyle(
                                            fontSize: 12,
                                            height: 1.4,
                                            color: CustomerColors.muted,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            if (!widget.setup)
                              Center(
                                child: TextButton.icon(
                                  onPressed: busy
                                      ? null
                                      : () => setState(() => step = 0),
                                  icon: const Icon(
                                    Icons.tune_rounded,
                                    size: 20,
                                  ),
                                  label: const CustomerText('Edit interests'),
                                  style: TextButton.styleFrom(
                                    foregroundColor: const Color(0xFFE35D16),
                                    textStyle: const TextStyle(
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ),
                              ),
                          ],
                          if (avatar.busy) ...[
                            const SizedBox(height: 16),
                            const LinearProgressIndicator(),
                          ],
                          if (avatar.error != null) ...[
                            const SizedBox(height: 16),
                            CustomerNotice(avatar.error!, error: true),
                            if (!avatar.loaded)
                              TextButton(
                                onPressed: busy ? null : avatar.load,
                                child: const CustomerText('Try again'),
                              ),
                          ],
                          SizedBox(height: compact ? 16 : 20),
                          SizedBox(
                            width: double.infinity,
                            child: FilledButton(
                              key: const ValueKey('avatar-continue'),
                              onPressed:
                                  busy ||
                                      !avatar.loaded ||
                                      selected.isEmpty ||
                                      (step == 1 &&
                                          widget.setup &&
                                          avatar.ids.length < 2)
                                  ? null
                                  : step == 0
                                  ? next
                                  : finish,
                              child: CustomerText(
                                step == 1 && !widget.setup
                                    ? 'Save changes'
                                    : 'Continue',
                              ),
                            ),
                          ),
                        ],
                      ),
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    ),
  );

  Widget _photo(
    String kind,
    String label,
    String asset,
    bool selfie,
    double aspectRatio,
  ) {
    final bytes = avatar.photos[kind];
    final ready = bytes != null;
    return Container(
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: const Color(0xFFF0ECE8)),
        boxShadow: const [
          BoxShadow(
            color: Color(0x0D3A2A20),
            blurRadius: 18,
            offset: Offset(0, 7),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                selfie ? Icons.face_outlined : Icons.accessibility_new_rounded,
                size: 18,
                color: CustomerColors.orange,
              ),
              const SizedBox(width: 5),
              Expanded(
                child: CustomerText(
                  label,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              if (ready)
                const Icon(
                  Icons.check_circle,
                  color: Color(0xFF47815E),
                  size: 18,
                ),
            ],
          ),
          const SizedBox(height: 9),
          Semantics(
            button: true,
            label: tr(context, ready ? 'Change $label' : 'Add $label'),
            child: InkWell(
              key: ValueKey('avatar-$kind'),
              onTap: busy ? null : () => choose(kind),
              borderRadius: BorderRadius.circular(14),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(14),
                child: AspectRatio(
                  aspectRatio: aspectRatio,
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      if (ready)
                        Image.memory(
                          bytes,
                          fit: selfie ? BoxFit.cover : BoxFit.contain,
                          gaplessPlayback: false,
                        )
                      else
                        Image.asset(
                          'assets/editorial/$asset.webp',
                          key: ValueKey('avatar-example-$kind'),
                          fit: BoxFit.cover,
                          alignment: selfie
                              ? const Alignment(0, -.65)
                              : Alignment.center,
                          excludeFromSemantics: true,
                          errorBuilder: (_, _, _) => Icon(
                            selfie ? Icons.face : Icons.accessibility_new,
                            size: 64,
                            color: CustomerColors.muted,
                          ),
                        ),
                      if (!ready)
                        const Positioned(
                          top: 10,
                          left: 8,
                          child: DecoratedBox(
                            decoration: BoxDecoration(
                              color: Colors.white70,
                              borderRadius: BorderRadius.all(
                                Radius.circular(6),
                              ),
                            ),
                            child: Padding(
                              padding: EdgeInsets.all(5),
                              child: CustomerText(
                                'Example',
                                style: TextStyle(fontSize: 10),
                              ),
                            ),
                          ),
                        ),
                      Positioned(
                        left: 0,
                        right: 0,
                        bottom: 0,
                        child: Container(
                          padding: const EdgeInsets.all(12),
                          decoration: const BoxDecoration(
                            gradient: LinearGradient(
                              begin: Alignment.topCenter,
                              end: Alignment.bottomCenter,
                              colors: [Colors.transparent, Colors.black87],
                            ),
                          ),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.center,
                            children: [
                              const Icon(
                                Icons.camera_alt_outlined,
                                color: Colors.white,
                                size: 19,
                              ),
                              const SizedBox(width: 9),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    CustomerText(
                                      label,
                                      style: const TextStyle(
                                        color: Colors.white,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                    CustomerText(
                                      ready ? 'Change photo' : 'Tap to upload',
                                      style: const TextStyle(
                                        color: Colors.white,
                                        fontSize: 11,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
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
}

class _InterestCard extends StatelessWidget {
  final String value, asset;
  final bool selected;
  final VoidCallback? onTap;
  const _InterestCard({
    required this.value,
    required this.asset,
    required this.selected,
    this.onTap,
  });
  @override
  Widget build(BuildContext context) => Semantics(
    selected: selected,
    button: true,
    label: tr(context, value),
    child: InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.all(3),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: selected ? CustomerColors.orange : CustomerColors.line,
            width: 1.5,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(10),
              child: AspectRatio(
                aspectRatio: 1.05,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    Image.asset(
                      'assets/editorial/$asset.webp',
                      fit: BoxFit.cover,
                      alignment: const Alignment(0, -.6),
                      excludeFromSemantics: true,
                      errorBuilder: (_, _, _) =>
                          const Icon(Icons.diamond_outlined, size: 52),
                    ),
                    Positioned(
                      top: 7,
                      right: 7,
                      child: Icon(
                        selected ? Icons.check_circle : Icons.circle_outlined,
                        size: 22,
                        color: selected ? CustomerColors.orange : Colors.white,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 9),
              child: CustomerText(
                value,
                style: TextStyle(
                  fontWeight: FontWeight.w600,
                  color: selected ? CustomerColors.orange : CustomerColors.ink,
                ),
              ),
            ),
          ],
        ),
      ),
    ),
  );
}
