import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../camera/camera_models.dart';
import '../live/frame_analysis_scheduler.dart';
import '../live/person_analysis.dart';
import '../session/capture_audio_service.dart';
import '../session/capture_flow.dart';
import '../session/capture_session_controller.dart';
import 'kiosk_chrome.dart';

class CameraSettingsScreen extends StatefulWidget {
  const CameraSettingsScreen({super.key, required this.controller});

  final CaptureSessionController controller;

  @override
  State<CameraSettingsScreen> createState() => _CameraSettingsScreenState();
}

class _CameraSettingsScreenState extends State<CameraSettingsScreen> {
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _refresh();
  }

  Future<void> _refresh() async {
    setState(() => _loading = true);
    try {
      await widget.controller.loadOperatorSettings();
      await widget.controller.refreshCameras();
    } catch (_) {
      // The controller publishes camera failures for the UI to render.
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return KioskScaffold(
      title: 'Camera Settings',
      subtitle: 'Local device configuration',
      leading: IconButton(
        onPressed: () => Navigator.of(context).pop(),
        icon: const Icon(Icons.arrow_back),
      ),
      child: AnimatedBuilder(
        animation: Listenable.merge([
          widget.controller,
          widget.controller.cameraService.state,
        ]),
        builder: (context, _) {
          final state = widget.controller.cameraService.state.value;
          return LayoutBuilder(
            builder: (context, constraints) {
              final portrait =
                  constraints.maxHeight > constraints.maxWidth * 1.12;
              final compact = constraints.maxWidth < 980 || portrait;
              final settings = _SettingsPanel(
                state: state,
                loading: _loading,
                countdownSeconds: widget.controller.captureCountdownSeconds,
                captureSoundsEnabled: widget.controller.captureSoundsEnabled,
                captureAudioProfile: widget.controller.captureAudioProfile,
                analysisDiagnostics: widget.controller.analysisDiagnostics,
                primarySubject: widget.controller.primarySubject,
                poseAnalyzerLatency: widget.controller.poseAnalyzerLatency,
                imageQualityAnalyzerLatency:
                    widget.controller.imageQualityAnalyzerLatency,
                onRefresh: _refresh,
                onSelectCamera: _selectCamera,
                onCountdownChanged:
                    widget.controller.updateCaptureCountdownSeconds,
                onCaptureSoundsChanged:
                    widget.controller.updateCaptureSoundsEnabled,
                onAudioProfileChanged:
                    widget.controller.updateCaptureAudioProfile,
                onPreviewSound: widget.controller.previewCaptureAudioProfile,
                onTestCamera: () => Navigator.of(context).pop(),
              );
              final preview = _PreviewCard(controller: widget.controller);

              if (compact) {
                final previewHeight = math.max(
                  portrait ? 360.0 : 260.0,
                  math.min(
                    portrait ? constraints.maxHeight * 0.32 : 420.0,
                    portrait
                        ? constraints.maxHeight * 0.42
                        : constraints.maxWidth * 0.56,
                  ),
                );
                return SingleChildScrollView(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      settings,
                      const SizedBox(height: 16),
                      SizedBox(height: previewHeight, child: preview),
                    ],
                  ),
                );
              }

              return Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  SizedBox(width: 460, child: settings),
                  const SizedBox(width: 24),
                  Expanded(child: preview),
                ],
              );
            },
          );
        },
      ),
    );
  }

  Future<void> _selectCamera(CameraDevice device) async {
    try {
      await widget.controller.selectCamera(device);
    } catch (_) {
      // The controller publishes camera failures for the UI to render.
    }
  }
}

class _SettingsPanel extends StatelessWidget {
  const _SettingsPanel({
    required this.state,
    required this.loading,
    required this.countdownSeconds,
    required this.captureSoundsEnabled,
    required this.captureAudioProfile,
    required this.analysisDiagnostics,
    required this.primarySubject,
    required this.poseAnalyzerLatency,
    required this.imageQualityAnalyzerLatency,
    required this.onRefresh,
    required this.onSelectCamera,
    required this.onCountdownChanged,
    required this.onCaptureSoundsChanged,
    required this.onAudioProfileChanged,
    required this.onPreviewSound,
    required this.onTestCamera,
  });

  final CameraState state;
  final bool loading;
  final int countdownSeconds;
  final bool captureSoundsEnabled;
  final CaptureAudioProfile captureAudioProfile;
  final FrameAnalysisDiagnostics? analysisDiagnostics;
  final PrimarySubject? primarySubject;
  final Duration? poseAnalyzerLatency;
  final Duration? imageQualityAnalyzerLatency;
  final VoidCallback onRefresh;
  final ValueChanged<CameraDevice> onSelectCamera;
  final ValueChanged<int> onCountdownChanged;
  final ValueChanged<bool> onCaptureSoundsChanged;
  final ValueChanged<CaptureAudioProfile> onAudioProfileChanged;
  final VoidCallback onPreviewSound;
  final VoidCallback onTestCamera;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Detected cameras',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 16),
            if (loading)
              const LinearProgressIndicator()
            else if (state.devices.isEmpty)
              const Text('No cameras detected.')
            else
              DropdownButtonFormField<String>(
                key: const Key('camera-selector'),
                initialValue: state.selectedDevice?.id,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Camera'),
                items: [
                  for (final device in state.devices)
                    DropdownMenuItem(
                      value: device.id,
                      child: Text(
                        device.label,
                        overflow: TextOverflow.ellipsis,
                        maxLines: 2,
                      ),
                    ),
                ],
                onChanged: (cameraId) {
                  final device = state.devices
                      .where((candidate) => candidate.id == cameraId)
                      .firstOrNull;
                  if (device != null) {
                    onSelectCamera(device);
                  }
                },
              ),
            const SizedBox(height: 24),
            _InfoRow(
              label: 'Preferred camera',
              value: state.selectedDevice?.label ?? 'Not selected',
            ),
            _InfoRow(label: 'Connection', value: _statusLabel(state.status)),
            _InfoRow(
              label: 'Resolution',
              value: state.capabilities.resolutionLabel,
            ),
            _InfoRow(
              label: 'Native backend',
              value: state.capabilities.nativeBackend,
            ),
            _InfoRow(
              label: 'Live frames',
              value: state.capabilities.supportsLiveFrames
                  ? 'Backend capable'
                  : 'Not supported',
            ),
            if (state.capabilities.notes.isNotEmpty) ...[
              const SizedBox(height: 18),
              for (final note in state.capabilities.notes)
                Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: Text(note),
                ),
            ],
            const SizedBox(height: 28),
            const Divider(),
            const SizedBox(height: 22),
            Text(
              'Capture Experience',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 16),
            DropdownButtonFormField<int>(
              key: const Key('countdown-duration-selector'),
              initialValue: countdownSeconds,
              decoration: const InputDecoration(labelText: 'Countdown'),
              items: [
                for (final seconds in allowedCaptureCountdownSeconds)
                  DropdownMenuItem<int>(
                    value: seconds,
                    child: Text('$seconds seconds'),
                  ),
              ],
              onChanged: (seconds) {
                if (seconds != null) {
                  onCountdownChanged(seconds);
                }
              },
            ),
            const SizedBox(height: 12),
            SwitchListTile(
              key: const Key('capture-sounds-toggle'),
              contentPadding: EdgeInsets.zero,
              title: const Text('Capture sounds'),
              subtitle: const Text('Countdown, shutter and success cues'),
              value: captureSoundsEnabled,
              onChanged: onCaptureSoundsChanged,
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<CaptureAudioProfile>(
              key: const Key('capture-audio-profile-selector'),
              initialValue: captureAudioProfile,
              decoration: const InputDecoration(labelText: 'Sound profile'),
              items: [
                for (final profile in CaptureAudioProfile.values)
                  DropdownMenuItem<CaptureAudioProfile>(
                    value: profile,
                    child: Text(profile.label),
                  ),
              ],
              onChanged: captureSoundsEnabled
                  ? (profile) {
                      if (profile != null) {
                        onAudioProfileChanged(profile);
                      }
                    }
                  : null,
            ),
            const SizedBox(height: 12),
            OutlinedButton.icon(
              key: const Key('preview-capture-sound'),
              onPressed: captureSoundsEnabled ? onPreviewSound : null,
              icon: const Icon(Icons.volume_up_outlined),
              label: const Text('Preview Sound'),
            ),
            const SizedBox(height: 24),
            const Divider(),
            const SizedBox(height: 22),
            Text(
              'Live diagnostics',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 12),
            if (analysisDiagnostics == null)
              const Text('Live analysis has not run in this session.')
            else ...[
              _InfoRow(
                label: 'Analysis FPS',
                value: analysisDiagnostics!.effectiveFps.toStringAsFixed(1),
              ),
              _InfoRow(
                label: 'Target FPS',
                value: analysisDiagnostics!.targetFps.toStringAsFixed(1),
              ),
              _InfoRow(
                label: 'Dropped frames',
                value: analysisDiagnostics!.droppedFrameCount.toString(),
              ),
              _InfoRow(
                label: 'Pose latency',
                value: _durationLabel(poseAnalyzerLatency),
              ),
              _InfoRow(
                label: 'Quality latency',
                value: _durationLabel(imageQualityAnalyzerLatency),
              ),
              _InfoRow(
                label: 'Primary subject',
                value: _primarySubjectLabel(primarySubject),
              ),
              _InfoRow(
                label: 'Prominence',
                value:
                    primarySubject?.visualProminenceScore.toStringAsFixed(2) ??
                    'Unavailable',
              ),
              _InfoRow(
                label: 'Target region',
                value: _targetRegionLabel(primarySubject?.targetRegion),
              ),
              _InfoRow(
                label: 'Tracking age',
                value: primarySubject == null
                    ? 'Unavailable'
                    : '${primarySubject!.observedFrameCount} frames',
              ),
              _InfoRow(
                label: 'Pose analyzer',
                value:
                    primarySubject?.analyzerCapabilities.displayName ??
                    'ML Kit / single-primary',
              ),
              const _InfoRow(
                label: 'Multi-person awareness',
                value: 'Unsupported',
              ),
            ],
            const SizedBox(height: 24),
            Wrap(
              spacing: 12,
              runSpacing: 12,
              children: [
                OutlinedButton.icon(
                  key: const Key('refresh-cameras'),
                  onPressed: onRefresh,
                  icon: const Icon(Icons.refresh),
                  label: const Text('Refresh Cameras'),
                ),
                ElevatedButton.icon(
                  key: const Key('test-camera'),
                  onPressed: onTestCamera,
                  icon: const Icon(Icons.photo_camera_outlined),
                  label: const Text('Test Camera'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _PreviewCard extends StatelessWidget {
  const _PreviewCard({required this.controller});

  final CaptureSessionController controller;

  @override
  Widget build(BuildContext context) {
    final state = controller.cameraService.state.value;
    return Card(
      child: ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child:
            state.status == CameraStatus.ready ||
                state.status == CameraStatus.capturing
            ? FittedBox(
                fit: BoxFit.cover,
                child: SizedBox(
                  width: 1280,
                  height: 720,
                  child: controller.cameraService.buildPreview(context),
                ),
              )
            : const Center(
                child: Text('Preview starts when a camera is ready.'),
              ),
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 7),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Flexible(
            child: Text(label, overflow: TextOverflow.ellipsis, maxLines: 2),
          ),
          const SizedBox(width: 18),
          Flexible(
            flex: 2,
            child: Text(
              value,
              textAlign: TextAlign.end,
              overflow: TextOverflow.ellipsis,
              maxLines: 2,
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
          ),
        ],
      ),
    );
  }
}

String _statusLabel(CameraStatus status) {
  return switch (status) {
    CameraStatus.idle => 'Idle',
    CameraStatus.discovering => 'Discovering',
    CameraStatus.noDevices => 'No devices',
    CameraStatus.initializing => 'Initializing',
    CameraStatus.ready => 'Connected',
    CameraStatus.capturing => 'Capturing',
    CameraStatus.disconnected => 'Disconnected',
    CameraStatus.failed => 'Failed',
    CameraStatus.disposed => 'Disposed',
  };
}

String _durationLabel(Duration? duration) {
  if (duration == null) {
    return 'Unavailable';
  }
  return '${duration.inMilliseconds} ms';
}

String _primarySubjectLabel(PrimarySubject? subject) {
  if (subject == null) {
    return 'Not locked';
  }
  return switch (subject.lockState) {
    PrimarySubjectLockState.locked => 'Locked',
    PrimarySubjectLockState.absent => 'Temporarily absent',
    PrimarySubjectLockState.unlocked => 'Not locked',
  };
}

String _targetRegionLabel(TargetSubjectRegion? region) {
  if (region == null) {
    return 'Unavailable';
  }
  return [
    region.x,
    region.y,
    region.width,
    region.height,
  ].map((value) => value.toStringAsFixed(2)).join(', ');
}

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
