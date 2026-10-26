import 'dart:async';

import 'package:flutter/material.dart';

import '../catalog/kiosk_catalog_gateway.dart';
import '../catalog/kiosk_catalog_repository.dart';
import '../config/kiosk_runtime_configuration_controller.dart';
import '../device/kiosk_device_session_controller.dart';
import '../operator/operator_access.dart';
import '../session/capture_session_controller.dart';
import '../tryon/garment_extraction_service.dart';
import '../tryon/kiosk_try_on_session_controller.dart';
import '../upload/kiosk_customer_upload_controller.dart';
import 'kiosk_home_screen.dart';
import 'kiosk_pairing_screen.dart';

class KioskStartupScreen extends StatefulWidget {
  const KioskStartupScreen({
    super.key,
    required this.deviceController,
    required this.captureController,
    required this.tryOnController,
    required this.uploadController,
    required this.catalogGateway,
    required this.configurationController,
    required this.operatorAccessController,
    this.extractionService = const UnavailableGarmentExtractionService(),
  });

  final KioskDeviceSessionController deviceController;
  final CaptureSessionController captureController;
  final KioskTryOnSessionController tryOnController;
  final KioskCustomerUploadController uploadController;
  final KioskCatalogGateway catalogGateway;
  final GarmentExtractionService extractionService;
  final KioskRuntimeConfigurationController configurationController;
  final OperatorAccessController operatorAccessController;

  @override
  State<KioskStartupScreen> createState() => _KioskStartupScreenState();
}

class _KioskStartupScreenState extends State<KioskStartupScreen> {
  int? _lastRequestedConfigurationVersion;
  bool _catalogAutoRefreshStarted = false;

  @override
  void initState() {
    super.initState();
    unawaited(widget.configurationController.loadCachedOrDefault());
    final catalogRepository = _catalogRepository;
    if (catalogRepository != null) {
      unawaited(catalogRepository.loadCachedOrDefault());
    }
    unawaited(widget.deviceController.start());
  }

  @override
  void dispose() {
    _catalogRepository?.stopAutoRefresh();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: widget.deviceController,
      builder: (context, _) {
        switch (widget.deviceController.state) {
          case KioskStartupState.active:
            _startCatalogAutoRefresh();
            _syncConfigurationIfNeeded();
            return KioskHomeScreen(
              controller: widget.captureController,
              tryOnController: widget.tryOnController,
              uploadController: widget.uploadController,
              catalogGateway: widget.catalogGateway,
              extractionService: widget.extractionService,
              configurationController: widget.configurationController,
              operatorAccessController: widget.operatorAccessController,
            );
          case KioskStartupState.networkUnavailable:
          case KioskStartupState.error:
            return _StartupRecoveryScreen(
              message:
                  widget.deviceController.message ??
                  'SelfX kiosk startup could not continue.',
              onRetry: () {
                unawaited(widget.deviceController.start());
              },
              onPairAgain: () {
                unawaited(widget.deviceController.clearAndPair());
              },
            );
          case KioskStartupState.checking:
          case KioskStartupState.restoring:
            return const _StartupLoadingScreen();
          case KioskStartupState.pairing:
          case KioskStartupState.waitingForPairing:
            return KioskPairingScreen(controller: widget.deviceController);
        }
      },
    );
  }

  void _syncConfigurationIfNeeded() {
    final latest =
        widget.deviceController.device?.latestConfigurationVersion ?? 1;
    if (_lastRequestedConfigurationVersion == latest &&
        widget.configurationController.configuration.version >= latest) {
      return;
    }
    if (widget.configurationController.syncing) {
      return;
    }
    _lastRequestedConfigurationVersion = latest;
    unawaited(() async {
      try {
        await widget.configurationController.syncIfNeeded(
          activateImmediately:
              widget.tryOnController.canActivateRuntimeConfiguration,
        );
        if (!mounted) {
          return;
        }
        if (widget.configurationController.pendingConfiguration != null) {
          return;
        }
        await widget.captureController.applyRuntimeConfiguration(
          widget.configurationController.configuration,
        );
        widget.tryOnController.applyEnabledGarmentIntents(
          widget.configurationController.configuration.enabledGarmentIntents,
        );
        widget.tryOnController.applyGarmentPreviewEnabled(
          widget.configurationController.configuration.garmentPreviewEnabled,
        );
        widget.tryOnController.applyMultiGarmentSelectionEnabled(
          widget
              .configurationController
              .configuration
              .multiGarmentSelectionEnabled,
        );
        widget.tryOnController.applyMaxTryOnPicks(
          widget.configurationController.configuration.maxTryOnPicks,
        );
        widget.tryOnController.applyCaptureUploadMaxImageBytes(
          widget
              .configurationController
              .configuration
              .captureUploadMaxImageBytes,
        );
        await _catalogRepository?.syncIfNeeded(force: true);
      } catch (_) {
        unawaited(widget.deviceController.handleDeviceAuthRejected());
      }
    }());
  }

  void _startCatalogAutoRefresh() {
    if (_catalogAutoRefreshStarted) {
      return;
    }
    _catalogAutoRefreshStarted = true;
    _catalogRepository?.startAutoRefresh();
    unawaited(_catalogRepository?.syncIfNeeded());
  }

  KioskCatalogRepository? get _catalogRepository {
    final gateway = widget.catalogGateway;
    return gateway is KioskCatalogRepository ? gateway : null;
  }
}

class _StartupLoadingScreen extends StatelessWidget {
  const _StartupLoadingScreen();

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircularProgressIndicator(),
            SizedBox(height: 18),
            Text('Restoring kiosk session...'),
          ],
        ),
      ),
    );
  }
}

class _StartupRecoveryScreen extends StatelessWidget {
  const _StartupRecoveryScreen({
    required this.message,
    required this.onRetry,
    required this.onPairAgain,
  });

  final String message;
  final VoidCallback onRetry;
  final VoidCallback onPairAgain;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Card(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  Icons.wifi_off_outlined,
                  size: 72,
                  color: Theme.of(context).colorScheme.primary,
                ),
                const SizedBox(height: 20),
                Text(
                  'Connection needed',
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
                const SizedBox(height: 12),
                Text(message, textAlign: TextAlign.center),
                const SizedBox(height: 24),
                ElevatedButton.icon(
                  onPressed: onRetry,
                  icon: const Icon(Icons.refresh),
                  label: const Text('Retry'),
                ),
                const SizedBox(height: 12),
                OutlinedButton(
                  onPressed: onPairAgain,
                  child: const Text('Pair Again'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
