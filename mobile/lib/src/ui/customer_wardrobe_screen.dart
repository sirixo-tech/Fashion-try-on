import 'dart:async';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import '../auth/customer_controller.dart';
import '../experience/customer_experience.dart';
import '../experience/customer_media.dart';
import '../l10n/customer_copy.dart';
import '../services/customer_wardrobe.dart';
import 'customer_photo_crop_screen.dart';
import 'customer_theme.dart';

class CustomerWardrobePanel extends StatefulWidget {
  final CustomerExperience experience;
  final Future<void> Function(Json)? onTryOn;
  final CustomerWardrobePicker? picker;
  const CustomerWardrobePanel({
    super.key,
    required this.experience,
    this.onTryOn,
    this.picker,
  });
  @override
  State<CustomerWardrobePanel> createState() => _CustomerWardrobePanelState();
}

class _CustomerWardrobePanelState extends State<CustomerWardrobePanel> {
  late final CustomerWardrobe wardrobe;
  final search = TextEditingController();
  Timer? debounce;
  late int deletionRevision;
  bool importing = false;
  String? importError;
  @override
  void initState() {
    super.initState();
    wardrobe = CustomerWardrobe(widget.experience.auth);
    deletionRevision = widget.experience.photoDeletionRevision;
    widget.experience.addListener(experienceChanged);
    unawaited(wardrobe.load());
  }

  void experienceChanged() {
    if (widget.experience.photoDeletionRevision != deletionRevision) {
      deletionRevision = widget.experience.photoDeletionRevision;
      unawaited(wardrobe.load());
    }
  }

  @override
  void dispose() {
    widget.experience.removeListener(experienceChanged);
    debounce?.cancel();
    search.dispose();
    wardrobe.dispose();
    super.dispose();
  }

  bool ownerStill(String? owner) =>
      mounted &&
      widget.experience.auth.profile?.id == owner &&
      widget.experience.auth.stage == CustomerStage.ready;
  Future<void> add(CustomerPhotoSource source) async {
    if (importing) return;
    setState(() {
      importing = true;
      importError = null;
    });
    final owner = widget.experience.auth.profile?.id;
    var selections = <WardrobeSelection>[];
    try {
      selections = await (widget.picker ?? NativeWardrobePicker()).pick(source);
      for (
        var index = 0;
        index < selections.length && ownerStill(owner);
        index++
      ) {
        final selection = selections[index];
        PickedCustomerPhoto? photo;
        while (photo == null && ownerStill(owner)) {
          try {
            photo = await selection.read();
          } catch (caught) {
            if (!mounted || !ownerStill(owner)) break;
            final retry = await showDialog<bool>(
              context: context,
              builder: (context) => AlertDialog(
                title: const CustomerText('Could not open photo'),
                content: CustomerText(
                  CustomerExperience.message(caught),
                  error: true,
                ),
                actions: [
                  TextButton(
                    onPressed: () => Navigator.pop(context, false),
                    child: const CustomerText('Skip'),
                  ),
                  FilledButton(
                    onPressed: () => Navigator.pop(context, true),
                    child: const CustomerText('Try again'),
                  ),
                ],
              ),
            );
            if (retry != true) break;
          }
        }
        if (photo == null || !mounted || !ownerStill(owner)) continue;
        final reviewed = await Navigator.push<Json>(
          context,
          MaterialPageRoute(
            builder: (_) => CustomerWardrobeEditor(
              wardrobe: wardrobe,
              photo: photo,
              position: '${index + 1} / ${selections.length}',
            ),
          ),
        );
        await selection.discard();
        if (reviewed == null) break;
      }
      if (ownerStill(owner)) await wardrobe.load();
    } catch (caught) {
      if (ownerStill(owner)) {
        setState(() => importError = CustomerExperience.message(caught));
      }
    } finally {
      for (final selection in selections) {
        try {
          await selection.discard();
        } catch (_) {}
      }
      if (mounted) setState(() => importing = false);
    }
  }

  Future<void> open(Json item) async {
    final owner = widget.experience.auth.profile?.id;
    await Navigator.push<void>(
      context,
      MaterialPageRoute(
        builder: (_) => CustomerWardrobeDetail(
          wardrobe: wardrobe,
          item: item,
          onTryOn: widget.onTryOn,
        ),
      ),
    );
    if (ownerStill(owner)) await wardrobe.load();
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: wardrobe,
    builder: (context, _) => Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: CustomerText(
                'My clothes',
                style: Theme.of(context).textTheme.titleLarge,
              ),
            ),
            IconButton(
              tooltip: tr(context, 'Refresh'),
              onPressed: importing ? null : () => wardrobe.load(),
              icon: const Icon(Icons.refresh_rounded),
            ),
            IconButton.filled(
              tooltip: tr(context, 'Add garment'),
              onPressed: importing
                  ? null
                  : () => add(CustomerPhotoSource.gallery),
              icon: const Icon(Icons.add_rounded),
            ),
          ],
        ),
        const SizedBox(height: 8),
        const CustomerText(
          'Private. Saved until you delete them.',
          style: TextStyle(color: CustomerColors.muted),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: search,
          maxLength: 120,
          decoration: InputDecoration(
            labelText: tr(context, 'Search your wardrobe'),
            counterText: '',
            prefixIcon: const Icon(Icons.search_rounded),
          ),
          onChanged: (value) {
            debounce?.cancel();
            debounce = Timer(
              const Duration(milliseconds: 300),
              () => wardrobe.load(query: value),
            );
          },
        ),
        const SizedBox(height: 12),
        SizedBox(
          height: 44,
          child: ListView(
            scrollDirection: Axis.horizontal,
            children: [
              for (final entry in {'': 'All', ...wardrobeCategories}.entries)
                Padding(
                  padding: const EdgeInsetsDirectional.only(end: 8),
                  child: ChoiceChip(
                    label: CustomerText(entry.value),
                    selected: wardrobe.category == entry.key,
                    onSelected: importing
                        ? null
                        : (_) {
                            debounce?.cancel();
                            unawaited(
                              wardrobe.load(
                                query: search.text,
                                filter: entry.key,
                              ),
                            );
                          },
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        if (importing) ...[
          const LinearProgressIndicator(),
          const SizedBox(height: 12),
        ],
        if (importError != null) CustomerNotice(importError!, error: true),
        if (wardrobe.error != null) ...[
          CustomerNotice(wardrobe.error!, error: true),
          TextButton(
            onPressed: () => wardrobe.load(),
            child: const CustomerText('Try again'),
          ),
        ],
        if (wardrobe.loading && wardrobe.items.isEmpty)
          const Center(child: CircularProgressIndicator()),
        if (!wardrobe.loading &&
            wardrobe.items.isEmpty &&
            wardrobe.error == null) ...[
          const SizedBox(height: 24),
          const Icon(
            Icons.checkroom_outlined,
            size: 64,
            color: CustomerColors.orange,
          ),
          const SizedBox(height: 16),
          CustomerText(
            search.text.trim().isEmpty && wardrobe.category.isEmpty
                ? 'Your wardrobe starts here'
                : 'No garments match your search.',
            style: Theme.of(context).textTheme.titleLarge,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 12),
          const CustomerText(
            'Add clothing photos and keep every piece ready to try on.',
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 20),
        ],
        Wrap(
          alignment: WrapAlignment.center,
          spacing: 8,
          runSpacing: 8,
          children: [
            FilledButton.icon(
              onPressed: importing
                  ? null
                  : () => add(CustomerPhotoSource.gallery),
              icon: const Icon(Icons.photo_library_outlined),
              label: const CustomerText('Import photos'),
            ),
            OutlinedButton.icon(
              onPressed: importing
                  ? null
                  : () => add(CustomerPhotoSource.camera),
              icon: const Icon(Icons.camera_alt_outlined),
              label: const CustomerText('Take a photo'),
            ),
          ],
        ),
        const SizedBox(height: 16),
        GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          itemCount: wardrobe.items.length,
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 2,
            mainAxisSpacing: 12,
            crossAxisSpacing: 10,
            childAspectRatio: .69,
          ),
          itemBuilder: (context, index) {
            final item = wardrobe.items[index];
            return Material(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
              clipBehavior: Clip.antiAlias,
              child: InkWell(
                onTap: importing ? null : () => open(item),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Expanded(
                      child: WardrobeImage(
                        auth: wardrobe.auth,
                        id: item['id'] as String,
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.fromLTRB(10, 8, 10, 3),
                      child: Text(
                        item['name'] as String,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.fromLTRB(10, 0, 10, 10),
                      child: CustomerText(
                        wardrobeCategories[item['category']] ?? 'Other',
                        style: const TextStyle(
                          fontSize: 12,
                          color: CustomerColors.muted,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        ),
        if (wardrobe.hasMore)
          TextButton(
            onPressed: wardrobe.loading
                ? null
                : () => wardrobe.load(more: true),
            child: CustomerText(wardrobe.loading ? 'Loading…' : 'Load more'),
          ),
      ],
    ),
  );
}

class WardrobeImage extends StatefulWidget {
  final CustomerController auth;
  final String id;
  const WardrobeImage({super.key, required this.auth, required this.id});
  @override
  State<WardrobeImage> createState() => _WardrobeImageState();
}

class _WardrobeImageState extends State<WardrobeImage> {
  Future<Uint8List>? loading;
  Uint8List? bytes;
  String? owner;
  int revision = 0;
  @override
  void initState() {
    super.initState();
    owner = widget.auth.profile?.id;
    widget.auth.addListener(authChanged);
    load();
  }

  void authChanged() {
    if (widget.auth.profile?.id != owner ||
        widget.auth.stage != CustomerStage.ready) {
      ++revision;
      clear();
      if (mounted) setState(() => loading = null);
    }
  }

  void clear() {
    if (bytes != null) {
      PaintingBinding.instance.imageCache.evict(MemoryImage(bytes!));
    }
    bytes = null;
  }

  void load() {
    final current = ++revision;
    loading = widget.auth
        .authorizedDownload('/wardrobe/${widget.id}/content')
        .then((value) {
          if (mounted &&
              current == revision &&
              owner == widget.auth.profile?.id) {
            bytes = value;
          }
          return value;
        });
  }

  @override
  void didUpdateWidget(covariant WardrobeImage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.id != widget.id) {
      clear();
      load();
    }
  }

  @override
  void dispose() {
    ++revision;
    widget.auth.removeListener(authChanged);
    clear();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<Uint8List>(
    future: loading,
    builder: (context, snapshot) {
      if (widget.auth.profile?.id != owner || loading == null) {
        return const SizedBox.shrink();
      }
      if (snapshot.hasError) {
        return Center(
          child: IconButton(
            tooltip: tr(context, 'Reload photo'),
            icon: const Icon(Icons.refresh_rounded),
            onPressed: () => setState(load),
          ),
        );
      }
      if (snapshot.connectionState == ConnectionState.done &&
          snapshot.hasData) {
        return Image.memory(
          snapshot.data!,
          fit: BoxFit.contain,
          gaplessPlayback: false,
        );
      }
      return const Center(child: CircularProgressIndicator());
    },
  );
}

class CustomerWardrobeEditor extends StatefulWidget {
  final CustomerWardrobe wardrobe;
  final PickedCustomerPhoto? photo;
  final Json? item;
  final String? position;
  const CustomerWardrobeEditor({
    super.key,
    required this.wardrobe,
    this.photo,
    this.item,
    this.position,
  });
  @override
  State<CustomerWardrobeEditor> createState() => _CustomerWardrobeEditorState();
}

class _CustomerWardrobeEditorState extends State<CustomerWardrobeEditor> {
  final form = GlobalKey<FormState>();
  late final TextEditingController name, colour, notes;
  late final String id;
  late final String? owner;
  late String category;
  PickedCustomerPhoto? photo;
  bool saving = false, started = false;
  Json? creation;
  String? error;
  @override
  void initState() {
    super.initState();
    id = widget.item?['id'] as String? ?? widget.wardrobe.newId();
    owner = widget.wardrobe.auth.profile?.id;
    name = TextEditingController(text: widget.item?['name'] as String? ?? '');
    colour = TextEditingController(
      text: widget.item?['colour'] as String? ?? '',
    );
    notes = TextEditingController(text: widget.item?['notes'] as String? ?? '');
    category = widget.item?['category'] as String? ?? 'TOPS';
    photo = widget.photo;
    widget.wardrobe.auth.addListener(authChanged);
  }

  void authChanged() {
    if (mounted &&
        (widget.wardrobe.auth.profile?.id != owner ||
            widget.wardrobe.auth.stage != CustomerStage.ready)) {
      if (photo != null) {
        PaintingBinding.instance.imageCache.evict(MemoryImage(photo!.bytes));
      }
      setState(() => photo = null);
      Navigator.pop(context);
    }
  }

  @override
  void dispose() {
    widget.wardrobe.auth.removeListener(authChanged);
    if (photo != null) {
      PaintingBinding.instance.imageCache.evict(MemoryImage(photo!.bytes));
    }
    if (widget.photo != null) {
      PaintingBinding.instance.imageCache.evict(
        MemoryImage(widget.photo!.bytes),
      );
    }
    name.dispose();
    colour.dispose();
    notes.dispose();
    super.dispose();
  }

  Future<void> save() async {
    if (saving || !form.currentState!.validate()) return;
    final metadata = {
      'name': name.text.trim(),
      'category': category,
      'colour': colour.text.trim(),
      'notes': notes.text.trim(),
    };
    setState(() {
      saving = true;
      error = null;
    });
    try {
      final Json result;
      if (widget.item != null) {
        result = await widget.wardrobe.update(id, metadata);
      } else {
        creation ??= metadata;
        setState(() => started = true);
        result = await widget.wardrobe.save(id, creation!, photo!);
      }
      if (mounted &&
          widget.wardrobe.auth.profile?.id == owner &&
          widget.wardrobe.auth.stage == CustomerStage.ready) {
        Navigator.pop(context, result);
      }
    } catch (caught) {
      if (mounted) setState(() => error = CustomerExperience.message(caught));
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  Future<void> crop() async {
    final result = await cropCustomerPhoto(
      context,
      photo!,
      title: 'Crop photo',
    );
    if (result != null && mounted) {
      if (photo != null) {
        PaintingBinding.instance.imageCache.evict(MemoryImage(photo!.bytes));
      }
      setState(() => photo = result);
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !saving,
    child: Scaffold(
      appBar: AppBar(
        title: CustomerText(
          widget.item == null ? 'Add garment' : 'Edit garment',
        ),
        actions: [
          if (widget.position != null)
            TextButton(
              onPressed: saving
                  ? null
                  : () =>
                        Navigator.pop(context, <String, dynamic>{'skip': true}),
              child: const CustomerText('Skip'),
            ),
          if (widget.position != null)
            Padding(
              padding: const EdgeInsets.all(16),
              child: Text(widget.position!),
            ),
        ],
      ),
      body: Form(
        key: form,
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            if (photo != null) ...[
              SizedBox(
                height: 240,
                child: Image.memory(photo!.bytes, fit: BoxFit.contain),
              ),
              TextButton.icon(
                onPressed: saving || started ? null : crop,
                icon: const Icon(Icons.crop_rounded),
                label: const CustomerText('Crop photo'),
              ),
            ],
            if (widget.item != null)
              SizedBox(
                height: 200,
                child: WardrobeImage(auth: widget.wardrobe.auth, id: id),
              ),
            if (error != null) ...[
              CustomerNotice(error!, error: true),
              const SizedBox(height: 12),
            ],
            TextFormField(
              controller: name,
              enabled: !saving && !started,
              maxLength: 120,
              decoration: InputDecoration(
                labelText: tr(context, 'Garment name'),
              ),
              validator: (value) => value == null || value.trim().isEmpty
                  ? tr(context, 'Enter a garment name.')
                  : null,
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: category,
              isExpanded: true,
              decoration: InputDecoration(labelText: tr(context, 'Category')),
              items: [
                for (final entry in wardrobeCategories.entries)
                  DropdownMenuItem(
                    value: entry.key,
                    child: CustomerText(entry.value),
                  ),
              ],
              onChanged: saving || started
                  ? null
                  : (value) => setState(() => category = value!),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: colour,
              enabled: !saving && !started,
              maxLength: 40,
              decoration: InputDecoration(
                labelText: tr(context, 'Colour (optional)'),
              ),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: notes,
              enabled: !saving && !started,
              maxLength: 500,
              minLines: 2,
              maxLines: 4,
              decoration: InputDecoration(
                labelText: tr(context, 'Notes (optional)'),
              ),
            ),
            const SizedBox(height: 12),
            const CustomerText(
              'Private. Saved until you delete them.',
              style: TextStyle(color: CustomerColors.muted),
            ),
          ],
        ),
      ),
      bottomNavigationBar: SafeArea(
        minimum: const EdgeInsets.all(16),
        child: FilledButton(
          onPressed: saving ? null : save,
          child: saving
              ? const SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : CustomerText(error == null ? 'Save garment' : 'Try again'),
        ),
      ),
    ),
  );
}

class CustomerWardrobeDetail extends StatefulWidget {
  final CustomerWardrobe wardrobe;
  final Json item;
  final Future<void> Function(Json)? onTryOn;
  const CustomerWardrobeDetail({
    super.key,
    required this.wardrobe,
    required this.item,
    this.onTryOn,
  });
  @override
  State<CustomerWardrobeDetail> createState() => _CustomerWardrobeDetailState();
}

class _CustomerWardrobeDetailState extends State<CustomerWardrobeDetail> {
  late Json item = widget.item;
  late final String? owner = widget.wardrobe.auth.profile?.id;
  bool busy = false;
  String? error;
  @override
  void initState() {
    super.initState();
    widget.wardrobe.auth.addListener(authChanged);
  }

  void authChanged() {
    if (mounted &&
        (widget.wardrobe.auth.profile?.id != owner ||
            widget.wardrobe.auth.stage != CustomerStage.ready)) {
      setState(
        () => item = {...item, 'name': '', 'notes': null, 'colour': null},
      );
      Navigator.pop(context);
    }
  }

  @override
  void dispose() {
    widget.wardrobe.auth.removeListener(authChanged);
    super.dispose();
  }

  Future<void> action(Future<void> Function() work) async {
    if (busy) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await work();
    } catch (caught) {
      if (mounted) setState(() => error = CustomerExperience.message(caught));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> edit() => action(() async {
    final updated = await Navigator.push<Json>(
      context,
      MaterialPageRoute(
        builder: (_) =>
            CustomerWardrobeEditor(wardrobe: widget.wardrobe, item: item),
      ),
    );
    if (!mounted || widget.wardrobe.auth.profile?.id != owner) return;
    if (updated != null && mounted) setState(() => item = updated);
  });
  Future<void> remove() => action(() async {
    final yes = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const CustomerText('Delete garment?'),
        content: const CustomerText(
          'This removes the garment from your private wardrobe.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const CustomerText('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const CustomerText('Delete'),
          ),
        ],
      ),
    );
    if (yes != true) return;
    await widget.wardrobe.remove(item['id'] as String);
    if (mounted) Navigator.pop(context);
  });
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: Text(
        item['name'] as String,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      ),
      actions: [
        IconButton(
          tooltip: tr(context, 'Edit garment'),
          onPressed: busy ? null : edit,
          icon: const Icon(Icons.edit_outlined),
        ),
        IconButton(
          tooltip: tr(context, 'Delete'),
          onPressed: busy ? null : remove,
          icon: const Icon(Icons.delete_outline_rounded),
        ),
      ],
    ),
    body: ListView(
      padding: const EdgeInsets.all(20),
      children: [
        AspectRatio(
          aspectRatio: .75,
          child: ClipRRect(
            borderRadius: BorderRadius.circular(18),
            child: WardrobeImage(
              auth: widget.wardrobe.auth,
              id: item['id'] as String,
            ),
          ),
        ),
        const SizedBox(height: 16),
        CustomerText(
          wardrobeCategories[item['category']] ?? 'Other',
          style: Theme.of(context).textTheme.titleLarge,
        ),
        if ((item['colour'] as String?)?.isNotEmpty == true)
          Padding(
            padding: const EdgeInsets.only(top: 12),
            child: Text(item['colour'] as String),
          ),
        if ((item['notes'] as String?)?.isNotEmpty == true)
          Padding(
            padding: const EdgeInsets.only(top: 12),
            child: Text(item['notes'] as String),
          ),
        const SizedBox(height: 16),
        const CustomerText('Private. Saved until you delete them.'),
        if (error != null) CustomerNotice(error!, error: true),
      ],
    ),
    bottomNavigationBar: SafeArea(
      minimum: const EdgeInsets.all(16),
      child: FilledButton.icon(
        onPressed: busy || widget.onTryOn == null
            ? null
            : () => action(() => widget.onTryOn!(item)),
        icon: const Icon(Icons.auto_awesome_rounded),
        label: const CustomerText('Try it on'),
      ),
    ),
  );
}
