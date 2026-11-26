import 'package:flutter/foundation.dart';
import 'package:uuid/uuid.dart';
import '../auth/customer_controller.dart';
import '../auth/customer_api.dart';
import '../experience/customer_experience.dart';

String outfitDateKey(DateTime date) =>
    '${date.year.toString().padLeft(4, '0')}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
DateTime outfitDate(String key) {
  final parts = key.split('-').map(int.parse).toList();
  return DateTime(parts[0], parts[1], parts[2]);
}

DateTime outfitCalendarDay(DateTime date) =>
    DateTime(date.year, date.month, date.day);
DateTime _plannerDay(DateTime day) => day.isBefore(DateTime(1900))
    ? DateTime(1900)
    : day.isAfter(DateTime(2199, 12, 31))
    ? DateTime(2199, 12, 31)
    : day;
DateTime _plannerWeek(DateTime day) =>
    day.isAfter(DateTime(2199, 12, 25)) ? DateTime(2199, 12, 25) : day;

class CustomerOutfitPlanner extends ChangeNotifier {
  final CustomerController auth;
  final String? owner;
  late DateTime selectedDay, weekStart;
  List<Json> items = [];
  Map<String, int> days = {};
  bool loading = false, hasMore = false;
  bool? hasWardrobeItems;
  String? error;
  int page = 0, _revision = 0;
  bool _disposed = false;
  CustomerOutfitPlanner(this.auth, {DateTime? today})
    : owner = auth.profile?.id {
    selectedDay = _plannerDay(outfitCalendarDay(today ?? DateTime.now()));
    weekStart = _plannerWeek(selectedDay);
    auth.addListener(authChanged);
  }
  bool get active =>
      !_disposed &&
      owner != null &&
      auth.stage == CustomerStage.ready &&
      auth.profile?.id == owner;
  DateTime get weekEnd =>
      DateTime(weekStart.year, weekStart.month, weekStart.day + 6);
  bool get canPreviousWeek => weekStart.isAfter(DateTime(1900));
  bool get canNextWeek => weekStart.isBefore(DateTime(2199, 12, 25));
  void _notify() {
    if (!_disposed) notifyListeners();
  }

  void authChanged() {
    if (!active) {
      ++_revision;
      items = [];
      days = {};
      loading = false;
      hasMore = false;
      hasWardrobeItems = null;
      error = null;
      _notify();
    }
  }

  Future<void> chooseDay(DateTime value) async {
    final day = _plannerDay(outfitCalendarDay(value));
    if (day.isBefore(weekStart) || day.isAfter(weekEnd)) {
      weekStart = _plannerWeek(day);
      days = {};
    }
    selectedDay = day;
    await load();
  }

  Future<void> shiftWeek(int amount) async {
    weekStart = _plannerWeek(
      _plannerDay(
        DateTime(weekStart.year, weekStart.month, weekStart.day + amount * 7),
      ),
    );
    selectedDay = weekStart;
    days = {};
    await load();
  }

  Future<void> load({bool more = false}) async {
    if (!active || (more && (loading || !hasMore))) return;
    final revision = ++_revision;
    if (!more) {
      items = [];
      page = 0;
      hasMore = false;
    }
    loading = true;
    error = null;
    _notify();
    try {
      final query = Uri(
        queryParameters: {
          'from': outfitDateKey(weekStart),
          'to': outfitDateKey(weekEnd),
          'day': outfitDateKey(selectedDay),
          'page': '${more ? page + 1 : 1}',
        },
      ).query;
      final result = await auth.authorized('/outfit-schedules?$query');
      if (!active || revision != _revision) return;
      final added = (result['items'] as List).cast<Json>();
      final existing = more ? items : <Json>[];
      items = [
        ...existing,
        ...added.where(
          (entry) => !existing.any((old) => old['id'] == entry['id']),
        ),
      ];
      page = (result['page'] as num).toInt();
      hasMore = result['hasMore'] == true;
      hasWardrobeItems = result['hasWardrobeItems'] == true;
      days = {
        for (final entry in (result['days'] as List).cast<Json>())
          entry['date'] as String: (entry['count'] as num).toInt(),
      };
    } catch (caught) {
      if (active && revision == _revision) {
        error = CustomerExperience.message(caught);
      }
    } finally {
      if (active && revision == _revision) {
        loading = false;
        _notify();
      }
    }
  }

  String newId() => const Uuid().v7();
  Future<Json> save(String id, Json input, {int? version}) async {
    if (!active) {
      throw const CustomerApiException(
        'CUSTOMER_UNAUTHORIZED',
        'Please sign in again.',
        401,
      );
    }
    final result = await auth.authorized(
      version == null ? '/outfit-schedules' : '/outfit-schedules/$id',
      method: version == null ? 'POST' : 'PATCH',
      body: {...input, if (version == null) 'id': id, 'version': ?version},
    );
    if (!active) {
      throw const CustomerApiException(
        'CUSTOMER_UNAUTHORIZED',
        'Please sign in again.',
        401,
      );
    }
    return result['item'] as Json;
  }

  Future<void> remove(String id) async {
    if (!active) return;
    await auth.authorized('/outfit-schedules/$id', method: 'DELETE');
    if (active) await load();
  }

  @override
  void dispose() {
    _disposed = true;
    ++_revision;
    auth.removeListener(authChanged);
    super.dispose();
  }
}
