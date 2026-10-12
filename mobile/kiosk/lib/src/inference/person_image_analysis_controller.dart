import 'dart:async';

import 'package:flutter/foundation.dart';

import 'accepted_person_image_analysis.dart';

enum PersonImageAnalysisStatus { idle, pending, available, unavailable }

class PersonImageAnalysisSnapshot {
  const PersonImageAnalysisSnapshot({
    this.status = PersonImageAnalysisStatus.idle,
    this.analysis,
  });
  final PersonImageAnalysisStatus status;
  final AcceptedPersonImageAnalysis? analysis;
}

/// Session-memory only. Owns the analyzer, not image files or navigation.
/// One active inference plus at most one pending latest accepted image.
class PersonImageAnalysisController extends ChangeNotifier {
  PersonImageAnalysisController([this._analyzer]);

  final AcceptedPersonImageAnalyzer? _analyzer;
  PersonImageAnalysisSnapshot _snapshot = const PersonImageAnalysisSnapshot();
  PersonImageAnalysisSnapshot get snapshot => _snapshot;
  (String, DateTime)? _acceptedImage;
  ({int revision, String path})? _pending;
  int _revision = 0;
  bool _scheduledOrRunning = false;
  bool _disposed = false;

  void acceptImage(String path, {required DateTime createdAt}) {
    if (_disposed || _acceptedImage == (path, createdAt)) return;
    _acceptedImage = (path, createdAt);
    final revision = ++_revision;
    _pending = null;
    if (_analyzer == null) {
      _publish(const PersonImageAnalysisSnapshot());
      return;
    }
    _pending = (revision: revision, path: path);
    _publish(
      const PersonImageAnalysisSnapshot(
        status: PersonImageAnalysisStatus.pending,
      ),
    );
    if (!_scheduledOrRunning) {
      _scheduledOrRunning = true;
      // Event scheduling avoids synchronous work on the navigation stack.
      unawaited(Future<void>(_drain));
    }
  }

  void clear() {
    if (_disposed) return;
    ++_revision;
    _acceptedImage = null;
    _pending = null;
    _publish(const PersonImageAnalysisSnapshot());
  }

  Future<void> _drain() async {
    try {
      while (!_disposed && _pending != null) {
        final request = _pending!;
        _pending = null;
        AcceptedPersonImageAnalysis? analysis;
        try {
          analysis = await _analyzer!.analyzeFile(request.path);
        } catch (_) {
          // Optional analysis must never become a capture or try-on error.
        }
        if (!_disposed && request.revision == _revision) {
          _publish(
            PersonImageAnalysisSnapshot(
              status: analysis?.isAvailable == true
                  ? PersonImageAnalysisStatus.available
                  : PersonImageAnalysisStatus.unavailable,
              analysis: analysis,
            ),
          );
        }
      }
    } finally {
      _scheduledOrRunning = false;
    }
  }

  void _publish(PersonImageAnalysisSnapshot snapshot) {
    _snapshot = snapshot;
    // Separate notifier: completion does not rebuild capture UI or drive
    // readiness/countdown/backend-session listeners.
    notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    ++_revision;
    _acceptedImage = null;
    _pending = null;
    _snapshot = const PersonImageAnalysisSnapshot();
    unawaited(_disposeAnalyzer());
    super.dispose();
  }

  Future<void> _disposeAnalyzer() async {
    try {
      await _analyzer?.dispose();
    } catch (_) {
      // Optional shutdown must not interrupt session cleanup.
    }
  }
}
