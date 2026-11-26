import 'dart:async';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../auth/customer_api.dart';
import '../auth/customer_controller.dart';
import '../experience/customer_experience.dart';
import '../l10n/customer_copy.dart';
import '../services/customer_outfit_planner.dart';
import '../services/customer_wardrobe.dart';
import 'customer_theme.dart';
import 'customer_wardrobe_image.dart';

class CustomerOutfitPlannerScreen extends StatefulWidget {
  final CustomerController auth;
  final Future<void> Function()? onImport;
  final Json? initialGarment;
  final DateTime? initialDay;
  const CustomerOutfitPlannerScreen({
    super.key,
    required this.auth,
    this.onImport,
    this.initialGarment,
    this.initialDay,
  });
  @override
  State<CustomerOutfitPlannerScreen> createState() =>
      _CustomerOutfitPlannerScreenState();
}

class _CustomerOutfitPlannerScreenState
    extends State<CustomerOutfitPlannerScreen> {
  late final planner = CustomerOutfitPlanner(
    widget.auth,
    today: widget.initialDay,
  );
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      await planner.load();
      if (mounted && planner.active && widget.initialGarment != null) {
        await edit(seed: widget.initialGarment);
      }
    });
  }

  @override
  void dispose() {
    planner.dispose();
    super.dispose();
  }

  Future<void> edit({Json? schedule, Json? seed}) async {
    final result = await Navigator.push<Json>(
      context,
      MaterialPageRoute(
        builder: (_) => CustomerOutfitScheduleEditor(
          planner: planner,
          schedule: schedule,
          initialGarment: seed,
        ),
      ),
    );
    if (mounted && planner.active) {
      if (result != null) {
        await planner.chooseDay(outfitDate(result['date'] as String));
      } else {
        await planner.load();
      }
    }
  }

  Future<void> jump() async {
    final date = await showDatePicker(
      context: context,
      initialDate: planner.selectedDay,
      firstDate: DateTime(1900),
      lastDate: DateTime(2199, 12, 31),
    );
    if (date != null && mounted && planner.active) {
      await planner.chooseDay(date);
    }
  }

  Future<void> remove(Json schedule) async {
    final yes = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const CustomerText('Delete scheduled outfit?'),
        content: const CustomerText('Your wardrobe garments will stay saved.'),
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
    if (yes != true || !mounted || !planner.active) return;
    try {
      await planner.remove(schedule['id'] as String);
    } catch (caught) {
      if (mounted && planner.active) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: CustomerText(
              CustomerExperience.message(caught),
              error: true,
            ),
          ),
        );
      }
    }
  }

  Future<void> reschedule(Json schedule) async {
    final available = (schedule['pieces'] as List).cast<Json>();
    if (available.any((piece) => piece['garment'] == null)) {
      await edit(schedule: schedule);
      return;
    }
    final date = await showDatePicker(
      context: context,
      initialDate: outfitDate(schedule['date'] as String),
      firstDate: DateTime(1900),
      lastDate: DateTime(2199, 12, 31),
    );
    if (date == null || !mounted || !planner.active) return;
    try {
      final result = await planner.save(schedule['id'] as String, {
        'date': outfitDateKey(date),
        'occasion': schedule['occasion'] ?? '',
        'notes': schedule['notes'] ?? '',
        'garmentIds': available
            .map((piece) => (piece['garment'] as Json)['id'])
            .toList(),
      }, version: (schedule['version'] as num).toInt());
      if (mounted && planner.active) {
        await planner.chooseDay(outfitDate(result['date'] as String));
      }
    } catch (caught) {
      if (mounted && planner.active) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: CustomerText(
              CustomerExperience.message(caught),
              error: true,
            ),
          ),
        );
      }
    }
  }

  void importPhotos() {
    final action = widget.onImport;
    if (action == null) return;
    Navigator.pop(context);
    unawaited(action());
  }

  @override
  Widget build(BuildContext context) => _PlannerAccountBoundary(
    auth: widget.auth,
    child: ListenableBuilder(
      listenable: planner,
      builder: (context, _) {
        final copy = CustomerCopy.of(context);
        return Scaffold(
          appBar: AppBar(
            title: const CustomerText('Outfit planner'),
            actions: [
              IconButton(
                tooltip: tr(context, 'Choose a date'),
                onPressed: jump,
                icon: const Icon(Icons.calendar_month_outlined),
              ),
            ],
          ),
          body: RefreshIndicator(
            onRefresh: planner.load,
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
              children: [
                const CustomerText(
                  'Choose a day, then build an outfit from your wardrobe.',
                  style: TextStyle(color: CustomerColors.muted),
                ),
                const SizedBox(height: 16),
                Material(
                  color: Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(20),
                    side: const BorderSide(color: CustomerColors.line),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      children: [
                        Row(
                          children: [
                            const Expanded(
                              child: CustomerText(
                                'Week planner',
                                style: TextStyle(fontWeight: FontWeight.w700),
                              ),
                            ),
                            IconButton(
                              tooltip: tr(context, 'Previous week'),
                              onPressed: planner.canPreviousWeek
                                  ? () => planner.shiftWeek(-1)
                                  : null,
                              icon: const Icon(Icons.chevron_left_rounded),
                            ),
                            IconButton(
                              tooltip: tr(context, 'Next week'),
                              onPressed: planner.canNextWeek
                                  ? () => planner.shiftWeek(1)
                                  : null,
                              icon: const Icon(Icons.chevron_right_rounded),
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Row(
                          children: [
                            for (var index = 0; index < 7; index++)
                              Expanded(
                                child: Builder(
                                  builder: (context) {
                                    final day = DateTime(
                                          planner.weekStart.year,
                                          planner.weekStart.month,
                                          planner.weekStart.day + index,
                                        ),
                                        key = outfitDateKey(day);
                                    final selected =
                                            key ==
                                            outfitDateKey(planner.selectedDay),
                                        hasOutfit =
                                            (planner.days[key] ?? 0) > 0;
                                    return Semantics(
                                      button: true,
                                      selected: selected,
                                      label: copy.date(day),
                                      child: Padding(
                                        padding: const EdgeInsets.symmetric(
                                          horizontal: 2,
                                        ),
                                        child: Material(
                                          color: selected
                                              ? CustomerColors.orange
                                              : Colors.white,
                                          borderRadius: BorderRadius.circular(
                                            12,
                                          ),
                                          child: InkWell(
                                            key: ValueKey('outfit-day-$key'),
                                            borderRadius: BorderRadius.circular(
                                              12,
                                            ),
                                            onTap: () => planner.chooseDay(day),
                                            child: Padding(
                                              padding:
                                                  const EdgeInsets.symmetric(
                                                    vertical: 8,
                                                  ),
                                              child: Column(
                                                children: [
                                                  FittedBox(
                                                    child: Text(
                                                      DateFormat.E(
                                                        copy.language,
                                                      ).format(day),
                                                      style: TextStyle(
                                                        fontSize: 11,
                                                        color: selected
                                                            ? Colors.white
                                                            : CustomerColors
                                                                  .muted,
                                                      ),
                                                    ),
                                                  ),
                                                  const SizedBox(height: 5),
                                                  FittedBox(
                                                    child: Text(
                                                      copy.number(day.day),
                                                      style: TextStyle(
                                                        fontSize: 18,
                                                        fontWeight:
                                                            FontWeight.w700,
                                                        color: selected
                                                            ? Colors.white
                                                            : CustomerColors
                                                                  .ink,
                                                      ),
                                                    ),
                                                  ),
                                                  const SizedBox(height: 4),
                                                  Container(
                                                    width: 5,
                                                    height: 5,
                                                    decoration: BoxDecoration(
                                                      shape: BoxShape.circle,
                                                      color: hasOutfit
                                                          ? (selected
                                                                ? Colors.white
                                                                : CustomerColors
                                                                      .orange)
                                                          : Colors.transparent,
                                                    ),
                                                  ),
                                                ],
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
                        ),
                        const SizedBox(height: 12),
                        const Divider(),
                        const SizedBox(height: 8),
                        Wrap(
                          alignment: WrapAlignment.spaceBetween,
                          crossAxisAlignment: WrapCrossAlignment.center,
                          spacing: 12,
                          runSpacing: 8,
                          children: [
                            Text(
                              copy.date(planner.selectedDay),
                              style: const TextStyle(
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            FilledButton.icon(
                              key: const ValueKey('add-scheduled-outfit'),
                              onPressed: planner.loading
                                  ? null
                                  : planner.hasWardrobeItems == false
                                  ? widget.onImport == null
                                        ? null
                                        : importPhotos
                                  : () => edit(),
                              icon: Icon(
                                planner.hasWardrobeItems == false
                                    ? Icons.photo_library_outlined
                                    : Icons.add_rounded,
                              ),
                              label: CustomerText(
                                planner.hasWardrobeItems == false
                                    ? 'Import photos'
                                    : 'Add outfit',
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 20),
                if (planner.loading && planner.items.isEmpty)
                  const Center(child: CircularProgressIndicator()),
                if (planner.error != null) ...[
                  CustomerNotice(planner.error!, error: true),
                  TextButton(
                    onPressed: () => planner.load(),
                    child: const CustomerText('Try again'),
                  ),
                ],
                if (!planner.loading &&
                    planner.error == null &&
                    planner.items.isEmpty) ...[
                  const SizedBox(height: 24),
                  const Icon(
                    Icons.checkroom_outlined,
                    size: 54,
                    color: CustomerColors.orange,
                  ),
                  const SizedBox(height: 16),
                  CustomerText(
                    planner.hasWardrobeItems == false
                        ? 'Your wardrobe is empty'
                        : 'No outfit scheduled for this day.',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 10),
                  CustomerText(
                    planner.hasWardrobeItems == false
                        ? 'Import clothing photos, then schedule your outfits.'
                        : 'Choose wardrobe pieces for an occasion or your everyday look.',
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: CustomerColors.muted),
                  ),
                ],
                for (final schedule in planner.items)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 14),
                    child: _ScheduleCard(
                      auth: widget.auth,
                      schedule: schedule,
                      onEdit: () => edit(schedule: schedule),
                      onMove: () => reschedule(schedule),
                      onDelete: () => remove(schedule),
                    ),
                  ),
                if (planner.hasMore)
                  TextButton(
                    onPressed: planner.loading
                        ? null
                        : () => planner.load(more: true),
                    child: CustomerText(
                      planner.loading ? 'Loading…' : 'Load more',
                    ),
                  ),
              ],
            ),
          ),
        );
      },
    ),
  );
}

class _ScheduleCard extends StatelessWidget {
  final CustomerController auth;
  final Json schedule;
  final VoidCallback onEdit, onMove, onDelete;
  const _ScheduleCard({
    required this.auth,
    required this.schedule,
    required this.onEdit,
    required this.onMove,
    required this.onDelete,
  });
  @override
  Widget build(BuildContext context) {
    final pieces = (schedule['pieces'] as List).cast<Json>();
    final occasion = schedule['occasion'] as String?;
    return Material(
      color: Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side: const BorderSide(color: CustomerColors.line),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: occasion?.isNotEmpty == true
                      ? Text(
                          occasion!,
                          style: Theme.of(context).textTheme.titleMedium,
                        )
                      : CustomerText(
                          'Scheduled outfit',
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                ),
                PopupMenuButton<String>(
                  tooltip: tr(context, 'More options'),
                  onSelected: (value) {
                    if (value == 'edit') {
                      onEdit();
                    } else if (value == 'move') {
                      onMove();
                    } else {
                      onDelete();
                    }
                  },
                  itemBuilder: (context) => [
                    PopupMenuItem(
                      value: 'edit',
                      child: const CustomerText('Edit outfit'),
                    ),
                    PopupMenuItem(
                      value: 'move',
                      child: const CustomerText('Move to another date'),
                    ),
                    PopupMenuItem(
                      value: 'delete',
                      child: const CustomerText('Delete'),
                    ),
                  ],
                ),
              ],
            ),
            SizedBox(
              height: 144,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: pieces.length,
                separatorBuilder: (context, index) => const SizedBox(width: 10),
                itemBuilder: (context, index) {
                  final garment = pieces[index]['garment'] as Json?;
                  return SizedBox(
                    width: 100,
                    child: Column(
                      children: [
                        Expanded(
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(12),
                            child: garment == null
                                ? const Center(
                                    child: Icon(
                                      Icons.image_not_supported_outlined,
                                      color: CustomerColors.muted,
                                    ),
                                  )
                                : WardrobeImage(
                                    auth: auth,
                                    id: garment['id'] as String,
                                  ),
                          ),
                        ),
                        const SizedBox(height: 7),
                        garment == null
                            ? const CustomerText(
                                'Garment unavailable',
                                maxLines: 2,
                                textAlign: TextAlign.center,
                                style: TextStyle(
                                  fontSize: 12,
                                  color: CustomerColors.muted,
                                ),
                              )
                            : Text(
                                garment['name'] as String,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                textAlign: TextAlign.center,
                                style: const TextStyle(fontSize: 12),
                              ),
                      ],
                    ),
                  );
                },
              ),
            ),
            if ((schedule['notes'] as String?)?.isNotEmpty == true)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Text(schedule['notes'] as String),
              ),
          ],
        ),
      ),
    );
  }
}

class CustomerOutfitScheduleEditor extends StatefulWidget {
  final CustomerOutfitPlanner planner;
  final Json? schedule, initialGarment;
  const CustomerOutfitScheduleEditor({
    super.key,
    required this.planner,
    this.schedule,
    this.initialGarment,
  });
  @override
  State<CustomerOutfitScheduleEditor> createState() =>
      _CustomerOutfitScheduleEditorState();
}

class _CustomerOutfitScheduleEditorState
    extends State<CustomerOutfitScheduleEditor> {
  late final id = widget.schedule?['id'] as String? ?? widget.planner.newId();
  late DateTime day = widget.schedule == null
      ? widget.planner.selectedDay
      : outfitDate(widget.schedule!['date'] as String);
  late final occasion = TextEditingController(
    text: widget.schedule?['occasion'] as String? ?? '',
  );
  late final notes = TextEditingController(
    text: widget.schedule?['notes'] as String? ?? '',
  );
  late List<Json?> garments = widget.schedule != null
      ? (widget.schedule!['pieces'] as List)
            .cast<Json>()
            .map((piece) => piece['garment'] as Json?)
            .toList()
      : [if (widget.initialGarment != null) widget.initialGarment];
  bool saving = false, locked = false;
  Json? request;
  String? error;
  @override
  void dispose() {
    occasion.dispose();
    notes.dispose();
    super.dispose();
  }

  Future<void> choose() async {
    final chosen = await Navigator.push<List<Json>>(
      context,
      MaterialPageRoute(
        builder: (_) => CustomerOutfitGarmentPicker(
          auth: widget.planner.auth,
          selected: garments.whereType<Json>().toList(),
        ),
      ),
    );
    if (chosen != null && mounted && widget.planner.active) {
      setState(() => garments = chosen);
    }
  }

  Future<void> save() async {
    if (saving || !widget.planner.active) return;
    if (garments.isEmpty || garments.any((item) => item == null)) {
      setState(
        () => error = 'Choose between 1 and 20 different wardrobe pieces.',
      );
      return;
    }
    request ??= {
      'date': outfitDateKey(day),
      'occasion': occasion.text.trim(),
      'notes': notes.text.trim(),
      'garmentIds': garments.map((item) => item!['id']).toList(),
    };
    setState(() {
      saving = true;
      locked = true;
      error = null;
    });
    try {
      final result = await widget.planner.save(
        id,
        request!,
        version: (widget.schedule?['version'] as num?)?.toInt(),
      );
      if (mounted && widget.planner.active) Navigator.pop(context, result);
    } catch (caught) {
      if (mounted && widget.planner.active) {
        setState(() {
          error = CustomerExperience.message(caught);
          if (caught is CustomerApiException && caught.status == 400) {
            locked = false;
            request = null;
          }
        });
      }
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  Future<void> date() async {
    final selected = await showDatePicker(
      context: context,
      initialDate: day,
      firstDate: DateTime(1900),
      lastDate: DateTime(2199, 12, 31),
    );
    if (selected != null && mounted && widget.planner.active) {
      setState(() => day = selected);
    }
  }

  @override
  Widget build(BuildContext context) => _PlannerAccountBoundary(
    auth: widget.planner.auth,
    child: PopScope(
      canPop: !saving,
      child: Scaffold(
        appBar: AppBar(
          title: CustomerText(
            widget.schedule == null ? 'Add outfit' : 'Edit outfit',
          ),
        ),
        body: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.calendar_today_outlined),
              title: Text(CustomerCopy.of(context).date(day)),
              trailing: IconButton(
                tooltip: tr(context, 'Choose a date'),
                onPressed: locked ? null : date,
                icon: const Icon(Icons.edit_calendar_outlined),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: occasion,
              enabled: !locked,
              maxLength: 80,
              decoration: InputDecoration(
                labelText: tr(context, 'Occasion (optional)'),
              ),
            ),
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: locked ? null : choose,
              icon: const Icon(Icons.checkroom_outlined),
              label: const CustomerText('Choose from wardrobe'),
            ),
            const SizedBox(height: 12),
            for (var index = 0; index < garments.length; index++)
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: SizedBox(
                  width: 52,
                  height: 64,
                  child: garments[index] == null
                      ? const Icon(Icons.image_not_supported_outlined)
                      : WardrobeImage(
                          auth: widget.planner.auth,
                          id: garments[index]!['id'] as String,
                        ),
                ),
                title: garments[index] == null
                    ? const CustomerText('Garment unavailable')
                    : Text(garments[index]!['name'] as String),
                trailing: IconButton(
                  tooltip: tr(context, 'Remove garment'),
                  onPressed: locked
                      ? null
                      : () => setState(() => garments.removeAt(index)),
                  icon: const Icon(Icons.close_rounded),
                ),
              ),
            const SizedBox(height: 12),
            TextField(
              controller: notes,
              enabled: !locked,
              maxLength: 500,
              minLines: 2,
              maxLines: 4,
              decoration: InputDecoration(
                labelText: tr(context, 'Notes (optional)'),
              ),
            ),
            const SizedBox(height: 12),
            const CustomerText(
              'Saved privately to your account. Scheduling uses no credits.',
              style: TextStyle(color: CustomerColors.muted),
            ),
            if (error != null) ...[
              const SizedBox(height: 12),
              CustomerNotice(error!, error: true),
            ],
            const SizedBox(height: 20),
            FilledButton(
              key: const ValueKey('save-scheduled-outfit'),
              onPressed: saving ? null : save,
              child: saving
                  ? const SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : CustomerText(error == null ? 'Save outfit' : 'Try again'),
            ),
          ],
        ),
      ),
    ),
  );
}

class CustomerOutfitGarmentPicker extends StatefulWidget {
  final CustomerController auth;
  final List<Json> selected;
  const CustomerOutfitGarmentPicker({
    super.key,
    required this.auth,
    required this.selected,
  });
  @override
  State<CustomerOutfitGarmentPicker> createState() =>
      _CustomerOutfitGarmentPickerState();
}

class _CustomerOutfitGarmentPickerState
    extends State<CustomerOutfitGarmentPicker> {
  late final wardrobe = CustomerWardrobe(widget.auth);
  late final chosen = <String, Json>{
    for (final item in widget.selected) item['id'] as String: item,
  };
  final search = TextEditingController();
  Timer? debounce;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) unawaited(wardrobe.load());
    });
  }

  @override
  void dispose() {
    debounce?.cancel();
    search.dispose();
    wardrobe.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => _PlannerAccountBoundary(
    auth: widget.auth,
    child: Scaffold(
      appBar: AppBar(
        title: const CustomerText('Choose from wardrobe'),
        actions: [
          TextButton(
            onPressed: chosen.isEmpty
                ? null
                : () => Navigator.pop(context, chosen.values.toList()),
            child: const CustomerText('Done'),
          ),
        ],
      ),
      body: ListenableBuilder(
        listenable: wardrobe,
        builder: (context, _) => ListView(
          padding: const EdgeInsets.all(16),
          children: [
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
                  for (final category in {
                    '': 'All',
                    ...wardrobeCategories,
                  }.entries)
                    Padding(
                      padding: const EdgeInsetsDirectional.only(end: 8),
                      child: ChoiceChip(
                        selected: wardrobe.category == category.key,
                        label: CustomerText(category.value),
                        onSelected: (_) {
                          debounce?.cancel();
                          unawaited(
                            wardrobe.load(
                              query: search.text,
                              filter: category.key,
                            ),
                          );
                        },
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            CustomerText(
              '${chosen.length} of 20',
              textAlign: TextAlign.end,
              style: const TextStyle(color: CustomerColors.muted),
            ),
            if (wardrobe.loading && wardrobe.items.isEmpty)
              const Center(child: CircularProgressIndicator()),
            if (wardrobe.error != null) ...[
              CustomerNotice(wardrobe.error!, error: true),
              TextButton(
                onPressed: () => wardrobe.load(),
                child: const CustomerText('Try again'),
              ),
            ],
            if (!wardrobe.loading &&
                wardrobe.error == null &&
                wardrobe.items.isEmpty)
              const CustomerText(
                'No garments match your search.',
                textAlign: TextAlign.center,
              ),
            for (final garment in wardrobe.items)
              CheckboxListTile(
                key: ValueKey('choose-outfit-${garment['id']}'),
                value: chosen.containsKey(garment['id']),
                onChanged:
                    chosen.length >= 20 && !chosen.containsKey(garment['id'])
                    ? null
                    : (selected) => setState(() {
                        if (selected == true) {
                          chosen[garment['id'] as String] = garment;
                        } else {
                          chosen.remove(garment['id']);
                        }
                      }),
                secondary: SizedBox(
                  width: 56,
                  height: 64,
                  child: WardrobeImage(
                    auth: widget.auth,
                    id: garment['id'] as String,
                  ),
                ),
                title: Text(garment['name'] as String),
                subtitle: CustomerText(
                  wardrobeCategories[garment['category']] ?? 'Other',
                ),
                contentPadding: EdgeInsets.zero,
              ),
            if (wardrobe.hasMore)
              TextButton(
                onPressed: wardrobe.loading
                    ? null
                    : () => wardrobe.load(more: true),
                child: CustomerText(
                  wardrobe.loading ? 'Loading…' : 'Load more',
                ),
              ),
          ],
        ),
      ),
    ),
  );
}

class _PlannerAccountBoundary extends StatefulWidget {
  final CustomerController auth;
  final Widget child;
  const _PlannerAccountBoundary({required this.auth, required this.child});
  @override
  State<_PlannerAccountBoundary> createState() =>
      _PlannerAccountBoundaryState();
}

class _PlannerAccountBoundaryState extends State<_PlannerAccountBoundary> {
  late final String? owner;
  bool get valid =>
      widget.auth.profile?.id == owner &&
      widget.auth.stage == CustomerStage.ready;
  @override
  void initState() {
    super.initState();
    owner = widget.auth.profile?.id;
    widget.auth.addListener(changed);
  }

  void changed() {
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
    widget.auth.removeListener(changed);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) =>
      valid ? widget.child : const Scaffold(body: SizedBox.shrink());
}
