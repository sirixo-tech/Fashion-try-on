import 'dart:io';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../camera/camera_models.dart';
import '../live/frame_analysis_scheduler.dart';
import '../live/person_analysis.dart';
import '../session/capture_audio_service.dart';
import '../session/capture_flow.dart';
import '../session/capture_session_controller.dart';
import '../theme/selfx_kiosk_theme.dart';
import 'kiosk_chrome.dart';

class CameraSettingsScreen extends StatefulWidget {
  const CameraSettingsScreen({super.key, required this.controller});

  final CaptureSessionController controller;

  @override
  State<CameraSettingsScreen> createState() => _CameraSettingsScreenState();
}

class _CameraSettingsScreenState extends State<CameraSettingsScreen> {
  bool _loading = true;
  _OperatorSettingsCategory _selectedCategory =
      _OperatorSettingsCategory.camera;

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
      title: 'Operator Settings',
      subtitle: 'Local kiosk configuration',
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
          return _OperatorSettingsWorkspace(
            state: state,
            selectedCategory: _selectedCategory,
            loading: _loading,
            countdownSeconds: widget.controller.captureCountdownSeconds,
            captureSoundsEnabled: widget.controller.captureSoundsEnabled,
            captureAudioProfile: widget.controller.captureAudioProfile,
            analysisDiagnostics: widget.controller.analysisDiagnostics,
            primarySubject: widget.controller.primarySubject,
            poseAnalyzerLatency: widget.controller.poseAnalyzerLatency,
            imageQualityAnalyzerLatency:
                widget.controller.imageQualityAnalyzerLatency,
            preview: _PreviewPanel(controller: widget.controller),
            onCategoryChanged: (category) {
              setState(() => _selectedCategory = category);
            },
            onRefresh: _refresh,
            onSelectCamera: _selectCamera,
            onCountdownChanged: widget.controller.updateCaptureCountdownSeconds,
            onCaptureSoundsChanged: widget.controller.updateCaptureSoundsEnabled,
            onAudioProfileChanged: widget.controller.updateCaptureAudioProfile,
            onPreviewSound: widget.controller.previewCaptureAudioProfile,
            onTestCamera: () => Navigator.of(context).pop(),
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

class _OperatorSettingsWorkspace extends StatelessWidget {
  const _OperatorSettingsWorkspace({
    required this.state,
    required this.selectedCategory,
    required this.loading,
    required this.countdownSeconds,
    required this.captureSoundsEnabled,
    required this.captureAudioProfile,
    required this.analysisDiagnostics,
    required this.primarySubject,
    required this.poseAnalyzerLatency,
    required this.imageQualityAnalyzerLatency,
    required this.preview,
    required this.onCategoryChanged,
    required this.onRefresh,
    required this.onSelectCamera,
    required this.onCountdownChanged,
    required this.onCaptureSoundsChanged,
    required this.onAudioProfileChanged,
    required this.onPreviewSound,
    required this.onTestCamera,
  });

  final CameraState state;
  final _OperatorSettingsCategory selectedCategory;
  final bool loading;
  final int countdownSeconds;
  final bool captureSoundsEnabled;
  final CaptureAudioProfile captureAudioProfile;
  final FrameAnalysisDiagnostics? analysisDiagnostics;
  final PrimarySubject? primarySubject;
  final Duration? poseAnalyzerLatency;
  final Duration? imageQualityAnalyzerLatency;
  final Widget preview;
  final ValueChanged<_OperatorSettingsCategory> onCategoryChanged;
  final VoidCallback onRefresh;
  final ValueChanged<CameraDevice> onSelectCamera;
  final ValueChanged<int> onCountdownChanged;
  final ValueChanged<bool> onCaptureSoundsChanged;
  final ValueChanged<CaptureAudioProfile> onAudioProfileChanged;
  final VoidCallback onPreviewSound;
  final VoidCallback onTestCamera;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final portrait = constraints.maxHeight > constraints.maxWidth * 1.12;
        final compact = constraints.maxWidth < 980 || portrait;
        final content = _SettingsCategoryContent(
          category: selectedCategory,
          state: state,
          loading: loading,
          countdownSeconds: countdownSeconds,
          captureSoundsEnabled: captureSoundsEnabled,
          captureAudioProfile: captureAudioProfile,
          analysisDiagnostics: analysisDiagnostics,
          primarySubject: primarySubject,
          poseAnalyzerLatency: poseAnalyzerLatency,
          imageQualityAnalyzerLatency: imageQualityAnalyzerLatency,
          onRefresh: onRefresh,
          onSelectCamera: onSelectCamera,
          onCountdownChanged: onCountdownChanged,
          onCaptureSoundsChanged: onCaptureSoundsChanged,
          onAudioProfileChanged: onAudioProfileChanged,
          onPreviewSound: onPreviewSound,
          onTestCamera: onTestCamera,
        );

        if (compact) {
          final previewHeight = math.max(
            220.0,
            math.min(360.0, constraints.maxHeight * 0.28),
          );
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _CategoryTabs(
                selectedCategory: selectedCategory,
                onChanged: onCategoryChanged,
              ),
              const SizedBox(height: 14),
              Expanded(
                child: SingleChildScrollView(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      content,
                      const SizedBox(height: 16),
                      SizedBox(height: previewHeight, child: preview),
                    ],
                  ),
                ),
              ),
            ],
          );
        }

        final previewWidth = math.max(
          300.0,
          math.min(420.0, constraints.maxWidth * 0.3),
        );
        return Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SizedBox(
              width: 220,
              child: _SettingsNavigationRail(
                selectedCategory: selectedCategory,
                onChanged: onCategoryChanged,
              ),
            ),
            const SizedBox(width: 18),
            Expanded(
              child: SingleChildScrollView(child: content),
            ),
            const SizedBox(width: 18),
            SizedBox(
              width: previewWidth,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _CameraSummaryCard(state: state),
                  const SizedBox(height: 16),
                  AspectRatio(aspectRatio: 16 / 9, child: preview),
                ],
              ),
            ),
          ],
        );
      },
    );
  }
}

class _SettingsNavigationRail extends StatelessWidget {
  const _SettingsNavigationRail({
    required this.selectedCategory,
    required this.onChanged,
  });

  final _OperatorSettingsCategory selectedCategory;
  final ValueChanged<_OperatorSettingsCategory> onChanged;

  @override
  Widget build(BuildContext context) {
    return _SolidPanel(
      child: ListView.separated(
        padding: const EdgeInsets.all(10),
        itemCount: _OperatorSettingsCategory.values.length,
        separatorBuilder: (_, _) => const SizedBox(height: 6),
        itemBuilder: (context, index) {
          final category = _OperatorSettingsCategory.values[index];
          final selected = category == selectedCategory;
          return _CategoryButton(
            category: category,
            selected: selected,
            onTap: () => onChanged(category),
          );
        },
      ),
    );
  }
}

class _CategoryTabs extends StatelessWidget {
  const _CategoryTabs({
    required this.selectedCategory,
    required this.onChanged,
  });

  final _OperatorSettingsCategory selectedCategory;
  final ValueChanged<_OperatorSettingsCategory> onChanged;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          for (final category in _OperatorSettingsCategory.values) ...[
            _CategoryChip(
              category: category,
              selected: category == selectedCategory,
              onTap: () => onChanged(category),
            ),
            const SizedBox(width: 8),
          ],
        ],
      ),
    );
  }
}

class _CategoryButton extends StatelessWidget {
  const _CategoryButton({
    required this.category,
    required this.selected,
    required this.onTap,
  });

  final _OperatorSettingsCategory category;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = selected
        ? SelfxKioskTokens.primary
        : SelfxKioskTokens.textSecondary;
    return InkWell(
      borderRadius: BorderRadius.circular(8),
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 140),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 13),
        decoration: BoxDecoration(
          color: selected
              ? SelfxKioskTokens.primary.withValues(alpha: 0.1)
              : Colors.transparent,
          border: Border.all(
            color: selected
                ? SelfxKioskTokens.primary.withValues(alpha: 0.42)
                : Colors.transparent,
          ),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Row(
          children: [
            Icon(category.icon, color: color, size: 22),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                category.label,
                style: TextStyle(
                  color: color,
                  fontWeight: selected ? FontWeight.w900 : FontWeight.w700,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CategoryChip extends StatelessWidget {
  const _CategoryChip({
    required this.category,
    required this.selected,
    required this.onTap,
  });

  final _OperatorSettingsCategory category;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ChoiceChip(
      selected: selected,
      avatar: Icon(
        category.icon,
        size: 18,
        color: selected
            ? SelfxKioskTokens.onPrimary
            : SelfxKioskTokens.textSecondary,
      ),
      label: Text(category.label),
      onSelected: (_) => onTap(),
      selectedColor: SelfxKioskTokens.primary,
      backgroundColor: SelfxKioskTokens.surface,
      labelStyle: TextStyle(
        color: selected
            ? SelfxKioskTokens.onPrimary
            : SelfxKioskTokens.textPrimary,
        fontWeight: FontWeight.w800,
      ),
      side: BorderSide(
        color: selected ? SelfxKioskTokens.primary : SelfxKioskTokens.border,
      ),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
    );
  }
}

class _SettingsCategoryContent extends StatelessWidget {
  const _SettingsCategoryContent({
    required this.category,
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

  final _OperatorSettingsCategory category;
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
    return _SettingsSurface(
      title: category.label,
      description: category.description,
      child: switch (category) {
        _OperatorSettingsCategory.camera => _CameraSection(
            state: state,
            loading: loading,
            onRefresh: onRefresh,
            onSelectCamera: onSelectCamera,
          ),
        _OperatorSettingsCategory.capture => _CaptureSection(
            countdownSeconds: countdownSeconds,
            onCountdownChanged: onCountdownChanged,
          ),
        _OperatorSettingsCategory.display => const _DisplaySection(),
        _OperatorSettingsCategory.audio => _AudioSection(
            captureSoundsEnabled: captureSoundsEnabled,
            captureAudioProfile: captureAudioProfile,
            onCaptureSoundsChanged: onCaptureSoundsChanged,
            onAudioProfileChanged: onAudioProfileChanged,
            onPreviewSound: onPreviewSound,
          ),
        _OperatorSettingsCategory.diagnostics => _DiagnosticsSection(
            state: state,
            analysisDiagnostics: analysisDiagnostics,
            primarySubject: primarySubject,
            poseAnalyzerLatency: poseAnalyzerLatency,
            imageQualityAnalyzerLatency: imageQualityAnalyzerLatency,
          ),
        _OperatorSettingsCategory.system => _SystemSection(
            onRefresh: onRefresh,
            onTestCamera: onTestCamera,
          ),
      },
    );
  }
}

class _CameraSection extends StatelessWidget {
  const _CameraSection({
    required this.state,
    required this.loading,
    required this.onRefresh,
    required this.onSelectCamera,
  });

  final CameraState state;
  final bool loading;
  final VoidCallback onRefresh;
  final ValueChanged<CameraDevice> onSelectCamera;

  @override
  Widget build(BuildContext context) {
    final selectedDevice = state.selectedDevice;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _StatusBanner(
          icon: _statusIcon(state.status),
          label: _statusLabel(state.status),
          tone: _statusTone(state.status),
          description: selectedDevice?.label ?? 'No camera selected',
        ),
        const SizedBox(height: 20),
        if (loading)
          const LinearProgressIndicator()
        else if (state.devices.isEmpty)
          const _EmptyPanel(
            icon: Icons.videocam_off_outlined,
            title: 'No cameras detected',
            message: 'Connect a camera and refresh detected devices.',
          )
        else
          DropdownButtonFormField<String>(
            key: const Key('camera-selector'),
            initialValue: selectedDevice?.id,
            isExpanded: true,
            decoration: const InputDecoration(
              labelText: 'Camera',
              helperText: 'Human-readable camera name is shown first.',
            ),
            items: [
              for (final device in state.devices)
                DropdownMenuItem(
                  value: device.id,
                  child: Text(device.label, overflow: TextOverflow.ellipsis),
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
        const SizedBox(height: 20),
        _InfoGrid(
          rows: [
            _InfoItem(
              label: 'Camera',
              value: selectedDevice?.label ?? 'Not selected',
            ),
            _InfoItem(label: 'Connection', value: _statusLabel(state.status)),
            _InfoItem(
              label: 'Resolution',
              value: state.capabilities.resolutionLabel,
            ),
            _InfoItem(label: 'Platform', value: Platform.operatingSystem),
          ],
        ),
        const SizedBox(height: 20),
        Align(
          alignment: Alignment.centerLeft,
          child: OutlinedButton.icon(
            key: const Key('refresh-cameras'),
            onPressed: onRefresh,
            icon: const Icon(Icons.refresh),
            label: const Text('Refresh Cameras'),
          ),
        ),
      ],
    );
  }
}

class _CaptureSection extends StatelessWidget {
  const _CaptureSection({
    required this.countdownSeconds,
    required this.onCountdownChanged,
  });

  final int countdownSeconds;
  final ValueChanged<int> onCountdownChanged;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const _FieldHeader(
          title: 'Assisted countdown',
          description: 'Customers see one guided countdown before still capture.',
        ),
        SegmentedButton<int>(
          key: const Key('countdown-duration-selector'),
          selected: {countdownSeconds},
          segments: [
            for (final seconds in allowedCaptureCountdownSeconds)
              ButtonSegment<int>(
                value: seconds,
                label: Text('$seconds sec'),
                icon: const Icon(Icons.timer_outlined),
              ),
          ],
          onSelectionChanged: (selection) {
            onCountdownChanged(selection.first);
          },
        ),
        const SizedBox(height: 24),
        const _StatusBanner(
          icon: Icons.photo_camera_outlined,
          label: 'Capture behavior',
          tone: _StatusTone.info,
          description:
              'Readiness, countdown, still capture, review and Photo Ready remain local.',
        ),
      ],
    );
  }
}

class _DisplaySection extends StatelessWidget {
  const _DisplaySection();

  @override
  Widget build(BuildContext context) {
    return const Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _InfoGrid(
          rows: [
            _InfoItem(label: 'Idle mode', value: 'Local default wallpaper'),
            _InfoItem(
              label: 'Wallpaper source',
              value: 'Bundled SelfX asset / local cache ready',
            ),
            _InfoItem(label: 'Presentation', value: 'Static or slideshow ready'),
            _InfoItem(label: 'SaaS sync', value: 'Future organization feature'),
          ],
        ),
        SizedBox(height: 20),
        _StatusBanner(
          icon: Icons.wallpaper_outlined,
          label: 'Offline fallback ready',
          tone: _StatusTone.success,
          description:
              'The bundled wallpaper remains available until organization kiosk wallpapers are synced later.',
        ),
      ],
    );
  }
}

class _AudioSection extends StatelessWidget {
  const _AudioSection({
    required this.captureSoundsEnabled,
    required this.captureAudioProfile,
    required this.onCaptureSoundsChanged,
    required this.onAudioProfileChanged,
    required this.onPreviewSound,
  });

  final bool captureSoundsEnabled;
  final CaptureAudioProfile captureAudioProfile;
  final ValueChanged<bool> onCaptureSoundsChanged;
  final ValueChanged<CaptureAudioProfile> onAudioProfileChanged;
  final VoidCallback onPreviewSound;

  @override
  Widget build(BuildContext context) {
    const futureProfiles = ['SelfX Signature', 'Studio', 'Muted'];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Material(
          color: Colors.transparent,
          borderRadius: BorderRadius.circular(SelfxKioskTokens.radiusSmall),
          clipBehavior: Clip.antiAlias,
          child: SwitchListTile(
            key: const Key('capture-sounds-toggle'),
            contentPadding: EdgeInsets.zero,
            title: const Text('Capture sounds'),
            subtitle: const Text('Countdown, shutter and success cues'),
            value: captureSoundsEnabled,
            activeThumbColor: SelfxKioskTokens.primary,
            activeTrackColor: SelfxKioskTokens.primary.withValues(alpha: 0.36),
            hoverColor: SelfxKioskTokens.primary.withValues(alpha: 0.06),
            selectedTileColor: SelfxKioskTokens.primary.withValues(alpha: 0.08),
            onChanged: onCaptureSoundsChanged,
          ),
        ),
        const SizedBox(height: 12),
        DropdownButtonFormField<CaptureAudioProfile>(
          key: const Key('capture-audio-profile-selector'),
          initialValue: captureAudioProfile,
          decoration: const InputDecoration(labelText: 'Current sound profile'),
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
        const SizedBox(height: 16),
        Align(
          alignment: Alignment.centerLeft,
          child: OutlinedButton.icon(
            key: const Key('preview-capture-sound'),
            onPressed: captureSoundsEnabled ? onPreviewSound : null,
            icon: const Icon(Icons.volume_up_outlined),
            label: const Text('Preview Sound'),
          ),
        ),
        const SizedBox(height: 24),
        const _FieldHeader(
          title: 'Premium profile foundation',
          description:
              'Future sound design can add these profiles without changing the settings layout.',
        ),
        Wrap(
          spacing: 10,
          runSpacing: 10,
          children: [
            const _ProfileChip(label: 'Soft', active: true),
            const _ProfileChip(label: 'Minimal', active: true),
            for (final profile in futureProfiles)
              _ProfileChip(label: profile, active: false),
          ],
        ),
      ],
    );
  }
}

class _DiagnosticsSection extends StatelessWidget {
  const _DiagnosticsSection({
    required this.state,
    required this.analysisDiagnostics,
    required this.primarySubject,
    required this.poseAnalyzerLatency,
    required this.imageQualityAnalyzerLatency,
  });

  final CameraState state;
  final FrameAnalysisDiagnostics? analysisDiagnostics;
  final PrimarySubject? primarySubject;
  final Duration? poseAnalyzerLatency;
  final Duration? imageQualityAnalyzerLatency;

  @override
  Widget build(BuildContext context) {
    final rows = <_InfoItem>[
      if (analysisDiagnostics == null)
        const _InfoItem(label: 'Live analysis', value: 'Not run this session')
      else ...[
        _InfoItem(
          label: 'Analysis FPS',
          value: analysisDiagnostics!.effectiveFps.toStringAsFixed(1),
        ),
        _InfoItem(
          label: 'Target FPS',
          value: analysisDiagnostics!.targetFps.toStringAsFixed(1),
        ),
        _InfoItem(
          label: 'Dropped frames',
          value: analysisDiagnostics!.droppedFrameCount.toString(),
        ),
        _InfoItem(label: 'Pose latency', value: _durationLabel(poseAnalyzerLatency)),
        _InfoItem(
          label: 'Quality latency',
          value: _durationLabel(imageQualityAnalyzerLatency),
        ),
        _InfoItem(
          label: 'Primary subject',
          value: _primarySubjectLabel(primarySubject),
        ),
        _InfoItem(
          label: 'Prominence',
          value: primarySubject?.visualProminenceScore.toStringAsFixed(2) ??
              'Unavailable',
        ),
        _InfoItem(
          label: 'Target region',
          value: _targetRegionLabel(primarySubject?.targetRegion),
        ),
        _InfoItem(
          label: 'Tracking age',
          value: primarySubject == null
              ? 'Unavailable'
              : '${primarySubject!.observedFrameCount} frames',
        ),
        _InfoItem(
          label: 'Analyzer',
          value: primarySubject?.analyzerCapabilities.displayName ??
              'ML Kit / single-primary',
        ),
        const _InfoItem(label: 'Multi-person awareness', value: 'Unsupported'),
      ],
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _InfoGrid(rows: rows),
        const SizedBox(height: 20),
        ExpansionTile(
          tilePadding: EdgeInsets.zero,
          childrenPadding: EdgeInsets.zero,
          title: const Text('Hardware details'),
          subtitle: const Text('Technical values for support diagnostics'),
          children: [
            _InfoGrid(
              rows: [
                _InfoItem(
                  label: 'Camera ID',
                  value: state.selectedDevice?.id ?? 'Unavailable',
                ),
                _InfoItem(
                  label: 'Native backend',
                  value: state.capabilities.nativeBackend,
                ),
                _InfoItem(
                  label: 'Live frames',
                  value: state.capabilities.supportsLiveFrames
                      ? 'Backend capable'
                      : 'Not supported',
                ),
                if (state.capabilities.notes.isNotEmpty)
                  _InfoItem(
                    label: 'Notes',
                    value: state.capabilities.notes.join(' / '),
                  ),
              ],
            ),
          ],
        ),
      ],
    );
  }
}

class _SystemSection extends StatelessWidget {
  const _SystemSection({
    required this.onRefresh,
    required this.onTestCamera,
  });

  final VoidCallback onRefresh;
  final VoidCallback onTestCamera;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _InfoGrid(
          rows: [
            _InfoItem(label: 'Platform', value: Platform.operatingSystem),
            const _InfoItem(label: 'App version', value: '1.0.0'),
            const _InfoItem(
              label: 'Connectivity',
              value: 'Offline home fallback available',
            ),
            const _InfoItem(
              label: 'Device management',
              value: 'Future fleet milestone',
            ),
          ],
        ),
        const SizedBox(height: 22),
        Wrap(
          spacing: 12,
          runSpacing: 12,
          children: [
            OutlinedButton.icon(
              onPressed: onRefresh,
              icon: const Icon(Icons.refresh),
              label: const Text('Refresh Cameras'),
            ),
            FilledButton.icon(
              key: const Key('test-camera'),
              onPressed: onTestCamera,
              icon: const Icon(Icons.photo_camera_outlined),
              label: const Text('Test Camera'),
            ),
          ],
        ),
      ],
    );
  }
}

class _PreviewPanel extends StatelessWidget {
  const _PreviewPanel({required this.controller});

  final CaptureSessionController controller;

  @override
  Widget build(BuildContext context) {
    final state = controller.cameraService.state.value;
    return _SolidPanel(
      padding: EdgeInsets.zero,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: DecoratedBox(
          decoration: const BoxDecoration(color: Color(0xFF101828)),
          child: Stack(
            fit: StackFit.expand,
            children: [
              if (state.status == CameraStatus.ready ||
                  state.status == CameraStatus.capturing)
                FittedBox(
                  fit: BoxFit.contain,
                  child: SizedBox(
                    width: 1280,
                    height: 720,
                    child: controller.cameraService.buildPreview(context),
                  ),
                )
              else
                const Center(
                  child: Padding(
                    padding: EdgeInsets.all(18),
                    child: Text(
                      'Preview starts when a camera is ready.',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ),
              Positioned(
                left: 12,
                top: 12,
                child: _StatusBadge(
                  icon: Icons.videocam_outlined,
                  label: 'Camera preview',
                  tone: _StatusTone.info,
                  compact: true,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CameraSummaryCard extends StatelessWidget {
  const _CameraSummaryCard({required this.state});

  final CameraState state;

  @override
  Widget build(BuildContext context) {
    return _SolidPanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _StatusBadge(
            icon: _statusIcon(state.status),
            label: _statusLabel(state.status),
            tone: _statusTone(state.status),
          ),
          const SizedBox(height: 14),
          Text(
            state.selectedDevice?.label ?? 'No camera selected',
            style: Theme.of(context).textTheme.titleMedium,
            overflow: TextOverflow.ellipsis,
            maxLines: 2,
          ),
          const SizedBox(height: 8),
          Text(
            state.capabilities.resolutionLabel,
            style: Theme.of(context).textTheme.bodyMedium,
          ),
        ],
      ),
    );
  }
}

class _SettingsSurface extends StatelessWidget {
  const _SettingsSurface({
    required this.title,
    required this.description,
    required this.child,
  });

  final String title;
  final String description;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return _SolidPanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(title, style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 6),
          Text(description, style: Theme.of(context).textTheme.bodyMedium),
          const SizedBox(height: 22),
          child,
        ],
      ),
    );
  }
}

class _SolidPanel extends StatelessWidget {
  const _SolidPanel({
    required this.child,
    this.padding = const EdgeInsets.all(22),
  });

  final Widget child;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: SelfxKioskTokens.surfaceElevated,
        border: Border.all(color: SelfxKioskTokens.border),
        borderRadius: BorderRadius.circular(SelfxKioskTokens.cardRadius),
        boxShadow: SelfxKioskTokens.cardShadow,
      ),
      child: Padding(padding: padding, child: child),
    );
  }
}

class _StatusBanner extends StatelessWidget {
  const _StatusBanner({
    required this.icon,
    required this.label,
    required this.tone,
    required this.description,
  });

  final IconData icon;
  final String label;
  final _StatusTone tone;
  final String description;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: _toneColor(tone).withValues(alpha: 0.09),
        border: Border.all(color: _toneColor(tone).withValues(alpha: 0.28)),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            Icon(icon, color: _toneColor(tone), size: 26),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: TextStyle(
                      color: _toneColor(tone),
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(description, overflow: TextOverflow.ellipsis),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StatusBadge extends StatelessWidget {
  const _StatusBadge({
    required this.icon,
    required this.label,
    required this.tone,
    this.compact = false,
  });

  final IconData icon;
  final String label;
  final _StatusTone tone;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final color = _toneColor(tone);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: color.withValues(alpha: compact ? 0.18 : 0.09),
        border: Border.all(color: color.withValues(alpha: 0.32)),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: EdgeInsets.symmetric(
          horizontal: compact ? 10 : 12,
          vertical: compact ? 8 : 10,
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, color: color, size: compact ? 16 : 18),
            const SizedBox(width: 8),
            Text(
              label,
              style: TextStyle(color: color, fontWeight: FontWeight.w900),
            ),
          ],
        ),
      ),
    );
  }
}

class _InfoGrid extends StatelessWidget {
  const _InfoGrid({required this.rows});

  final List<_InfoItem> rows;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final twoColumns = constraints.maxWidth >= 680 && rows.length > 1;
        return Wrap(
          spacing: 12,
          runSpacing: 12,
          children: [
            for (final row in rows)
              SizedBox(
                width: twoColumns
                    ? (constraints.maxWidth - 12) / 2
                    : constraints.maxWidth,
                child: _InfoTile(item: row),
              ),
          ],
        );
      },
    );
  }
}

class _InfoTile extends StatelessWidget {
  const _InfoTile({required this.item});

  final _InfoItem item;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: const Color(0xFFF8FAFC),
        border: Border.all(color: SelfxKioskTokens.border),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              item.label,
              style: const TextStyle(
                color: SelfxKioskTokens.textMuted,
                fontWeight: FontWeight.w700,
                fontSize: 13,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              item.value,
              overflow: TextOverflow.ellipsis,
              maxLines: 3,
              style: const TextStyle(
                color: SelfxKioskTokens.textPrimary,
                fontWeight: FontWeight.w900,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _InfoItem {
  const _InfoItem({required this.label, required this.value});

  final String label;
  final String value;
}

class _FieldHeader extends StatelessWidget {
  const _FieldHeader({required this.title, required this.description});

  final String title;
  final String description;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 4),
          Text(description, style: Theme.of(context).textTheme.bodyMedium),
        ],
      ),
    );
  }
}

class _ProfileChip extends StatelessWidget {
  const _ProfileChip({required this.label, required this.active});

  final String label;
  final bool active;

  @override
  Widget build(BuildContext context) {
    return _StatusBadge(
      icon: active ? Icons.graphic_eq_outlined : Icons.lock_outline,
      label: label,
      tone: active ? _StatusTone.success : _StatusTone.neutral,
      compact: true,
    );
  }
}

class _EmptyPanel extends StatelessWidget {
  const _EmptyPanel({
    required this.icon,
    required this.title,
    required this.message,
  });

  final IconData icon;
  final String title;
  final String message;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: const Color(0xFFF8FAFC),
        border: Border.all(color: SelfxKioskTokens.border),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.all(22),
        child: Column(
          children: [
            Icon(icon, size: 40, color: SelfxKioskTokens.textMuted),
            const SizedBox(height: 12),
            Text(title, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 4),
            Text(message, textAlign: TextAlign.center),
          ],
        ),
      ),
    );
  }
}

enum _OperatorSettingsCategory {
  camera,
  capture,
  display,
  audio,
  diagnostics,
  system,
}

extension _OperatorSettingsCategoryInfo on _OperatorSettingsCategory {
  String get label {
    return switch (this) {
      _OperatorSettingsCategory.camera => 'Camera',
      _OperatorSettingsCategory.capture => 'Capture',
      _OperatorSettingsCategory.display => 'Display',
      _OperatorSettingsCategory.audio => 'Audio',
      _OperatorSettingsCategory.diagnostics => 'Diagnostics',
      _OperatorSettingsCategory.system => 'System',
    };
  }

  String get description {
    return switch (this) {
      _OperatorSettingsCategory.camera =>
        'Select and verify the kiosk camera without exposing raw hardware IDs.',
      _OperatorSettingsCategory.capture =>
        'Tune the assisted capture flow customers use on the kiosk.',
      _OperatorSettingsCategory.display =>
        'Review customer home presentation and local wallpaper behavior.',
      _OperatorSettingsCategory.audio =>
        'Manage local capture cues and prepare for future premium profiles.',
      _OperatorSettingsCategory.diagnostics =>
        'Safe local analysis and hardware details for operator support.',
      _OperatorSettingsCategory.system =>
        'Local app state and utility actions for this kiosk.',
    };
  }

  IconData get icon {
    return switch (this) {
      _OperatorSettingsCategory.camera => Icons.videocam_outlined,
      _OperatorSettingsCategory.capture => Icons.photo_camera_outlined,
      _OperatorSettingsCategory.display => Icons.wallpaper_outlined,
      _OperatorSettingsCategory.audio => Icons.volume_up_outlined,
      _OperatorSettingsCategory.diagnostics => Icons.monitor_heart_outlined,
      _OperatorSettingsCategory.system => Icons.settings_outlined,
    };
  }
}

enum _StatusTone { success, warning, danger, info, neutral }

_StatusTone _statusTone(CameraStatus status) {
  return switch (status) {
    CameraStatus.ready => _StatusTone.success,
    CameraStatus.capturing ||
    CameraStatus.initializing ||
    CameraStatus.discovering => _StatusTone.info,
    CameraStatus.noDevices ||
    CameraStatus.disconnected ||
    CameraStatus.failed => _StatusTone.danger,
    _ => _StatusTone.neutral,
  };
}

IconData _statusIcon(CameraStatus status) {
  return switch (status) {
    CameraStatus.ready => Icons.check_circle_outline,
    CameraStatus.capturing => Icons.camera_outlined,
    CameraStatus.initializing || CameraStatus.discovering => Icons.sync,
    CameraStatus.noDevices => Icons.videocam_off_outlined,
    CameraStatus.disconnected => Icons.link_off_outlined,
    CameraStatus.failed => Icons.error_outline,
    _ => Icons.info_outline,
  };
}

Color _toneColor(_StatusTone tone) {
  return switch (tone) {
    _StatusTone.success => SelfxKioskTokens.success,
    _StatusTone.warning => SelfxKioskTokens.warning,
    _StatusTone.danger => SelfxKioskTokens.danger,
    _StatusTone.info => SelfxKioskTokens.info,
    _StatusTone.neutral => SelfxKioskTokens.textMuted,
  };
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
    CameraStatus.failed => 'Warning',
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
