import 'dart:async';

import 'package:flutter/foundation.dart';

import 'live_frame.dart';

class FrameAnalysisSchedulerConfig {
  const FrameAnalysisSchedulerConfig({
    this.initialTargetFps = 3,
    this.minimumTargetFps = 1,
    this.slowAnalysisThreshold = const Duration(milliseconds: 420),
  });

  final double initialTargetFps;
  final double minimumTargetFps;
  final Duration slowAnalysisThreshold;

  Duration get initialInterval {
    return Duration(milliseconds: (1000 / initialTargetFps).round());
  }
}

class FrameAnalysisDiagnostics {
  const FrameAnalysisDiagnostics({
    required this.targetFps,
    required this.effectiveFps,
    required this.droppedFrameCount,
    required this.lastAnalysisDuration,
  });

  final double targetFps;
  final double effectiveFps;
  final int droppedFrameCount;
  final Duration? lastAnalysisDuration;
}

class FrameAnalysisScheduler {
  FrameAnalysisScheduler({
    required this._analyze,
    this.config = const FrameAnalysisSchedulerConfig(),
  }) : _targetInterval = config.initialInterval;

  final FrameAnalysisSchedulerConfig config;

  final Future<void> Function(LiveCameraFrame frame) _analyze;

  final ValueNotifier<FrameAnalysisDiagnostics> diagnostics = ValueNotifier(
    const FrameAnalysisDiagnostics(
      targetFps: 3,
      effectiveFps: 0,
      droppedFrameCount: 0,
      lastAnalysisDuration: null,
    ),
  );

  Duration _targetInterval;
  LiveCameraFrame? _latestPending;
  DateTime? _lastStartedAt;
  DateTime? _firstCompletedAt;
  int _completedCount = 0;
  int _droppedFrameCount = 0;
  bool _running = false;
  bool _disposed = false;

  void submit(LiveCameraFrame frame) {
    if (_disposed) {
      return;
    }
    final lastStartedAt = _lastStartedAt;
    if (_running ||
        (lastStartedAt != null &&
            frame.timestamp.difference(lastStartedAt) < _targetInterval)) {
      if (_latestPending != null) {
        _droppedFrameCount++;
      }
      _latestPending = frame;
      _publish(lastDuration: diagnostics.value.lastAnalysisDuration);
      return;
    }
    unawaited(_run(frame));
  }

  Future<void> flush() async {
    while (_running) {
      await Future<void>.delayed(const Duration(milliseconds: 1));
    }
  }

  void dispose() {
    _disposed = true;
    _latestPending = null;
    diagnostics.dispose();
  }

  Future<void> _run(LiveCameraFrame frame) async {
    _running = true;
    _lastStartedAt = frame.timestamp;
    final stopwatch = Stopwatch()..start();
    try {
      await _analyze(frame);
    } finally {
      stopwatch.stop();
      _completedCount++;
      _firstCompletedAt ??= DateTime.now();
      _adaptIfNeeded(stopwatch.elapsed);
      _publish(lastDuration: stopwatch.elapsed);
      _running = false;
      final pending = _latestPending;
      _latestPending = null;
      if (!_disposed && pending != null) {
        unawaited(_run(pending));
      }
    }
  }

  void _adaptIfNeeded(Duration elapsed) {
    if (elapsed <= config.slowAnalysisThreshold) {
      return;
    }
    final currentFps = 1000 / _targetInterval.inMilliseconds;
    final nextFps = (currentFps - 1).clamp(
      config.minimumTargetFps,
      config.initialTargetFps,
    );
    _targetInterval = Duration(milliseconds: (1000 / nextFps).round());
  }

  void _publish({required Duration? lastDuration}) {
    final started = _firstCompletedAt;
    var effectiveFps = 0.0;
    if (started != null && _completedCount > 0) {
      final elapsed = DateTime.now().difference(started).inMilliseconds;
      if (elapsed > 0) {
        effectiveFps = _completedCount * 1000 / elapsed;
      }
    }
    diagnostics.value = FrameAnalysisDiagnostics(
      targetFps: 1000 / _targetInterval.inMilliseconds,
      effectiveFps: effectiveFps,
      droppedFrameCount: _droppedFrameCount,
      lastAnalysisDuration: lastDuration,
    );
  }
}
