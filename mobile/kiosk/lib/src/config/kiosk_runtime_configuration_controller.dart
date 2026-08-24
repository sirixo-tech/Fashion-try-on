import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:path/path.dart' as path;
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../device/kiosk_device_gateway.dart';
import '../device/kiosk_device_models.dart';
import '../device/kiosk_device_session_controller.dart';
import 'kiosk_runtime_configuration.dart';

class KioskRuntimeConfigurationController extends ChangeNotifier {
  KioskRuntimeConfigurationController({
    required this.gateway,
    required this.deviceController,
    SharedPreferencesAsync? preferences,
    KioskRuntimeConfigurationCache? cache,
    this.cacheDirectoryProvider,
    http.Client? client,
  }) : _cache =
           cache ??
           SharedPreferencesKioskRuntimeConfigurationCache(
             preferences ?? SharedPreferencesAsync(),
           ),
       _client = client ?? http.Client();

  final KioskDeviceGateway gateway;
  final KioskDeviceSessionController deviceController;
  final KioskRuntimeConfigurationCache _cache;
  final Future<Directory> Function()? cacheDirectoryProvider;
  final http.Client _client;

  KioskRuntimeConfiguration configuration = defaultRuntimeConfiguration;
  KioskRuntimeConfiguration? pendingConfiguration;
  String statusLabel = 'Bundled defaults';
  String? lastErrorCode;
  bool syncing = false;

  Future<void> loadCachedOrDefault() async {
    final cached = await _cache.readConfigurationJson();
    if (cached == null || cached.trim().isEmpty) {
      configuration = defaultRuntimeConfiguration;
      pendingConfiguration = null;
      statusLabel = 'Bundled defaults';
      notifyListeners();
      return;
    }
    try {
      final json = jsonDecode(cached);
      if (json is Map<String, dynamic>) {
        configuration = KioskRuntimeConfiguration.fromJson(json);
        pendingConfiguration = null;
        statusLabel = 'Cached v${configuration.version}';
        notifyListeners();
      }
    } catch (_) {
      configuration = defaultRuntimeConfiguration;
      pendingConfiguration = null;
      statusLabel = 'Bundled defaults';
      notifyListeners();
    }
  }

  Future<void> syncIfNeeded({
    bool force = false,
    bool activateImmediately = true,
  }) async {
    final latest = deviceController.device?.latestConfigurationVersion;
    final preparedVersion =
        pendingConfiguration?.version ?? configuration.version;
    if (!force && latest != null && latest <= preparedVersion) {
      return;
    }
    await sync(activateImmediately: activateImmediately);
  }

  Future<void> sync({bool activateImmediately = true}) async {
    if (syncing) {
      return;
    }
    syncing = true;
    notifyListeners();
    try {
      final remote = await deviceController.withDeviceAccess(
        (token) => gateway.configuration(token),
      );
      final prepared = await _prepareAssets(remote);
      await _cache.writeConfigurationJson(jsonEncode(prepared.toJson()));
      if (activateImmediately) {
        configuration = prepared;
        pendingConfiguration = null;
        statusLabel = 'Remote v${configuration.version}';
      } else {
        pendingConfiguration = prepared;
        statusLabel = 'Pending remote v${prepared.version}';
      }
      lastErrorCode = null;
      notifyListeners();
    } on KioskDeviceException catch (error) {
      lastErrorCode = error.code;
      statusLabel = 'Using cached v${configuration.version}';
      if (error.isRevoked) {
        rethrow;
      }
    } on TimeoutException {
      lastErrorCode = 'KIOSK_CONFIGURATION_NETWORK_TIMEOUT';
      statusLabel = 'Using cached v${configuration.version}';
    } on SocketException {
      lastErrorCode = 'KIOSK_CONFIGURATION_NETWORK_UNAVAILABLE';
      statusLabel = 'Using cached v${configuration.version}';
    } catch (_) {
      lastErrorCode = 'KIOSK_CONFIGURATION_SYNC_FAILED';
      statusLabel = 'Using cached v${configuration.version}';
    } finally {
      syncing = false;
      notifyListeners();
    }
  }

  KioskRuntimeConfiguration? activatePendingConfiguration() {
    final pending = pendingConfiguration;
    if (pending == null) {
      return null;
    }
    configuration = pending;
    pendingConfiguration = null;
    statusLabel = 'Remote v${configuration.version}';
    notifyListeners();
    return configuration;
  }

  Future<KioskRuntimeConfiguration> _prepareAssets(
    KioskRuntimeConfiguration remote,
  ) async {
    final preparedAssets = <KioskRuntimeAsset>[];
    for (final asset in remote.assets) {
      if (asset.type == RuntimeKioskAssetType.bundledImage ||
          asset.type == RuntimeKioskAssetType.bundledVideo) {
        final assetPath = assetPathForBundledKey(asset.bundledAssetKey);
        final videoPath = videoPathForBundledKey(asset.bundledAssetKey);
        if (assetPath != null || videoPath != null) {
          preparedAssets.add(
            KioskRuntimeAsset(
              id: asset.id,
              type: asset.type,
              label: asset.label,
              bundledAssetKey: asset.bundledAssetKey,
              assetImagePath: assetPath,
              assetVideoPath: videoPath,
            ),
          );
        }
        continue;
      }
      final url = asset.url;
      if (url == null || Uri.tryParse(url)?.scheme != 'https') {
        throw const KioskDeviceException(
          'KIOSK_CONFIGURATION_ASSET_INVALID',
          'Kiosk presentation asset is invalid.',
        );
      }
      final localPath = await _downloadAsset(remote.version, asset);
      preparedAssets.add(asset.copyWithLocalAssetPath(localPath));
    }
    if (preparedAssets.isEmpty) {
      throw const KioskDeviceException(
        'KIOSK_CONFIGURATION_ASSET_UNAVAILABLE',
        'No kiosk presentation assets could be prepared.',
      );
    }
    return KioskRuntimeConfiguration(
      version: remote.version,
      idleMode: remote.idleMode,
      slideDurationSeconds: remote.slideDurationSeconds,
      title: remote.title,
      subtitle: remote.subtitle,
      ctaLabel: remote.ctaLabel,
      assets: preparedAssets,
      countdownSeconds: remote.countdownSeconds,
      soundEnabled: remote.soundEnabled,
      soundProfile: remote.soundProfile,
      guidanceAudioEnabled: remote.guidanceAudioEnabled,
      enabledGarmentIntents: remote.enabledGarmentIntents,
      garmentPreviewEnabled: remote.garmentPreviewEnabled,
      sessionIdleTimeoutSeconds: remote.sessionIdleTimeoutSeconds,
      updatedAt: remote.updatedAt,
    );
  }

  Future<String> _downloadAsset(int version, KioskRuntimeAsset asset) async {
    final response = await _client
        .get(Uri.parse(asset.url!))
        .timeout(const Duration(seconds: 20));
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw const KioskDeviceException(
        'KIOSK_CONFIGURATION_ASSET_UNAVAILABLE',
        'Kiosk presentation asset could not be downloaded.',
      );
    }
    final contentType = response.headers[HttpHeaders.contentTypeHeader] ?? '';
    if (!_isSupportedDownloadedContentType(contentType)) {
      throw const KioskDeviceException(
        'KIOSK_CONFIGURATION_ASSET_INVALID',
        'Kiosk presentation asset media type is not supported.',
      );
    }
    final directory = await _configurationCacheDirectory();
    final extension = _extensionForContentType(contentType);
    final file = File(
      path.join(
        directory.path,
        'v$version-${_safeFilePart(asset.id)}$extension',
      ),
    );
    final temporaryFile = File('${file.path}.tmp');
    await temporaryFile.writeAsBytes(response.bodyBytes, flush: true);
    if (await file.exists()) {
      await file.delete();
    }
    await temporaryFile.rename(file.path);
    return file.path;
  }

  Future<Directory> _configurationCacheDirectory() async {
    final provided = cacheDirectoryProvider;
    if (provided != null) {
      final directory = await provided();
      if (!await directory.exists()) {
        await directory.create(recursive: true);
      }
      return directory;
    }
    final root = await getApplicationSupportDirectory();
    final directory = Directory(path.join(root.path, 'selfx-kiosk-config'));
    if (!await directory.exists()) {
      await directory.create(recursive: true);
    }
    return directory;
  }

  static const _cacheKey = 'selfx.kiosk.runtimeConfiguration';

  @override
  void dispose() {
    _client.close();
    super.dispose();
  }
}

abstract class KioskRuntimeConfigurationCache {
  Future<String?> readConfigurationJson();

  Future<void> writeConfigurationJson(String value);
}

class SharedPreferencesKioskRuntimeConfigurationCache
    implements KioskRuntimeConfigurationCache {
  const SharedPreferencesKioskRuntimeConfigurationCache(this.preferences);

  final SharedPreferencesAsync preferences;

  @override
  Future<String?> readConfigurationJson() =>
      preferences.getString(KioskRuntimeConfigurationController._cacheKey);

  @override
  Future<void> writeConfigurationJson(String value) => preferences.setString(
    KioskRuntimeConfigurationController._cacheKey,
    value,
  );
}

String _extensionForContentType(String contentType) {
  final value = contentType.toLowerCase();
  if (value.contains('video/mp4')) {
    return '.mp4';
  }
  if (value.contains('png')) {
    return '.png';
  }
  if (value.contains('webp')) {
    return '.webp';
  }
  return '.jpg';
}

bool _isSupportedDownloadedContentType(String contentType) {
  final value = contentType.toLowerCase();
  return value.startsWith('image/') || value.startsWith('video/mp4');
}

String _safeFilePart(String value) {
  return value.replaceAll(RegExp(r'[^a-zA-Z0-9._-]'), '_');
}
