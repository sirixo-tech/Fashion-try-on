import 'customer_outfit_planner_screen.dart';
import 'customer_wardrobe_image.dart';
export 'customer_wardrobe_image.dart';
import 'dart:async';
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
  final VoidCallback? onFavourites;
  const CustomerWardrobePanel({
    super.key,
    required this.experience,
    this.onTryOn,
    this.picker,
    this.onFavourites,
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
              child: TextField(
                controller: search,
                maxLength: 120,
                decoration: InputDecoration(
                  labelText: tr(context, 'Search your wardrobe'),
                  counterText: '',
                  prefixIcon: const Icon(Icons.search_rounded),
                  suffixIcon: IconButton(
                    tooltip: tr(context, 'Refresh'),
                    onPressed: importing ? null : () => wardrobe.load(),
                    icon: const Icon(Icons.refresh_rounded),
                  ),
                ),
                onChanged: (value) {
                  debounce?.cancel();
                  debounce = Timer(
                    const Duration(milliseconds: 300),
                    () => wardrobe.load(query: value),
                  );
                },
              ),
            ),
            const SizedBox(width: 8),
            IconButton.filledTonal(
              key: const ValueKey('wardrobe-favourites'),
              tooltip: tr(context, 'Favourite products'),
              onPressed: importing ? null : widget.onFavourites,
              icon: const Icon(Icons.favorite_border_rounded),
            ),
          ],
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
        Row(
          children: [
            Expanded(
              child: FilledButton.icon(
                onPressed: importing
                    ? null
                    : () => add(CustomerPhotoSource.gallery),
                icon: const Icon(Icons.photo_library_outlined),
                label: const CustomerText('Import photos'),
              ),
            ),
            const SizedBox(width: 8),
            IconButton.outlined(
              tooltip: tr(context, 'Take a photo'),
              onPressed: importing
                  ? null
                  : () => add(CustomerPhotoSource.camera),
              icon: const Icon(Icons.camera_alt_outlined),
            ),
            const SizedBox(width: 8),
            IconButton.outlined(
              key: const ValueKey('wardrobe-planner'),
              tooltip: tr(context, 'Outfit planner'),
              onPressed: importing
                  ? null
                  : () => Navigator.push<void>(
                      context,
                      MaterialPageRoute(
                        builder: (_) => CustomerOutfitPlannerScreen(
                          auth: wardrobe.auth,
                          onImport: () => add(CustomerPhotoSource.gallery),
                        ),
                      ),
                    ),
              icon: const Icon(Icons.calendar_month_outlined),
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
  late final String? owner = widget.wardrobe.auth.profile?.id;
  late List<Json> garments;
  late int selected;
  late final PageController pages;
  final thumbnails = ScrollController();
  bool busy = false, invalidated = false;
  String? error;
  Json get item => garments[selected];
  bool get ownerStill =>
      widget.wardrobe.auth.profile?.id == owner &&
      widget.wardrobe.auth.stage == CustomerStage.ready;
  @override
  void initState() {
    super.initState();
    garments = widget.wardrobe.items
        .map((entry) => Map<String, dynamic>.from(entry))
        .toList();
    selected = garments.indexWhere((entry) => entry['id'] == widget.item['id']);
    if (selected < 0) {
      garments = [Map<String, dynamic>.from(widget.item)];
      selected = 0;
    }
    pages = PageController(initialPage: selected);
    widget.wardrobe.auth.addListener(authChanged);
    widget.wardrobe.addListener(collectionChanged);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        revealThumbnail();
        prefetch();
      }
    });
  }

  void authChanged() {
    if (mounted && !ownerStill) {
      setState(() {
        invalidated = true;
        garments = [];
      });
      final route = ModalRoute.of(context);
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && route?.isActive == true) {
          Navigator.of(context).removeRoute(route!);
        }
      });
    }
  }

  void collectionChanged() {
    if (!mounted || !ownerStill || invalidated) return;
    final known = garments.map((entry) => entry['id']).toSet();
    setState(
      () => garments = [
        ...garments,
        ...widget.wardrobe.items
            .where((entry) => !known.contains(entry['id']))
            .map((entry) => Map<String, dynamic>.from(entry)),
      ],
    );
  }

  void prefetch() {
    if (ownerStill &&
        !invalidated &&
        widget.wardrobe.hasMore &&
        !widget.wardrobe.loading &&
        selected >= garments.length - 3 &&
        widget.wardrobe.error == null) {
      unawaited(widget.wardrobe.load(more: true));
    }
  }

  void revealThumbnail() {
    if (!thumbnails.hasClients) return;
    final target =
        (selected * 80 - (thumbnails.position.viewportDimension - 72) / 2)
            .clamp(0.0, thumbnails.position.maxScrollExtent)
            .toDouble();
    unawaited(
      thumbnails.animateTo(
        target,
        duration: const Duration(milliseconds: 180),
        curve: Curves.easeOut,
      ),
    );
  }

  void changed(int index) {
    setState(() {
      selected = index;
      error = null;
    });
    revealThumbnail();
    prefetch();
  }

  void select(int index) {
    if (busy || index < 0 || index >= garments.length) return;
    unawaited(
      pages.animateToPage(
        index,
        duration: const Duration(milliseconds: 220),
        curve: Curves.easeOut,
      ),
    );
  }

  @override
  void dispose() {
    widget.wardrobe.auth.removeListener(authChanged);
    widget.wardrobe.removeListener(collectionChanged);
    pages.dispose();
    thumbnails.dispose();
    super.dispose();
  }

  Future<void> action(Future<void> Function() work) async {
    if (busy || !ownerStill || invalidated) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await work();
    } catch (caught) {
      if (mounted && ownerStill) {
        setState(() => error = CustomerExperience.message(caught));
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> edit() => action(() async {
    final id = item['id'];
    final updated = await Navigator.push<Json>(
      context,
      MaterialPageRoute(
        builder: (_) =>
            CustomerWardrobeEditor(wardrobe: widget.wardrobe, item: item),
      ),
    );
    if (!mounted || !ownerStill || updated == null) return;
    setState(() {
      final index = garments.indexWhere((entry) => entry['id'] == id);
      if (index >= 0) garments[index] = updated;
    });
  });
  Future<void> remove() => action(() async {
    final id = item['id'] as String;
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
    if (yes != true || !mounted || !ownerStill) return;
    await widget.wardrobe.remove(id);
    if (mounted && ownerStill) Navigator.pop(context);
  });
  Future<void> fullscreen() => Navigator.push<void>(
    context,
    MaterialPageRoute(
      builder: (_) => _WardrobeFullscreen(
        auth: widget.wardrobe.auth,
        item: Map<String, dynamic>.from(item),
      ),
    ),
  );
  @override
  Widget build(BuildContext context) {
    if (invalidated || !ownerStill || garments.isEmpty) {
      return const Scaffold(body: SizedBox.shrink());
    }
    final width = MediaQuery.sizeOf(context).width - 40;
    final imageHeight = (width / .82)
        .clamp(
          160.0,
          (MediaQuery.sizeOf(context).height * .54).clamp(160.0, 640.0),
        )
        .toDouble();
    return Scaffold(
      appBar: AppBar(
        title: Text(
          item['name'] as String,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        actions: [
          PopupMenuButton<String>(
            key: const ValueKey('wardrobe-actions'),
            tooltip: tr(context, 'More options'),
            enabled: !busy,
            onSelected: (value) {
              if (value == 'edit') {
                unawaited(edit());
              } else if (value == 'schedule') {
                unawaited(
                  Navigator.push<void>(
                    context,
                    MaterialPageRoute(
                      builder: (_) => CustomerOutfitPlannerScreen(
                        auth: widget.wardrobe.auth,
                        initialGarment: Map<String, dynamic>.from(item),
                      ),
                    ),
                  ),
                );
              } else {
                unawaited(remove());
              }
            },
            itemBuilder: (context) => [
              const PopupMenuItem(
                value: 'schedule',
                child: ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(Icons.calendar_month_outlined),
                  title: CustomerText('Schedule outfit'),
                ),
              ),
              PopupMenuItem(
                value: 'edit',
                child: ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.edit_outlined),
                  title: const CustomerText('Edit garment'),
                ),
              ),
              PopupMenuItem(
                value: 'delete',
                child: ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(
                    Icons.delete_outline_rounded,
                    color: Colors.red,
                  ),
                  title: const CustomerText(
                    'Delete',
                    style: TextStyle(color: Colors.red),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
      body: SafeArea(
        top: false,
        child: ListView(
          key: const ValueKey('wardrobe-detail-scroll'),
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
          children: [
            Container(
              height: imageHeight,
              clipBehavior: Clip.antiAlias,
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(24),
                border: Border.all(color: CustomerColors.line),
              ),
              child: Stack(
                children: [
                  Positioned.fill(
                    child: PageView.builder(
                      key: const ValueKey('wardrobe-pages'),
                      controller: pages,
                      itemCount: garments.length,
                      physics: busy
                          ? const NeverScrollableScrollPhysics()
                          : null,
                      onPageChanged: changed,
                      itemBuilder: (context, index) => Padding(
                        padding: const EdgeInsets.all(10),
                        child: WardrobeImage(
                          key: ValueKey(
                            'wardrobe-page-${garments[index]['id']}',
                          ),
                          auth: widget.wardrobe.auth,
                          id: garments[index]['id'] as String,
                        ),
                      ),
                    ),
                  ),
                  PositionedDirectional(
                    top: 10,
                    end: 10,
                    child: IconButton.filledTonal(
                      tooltip: tr(context, 'View full screen'),
                      onPressed: busy ? null : fullscreen,
                      icon: const Icon(Icons.fullscreen_rounded),
                    ),
                  ),
                ],
              ),
            ),
            if (garments.length > 1 || widget.wardrobe.hasMore) ...[
              const SizedBox(height: 4),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  IconButton(
                    tooltip: tr(context, 'Previous garment'),
                    onPressed: busy || selected == 0
                        ? null
                        : () => select(selected - 1),
                    icon: const Icon(Icons.chevron_left_rounded),
                  ),
                  Flexible(
                    child: CustomerText(
                      '${selected + 1} of ${garments.length}${widget.wardrobe.hasMore ? '+' : ''}',
                      key: const ValueKey('wardrobe-position'),
                      style: const TextStyle(
                        color: CustomerColors.muted,
                        fontSize: 13,
                      ),
                      textAlign: TextAlign.center,
                    ),
                  ),
                  IconButton(
                    tooltip: tr(context, 'Next garment'),
                    onPressed: busy || selected >= garments.length - 1
                        ? null
                        : () => select(selected + 1),
                    icon: const Icon(Icons.chevron_right_rounded),
                  ),
                ],
              ),
              SizedBox(
                height: 80,
                child: ListView.builder(
                  key: const ValueKey('wardrobe-thumbnails'),
                  controller: thumbnails,
                  scrollDirection: Axis.horizontal,
                  itemCount:
                      garments.length + (widget.wardrobe.hasMore ? 1 : 0),
                  itemBuilder: (context, index) {
                    if (index == garments.length) {
                      return SizedBox(
                        width: 80,
                        child: widget.wardrobe.loading
                            ? const Center(child: CircularProgressIndicator())
                            : IconButton(
                                tooltip: tr(context, 'Load more'),
                                onPressed: () =>
                                    widget.wardrobe.load(more: true),
                                icon: const Icon(Icons.add_rounded),
                              ),
                      );
                    }
                    final garment = garments[index];
                    return Padding(
                      padding: const EdgeInsetsDirectional.only(end: 8),
                      child: Semantics(
                        button: true,
                        selected: selected == index,
                        label: garment['name'] as String,
                        child: Material(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(14),
                          clipBehavior: Clip.antiAlias,
                          child: InkWell(
                            key: ValueKey(
                              'wardrobe-thumbnail-${garment['id']}',
                            ),
                            onTap: busy ? null : () => select(index),
                            child: Container(
                              width: 72,
                              padding: const EdgeInsets.all(4),
                              decoration: BoxDecoration(
                                borderRadius: BorderRadius.circular(14),
                                border: Border.all(
                                  color: selected == index
                                      ? CustomerColors.orange
                                      : CustomerColors.line,
                                  width: selected == index ? 2 : 1,
                                ),
                              ),
                              child: WardrobeImage(
                                auth: widget.wardrobe.auth,
                                id: garment['id'] as String,
                              ),
                            ),
                          ),
                        ),
                      ),
                    );
                  },
                ),
              ),
            ],
            if (widget.wardrobe.error != null) ...[
              const SizedBox(height: 8),
              CustomerNotice(widget.wardrobe.error!, error: true),
              TextButton(
                onPressed: () => widget.wardrobe.load(more: true),
                child: const CustomerText('Try again'),
              ),
            ],
            const SizedBox(height: 14),
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: Chip(
                avatar: const Icon(Icons.checkroom_outlined, size: 18),
                label: CustomerText(
                  wardrobeCategories[item['category']] ?? 'Other',
                ),
                visualDensity: VisualDensity.compact,
              ),
            ),
            if ((item['colour'] as String?)?.isNotEmpty == true)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(item['colour'] as String),
              ),
            if ((item['notes'] as String?)?.isNotEmpty == true)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(item['notes'] as String),
              ),
            if (error != null) ...[
              const SizedBox(height: 12),
              CustomerNotice(error!, error: true),
            ],
            const SizedBox(height: 20),
            FilledButton.icon(
              key: const ValueKey('wardrobe-try-on'),
              onPressed: busy || widget.onTryOn == null
                  ? null
                  : () => action(
                      () => widget.onTryOn!(Map<String, dynamic>.from(item)),
                    ),
              icon: const Icon(Icons.auto_awesome_rounded),
              label: const CustomerText('Try it on'),
            ),
          ],
        ),
      ),
    );
  }
}

class _WardrobeFullscreen extends StatefulWidget {
  final CustomerController auth;
  final Json item;
  const _WardrobeFullscreen({required this.auth, required this.item});
  @override
  State<_WardrobeFullscreen> createState() => _WardrobeFullscreenState();
}

class _WardrobeFullscreenState extends State<_WardrobeFullscreen> {
  late final String? owner = widget.auth.profile?.id;
  bool get valid =>
      owner == widget.auth.profile?.id &&
      widget.auth.stage == CustomerStage.ready;
  @override
  void initState() {
    super.initState();
    widget.auth.addListener(authChanged);
  }

  void authChanged() {
    if (!valid && mounted) {
      setState(() {});
      final route = ModalRoute.of(context);
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && route?.isActive == true) {
          Navigator.of(context).removeRoute(route!);
        }
      });
    }
  }

  @override
  void dispose() {
    widget.auth.removeListener(authChanged);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: valid ? Text(widget.item['name'] as String) : null),
    body: valid
        ? SafeArea(
            child: InteractiveViewer(
              minScale: 1,
              maxScale: 4,
              child: SizedBox.expand(
                child: WardrobeImage(
                  auth: widget.auth,
                  id: widget.item['id'] as String,
                ),
              ),
            ),
          )
        : const SizedBox.shrink(),
  );
}
