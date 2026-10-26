import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../camera/camera_models.dart';
import '../camera/camera_orientation.dart';
import '../camera/camera_preview_viewport.dart';
import '../config/kiosk_runtime_configuration_controller.dart';
import '../live/frame_analysis_scheduler.dart';
import '../live/person_analysis.dart';
import '../session/capture_audio_service.dart';
import '../session/capture_flow.dart';
import '../session/capture_session_controller.dart';
import '../theme/selfx_kiosk_theme.dart';
import '../tryon/kiosk_garment_input.dart';
import '../tryon/kiosk_try_on_session_controller.dart';
import 'kiosk_chrome.dart';
import 'selfx_logo.dart';

class CameraSettingsScreen extends StatefulWidget {
  const CameraSettingsScreen({
    super.key,
    required this.controller,
    this.tryOnController,
    this.configurationController,
  });

  final CaptureSessionController controller;
  final KioskTryOnSessionController? tryOnController;
  final KioskRuntimeConfigurationController? configurationController;

  @override
  State<CameraSettingsScreen> createState() => _CameraSettingsScreenState();
}

class _CameraSettingsScreenState extends State<CameraSettingsScreen> {
  bool _loading = true;
  _OperatorSettingsCategory _selectedCategory = _OperatorSettingsCategory.tryOn;

  @override
  void initState() {
    super.initState();
    _refresh();
  }

  Future<void> _refresh() async {
    setState(() => _loading = true);
    try {
      await widget.controller.loadOperatorSettings();
      await _loadLocalTryOnSettings();
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
      child: AnimatedBuilder(
        animation: Listenable.merge([
          widget.controller,
          widget.controller.cameraService.state,
          if (widget.tryOnController != null) widget.tryOnController!,
          if (widget.configurationController != null)
            widget.configurationController!,
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
            cameraOrientationMode: widget.controller.cameraOrientationMode,
            analysisDiagnostics: widget.controller.analysisDiagnostics,
            primarySubject: widget.controller.primarySubject,
            poseAnalyzerLatency: widget.controller.poseAnalyzerLatency,
            imageQualityAnalyzerLatency:
                widget.controller.imageQualityAnalyzerLatency,
            enabledGarmentIntents: widget
                .configurationController
                ?.configuration
                .enabledGarmentIntents,
            multiGarmentSelectionEnabled:
                widget.tryOnController?.multiGarmentSelectionEnabled ?? true,
            maxTryOnPicks: widget.tryOnController?.maxTryOnPicks ?? 5,
            showMyPicksCounter:
                widget.tryOnController?.showMyPicksCounter ?? true,
            saveMyLooksQrEnabled:
                widget.tryOnController?.saveMyLooksQrEnabled ?? true,
            preview: _PreviewPanel(
              state: state,
              preview: widget.controller.cameraService.buildPreview(context),
            ),
            onBack: () => Navigator.of(context).pop(),
            onCategoryChanged: (category) {
              setState(() => _selectedCategory = category);
            },
            onRefresh: _refresh,
            onSelectCamera: _selectCamera,
            onCountdownChanged: widget.controller.updateCaptureCountdownSeconds,
            onCaptureSoundsChanged:
                widget.controller.updateCaptureSoundsEnabled,
            onAudioProfileChanged: widget.controller.updateCaptureAudioProfile,
            onCameraOrientationChanged:
                widget.controller.updateCameraOrientationMode,
            onMultiGarmentSelectionChanged: _updateMultiGarmentSelectionEnabled,
            onMaxTryOnPicksChanged: _updateMaxTryOnPicks,
            onShowMyPicksCounterChanged: _updateShowMyPicksCounter,
            onSaveMyLooksQrChanged: _updateSaveMyLooksQrEnabled,
            onPreviewSound: widget.controller.previewCaptureAudioProfile,
            onTestCamera: () => Navigator.of(context).pop(),
            configurationStatus:
                widget.configurationController?.statusLabel ??
                'Bundled defaults',
            configurationErrorCode:
                widget.configurationController?.lastErrorCode,
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

  Future<void> _loadLocalTryOnSettings() async {
    final tryOnController = widget.tryOnController;
    if (tryOnController == null) {
      return;
    }
    final settings = widget.controller.settingsStore;
    tryOnController.applyMultiGarmentSelectionEnabled(
      await settings.readMultiGarmentSelectionEnabled(),
    );
    tryOnController.applyMaxTryOnPicks(await settings.readMaxTryOnPicks());
    tryOnController.applyShowMyPicksCounter(
      await settings.readShowMyPicksCounter(),
    );
    tryOnController.applySaveMyLooksQrEnabled(
      await settings.readSaveMyLooksQrEnabled(),
    );
  }

  void _updateMultiGarmentSelectionEnabled(bool enabled) {
    unawaited(() async {
      widget.tryOnController?.applyMultiGarmentSelectionEnabled(enabled);
      await widget.controller.settingsStore.saveMultiGarmentSelectionEnabled(
        enabled,
      );
    }());
  }

  void _updateMaxTryOnPicks(int count) {
    unawaited(() async {
      widget.tryOnController?.applyMaxTryOnPicks(count);
      await widget.controller.settingsStore.saveMaxTryOnPicks(count);
    }());
  }

  void _updateShowMyPicksCounter(bool enabled) {
    unawaited(() async {
      widget.tryOnController?.applyShowMyPicksCounter(enabled);
      await widget.controller.settingsStore.saveShowMyPicksCounter(enabled);
    }());
  }

  void _updateSaveMyLooksQrEnabled(bool enabled) {
    unawaited(() async {
      widget.tryOnController?.applySaveMyLooksQrEnabled(enabled);
      await widget.controller.settingsStore.saveSaveMyLooksQrEnabled(enabled);
    }());
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
    required this.cameraOrientationMode,
    required this.analysisDiagnostics,
    required this.primarySubject,
    required this.poseAnalyzerLatency,
    required this.imageQualityAnalyzerLatency,
    required this.enabledGarmentIntents,
    required this.multiGarmentSelectionEnabled,
    required this.maxTryOnPicks,
    required this.showMyPicksCounter,
    required this.saveMyLooksQrEnabled,
    required this.preview,
    required this.onBack,
    required this.onCategoryChanged,
    required this.onRefresh,
    required this.onSelectCamera,
    required this.onCountdownChanged,
    required this.onCaptureSoundsChanged,
    required this.onAudioProfileChanged,
    required this.onCameraOrientationChanged,
    required this.onMultiGarmentSelectionChanged,
    required this.onMaxTryOnPicksChanged,
    required this.onShowMyPicksCounterChanged,
    required this.onSaveMyLooksQrChanged,
    required this.onPreviewSound,
    required this.onTestCamera,
    required this.configurationStatus,
    required this.configurationErrorCode,
  });

  final CameraState state;
  final _OperatorSettingsCategory selectedCategory;
  final bool loading;
  final int countdownSeconds;
  final bool captureSoundsEnabled;
  final CaptureAudioProfile captureAudioProfile;
  final CameraOrientationMode cameraOrientationMode;
  final FrameAnalysisDiagnostics? analysisDiagnostics;
  final PrimarySubject? primarySubject;
  final Duration? poseAnalyzerLatency;
  final Duration? imageQualityAnalyzerLatency;
  final List<KioskGarmentIntent>? enabledGarmentIntents;
  final bool multiGarmentSelectionEnabled;
  final int maxTryOnPicks;
  final bool showMyPicksCounter;
  final bool saveMyLooksQrEnabled;
  final Widget preview;
  final VoidCallback onBack;
  final ValueChanged<_OperatorSettingsCategory> onCategoryChanged;
  final VoidCallback onRefresh;
  final ValueChanged<CameraDevice> onSelectCamera;
  final ValueChanged<int> onCountdownChanged;
  final ValueChanged<bool> onCaptureSoundsChanged;
  final ValueChanged<CaptureAudioProfile> onAudioProfileChanged;
  final ValueChanged<CameraOrientationMode> onCameraOrientationChanged;
  final ValueChanged<bool> onMultiGarmentSelectionChanged;
  final ValueChanged<int> onMaxTryOnPicksChanged;
  final ValueChanged<bool> onShowMyPicksCounterChanged;
  final ValueChanged<bool> onSaveMyLooksQrChanged;
  final ValueChanged<CaptureAudioProfile> onPreviewSound;
  final VoidCallback onTestCamera;
  final String configurationStatus;
  final String? configurationErrorCode;

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
          cameraOrientationMode: cameraOrientationMode,
          analysisDiagnostics: analysisDiagnostics,
          primarySubject: primarySubject,
          poseAnalyzerLatency: poseAnalyzerLatency,
          imageQualityAnalyzerLatency: imageQualityAnalyzerLatency,
          onRefresh: onRefresh,
          onSelectCamera: onSelectCamera,
          onCountdownChanged: onCountdownChanged,
          onCaptureSoundsChanged: onCaptureSoundsChanged,
          onAudioProfileChanged: onAudioProfileChanged,
          onCameraOrientationChanged: onCameraOrientationChanged,
          onPreviewSound: onPreviewSound,
          onTestCamera: onTestCamera,
          configurationStatus: configurationStatus,
          configurationErrorCode: configurationErrorCode,
          enabledGarmentIntents: enabledGarmentIntents,
          multiGarmentSelectionEnabled: multiGarmentSelectionEnabled,
          maxTryOnPicks: maxTryOnPicks,
          showMyPicksCounter: showMyPicksCounter,
          saveMyLooksQrEnabled: saveMyLooksQrEnabled,
          onMultiGarmentSelectionChanged: onMultiGarmentSelectionChanged,
          onMaxTryOnPicksChanged: onMaxTryOnPicksChanged,
          onShowMyPicksCounterChanged: onShowMyPicksCounterChanged,
          onSaveMyLooksQrChanged: onSaveMyLooksQrChanged,
          preview: preview,
        );

        if (compact) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _ControlCentreTopBar(
                title: selectedCategory.label,
                onBack: onBack,
                onMenu: () => _showCategoryMenu(context),
              ),
              const SizedBox(height: 12),
              const _ControlCentreHero(compact: true),
              const SizedBox(height: 12),
              Expanded(
                child: SingleChildScrollView(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [content],
                  ),
                ),
              ),
            ],
          );
        }

        return Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SizedBox(
              width: 236,
              child: _SettingsNavigationRail(
                selectedCategory: selectedCategory,
                onChanged: onCategoryChanged,
              ),
            ),
            const SizedBox(width: 18),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _ControlCentreTopBar(
                    title: selectedCategory.label,
                    onBack: onBack,
                  ),
                  const SizedBox(height: 14),
                  const _ControlCentreHero(compact: false),
                  const SizedBox(height: 14),
                  Expanded(child: SingleChildScrollView(child: content)),
                ],
              ),
            ),
          ],
        );
      },
    );
  }

  void _showCategoryMenu(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _CategoryMenuSheet(
        selectedCategory: selectedCategory,
        onChanged: (category) {
          Navigator.of(context).pop();
          onCategoryChanged(category);
        },
      ),
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
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF111820), Color(0xFF202832)],
        ),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
        boxShadow: SelfxKioskTokens.softShadow,
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 14, 12, 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const _ControlCentreMenuHeader(compact: false),
            const SizedBox(height: 18),
            Expanded(
              child: ListView.separated(
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
            ),
          ],
        ),
      ),
    );
  }
}

class _ControlCentreTopBar extends StatelessWidget {
  const _ControlCentreTopBar({
    required this.title,
    required this.onBack,
    this.onMenu,
  });

  final String title;
  final VoidCallback onBack;
  final VoidCallback? onMenu;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 54,
      child: Stack(
        alignment: Alignment.center,
        children: [
          Align(
            alignment: Alignment.centerLeft,
            child: IconButton(
              onPressed: onBack,
              icon: const Icon(Icons.arrow_back),
              tooltip: 'Back',
            ),
          ),
          Text(
            title,
            textAlign: TextAlign.center,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(
              context,
            ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900),
          ),
          Align(
            alignment: Alignment.centerRight,
            child: onMenu == null
                ? const SizedBox.shrink()
                : IconButton(
                    onPressed: onMenu,
                    icon: const Icon(Icons.menu),
                    tooltip: 'Menu',
                  ),
          ),
        ],
      ),
    );
  }
}

class _ControlCentreHero extends StatelessWidget {
  const _ControlCentreHero({required this.compact});

  final bool compact;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: const Color(0xFF171D24),
        borderRadius: BorderRadius.circular(8),
        boxShadow: SelfxKioskTokens.cardShadow,
      ),
      child: Padding(
        padding: EdgeInsets.symmetric(
          horizontal: compact ? 18 : 24,
          vertical: compact ? 14 : 18,
        ),
        child: Row(
          children: [
            const SelfxLogo(
              height: 46,
              maxWidth: 158,
              taglineColor: Colors.white,
            ),
            const SizedBox(width: 14),
            const Expanded(
              child: Text(
                'KIOSK CONTROL CENTRE',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 13,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 0,
                ),
              ),
            ),
            DecoratedBox(
              decoration: BoxDecoration(
                border: Border.all(color: Colors.white.withValues(alpha: 0.42)),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Padding(
                padding: EdgeInsets.all(10),
                child: Icon(
                  Icons.desktop_windows_outlined,
                  color: Colors.white,
                  size: 25,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CategoryMenuSheet extends StatelessWidget {
  const _CategoryMenuSheet({
    required this.selectedCategory,
    required this.onChanged,
  });

  final _OperatorSettingsCategory selectedCategory;
  final ValueChanged<_OperatorSettingsCategory> onChanged;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF111820), Color(0xFF202832)],
        ),
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 22),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const _ControlCentreMenuHeader(compact: true),
              const SizedBox(height: 14),
              for (final category in _OperatorSettingsCategory.values) ...[
                _CategoryButton(
                  category: category,
                  selected: category == selectedCategory,
                  onTap: () => onChanged(category),
                ),
                const SizedBox(height: 7),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _ControlCentreMenuHeader extends StatelessWidget {
  const _ControlCentreMenuHeader({required this.compact});

  final bool compact;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
      ),
      child: Padding(
        padding: EdgeInsets.symmetric(
          horizontal: compact ? 12 : 10,
          vertical: compact ? 12 : 10,
        ),
        child: Row(
          children: [
            SelfxLogo(
              height: compact ? 36 : 32,
              maxWidth: compact ? 130 : 116,
              taglineColor: Colors.white,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                'KIOSK CONTROL CENTRE',
                maxLines: compact ? 1 : 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: Colors.white,
                  fontSize: compact ? 12 : 10,
                  fontWeight: FontWeight.w900,
                  height: 1.05,
                  letterSpacing: 0,
                ),
              ),
            ),
          ],
        ),
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
        ? Colors.white
        : Colors.white.withValues(alpha: 0.78);
    return InkWell(
      borderRadius: BorderRadius.circular(8),
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 140),
        curve: Curves.easeOut,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        decoration: BoxDecoration(
          color: selected ? null : Colors.white.withValues(alpha: 0.035),
          gradient: selected
              ? const LinearGradient(
                  begin: Alignment.centerLeft,
                  end: Alignment.centerRight,
                  colors: [
                    SelfxKioskTokens.primaryGradientStart,
                    SelfxKioskTokens.primaryGradientEnd,
                  ],
                )
              : null,
          border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
          borderRadius: BorderRadius.circular(8),
          boxShadow: selected
              ? [
                  BoxShadow(
                    color: SelfxKioskTokens.primary.withValues(alpha: 0.24),
                    blurRadius: 18,
                    offset: const Offset(0, 8),
                  ),
                ]
              : null,
        ),
        child: Row(
          children: [
            AnimatedContainer(
              duration: const Duration(milliseconds: 140),
              width: 34,
              height: 34,
              decoration: BoxDecoration(
                color: selected
                    ? Colors.white.withValues(alpha: 0.18)
                    : Colors.white.withValues(alpha: 0.06),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
              ),
              child: Icon(category.icon, color: color, size: 20),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                category.label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
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

class _SettingsCategoryContent extends StatelessWidget {
  const _SettingsCategoryContent({
    required this.category,
    required this.state,
    required this.loading,
    required this.countdownSeconds,
    required this.captureSoundsEnabled,
    required this.captureAudioProfile,
    required this.cameraOrientationMode,
    required this.analysisDiagnostics,
    required this.primarySubject,
    required this.poseAnalyzerLatency,
    required this.imageQualityAnalyzerLatency,
    required this.onRefresh,
    required this.onSelectCamera,
    required this.onCountdownChanged,
    required this.onCaptureSoundsChanged,
    required this.onAudioProfileChanged,
    required this.onCameraOrientationChanged,
    required this.onPreviewSound,
    required this.onTestCamera,
    required this.configurationStatus,
    required this.configurationErrorCode,
    required this.enabledGarmentIntents,
    required this.multiGarmentSelectionEnabled,
    required this.maxTryOnPicks,
    required this.showMyPicksCounter,
    required this.saveMyLooksQrEnabled,
    required this.onMultiGarmentSelectionChanged,
    required this.onMaxTryOnPicksChanged,
    required this.onShowMyPicksCounterChanged,
    required this.onSaveMyLooksQrChanged,
    required this.preview,
  });

  final _OperatorSettingsCategory category;
  final CameraState state;
  final bool loading;
  final int countdownSeconds;
  final bool captureSoundsEnabled;
  final CaptureAudioProfile captureAudioProfile;
  final CameraOrientationMode cameraOrientationMode;
  final FrameAnalysisDiagnostics? analysisDiagnostics;
  final PrimarySubject? primarySubject;
  final Duration? poseAnalyzerLatency;
  final Duration? imageQualityAnalyzerLatency;
  final VoidCallback onRefresh;
  final ValueChanged<CameraDevice> onSelectCamera;
  final ValueChanged<int> onCountdownChanged;
  final ValueChanged<bool> onCaptureSoundsChanged;
  final ValueChanged<CaptureAudioProfile> onAudioProfileChanged;
  final ValueChanged<CameraOrientationMode> onCameraOrientationChanged;
  final ValueChanged<CaptureAudioProfile> onPreviewSound;
  final VoidCallback onTestCamera;
  final String configurationStatus;
  final String? configurationErrorCode;
  final List<KioskGarmentIntent>? enabledGarmentIntents;
  final bool multiGarmentSelectionEnabled;
  final int maxTryOnPicks;
  final bool showMyPicksCounter;
  final bool saveMyLooksQrEnabled;
  final ValueChanged<bool> onMultiGarmentSelectionChanged;
  final ValueChanged<int> onMaxTryOnPicksChanged;
  final ValueChanged<bool> onShowMyPicksCounterChanged;
  final ValueChanged<bool> onSaveMyLooksQrChanged;
  final Widget preview;

  @override
  Widget build(BuildContext context) {
    return _SettingsSurface(
      title: category.label,
      description: category.description,
      child: switch (category) {
        _OperatorSettingsCategory.dashboard => _DashboardSection(
          state: state,
          countdownSeconds: countdownSeconds,
          captureSoundsEnabled: captureSoundsEnabled,
          multiGarmentSelectionEnabled: multiGarmentSelectionEnabled,
          maxTryOnPicks: maxTryOnPicks,
          configurationStatus: configurationStatus,
          configurationErrorCode: configurationErrorCode,
        ),
        _OperatorSettingsCategory.kiosks => _CameraSection(
          state: state,
          loading: loading,
          cameraOrientationMode: cameraOrientationMode,
          preview: preview,
          onRefresh: onRefresh,
          onSelectCamera: onSelectCamera,
          onCameraOrientationChanged: onCameraOrientationChanged,
        ),
        _OperatorSettingsCategory.tryOn => _TryOnSettingsSection(
          enabledGarmentIntents: enabledGarmentIntents,
          multiGarmentSelectionEnabled: multiGarmentSelectionEnabled,
          maxTryOnPicks: maxTryOnPicks,
          showMyPicksCounter: showMyPicksCounter,
          saveMyLooksQrEnabled: saveMyLooksQrEnabled,
          onMultiGarmentSelectionChanged: onMultiGarmentSelectionChanged,
          onMaxTryOnPicksChanged: onMaxTryOnPicksChanged,
          onShowMyPicksCounterChanged: onShowMyPicksCounterChanged,
          onSaveMyLooksQrChanged: onSaveMyLooksQrChanged,
          configurationStatus: configurationStatus,
        ),
        _OperatorSettingsCategory.idle => _CaptureSection(
          countdownSeconds: countdownSeconds,
          onCountdownChanged: onCountdownChanged,
        ),
        _OperatorSettingsCategory.content => _DisplaySection(
          configurationStatus: configurationStatus,
          configurationErrorCode: configurationErrorCode,
        ),
        _OperatorSettingsCategory.sounds => _AudioSection(
          captureSoundsEnabled: captureSoundsEnabled,
          captureAudioProfile: captureAudioProfile,
          onCaptureSoundsChanged: onCaptureSoundsChanged,
          onAudioProfileChanged: onAudioProfileChanged,
          onPreviewSound: onPreviewSound,
        ),
        _OperatorSettingsCategory.logs => _DiagnosticsSection(
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

class _DashboardSection extends StatelessWidget {
  const _DashboardSection({
    required this.state,
    required this.countdownSeconds,
    required this.captureSoundsEnabled,
    required this.multiGarmentSelectionEnabled,
    required this.maxTryOnPicks,
    required this.configurationStatus,
    required this.configurationErrorCode,
  });

  final CameraState state;
  final int countdownSeconds;
  final bool captureSoundsEnabled;
  final bool multiGarmentSelectionEnabled;
  final int maxTryOnPicks;
  final String configurationStatus;
  final String? configurationErrorCode;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _StatusBanner(
          icon: _statusIcon(state.status),
          label: _statusLabel(state.status),
          tone: _statusTone(state.status),
          description: state.selectedDevice?.label ?? 'No camera selected',
        ),
        const SizedBox(height: 18),
        _InfoGrid(
          rows: [
            _InfoItem(label: 'Try-On Picks', value: '$maxTryOnPicks items'),
            _InfoItem(
              label: 'Multi-garment',
              value: multiGarmentSelectionEnabled ? 'Enabled' : 'Disabled',
            ),
            _InfoItem(label: 'Countdown', value: '$countdownSeconds sec'),
            _InfoItem(
              label: 'Sounds',
              value: captureSoundsEnabled ? 'Enabled' : 'Muted',
            ),
            _InfoItem(label: 'Configuration', value: configurationStatus),
            _InfoItem(
              label: 'Sync issue',
              value: configurationErrorCode ?? 'None',
            ),
          ],
        ),
      ],
    );
  }
}

class _TryOnSettingsSection extends StatelessWidget {
  const _TryOnSettingsSection({
    required this.enabledGarmentIntents,
    required this.multiGarmentSelectionEnabled,
    required this.maxTryOnPicks,
    required this.showMyPicksCounter,
    required this.saveMyLooksQrEnabled,
    required this.onMultiGarmentSelectionChanged,
    required this.onMaxTryOnPicksChanged,
    required this.onShowMyPicksCounterChanged,
    required this.onSaveMyLooksQrChanged,
    required this.configurationStatus,
  });

  final List<KioskGarmentIntent>? enabledGarmentIntents;
  final bool multiGarmentSelectionEnabled;
  final int maxTryOnPicks;
  final bool showMyPicksCounter;
  final bool saveMyLooksQrEnabled;
  final ValueChanged<bool> onMultiGarmentSelectionChanged;
  final ValueChanged<int> onMaxTryOnPicksChanged;
  final ValueChanged<bool> onShowMyPicksCounterChanged;
  final ValueChanged<bool> onSaveMyLooksQrChanged;
  final String configurationStatus;

  @override
  Widget build(BuildContext context) {
    final intents = enabledGarmentIntents ?? const <KioskGarmentIntent>[];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _SettingsControlCard(
          title: 'Multi-Garment Selection',
          subtitle: 'Customers can add several garments to My Picks.',
          trailing: _SettingsSwitch(
            value: multiGarmentSelectionEnabled,
            onChanged: onMultiGarmentSelectionChanged,
          ),
          footer: _InlineStatus(
            enabled: multiGarmentSelectionEnabled,
            label: multiGarmentSelectionEnabled ? 'Enabled' : 'Disabled',
          ),
        ),
        const SizedBox(height: 12),
        _SettingsControlCard(
          title: 'Default State',
          subtitle: multiGarmentSelectionEnabled
              ? 'Enabled on this kiosk'
              : 'Disabled on this kiosk',
        ),
        const SizedBox(height: 12),
        _SettingsControlCard(
          title: 'My Picks Limit',
          subtitle: 'Maximum items in My Picks',
          trailing: _MaxPicksDropdown(
            value: maxTryOnPicks,
            onChanged: onMaxTryOnPicksChanged,
          ),
        ),
        const SizedBox(height: 12),
        _SettingsControlCard(
          title: 'Show My Picks Counter',
          subtitle: 'Display selected item count to the customer.',
          trailing: _SettingsSwitch(
            value: showMyPicksCounter,
            onChanged: onShowMyPicksCounterChanged,
          ),
        ),
        const SizedBox(height: 18),
        const _SectionEyebrow('OTHER TRY-ON SETTINGS'),
        const SizedBox(height: 10),
        _SettingsControlCard(
          title: 'Save My Looks (QR)',
          subtitle: saveMyLooksQrEnabled ? 'Enabled' : 'Disabled',
          trailing: _SettingsSwitch(
            value: saveMyLooksQrEnabled,
            onChanged: onSaveMyLooksQrChanged,
          ),
        ),
        const SizedBox(height: 18),
        Wrap(
          spacing: 10,
          runSpacing: 10,
          children: [
            for (final intent in intents)
              _StatusBadge(
                icon: Icons.check_circle_outline,
                label: intent.label,
                tone: _StatusTone.success,
                compact: true,
              ),
            if (intents.isEmpty)
              const _StatusBadge(
                icon: Icons.info_outline,
                label: 'Default garment modes',
                tone: _StatusTone.info,
                compact: true,
              ),
            _StatusBadge(
              icon: Icons.sync_outlined,
              label: configurationStatus,
              tone: _StatusTone.info,
              compact: true,
            ),
          ],
        ),
      ],
    );
  }
}

class _CameraSection extends StatelessWidget {
  const _CameraSection({
    required this.state,
    required this.loading,
    required this.cameraOrientationMode,
    required this.preview,
    required this.onRefresh,
    required this.onSelectCamera,
    required this.onCameraOrientationChanged,
  });

  final CameraState state;
  final bool loading;
  final CameraOrientationMode cameraOrientationMode;
  final Widget preview;
  final VoidCallback onRefresh;
  final ValueChanged<CameraDevice> onSelectCamera;
  final ValueChanged<CameraOrientationMode> onCameraOrientationChanged;

  @override
  Widget build(BuildContext context) {
    final selectedDevice = state.selectedDevice;
    final showOrientationCalibration = _cameraOrientationCalibrationAvailable(
      state,
    );
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
        preview,
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
        if (showOrientationCalibration) ...[
          const SizedBox(height: 20),
          DropdownButtonFormField<CameraOrientationMode>(
            key: const Key('camera-orientation-mode'),
            initialValue: cameraOrientationMode,
            isExpanded: true,
            decoration: const InputDecoration(
              labelText: 'Camera Orientation',
              helperText:
                  'Use Auto unless a mounted external camera appears sideways.',
            ),
            items: [
              for (final mode in CameraOrientationMode.values)
                DropdownMenuItem(
                  value: mode,
                  child: Text(_orientationModeLabel(mode)),
                ),
            ],
            onChanged: (mode) {
              if (mode != null) {
                onCameraOrientationChanged(mode);
              }
            },
          ),
        ],
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
            _InfoItem(
              label: 'Orientation',
              value: _orientationModeLabel(state.capabilities.orientationMode),
            ),
            _InfoItem(
              label: 'Lens direction',
              value: selectedDevice?.facing.name ?? 'Unknown',
            ),
            _InfoItem(
              label: 'Sensor orientation',
              value: selectedDevice?.sensorOrientation == null
                  ? 'Unknown'
                  : '${selectedDevice!.sensorOrientation} deg',
            ),
            _InfoItem(
              label: 'Effective correction',
              value: '${state.capabilities.effectiveRotationDegrees} deg',
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

bool _cameraOrientationCalibrationAvailable(CameraState state) {
  return state.selectedDevice != null &&
      (state.status == CameraStatus.ready ||
          state.status == CameraStatus.capturing);
}

class _CaptureSection extends StatefulWidget {
  const _CaptureSection({
    required this.countdownSeconds,
    required this.onCountdownChanged,
  });

  final int countdownSeconds;
  final ValueChanged<int> onCountdownChanged;

  @override
  State<_CaptureSection> createState() => _CaptureSectionState();
}

class _CaptureSectionState extends State<_CaptureSection> {
  late final TextEditingController _countdownController;
  late final FocusNode _countdownFocusNode;

  @override
  void initState() {
    super.initState();
    _countdownController = TextEditingController(
      text: widget.countdownSeconds.toString(),
    );
    _countdownFocusNode = FocusNode();
  }

  @override
  void didUpdateWidget(covariant _CaptureSection oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.countdownSeconds != oldWidget.countdownSeconds &&
        !_countdownFocusNode.hasFocus) {
      _countdownController.text = widget.countdownSeconds.toString();
    }
  }

  @override
  void dispose() {
    _countdownController.dispose();
    _countdownFocusNode.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const _FieldHeader(
          title: 'Assisted countdown',
          description:
              'Customers see one guided countdown before still capture.',
        ),
        Row(
          key: const Key('countdown-duration-selector'),
          children: [
            IconButton.filledTonal(
              tooltip: 'Decrease countdown',
              onPressed: widget.countdownSeconds > minCaptureCountdownSeconds
                  ? () => _setCountdown(widget.countdownSeconds - 1)
                  : null,
              icon: const Icon(Icons.remove),
            ),
            const SizedBox(width: 12),
            SizedBox(
              width: 132,
              child: TextFormField(
                controller: _countdownController,
                focusNode: _countdownFocusNode,
                keyboardType: TextInputType.number,
                textAlign: TextAlign.center,
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                decoration: const InputDecoration(
                  labelText: 'Seconds',
                  suffixText: 'sec',
                  helperText: '1-15',
                ),
                onChanged: _handleCountdownInput,
                onFieldSubmitted: (_) => _commitCountdownInput(),
                onEditingComplete: _commitCountdownInput,
              ),
            ),
            const SizedBox(width: 12),
            IconButton.filledTonal(
              tooltip: 'Increase countdown',
              onPressed: widget.countdownSeconds < maxCaptureCountdownSeconds
                  ? () => _setCountdown(widget.countdownSeconds + 1)
                  : null,
              icon: const Icon(Icons.add),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Text(
                '${widget.countdownSeconds} second countdown before capture',
                style: Theme.of(context).textTheme.bodyMedium,
              ),
            ),
          ],
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

  void _handleCountdownInput(String value) {
    final seconds = int.tryParse(value);
    if (seconds == null ||
        seconds < minCaptureCountdownSeconds ||
        seconds > maxCaptureCountdownSeconds) {
      return;
    }
    widget.onCountdownChanged(seconds);
  }

  void _commitCountdownInput() {
    final normalized = normalizeCaptureCountdownSeconds(
      int.tryParse(_countdownController.text),
    );
    _countdownController.text = normalized.toString();
    widget.onCountdownChanged(normalized);
    _countdownFocusNode.unfocus();
  }

  void _setCountdown(int seconds) {
    final normalized = normalizeCaptureCountdownSeconds(seconds);
    _countdownController.text = normalized.toString();
    widget.onCountdownChanged(normalized);
  }
}

class _DisplaySection extends StatelessWidget {
  const _DisplaySection({
    required this.configurationStatus,
    required this.configurationErrorCode,
  });

  final String configurationStatus;
  final String? configurationErrorCode;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _InfoGrid(
          rows: [
            const _InfoItem(label: 'Idle mode', value: 'Remote controlled'),
            const _InfoItem(
              label: 'Wallpaper source',
              value: 'Bundled SelfX asset or local cache',
            ),
            const _InfoItem(
              label: 'Presentation',
              value: 'Static or slideshow ready',
            ),
            _InfoItem(label: 'SaaS sync', value: configurationStatus),
          ],
        ),
        const SizedBox(height: 20),
        _StatusBanner(
          icon: Icons.wallpaper_outlined,
          label: 'Offline fallback ready',
          tone: configurationErrorCode == null
              ? _StatusTone.success
              : _StatusTone.warning,
          description: configurationErrorCode == null
              ? 'The kiosk uses the last valid remote configuration and falls back to the bundled wallpaper when no cache exists.'
              : 'Last sync issue: $configurationErrorCode. The kiosk is using the last valid local configuration.',
        ),
      ],
    );
  }
}

class _AudioSection extends StatefulWidget {
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
  final ValueChanged<CaptureAudioProfile> onPreviewSound;

  @override
  State<_AudioSection> createState() => _AudioSectionState();
}

class _AudioSectionState extends State<_AudioSection> {
  late CaptureAudioProfile _selectedProfile;

  @override
  void initState() {
    super.initState();
    _selectedProfile = widget.captureAudioProfile;
  }

  @override
  void didUpdateWidget(_AudioSection oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.captureAudioProfile != oldWidget.captureAudioProfile) {
      _selectedProfile = widget.captureAudioProfile;
    }
  }

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
            subtitle: const Text('Countdown and shutter cues'),
            value: widget.captureSoundsEnabled,
            activeThumbColor: SelfxKioskTokens.primary,
            activeTrackColor: SelfxKioskTokens.primary.withValues(alpha: 0.36),
            hoverColor: SelfxKioskTokens.primary.withValues(alpha: 0.06),
            selectedTileColor: SelfxKioskTokens.primary.withValues(alpha: 0.08),
            onChanged: widget.onCaptureSoundsChanged,
          ),
        ),
        const SizedBox(height: 12),
        DropdownButtonFormField<CaptureAudioProfile>(
          key: const Key('capture-audio-profile-selector'),
          initialValue: _selectedProfile,
          decoration: const InputDecoration(labelText: 'Current sound profile'),
          items: [
            for (final profile in CaptureAudioProfile.values)
              DropdownMenuItem<CaptureAudioProfile>(
                value: profile,
                child: Text(profile.label),
              ),
          ],
          onChanged: widget.captureSoundsEnabled
              ? (profile) {
                  if (profile != null) {
                    setState(() => _selectedProfile = profile);
                    widget.onAudioProfileChanged(profile);
                  }
                }
              : null,
        ),
        const SizedBox(height: 16),
        Align(
          alignment: Alignment.centerLeft,
          child: OutlinedButton.icon(
            key: const Key('preview-capture-sound'),
            onPressed: widget.captureSoundsEnabled
                ? () => widget.onPreviewSound(_selectedProfile)
                : null,
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
        _InfoItem(
          label: 'Pose latency',
          value: _durationLabel(poseAnalyzerLatency),
        ),
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
          value:
              primarySubject?.visualProminenceScore.toStringAsFixed(2) ??
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
          value:
              primarySubject?.analyzerCapabilities.displayName ??
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
                  label: 'Orientation mode',
                  value: _orientationModeLabel(
                    state.capabilities.orientationMode,
                  ),
                ),
                _InfoItem(
                  label: 'Sensor orientation',
                  value: state.selectedDevice?.sensorOrientation == null
                      ? 'Unknown'
                      : '${state.selectedDevice!.sensorOrientation} deg',
                ),
                _InfoItem(
                  label: 'Effective rotation',
                  value: '${state.capabilities.effectiveRotationDegrees} deg',
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
  const _SystemSection({required this.onRefresh, required this.onTestCamera});

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
  const _PreviewPanel({required this.state, required this.preview});

  final CameraState state;
  final Widget preview;

  @override
  Widget build(BuildContext context) {
    return _SolidPanel(
      padding: EdgeInsets.zero,
      child: AspectRatio(
        aspectRatio: _cameraPreviewAspectRatio(context, state),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: DecoratedBox(
            decoration: const BoxDecoration(color: Color(0xFF101828)),
            child: Stack(
              fit: StackFit.expand,
              children: [
                if (state.status == CameraStatus.ready ||
                    state.status == CameraStatus.capturing)
                  CameraPreviewViewport(
                    state: state,
                    preview: preview,
                    fit: BoxFit.cover,
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
      ),
    );
  }
}

double _cameraPreviewAspectRatio(BuildContext context, CameraState state) {
  final viewport = MediaQuery.sizeOf(context);
  final viewportIsPortrait = viewport.height > viewport.width;
  final width = state.capabilities.displayPreviewWidth;
  final height = state.capabilities.displayPreviewHeight;
  if (width == null || height == null || width <= 0 || height <= 0) {
    return viewportIsPortrait ? 9 / 16 : 16 / 9;
  }
  final rawAspectRatio = width / height;
  if (viewportIsPortrait && rawAspectRatio > 1) {
    return 1 / rawAspectRatio;
  }
  if (!viewportIsPortrait && rawAspectRatio < 1) {
    return 1 / rawAspectRatio;
  }
  return rawAspectRatio;
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

class _SettingsControlCard extends StatelessWidget {
  const _SettingsControlCard({
    required this.title,
    required this.subtitle,
    this.trailing,
    this.footer,
  });

  final String title;
  final String subtitle;
  final Widget? trailing;
  final Widget? footer;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: SelfxKioskTokens.surface,
        border: Border.all(color: SelfxKioskTokens.border),
        borderRadius: BorderRadius.circular(8),
        boxShadow: const [
          BoxShadow(
            color: Color(0x0D0F172A),
            blurRadius: 14,
            offset: Offset(0, 6),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: Theme.of(context).textTheme.titleMedium
                            ?.copyWith(fontWeight: FontWeight.w900),
                      ),
                      const SizedBox(height: 7),
                      Text(
                        subtitle,
                        style: Theme.of(context).textTheme.bodyMedium,
                      ),
                    ],
                  ),
                ),
                if (trailing != null) ...[const SizedBox(width: 14), trailing!],
              ],
            ),
            if (footer != null) ...[const SizedBox(height: 16), footer!],
          ],
        ),
      ),
    );
  }
}

class _SettingsSwitch extends StatelessWidget {
  const _SettingsSwitch({required this.value, required this.onChanged});

  final bool value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return Switch(
      value: value,
      onChanged: onChanged,
      activeThumbColor: Colors.white,
      activeTrackColor: SelfxKioskTokens.primary,
      inactiveThumbColor: Colors.white,
      inactiveTrackColor: const Color(0xFFE5E7EB),
    );
  }
}

class _InlineStatus extends StatelessWidget {
  const _InlineStatus({required this.enabled, required this.label});

  final bool enabled;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(
          enabled ? Icons.check_circle : Icons.info_outline,
          color: enabled
              ? SelfxKioskTokens.success
              : SelfxKioskTokens.textMuted,
          size: 22,
        ),
        const SizedBox(width: 9),
        Text(
          label,
          style: TextStyle(
            color: enabled
                ? SelfxKioskTokens.success
                : SelfxKioskTokens.textSecondary,
            fontWeight: FontWeight.w900,
          ),
        ),
      ],
    );
  }
}

class _MaxPicksDropdown extends StatelessWidget {
  const _MaxPicksDropdown({required this.value, required this.onChanged});

  final int value;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    final options = {
      ...List<int>.generate(10, (index) => index + 1),
      15,
      20,
      value.clamp(1, 20).toInt(),
    }.toList()..sort();
    return SizedBox(
      width: 132,
      child: DropdownButtonFormField<int>(
        key: const Key('operator-max-try-on-picks'),
        initialValue: value.clamp(1, 20).toInt(),
        isExpanded: true,
        decoration: InputDecoration(
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 12,
            vertical: 10,
          ),
          filled: true,
          fillColor: const Color(0xFFF8FAFC),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(8),
            borderSide: const BorderSide(color: SelfxKioskTokens.border),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(8),
            borderSide: const BorderSide(color: SelfxKioskTokens.border),
          ),
        ),
        items: [
          for (final option in options)
            DropdownMenuItem<int>(
              value: option,
              child: Text(
                '$option Items',
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontWeight: FontWeight.w900),
              ),
            ),
        ],
        onChanged: (next) {
          if (next != null) {
            onChanged(next);
          }
        },
      ),
    );
  }
}

class _SectionEyebrow extends StatelessWidget {
  const _SectionEyebrow(this.label);

  final String label;

  @override
  Widget build(BuildContext context) {
    return Text(
      label,
      style: const TextStyle(
        color: SelfxKioskTokens.textMuted,
        fontSize: 13,
        fontWeight: FontWeight.w900,
        letterSpacing: 0,
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
  dashboard,
  kiosks,
  tryOn,
  content,
  sounds,
  idle,
  system,
  logs,
}

extension _OperatorSettingsCategoryInfo on _OperatorSettingsCategory {
  String get label {
    return switch (this) {
      _OperatorSettingsCategory.dashboard => 'Dashboard',
      _OperatorSettingsCategory.kiosks => 'Kiosks',
      _OperatorSettingsCategory.tryOn => 'Try-On Settings',
      _OperatorSettingsCategory.content => 'Content',
      _OperatorSettingsCategory.sounds => 'Sounds',
      _OperatorSettingsCategory.idle => 'Idle Settings',
      _OperatorSettingsCategory.system => 'System',
      _OperatorSettingsCategory.logs => 'Logs',
    };
  }

  String get description {
    return switch (this) {
      _OperatorSettingsCategory.dashboard =>
        'Current kiosk state and customer-flow readiness.',
      _OperatorSettingsCategory.kiosks =>
        'Camera selection and mounted-device calibration.',
      _OperatorSettingsCategory.tryOn =>
        'Local customer Try-On controls for this kiosk.',
      _OperatorSettingsCategory.content =>
        'Customer home presentation and local media cache.',
      _OperatorSettingsCategory.sounds =>
        'Capture countdown and shutter cue settings.',
      _OperatorSettingsCategory.idle =>
        'Assisted capture timing and idle flow behavior.',
      _OperatorSettingsCategory.system =>
        'Local app state and utility actions for this kiosk.',
      _OperatorSettingsCategory.logs =>
        'Safe local analysis and hardware details for operator support.',
    };
  }

  IconData get icon {
    return switch (this) {
      _OperatorSettingsCategory.dashboard => Icons.dashboard_outlined,
      _OperatorSettingsCategory.kiosks => Icons.desktop_windows_outlined,
      _OperatorSettingsCategory.tryOn => Icons.checkroom_outlined,
      _OperatorSettingsCategory.content => Icons.collections_outlined,
      _OperatorSettingsCategory.sounds => Icons.volume_up_outlined,
      _OperatorSettingsCategory.idle => Icons.timer_outlined,
      _OperatorSettingsCategory.system => Icons.settings_outlined,
      _OperatorSettingsCategory.logs => Icons.article_outlined,
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

String _orientationModeLabel(CameraOrientationMode mode) {
  return switch (mode) {
    CameraOrientationMode.auto => 'Auto',
    CameraOrientationMode.deg0 => '0 deg',
    CameraOrientationMode.deg90 => '90 deg',
    CameraOrientationMode.deg180 => '180 deg',
    CameraOrientationMode.deg270 => '270 deg',
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
