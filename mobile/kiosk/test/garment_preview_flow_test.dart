import 'dart:async';
import 'dart:collection';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:selfx_kiosk/src/acquisition/photo_acquisition.dart';
import 'package:selfx_kiosk/src/camera/camera_models.dart';
import 'package:selfx_kiosk/src/camera/camera_orientation.dart';
import 'package:selfx_kiosk/src/camera/camera_service.dart';
import 'package:selfx_kiosk/src/config/kiosk_runtime_configuration.dart';
import 'package:selfx_kiosk/src/device/kiosk_device_gateway.dart';
import 'package:selfx_kiosk/src/device/kiosk_device_models.dart';
import 'package:selfx_kiosk/src/device/kiosk_device_session_controller.dart';
import 'package:selfx_kiosk/src/device/kiosk_device_storage.dart';
import 'package:selfx_kiosk/src/live/live_frame.dart';
import 'package:selfx_kiosk/src/quality/image_quality.dart';
import 'package:selfx_kiosk/src/session/capture_audio_service.dart';
import 'package:selfx_kiosk/src/session/capture_session_controller.dart';
import 'package:selfx_kiosk/src/session/temporary_capture_store.dart';
import 'package:selfx_kiosk/src/settings/camera_settings_store.dart';
import 'package:selfx_kiosk/src/theme/selfx_kiosk_theme.dart';
import 'package:selfx_kiosk/src/tryon/garment_extraction_service.dart';
import 'package:selfx_kiosk/src/tryon/kiosk_garment_input.dart';
import 'package:selfx_kiosk/src/tryon/kiosk_try_on_gateway.dart';
import 'package:selfx_kiosk/src/tryon/kiosk_try_on_models.dart';
import 'package:selfx_kiosk/src/tryon/kiosk_try_on_session_controller.dart';
import 'package:selfx_kiosk/src/ui/garment_review_screen.dart';
import 'package:selfx_kiosk/src/ui/selfx_kiosk_button.dart';
import 'package:selfx_kiosk/src/upload/kiosk_customer_upload_controller.dart';
import 'package:selfx_kiosk/src/upload/kiosk_customer_upload_gateway.dart';
import 'package:selfx_kiosk/src/upload/kiosk_customer_upload_models.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('GarmentReviewScreen preview flow', () {
    testWidgets('new garment input starts extraction exactly once', (
      tester,
    ) async {
      final harness = await _ReviewHarness.create();
      addTearDown(harness.dispose);
      final extraction = FakeGarmentExtractionService();

      await tester.pumpReview(harness, extraction);
      await tester.pump();
      await tester.pump();

      expect(extraction.calls, 1);
      expect(extraction.inputs.single.localPath, harness.original.path);
      expect(find.text('Preparing garment preview...'), findsOneWidget);
      expect(_continueButton(tester).onPressed, isNull);

      extraction.completePendingFailure();
      await tester.pump();
    });

    testWidgets('successful extraction displays preview and enables continue', (
      tester,
    ) async {
      final harness = await _ReviewHarness.create();
      addTearDown(harness.dispose);
      final extraction = FakeGarmentExtractionService()
        ..enqueueSuccess(harness.preview.path);

      await tester.pumpReview(harness, extraction);
      await tester.pumpAndSettle();

      expect(extraction.calls, 1);
      expect(find.text('Garment looks ready'), findsOneWidget);
      expect(_continueButton(tester).onPressed, isNotNull);

      await tester.tap(find.byKey(const Key('continue-from-garment-review')));
      await tester.pumpAndSettle();

      expect(harness.tryOn.garmentInput?.localPath, harness.original.path);
      expect(
        harness.tryOn.garmentInput?.extractedPreviewPath,
        harness.preview.path,
      );
      expect(find.byKey(const Key('capture-photo')), findsOneWidget);
      expect(find.byKey(const Key('upload-person-photo')), findsOneWidget);
    });

    testWidgets('failure hides raw error and retry reuses same original path', (
      tester,
    ) async {
      final harness = await _ReviewHarness.create();
      addTearDown(harness.dispose);
      final extraction = FakeGarmentExtractionService()
        ..enqueueFailure(
          code: 'GARMENT_PREVIEW_CONFIGURATION_ERROR',
          message: 'OPENAI_API_KEY missing after provider stack trace.',
          kind: GarmentExtractionFailureKind.temporary,
        )
        ..enqueueSuccess(harness.preview.path);

      await tester.pumpReview(harness, extraction);
      await tester.pumpAndSettle();

      expect(find.textContaining('OPENAI_API_KEY'), findsNothing);
      expect(
        find.text("We couldn't prepare the garment preview right now."),
        findsOneWidget,
      );
      expect(find.byKey(const Key('retry-garment-preview')), findsOneWidget);
      expect(_continueButton(tester).onPressed, isNull);

      await tester.tap(find.byKey(const Key('retry-garment-preview')));
      await tester.pumpAndSettle();

      expect(extraction.calls, 2);
      expect(extraction.inputs.map((input) => input.localPath), [
        harness.original.path,
        harness.original.path,
      ]);
      expect(find.text('Garment looks ready'), findsOneWidget);
      expect(_continueButton(tester).onPressed, isNotNull);
    });

    testWidgets('image failure shows image guidance instead of service copy', (
      tester,
    ) async {
      final harness = await _ReviewHarness.create();
      addTearDown(harness.dispose);
      final extraction = FakeGarmentExtractionService()
        ..enqueueFailure(
          code: 'GARMENT_EXTRACTION_IMAGE_INVALID',
          message: 'decoder internals',
          kind: GarmentExtractionFailureKind.image,
        );

      await tester.pumpReview(harness, extraction);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      expect(
        find.text("We couldn't find a clear garment in this photo."),
        findsOneWidget,
      );
      expect(find.text('Retake garment photo'), findsOneWidget);
      expect(find.text('Keep the full garment visible'), findsOneWidget);
      expect(find.textContaining('decoder internals'), findsNothing);
    });

    testWidgets('existing valid preview does not start extraction', (
      tester,
    ) async {
      final harness = await _ReviewHarness.create(withExistingPreview: true);
      addTearDown(harness.dispose);
      final extraction = FakeGarmentExtractionService();

      await tester.pumpReview(harness, extraction);
      await tester.pumpAndSettle();

      expect(extraction.calls, 0);
      expect(find.text('Garment looks ready'), findsOneWidget);
      expect(_continueButton(tester).onPressed, isNotNull);
    });

    testWidgets('a new garment path starts a new extraction', (tester) async {
      final harness = await _ReviewHarness.create();
      addTearDown(harness.dispose);
      final nextOriginal = await harness.writeImage('next-garment.png');
      final nextPreview = await harness.writeImage('next-preview.png');
      final extraction = FakeGarmentExtractionService()
        ..enqueueSuccess(harness.preview.path)
        ..enqueueSuccess(nextPreview.path);

      await tester.pumpReview(harness, extraction);
      await tester.pumpAndSettle();

      await tester.pumpReview(
        harness,
        extraction,
        input: harness.inputFor(nextOriginal),
      );
      await tester.pumpAndSettle();

      expect(extraction.calls, 2);
      expect(extraction.inputs.last.localPath, nextOriginal.path);
    });

    testWidgets('camera and upload inputs enter the same preview behavior', (
      tester,
    ) async {
      final harness = await _ReviewHarness.create();
      addTearDown(harness.dispose);
      final uploadOriginal = await harness.writeImage('upload-garment.png');
      final uploadPreview = await harness.writeImage('upload-preview.png');
      final extraction = FakeGarmentExtractionService()
        ..enqueueSuccess(harness.preview.path)
        ..enqueueSuccess(uploadPreview.path);

      await tester.pumpReview(harness, extraction, pendingCameraCapture: true);
      await tester.pumpAndSettle();
      expect(find.text('Retake Photo'), findsOneWidget);

      await tester.pumpReview(
        harness,
        extraction,
        input: harness.inputFor(
          uploadOriginal,
          source: KioskGarmentInputSource.phoneUpload,
        ),
        pendingCameraCapture: false,
      );
      await tester.pumpAndSettle();

      expect(extraction.calls, 2);
      expect(find.text('Retake'), findsOneWidget);
      expect(find.text('Garment looks ready'), findsOneWidget);
    });
  });
}

SelfxKioskButton _continueButton(WidgetTester tester) {
  return tester.widget<SelfxKioskButton>(
    find.byKey(const Key('continue-from-garment-review')),
  );
}

extension _ReviewPump on WidgetTester {
  Future<void> pumpReview(
    _ReviewHarness harness,
    FakeGarmentExtractionService extraction, {
    KioskGarmentInput? input,
    bool pendingCameraCapture = false,
  }) async {
    await pumpWidget(
      MaterialApp(
        theme: buildSelfxKioskTheme(),
        home: GarmentReviewScreen(
          captureController: harness.capture,
          tryOnController: harness.tryOn,
          uploadController: harness.upload,
          garmentInput: input ?? harness.input,
          pendingCameraCapture: pendingCameraCapture,
          extractionService: extraction,
        ),
      ),
    );
  }
}

class FakeGarmentExtractionService implements GarmentExtractionService {
  final Queue<FutureOr<GarmentExtractionResult>> _results = Queue();
  final List<KioskGarmentInput> inputs = [];
  final List<Completer<GarmentExtractionResult>> pending = [];

  int get calls => inputs.length;

  void enqueueSuccess(String previewPath) {
    _results.add(
      GarmentExtractionResult(
        status: GarmentExtractionStatus.succeeded,
        previewPath: previewPath,
      ),
    );
  }

  void enqueueFailure({
    required String code,
    required String message,
    required GarmentExtractionFailureKind kind,
  }) {
    _results.add(
      GarmentExtractionResult(
        status: GarmentExtractionStatus.failed,
        message: message,
        code: code,
        failureKind: kind,
      ),
    );
  }

  @override
  Future<GarmentExtractionResult> extractPreview(
    KioskGarmentInput input,
  ) async {
    inputs.add(input);
    if (_results.isEmpty) {
      final completer = Completer<GarmentExtractionResult>();
      pending.add(completer);
      return completer.future;
    }
    return _results.removeFirst();
  }

  void completePendingFailure() {
    for (final completer in pending) {
      if (!completer.isCompleted) {
        completer.complete(
          const GarmentExtractionResult(
            status: GarmentExtractionStatus.failed,
            code: 'GARMENT_PREVIEW_TEST_CANCELLED',
          ),
        );
      }
    }
    pending.clear();
  }
}

class _ReviewHarness {
  _ReviewHarness({
    required this.temp,
    required this.original,
    required this.preview,
    required this.capture,
    required this.tryOn,
    required this.upload,
    required this.input,
  });

  final Directory temp;
  final File original;
  final File preview;
  final CaptureSessionController capture;
  final KioskTryOnSessionController tryOn;
  final KioskCustomerUploadController upload;
  final KioskGarmentInput input;

  static Future<_ReviewHarness> create({
    bool withExistingPreview = false,
  }) async {
    final temp = await Directory.systemTemp.createTemp('selfx-preview-test-');
    final original = await _writePng(temp, 'original-garment.png');
    final preview = await _writePng(temp, 'generated-preview.png');
    final captureStore = _TestTemporaryCaptureStore(temp);
    final capture = CaptureSessionController(
      cameraService: _FakeCameraService(),
      settingsStore: InMemoryCameraSettingsStore(),
      analyzer: _FakeQualityAnalyzer(),
      captureStore: captureStore,
      audioService: const SilentCaptureAudioService(),
    );
    final tryOn = KioskTryOnSessionController(gateway: _FakeTryOnGateway());
    final upload = KioskCustomerUploadController(
      deviceController: _testDeviceController(),
      gateway: _FakeUploadGateway(),
      captureStore: captureStore,
    );
    final input = KioskGarmentInput(
      source: KioskGarmentInputSource.capturedGarment,
      localPath: original.path,
      intent: KioskGarmentIntent.top,
      photoType: KioskGarmentPhotoType.onModel,
      extractedPreviewPath: withExistingPreview ? preview.path : null,
    );
    return _ReviewHarness(
      temp: temp,
      original: original,
      preview: preview,
      capture: capture,
      tryOn: tryOn,
      upload: upload,
      input: input,
    );
  }

  Future<File> writeImage(String name) => _writePng(temp, name);

  KioskGarmentInput inputFor(
    File file, {
    KioskGarmentInputSource source = KioskGarmentInputSource.capturedGarment,
  }) {
    return KioskGarmentInput(
      source: source,
      localPath: file.path,
      intent: KioskGarmentIntent.top,
      photoType: KioskGarmentPhotoType.onModel,
    );
  }

  Future<void> dispose() async {
    tryOn.dispose();
    capture.dispose();
    upload.dispose();
    if (await temp.exists()) {
      await temp.delete(recursive: true);
    }
  }
}

Future<File> _writePng(Directory directory, String name) async {
  final file = File('${directory.path}${Platform.pathSeparator}$name');
  await file.writeAsBytes(_tinyPng, flush: true);
  return file;
}

final _tinyPng = base64Decode(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
);

class _TestTemporaryCaptureStore extends TemporaryCaptureStore {
  _TestTemporaryCaptureStore(this.directory);

  final Directory directory;
  final List<String> deleted = [];

  @override
  Future<String> createTempCapturePath({
    required String prefix,
    required String extension,
  }) async {
    final safeExtension = extension.startsWith('.') ? extension : '.$extension';
    return '${directory.path}${Platform.pathSeparator}$prefix-${DateTime.now().microsecondsSinceEpoch}$safeExtension';
  }

  @override
  Future<void> deleteCapture(String? path) async {
    if (path != null) {
      deleted.add(path);
    }
  }

  @override
  Future<void> clearAll() async {}
}

class _FakeTryOnGateway implements KioskTryOnGateway {
  @override
  Future<KioskTryOnRun> createRun(KioskTryOnRequest request) async {
    return const KioskTryOnRun(id: 'run-1', status: KioskTryOnStatus.queued);
  }

  @override
  Future<KioskTryOnRun> getRun(String runId) async {
    return KioskTryOnRun(id: runId, status: KioskTryOnStatus.processing);
  }
}

KioskDeviceSessionController _testDeviceController() {
  return KioskDeviceSessionController(
      gateway: _FakeDeviceGateway(),
      store: _InMemoryDeviceStore(),
    )
    ..accessToken = 'device-token'
    ..accessTokenExpiresAt = DateTime.now().add(const Duration(minutes: 5))
    ..state = KioskStartupState.active;
}

class _FakeUploadGateway implements KioskCustomerUploadGateway {
  @override
  Future<KioskCustomerUploadSession> cancelSession({
    required String accessToken,
    required String sessionId,
  }) async {
    return _session(KioskCustomerUploadStatus.cancelled);
  }

  @override
  Future<KioskCustomerUploadSession> consumeSession({
    required String accessToken,
    required String sessionId,
    required PhotoAcquisitionPurpose purpose,
  }) async {
    return _session(KioskCustomerUploadStatus.consumed, purpose: purpose);
  }

  @override
  Future<KioskCustomerUploadSession> createSession(
    String accessToken, {
    required PhotoAcquisitionPurpose purpose,
  }) async {
    return _session(KioskCustomerUploadStatus.waiting, purpose: purpose);
  }

  @override
  Future<void> downloadReadyPhoto({
    required String readUrl,
    required String targetPath,
  }) async {}

  @override
  Future<KioskCustomerUploadSession> getSession({
    required String accessToken,
    required String sessionId,
  }) async {
    return _session(KioskCustomerUploadStatus.waiting);
  }

  KioskCustomerUploadSession _session(
    KioskCustomerUploadStatus status, {
    PhotoAcquisitionPurpose purpose = PhotoAcquisitionPurpose.model,
  }) {
    return KioskCustomerUploadSession(
      sessionId: 'session-1',
      status: status,
      purpose: purpose,
      expiresAt: DateTime.now().add(const Duration(minutes: 5)),
      serverTime: DateTime.now(),
      pollIntervalSeconds: 3,
      publicUploadUrl: 'https://selfx.test/upload',
    );
  }
}

class _FakeDeviceGateway implements KioskDeviceGateway {
  @override
  Future<KioskPairingSession> createPairingSession({
    required String installationId,
    required String platform,
    required String appVersion,
  }) {
    throw UnimplementedError();
  }

  @override
  Future<KioskDeviceCredentials> exchangeProvisioningGrant({
    required String pairingSessionId,
    required String provisioningSecret,
    required String provisioningGrant,
  }) {
    throw UnimplementedError();
  }

  @override
  Future<KioskPairingStatusResult> getPairingStatus({
    required String sessionId,
    required String provisioningSecret,
  }) {
    throw UnimplementedError();
  }

  @override
  Future<KioskDeviceIdentity> heartbeat({
    required String accessToken,
    required String platform,
    required String appVersion,
  }) {
    throw UnimplementedError();
  }

  @override
  Future<KioskDeviceIdentity> me(String accessToken) {
    throw UnimplementedError();
  }

  @override
  Future<KioskDeviceCredentials> refreshSession(String refreshToken) {
    throw UnimplementedError();
  }

  @override
  Future<KioskRuntimeConfiguration> configuration(String accessToken) async {
    return defaultRuntimeConfiguration;
  }
}

class _InMemoryDeviceStore implements KioskDeviceCredentialStore {
  String? refreshToken;

  @override
  Future<void> clearRefreshToken() async {
    refreshToken = null;
  }

  @override
  Future<String> installationId() async => 'installation-1';

  @override
  Future<String?> readRefreshToken() async => refreshToken;

  @override
  Future<void> writeRefreshToken(String token) async {
    refreshToken = token;
  }
}

class _FakeCameraService implements CameraService {
  final _state = ValueNotifier(const CameraState());

  @override
  ValueListenable<CameraState> get state => _state;

  @override
  Stream<LiveCameraFrame> get liveFrames => const Stream.empty();

  @override
  Widget buildPreview(BuildContext context) => const SizedBox.shrink();

  @override
  Future<CameraCaptureResult> captureStill() {
    throw UnimplementedError();
  }

  @override
  Future<void> dispose() async {
    _state.dispose();
  }

  @override
  Future<void> initialize({String? preferredCameraId}) async {}

  @override
  Future<List<CameraDevice>> rediscoverDevices() async => const [];

  @override
  Future<void> selectCamera(CameraDevice device) async {}

  @override
  Future<void> startLiveFrames() async {}

  @override
  Future<void> stopLiveFrames() async {}

  @override
  Future<void> updateOrientationMode(CameraOrientationMode mode) async {}
}

class _FakeQualityAnalyzer implements KioskImageQualityAnalyzer {
  @override
  Future<ImageQualityResult> analyzeStillImage(
    String imagePath,
    ImageQualityTarget target,
  ) async {
    return const ImageQualityResult(
      status: ImageQualityStatus.pass,
      passed: true,
      score: 100,
      metrics: ImageQualityMetrics(
        width: 1,
        height: 1,
        sharpness: null,
        brightness: null,
        contrast: null,
      ),
      issues: [],
    );
  }

  @override
  void dispose() {}
}
