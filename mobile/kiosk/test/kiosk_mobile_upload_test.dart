import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:selfx_kiosk/src/config/kiosk_runtime_configuration.dart';
import 'package:selfx_kiosk/src/camera/camera_models.dart';
import 'package:selfx_kiosk/src/camera/camera_orientation.dart';
import 'package:selfx_kiosk/src/acquisition/photo_acquisition.dart';
import 'package:selfx_kiosk/src/camera/camera_service.dart';
import 'package:selfx_kiosk/src/device/kiosk_device_gateway.dart';
import 'package:selfx_kiosk/src/device/kiosk_device_models.dart';
import 'package:selfx_kiosk/src/device/kiosk_device_session_controller.dart';
import 'package:selfx_kiosk/src/device/kiosk_device_storage.dart';
import 'package:selfx_kiosk/src/live/live_frame.dart';
import 'package:selfx_kiosk/src/quality/image_quality.dart';
import 'package:selfx_kiosk/src/session/capture_audio_service.dart';
import 'package:selfx_kiosk/src/session/capture_flow.dart';
import 'package:selfx_kiosk/src/session/capture_scope.dart';
import 'package:selfx_kiosk/src/session/capture_session_controller.dart';
import 'package:selfx_kiosk/src/session/temporary_capture_store.dart';
import 'package:selfx_kiosk/src/settings/camera_settings_store.dart';
import 'package:selfx_kiosk/src/tryon/kiosk_garment_input.dart';
import 'package:selfx_kiosk/src/tryon/kiosk_try_on_gateway.dart';
import 'package:selfx_kiosk/src/tryon/kiosk_try_on_models.dart';
import 'package:selfx_kiosk/src/tryon/kiosk_try_on_session_controller.dart';
import 'package:selfx_kiosk/src/tryon/model_coverage_analyzer.dart';
import 'package:selfx_kiosk/src/tryon/model_garment_compatibility.dart';
import 'package:selfx_kiosk/src/tryon/try_on_target_preparer.dart';
import 'package:selfx_kiosk/src/upload/kiosk_customer_upload_controller.dart';
import 'package:selfx_kiosk/src/upload/kiosk_customer_upload_gateway.dart';
import 'package:selfx_kiosk/src/upload/kiosk_customer_upload_models.dart';
import 'package:selfx_kiosk/src/ui/mobile_upload_screen.dart';

void main() {
  test('createSession sends bodyless POST without JSON content type', () async {
    final gateway = SelfxKioskCustomerUploadGateway(
      config: const KioskCustomerUploadApiConfig(
        apiBaseUrl: 'https://api.selfx.test',
      ),
      client: MockClient((http.Request request) async {
        expect(request.method, 'POST');
        expect(request.url.path, '/api/v1/kiosk/customer-upload-sessions');
        expect(request.url.queryParameters['purpose'], 'MODEL');
        expect(request.bodyBytes, isEmpty);
        expect(request.headers[HttpHeaders.acceptHeader], 'application/json');
        expect(
          request.headers[HttpHeaders.authorizationHeader],
          'Bearer device-token',
        );
        expect(request.headers, isNot(contains(HttpHeaders.contentTypeHeader)));
        return uploadSessionJsonResponse(uploadSessionJson('upload-session'));
      }),
    );

    final session = await gateway.createSession(
      'device-token',
      purpose: PhotoAcquisitionPurpose.model,
    );

    expect(session.sessionId, 'upload-session');
  });

  test(
    'bodyless customer upload device requests omit JSON content type',
    () async {
      final seen = <String, http.Request>{};
      final gateway = SelfxKioskCustomerUploadGateway(
        config: const KioskCustomerUploadApiConfig(
          apiBaseUrl: 'https://api.selfx.test',
        ),
        client: MockClient((http.Request request) async {
          seen[request.url.path] = request;
          return uploadSessionJsonResponse(uploadSessionJson('upload-session'));
        }),
      );

      await gateway.getSession(
        accessToken: 'device-token',
        sessionId: 'upload-session',
      );
      await gateway.cancelSession(
        accessToken: 'device-token',
        sessionId: 'upload-session',
      );
      await gateway.consumeSession(
        accessToken: 'device-token',
        sessionId: 'upload-session',
        purpose: PhotoAcquisitionPurpose.model,
      );

      for (final request in seen.values) {
        expect(request.bodyBytes, isEmpty);
        expect(request.headers[HttpHeaders.acceptHeader], 'application/json');
        expect(
          request.headers[HttpHeaders.authorizationHeader],
          'Bearer device-token',
        );
        expect(request.headers, isNot(contains(HttpHeaders.contentTypeHeader)));
      }
    },
  );

  test('customer upload download uses binary GET headers', () async {
    final seen = <http.Request>[];
    final gateway = SelfxKioskCustomerUploadGateway(
      config: const KioskCustomerUploadApiConfig(
        apiBaseUrl: 'https://api.selfx.test',
      ),
      client: MockClient((http.Request request) async {
        seen.add(request);
        return http.Response.bytes([1, 2, 3], 200);
      }),
    );
    final target = File(
      '${Directory.systemTemp.path}${Platform.pathSeparator}selfx-upload-test.jpg',
    );
    addTearDown(() async {
      if (await target.exists()) {
        await target.delete();
      }
    });

    await gateway.downloadReadyPhoto(
      readUrl: 'https://storage.selfx.test/photo.jpg',
      targetPath: target.path,
    );

    expect(seen.single.headers, isNot(contains(HttpHeaders.contentTypeHeader)));
    expect(await target.readAsBytes(), [1, 2, 3]);
  });

  test(
    'mobile upload session creates QR state from active device token',
    () async {
      final gateway = FakeUploadGateway()
        ..nextStatusSession = waitingUploadSession('upload-session');
      final controller = KioskCustomerUploadController(
        deviceController: testDeviceController(),
        gateway: gateway,
        captureStore: InMemoryTemporaryCaptureStore(),
      );

      await controller.createSession();

      expect(
        controller.session?.publicUploadUrl,
        contains('/upload/capability'),
      );
      expect(controller.message, 'Waiting for your photo...');
      expect(controller.flowState, KioskCustomerUploadFlowState.waiting);
      expect(gateway.createdAccessToken, 'device-token');
      expect(gateway.createdPurpose, PhotoAcquisitionPurpose.model);
      controller.dispose();
    },
  );

  test(
    'garment upload session carries purpose through create and consume',
    () async {
      final gateway = FakeUploadGateway()
        ..nextSession = readyUploadSession(
          'garment-upload-session',
          purpose: PhotoAcquisitionPurpose.garment,
        );
      final uploadController =
          KioskCustomerUploadController(
              deviceController: testDeviceController(),
              gateway: gateway,
              captureStore: InMemoryTemporaryCaptureStore(),
            )
            ..session = readyUploadSession(
              'garment-upload-session',
              purpose: PhotoAcquisitionPurpose.garment,
            );

      await uploadController.createSession(
        purpose: PhotoAcquisitionPurpose.garment,
      );
      uploadController.session = readyUploadSession(
        'garment-upload-session',
        purpose: PhotoAcquisitionPurpose.garment,
      );
      final input = await uploadController.useReadyGarment(
        intent: KioskGarmentIntent.top,
      );

      expect(gateway.createdPurpose, PhotoAcquisitionPurpose.garment);
      expect(gateway.consumedPurpose, PhotoAcquisitionPurpose.garment);
      expect(input?.source, KioskGarmentInputSource.phoneUpload);
      expect(input?.intent, KioskGarmentIntent.top);
      expect(input?.photoType, KioskGarmentPhotoType.auto);
      uploadController.dispose();
    },
  );

  testWidgets('phone garment upload skips preview when disabled', (
    tester,
  ) async {
    final harness = await pumpMobileUploadScreen(
      tester,
      gateway: FakeUploadGateway()
        ..nextSession = readyUploadSession(
          'garment-upload-session',
          purpose: PhotoAcquisitionPurpose.garment,
        ),
      purpose: PhotoAcquisitionPurpose.garment,
    );

    await pumpMobileUploadState(tester);
    await tester.tap(find.byKey(const Key('use-mobile-photo')));
    await tester.pumpAndSettle();

    expect(
      harness.tryOnController.garmentInput?.source,
      KioskGarmentInputSource.phoneUpload,
    );
    expect(harness.tryOnController.garmentInput?.extractedPreviewPath, isNull);
    expect(find.text('Creating Try-On'), findsOneWidget);
    expect(find.text('Preparing garment preview'), findsNothing);

    harness.dispose();
    await tester.pumpWidget(const SizedBox.shrink());
  });

  test('cancel stops active mobile upload polling', () async {
    final gateway = FakeUploadGateway()
      ..nextStatusSession = waitingUploadSession('upload-session');
    final controller = KioskCustomerUploadController(
      deviceController: testDeviceController(),
      gateway: gateway,
      captureStore: InMemoryTemporaryCaptureStore(),
    );

    await controller.createSession();
    expect(controller.hasActivePoller, isTrue);

    await controller.cancel();

    expect(controller.hasActivePoller, isFalse);
    controller.dispose();
  });

  test(
    'expired session requests a replacement and stops using old QR',
    () async {
      final expired = waitingUploadSession(
        'old-session',
        publicUploadUrl: 'https://try.selfx.test/upload/old-secret',
        expiresAt: DateTime.now().subtract(const Duration(seconds: 1)),
      );
      final fresh = waitingUploadSession(
        'new-session',
        publicUploadUrl: 'https://try.selfx.test/upload/new-secret',
      );
      final gateway = FakeUploadGateway()
        ..createOutcomes.addAll([expired, fresh])
        ..nextStatusSession = waitingUploadSession('new-session');
      final controller = KioskCustomerUploadController(
        deviceController: testDeviceController(),
        gateway: gateway,
        captureStore: InMemoryTemporaryCaptureStore(),
      );

      await controller.createSession();
      await testerPumpEventQueue();

      expect(gateway.createCalls, greaterThanOrEqualTo(2));
      expect(controller.session?.sessionId, 'new-session');
      expect(controller.session?.publicUploadUrl, contains('new-secret'));
      controller.dispose();
    },
  );

  test(
    'revoked device upload failure clears auth and returns to pairing',
    () async {
      final deviceGateway = FakeDeviceGateway();
      final store = InMemoryDeviceStore()..refreshToken = 'refresh-token';
      final deviceController =
          KioskDeviceSessionController(gateway: deviceGateway, store: store)
            ..accessToken = 'device-token'
            ..state = KioskStartupState.active;
      final gateway = FakeUploadGateway()
        ..createOutcomes.add(
          const KioskCustomerUploadException(
            'DEVICE_REVOKED',
            'Device revoked.',
            statusCode: 403,
          ),
        );
      final controller = KioskCustomerUploadController(
        deviceController: deviceController,
        gateway: gateway,
        captureStore: InMemoryTemporaryCaptureStore(),
      );

      await controller.createSession();

      expect(store.refreshToken, isNull);
      expect(deviceController.state, KioskStartupState.waitingForPairing);
      expect(controller.errorCode, 'DEVICE_REVOKED');
      controller.dispose();
      deviceController.dispose();
    },
  );

  test(
    'normal customer upload request failure does not clear pairing',
    () async {
      final deviceGateway = FakeDeviceGateway();
      final store = InMemoryDeviceStore()..refreshToken = 'refresh-token';
      final deviceController =
          KioskDeviceSessionController(gateway: deviceGateway, store: store)
            ..accessToken = 'device-token'
            ..accessTokenExpiresAt = DateTime.now().add(
              const Duration(minutes: 5),
            )
            ..state = KioskStartupState.active;
      final gateway = FakeUploadGateway()
        ..createOutcomes.add(
          const KioskCustomerUploadException(
            'CUSTOMER_UPLOAD_REQUEST_FAILED',
            'Request failed.',
            statusCode: 400,
          ),
        );
      final controller = KioskCustomerUploadController(
        deviceController: deviceController,
        gateway: gateway,
        captureStore: InMemoryTemporaryCaptureStore(),
      );

      await controller.createSession();

      expect(await store.readRefreshToken(), 'refresh-token');
      expect(deviceController.state, KioskStartupState.active);
      expect(deviceGateway.pairingRequests, 0);
      expect(controller.errorCode, 'CUSTOMER_UPLOAD_REQUEST_FAILED');
      controller.dispose();
      deviceController.dispose();
    },
  );

  for (final code in ['DEVICE_TOKEN_INVALID', 'DEVICE_TOKEN_EXPIRED']) {
    test('$code refreshes once and retries createSession', () async {
      final deviceGateway = FakeDeviceGateway(
        refreshedCredentials: testDeviceCredentials('fresh-device-token'),
      );
      final store = InMemoryDeviceStore()..refreshToken = 'refresh-token';
      final deviceController =
          KioskDeviceSessionController(gateway: deviceGateway, store: store)
            ..accessToken = 'stale-device-token'
            ..accessTokenExpiresAt = DateTime.now().add(
              const Duration(minutes: 5),
            )
            ..state = KioskStartupState.active;
      final gateway = FakeUploadGateway()
        ..createOutcomes.add(
          KioskCustomerUploadException(
            code,
            'Access token rejected.',
            statusCode: 401,
          ),
        )
        ..createOutcomes.add(waitingUploadSession('upload-session'))
        ..nextStatusSession = waitingUploadSession('upload-session');
      final controller = KioskCustomerUploadController(
        deviceController: deviceController,
        gateway: gateway,
        captureStore: InMemoryTemporaryCaptureStore(),
      );

      await controller.createSession();

      expect(gateway.createCalls, 2);
      expect(gateway.createAccessTokens, [
        'stale-device-token',
        'fresh-device-token',
      ]);
      expect(deviceGateway.refreshCalls, 1);
      expect(controller.flowState, KioskCustomerUploadFlowState.waiting);
      controller.dispose();
      deviceController.dispose();
    });
  }

  test('refreshable token response does not retry indefinitely', () async {
    final deviceGateway = FakeDeviceGateway(
      refreshedCredentials: testDeviceCredentials('fresh-device-token'),
    );
    final store = InMemoryDeviceStore()..refreshToken = 'refresh-token';
    final deviceController =
        KioskDeviceSessionController(gateway: deviceGateway, store: store)
          ..accessToken = 'stale-device-token'
          ..accessTokenExpiresAt = DateTime.now().add(
            const Duration(minutes: 5),
          )
          ..state = KioskStartupState.active;
    final gateway = FakeUploadGateway()
      ..createOutcomes.add(
        const KioskCustomerUploadException(
          'DEVICE_TOKEN_INVALID',
          'Access token rejected.',
          statusCode: 401,
        ),
      )
      ..createOutcomes.add(
        const KioskCustomerUploadException(
          'DEVICE_TOKEN_INVALID',
          'Access token rejected.',
          statusCode: 401,
        ),
      );
    final controller = KioskCustomerUploadController(
      deviceController: deviceController,
      gateway: gateway,
      captureStore: InMemoryTemporaryCaptureStore(),
    );

    await controller.createSession();

    expect(gateway.createCalls, 2);
    expect(deviceGateway.refreshCalls, 1);
    expect(controller.errorCode, 'DEVICE_TOKEN_INVALID');
    expect(await store.readRefreshToken(), 'next-refresh-token');
    controller.dispose();
    deviceController.dispose();
  });

  test('terminal forced refresh failure does not retry upload again', () async {
    final deviceGateway = FakeDeviceGateway(
      refreshException: const KioskDeviceException(
        'DEVICE_UNPAIRED',
        'Kiosk device is not paired.',
      ),
    );
    final store = InMemoryDeviceStore()..refreshToken = 'refresh-token';
    final deviceController =
        KioskDeviceSessionController(gateway: deviceGateway, store: store)
          ..accessToken = 'stale-device-token'
          ..accessTokenExpiresAt = DateTime.now().add(
            const Duration(minutes: 5),
          )
          ..state = KioskStartupState.active;
    final gateway = FakeUploadGateway()
      ..createOutcomes.add(
        const KioskCustomerUploadException(
          'DEVICE_TOKEN_EXPIRED',
          'Access token expired.',
          statusCode: 401,
        ),
      );
    final controller = KioskCustomerUploadController(
      deviceController: deviceController,
      gateway: gateway,
      captureStore: InMemoryTemporaryCaptureStore(),
    );

    await controller.createSession();

    expect(gateway.createCalls, 1);
    expect(deviceGateway.refreshCalls, 1);
    expect(deviceController.state, KioskStartupState.waitingForPairing);
    expect(controller.errorCode, 'DEVICE_UNPAIRED');
    controller.dispose();
    deviceController.dispose();
  });

  test(
    'terminal unpaired upload failure clears auth and returns to pairing',
    () async {
      final deviceGateway = FakeDeviceGateway();
      final store = InMemoryDeviceStore()..refreshToken = 'refresh-token';
      final deviceController =
          KioskDeviceSessionController(gateway: deviceGateway, store: store)
            ..accessToken = 'device-token'
            ..accessTokenExpiresAt = DateTime.now().add(
              const Duration(minutes: 5),
            )
            ..state = KioskStartupState.active;
      final gateway = FakeUploadGateway()
        ..createOutcomes.add(
          const KioskCustomerUploadException(
            'DEVICE_UNPAIRED',
            'Device is not paired.',
            statusCode: 401,
          ),
        );
      final controller = KioskCustomerUploadController(
        deviceController: deviceController,
        gateway: gateway,
        captureStore: InMemoryTemporaryCaptureStore(),
      );

      await controller.createSession();

      expect(await store.readRefreshToken(), isNull);
      expect(deviceController.state, KioskStartupState.waitingForPairing);
      expect(controller.errorCode, 'DEVICE_UNPAIRED');
      controller.dispose();
      deviceController.dispose();
    },
  );

  test('ready mobile upload is accepted as temporary person photo', () async {
    final gateway = FakeUploadGateway()
      ..nextSession = readyUploadSession('upload-session');
    final uploadController = KioskCustomerUploadController(
      deviceController: testDeviceController(),
      gateway: gateway,
      captureStore: InMemoryTemporaryCaptureStore(),
    )..session = readyUploadSession('upload-session');
    final captureController = testCaptureController();

    final accepted = await uploadController.useReadyPhoto(captureController);

    expect(accepted, isTrue);
    expect(
      captureController.acceptedCapture?.originalPath,
      'mobile-upload-0.jpg',
    );
    expect(
      captureController.acceptedPersonImage?.source,
      CustomerPersonImageSource.mobileUpload,
    );
    expect(captureController.flowState.stage, CaptureFlowStage.photoReady);
    expect(gateway.consumedSessionId, 'upload-session');
    uploadController.dispose();
    captureController.dispose();
  });

  test('phone model upload stores analyzed upper-body coverage', () async {
    final uploadController = KioskCustomerUploadController(
      deviceController: testDeviceController(),
      gateway: FakeUploadGateway()
        ..nextSession = readyUploadSession('upload-session'),
      captureStore: InMemoryTemporaryCaptureStore(),
    )..session = readyUploadSession('upload-session');
    final analyzer = FakeModelCoverageAnalyzer([
      const ModelCoverageAnalysis.resolved(
        coverage: ModelCoverage.upperBody,
        confidence: 0.91,
        reasonCode: 'TEST_UPPER_BODY',
      ),
    ]);
    final captureController = testCaptureController(
      modelCoverageAnalyzer: analyzer,
    )..selectCaptureScope(CaptureScope.fullBody);

    final accepted = await uploadController.useReadyPhoto(captureController);

    expect(accepted, isTrue);
    expect(captureController.acceptedModelCoverage, ModelCoverage.upperBody);
    expect(
      captureController.acceptedModelCoverageAnalysis?.analysisAvailable,
      isTrue,
    );
    expect(analyzer.calls, 1);
    uploadController.dispose();
    captureController.dispose();
  });

  test(
    'phone upper-body model with top garment reaches request creation',
    () async {
      final uploadController = KioskCustomerUploadController(
        deviceController: testDeviceController(),
        gateway: FakeUploadGateway()
          ..nextSession = readyUploadSession('upload-session'),
        captureStore: InMemoryTemporaryCaptureStore(),
      )..session = readyUploadSession('upload-session');
      final captureController = testCaptureController(
        modelCoverageAnalyzer: FakeModelCoverageAnalyzer([
          const ModelCoverageAnalysis.resolved(
            coverage: ModelCoverage.upperBody,
            confidence: 0.88,
            reasonCode: 'TEST_UPPER_BODY',
          ),
        ]),
      )..selectCaptureScope(CaptureScope.fullBody);
      final tryOnGateway = FakeTryOnGateway();
      final tryOnController =
          KioskTryOnSessionController(
            gateway: tryOnGateway,
            targetPreparer: FakeTargetPreparer(),
          )..selectGarment(
            const KioskGarmentInput(
              source: KioskGarmentInputSource.phoneUpload,
              localPath: 'garment.jpg',
              intent: KioskGarmentIntent.top,
            ),
          );

      await uploadController.useReadyPhoto(captureController);
      await tryOnController.submitFromCapture(captureController);

      expect(tryOnGateway.createCalls, 1);
      expect(tryOnGateway.lastRequest?.modelCoverage, ModelCoverage.upperBody);
      expect(
        tryOnGateway.lastRequest?.garmentInput.intent,
        KioskGarmentIntent.top,
      );
      uploadController.dispose();
      captureController.dispose();
      tryOnController.dispose();
    },
  );

  test('phone model upload stores full-body coverage', () async {
    final uploadController = KioskCustomerUploadController(
      deviceController: testDeviceController(),
      gateway: FakeUploadGateway()
        ..nextSession = readyUploadSession('upload-session'),
      captureStore: InMemoryTemporaryCaptureStore(),
    )..session = readyUploadSession('upload-session');
    final captureController = testCaptureController(
      modelCoverageAnalyzer: FakeModelCoverageAnalyzer([
        const ModelCoverageAnalysis.resolved(
          coverage: ModelCoverage.fullBody,
          confidence: 0.93,
          reasonCode: 'TEST_FULL_BODY',
        ),
      ]),
    );

    await uploadController.useReadyPhoto(captureController);

    expect(captureController.acceptedModelCoverage, ModelCoverage.fullBody);
    uploadController.dispose();
    captureController.dispose();
  });

  test('full-body phone model supports top, bottom and full outfit', () async {
    const service = ModelGarmentCompatibilityService();

    for (final intent in [
      KioskGarmentIntent.top,
      KioskGarmentIntent.bottom,
      KioskGarmentIntent.fullOutfit,
    ]) {
      expect(
        service
            .check(coverage: ModelCoverage.fullBody, intent: intent)
            .supported,
        isTrue,
      );
    }
  });

  test(
    'unknown phone model coverage remains blocked before provider',
    () async {
      final captureController = testCaptureController(
        modelCoverageAnalyzer: FakeModelCoverageAnalyzer([
          const ModelCoverageAnalysis.unknown(reasonCode: 'TEST_INSUFFICIENT'),
        ]),
      )..selectCaptureScope(CaptureScope.top);
      final uploadController = KioskCustomerUploadController(
        deviceController: testDeviceController(),
        gateway: FakeUploadGateway()
          ..nextSession = readyUploadSession('upload-session'),
        captureStore: InMemoryTemporaryCaptureStore(),
      )..session = readyUploadSession('upload-session');
      final tryOnGateway = FakeTryOnGateway();
      final tryOnController =
          KioskTryOnSessionController(
            gateway: tryOnGateway,
            targetPreparer: FakeTargetPreparer(),
          )..selectGarment(
            const KioskGarmentInput(
              source: KioskGarmentInputSource.phoneUpload,
              localPath: 'garment.jpg',
              intent: KioskGarmentIntent.top,
            ),
          );

      await uploadController.useReadyPhoto(captureController);
      await tryOnController.submitFromCapture(captureController);

      expect(captureController.acceptedModelCoverage, ModelCoverage.unknown);
      expect(
        tryOnController.failureCode,
        KioskTryOnFailureCode.modelImageIncompatibleWithGarment,
      );
      expect(tryOnGateway.createCalls, 0);
      uploadController.dispose();
      captureController.dispose();
      tryOnController.dispose();
    },
  );

  test('unavailable phone model analysis remains safely blocked', () async {
    final captureController = testCaptureController(
      modelCoverageAnalyzer: FakeModelCoverageAnalyzer([
        const ModelCoverageAnalysis.unavailable('TEST_ANALYSIS_UNAVAILABLE'),
      ]),
    );
    final uploadController = KioskCustomerUploadController(
      deviceController: testDeviceController(),
      gateway: FakeUploadGateway()
        ..nextSession = readyUploadSession('upload-session'),
      captureStore: InMemoryTemporaryCaptureStore(),
    )..session = readyUploadSession('upload-session');
    final tryOnGateway = FakeTryOnGateway();
    final tryOnController =
        KioskTryOnSessionController(
          gateway: tryOnGateway,
          targetPreparer: FakeTargetPreparer(),
        )..selectGarment(
          const KioskGarmentInput(
            source: KioskGarmentInputSource.phoneUpload,
            localPath: 'garment.jpg',
            intent: KioskGarmentIntent.top,
          ),
        );

    await uploadController.useReadyPhoto(captureController);
    await tryOnController.submitFromCapture(captureController);

    expect(captureController.acceptedModelCoverage, ModelCoverage.unknown);
    expect(
      captureController.acceptedModelCoverageAnalysis?.status,
      ModelCoverageAnalysisStatus.unavailable,
    );
    expect(
      tryOnController.failureCode,
      KioskTryOnFailureCode.modelImageIncompatibleWithGarment,
    );
    expect(tryOnGateway.createCalls, 0);
    uploadController.dispose();
    captureController.dispose();
    tryOnController.dispose();
  });

  test(
    'new phone model replacement clears and replaces previous coverage',
    () async {
      final first = Completer<ModelCoverageAnalysis>();
      final analyzer = FakeModelCoverageAnalyzer([
        first.future,
        const ModelCoverageAnalysis.resolved(
          coverage: ModelCoverage.fullBody,
          confidence: 0.95,
          reasonCode: 'TEST_FULL_BODY',
        ),
      ]);
      final captureController = testCaptureController(
        modelCoverageAnalyzer: analyzer,
      );
      final uploadController = KioskCustomerUploadController(
        deviceController: testDeviceController(),
        gateway: FakeUploadGateway()
          ..nextSession = readyUploadSession('upload-session'),
        captureStore: InMemoryTemporaryCaptureStore(),
      )..session = readyUploadSession('upload-session');

      final pending = uploadController.useReadyPhoto(captureController);
      await Future<void>.delayed(Duration.zero);

      expect(captureController.acceptedModelCoverage, isNull);

      first.complete(
        const ModelCoverageAnalysis.resolved(
          coverage: ModelCoverage.upperBody,
          confidence: 0.9,
          reasonCode: 'TEST_UPPER_BODY',
        ),
      );
      await pending;
      expect(captureController.acceptedModelCoverage, ModelCoverage.upperBody);

      uploadController.session = readyUploadSession('upload-session-2');
      await uploadController.useReadyPhoto(captureController);

      expect(captureController.acceptedModelCoverage, ModelCoverage.fullBody);
      expect(analyzer.calls, 2);
      uploadController.dispose();
      captureController.dispose();
    },
  );

  test('phone garment upload does not run model coverage analysis', () async {
    final analyzer = FakeModelCoverageAnalyzer([
      const ModelCoverageAnalysis.resolved(
        coverage: ModelCoverage.upperBody,
        confidence: 0.9,
        reasonCode: 'SHOULD_NOT_RUN',
      ),
    ]);
    final captureController = testCaptureController(
      modelCoverageAnalyzer: analyzer,
    );
    final uploadController =
        KioskCustomerUploadController(
            deviceController: testDeviceController(),
            gateway: FakeUploadGateway()
              ..nextSession = readyUploadSession(
                'garment-upload-session',
                purpose: PhotoAcquisitionPurpose.garment,
              ),
            captureStore: InMemoryTemporaryCaptureStore(),
          )
          ..session = readyUploadSession(
            'garment-upload-session',
            purpose: PhotoAcquisitionPurpose.garment,
          );

    final input = await uploadController.useReadyGarment(
      intent: KioskGarmentIntent.top,
    );

    expect(input, isNotNull);
    expect(analyzer.calls, 0);
    expect(captureController.acceptedModelCoverage, isNull);
    uploadController.dispose();
    captureController.dispose();
  });

  testWidgets('loading state does not show 00:00 before session exists', (
    tester,
  ) async {
    final pendingSession = Completer<KioskCustomerUploadSession>();
    final harness = await pumpMobileUploadScreen(
      tester,
      gateway: FakeUploadGateway()..createOutcomes.add(pendingSession),
    );

    expect(find.text('Preparing secure upload...'), findsWidgets);
    expect(find.byKey(const Key('mobile-upload-countdown')), findsNothing);
    expect(find.text('00:00'), findsNothing);
    harness.dispose();
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('successful session renders QR and countdown without secrets', (
    tester,
  ) async {
    final harness = await pumpMobileUploadScreen(
      tester,
      gateway: FakeUploadGateway()
        ..createOutcomes.add(
          waitingUploadSession(
            'upload-session',
            publicUploadUrl:
                'https://try.selfx.test/upload/super-secret-capability',
          ),
        )
        ..nextStatusSession = waitingUploadSession('upload-session'),
    );

    await pumpMobileUploadState(tester);

    expect(find.byKey(const Key('mobile-upload-qr')), findsOneWidget);
    expect(find.byKey(const Key('mobile-upload-countdown')), findsOneWidget);
    expect(find.textContaining('super-secret-capability'), findsNothing);
    expect(tester.takeException(), isNull);
    harness.dispose();
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('session creation failure renders retry instead of spinner', (
    tester,
  ) async {
    final gateway = FakeUploadGateway()
      ..createOutcomes.add(
        const KioskCustomerUploadException(
          'CUSTOMER_UPLOAD_SERVER_ERROR',
          'Server unavailable.',
          statusCode: 500,
        ),
      )
      ..createOutcomes.add(waitingUploadSession('retry-session'));
    final harness = await pumpMobileUploadScreen(tester, gateway: gateway);

    await pumpMobileUploadState(tester);

    expect(find.text('Unable to start phone upload'), findsOneWidget);
    expect(find.byKey(const Key('retry-mobile-upload')), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsNothing);

    await tester.tap(find.byKey(const Key('retry-mobile-upload')));
    await pumpMobileUploadState(tester);

    expect(gateway.createCalls, 2);
    expect(find.byKey(const Key('mobile-upload-qr')), findsOneWidget);
    harness.dispose();
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('compact viewport does not overflow and shrinks QR frame', (
    tester,
  ) async {
    final gateway = FakeUploadGateway()
      ..createOutcomes.add(waitingUploadSession('large-session'))
      ..nextStatusSession = waitingUploadSession('large-session');
    final largeHarness = await pumpMobileUploadScreen(
      tester,
      gateway: gateway,
      size: const Size(1000, 760),
    );
    await pumpMobileUploadState(tester);
    final largeQrSize = tester.getSize(
      find.byKey(const Key('mobile-upload-qr-frame')),
    );

    largeHarness.dispose();
    await tester.pumpWidget(const SizedBox.shrink());

    final compactGateway = FakeUploadGateway()
      ..createOutcomes.add(waitingUploadSession('compact-session'))
      ..nextStatusSession = waitingUploadSession('compact-session');
    final compactHarness = await pumpMobileUploadScreen(
      tester,
      gateway: compactGateway,
      size: const Size(520, 430),
    );
    await pumpMobileUploadState(tester);

    final compactQrSize = tester.getSize(
      find.byKey(const Key('mobile-upload-qr-frame')),
    );

    expect(compactQrSize.height, lessThan(largeQrSize.height));
    expect(compactQrSize.height, greaterThanOrEqualTo(176));
    expect(tester.takeException(), isNull);
    compactHarness.dispose();
    await tester.pumpWidget(const SizedBox.shrink());
  });
}

KioskDeviceSessionController testDeviceController() {
  return KioskDeviceSessionController(
    gateway: FakeDeviceGateway(),
    store: InMemoryDeviceStore(),
  )..accessToken = 'device-token';
}

KioskCustomerUploadSession readyUploadSession(
  String sessionId, {
  PhotoAcquisitionPurpose purpose = PhotoAcquisitionPurpose.model,
}) {
  return KioskCustomerUploadSession(
    sessionId: sessionId,
    status: KioskCustomerUploadStatus.ready,
    purpose: purpose,
    expiresAt: DateTime.now().add(const Duration(minutes: 5)),
    serverTime: DateTime.now(),
    pollIntervalSeconds: 3,
    publicUploadUrl: 'https://try.selfx.test/upload/capability',
    photo: const KioskCustomerUploadPhoto(
      readUrl: 'https://storage.selfx.test/customer-photo.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 128,
      width: 1024,
      height: 1536,
    ),
  );
}

KioskCustomerUploadSession waitingUploadSession(
  String sessionId, {
  String publicUploadUrl = 'https://try.selfx.test/upload/capability',
  DateTime? expiresAt,
  PhotoAcquisitionPurpose purpose = PhotoAcquisitionPurpose.model,
}) {
  final now = DateTime.now();
  return KioskCustomerUploadSession(
    sessionId: sessionId,
    status: KioskCustomerUploadStatus.waiting,
    purpose: purpose,
    expiresAt: expiresAt ?? now.add(const Duration(minutes: 5)),
    serverTime: now,
    pollIntervalSeconds: 3,
    publicUploadUrl: publicUploadUrl,
  );
}

Map<String, dynamic> uploadSessionJson(String sessionId) {
  final now = DateTime.now();
  return {
    'sessionId': sessionId,
    'status': 'WAITING',
    'purpose': 'MODEL',
    'expiresAt': now.add(const Duration(minutes: 5)).toIso8601String(),
    'serverTime': now.toIso8601String(),
    'pollIntervalSeconds': 3,
    'publicUploadUrl': 'https://try.selfx.test/upload/capability',
  };
}

http.Response uploadSessionJsonResponse(Map<String, dynamic> body) {
  return http.Response(
    jsonEncode(body),
    201,
    headers: {HttpHeaders.contentTypeHeader: 'application/json'},
  );
}

CaptureSessionController testCaptureController({
  ModelCoverageAnalyzer? modelCoverageAnalyzer,
}) {
  return CaptureSessionController(
    cameraService: FakeCameraService(),
    settingsStore: FakeSettingsStore(),
    analyzer: FakeQualityAnalyzer(),
    captureStore: InMemoryTemporaryCaptureStore(),
    audioService: const SilentCaptureAudioService(),
    modelCoverageAnalyzer:
        modelCoverageAnalyzer ?? const UnavailableModelCoverageAnalyzer(),
  )..selectCaptureScope(CaptureScope.fullBody);
}

KioskDeviceCredentials testDeviceCredentials(String accessToken) {
  return KioskDeviceCredentials(
    accessToken: accessToken,
    accessTokenExpiresAt: DateTime.now().add(const Duration(minutes: 15)),
    refreshToken: 'next-refresh-token',
    refreshTokenExpiresAt: DateTime.now().add(const Duration(days: 30)),
    device: const KioskDeviceIdentity(
      id: 'device-1',
      displayName: 'Test kiosk',
      status: KioskDeviceStatus.active,
      assignment: KioskDeviceAssignment(
        scope: KioskAssignmentScope.platform,
        organizationId: null,
        organizationName: null,
        storeId: null,
        storeName: null,
      ),
      platform: 'windows',
      appVersion: '1.0.0',
      lastSeenAt: null,
      latestConfigurationVersion: 1,
    ),
  );
}

KioskTryOnSessionController testTryOnController() {
  return KioskTryOnSessionController(gateway: FakeTryOnGateway());
}

Future<MobileUploadHarness> pumpMobileUploadScreen(
  WidgetTester tester, {
  required FakeUploadGateway gateway,
  Size size = const Size(900, 700),
  PhotoAcquisitionPurpose purpose = PhotoAcquisitionPurpose.model,
  KioskGarmentIntent? garmentIntent,
}) async {
  await tester.binding.setSurfaceSize(size);
  addTearDown(() async {
    await tester.binding.setSurfaceSize(null);
  });
  final deviceController = testDeviceController();
  final captureController = testCaptureController();
  final tryOnController = testTryOnController();
  final uploadController = KioskCustomerUploadController(
    deviceController: deviceController,
    gateway: gateway,
    captureStore: InMemoryTemporaryCaptureStore(),
  );

  await tester.pumpWidget(
    MaterialApp(
      home: MobileUploadScreen(
        captureController: captureController,
        tryOnController: tryOnController,
        uploadController: uploadController,
        purpose: purpose,
        garmentIntent: garmentIntent,
      ),
    ),
  );

  return MobileUploadHarness(
    deviceController: deviceController,
    captureController: captureController,
    tryOnController: tryOnController,
    uploadController: uploadController,
  );
}

Future<void> pumpMobileUploadState(WidgetTester tester) async {
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 100));
}

class MobileUploadHarness {
  MobileUploadHarness({
    required this.deviceController,
    required this.captureController,
    required this.tryOnController,
    required this.uploadController,
  });

  final KioskDeviceSessionController deviceController;
  final CaptureSessionController captureController;
  final KioskTryOnSessionController tryOnController;
  final KioskCustomerUploadController uploadController;
  bool _disposed = false;

  void dispose() {
    if (_disposed) {
      return;
    }
    _disposed = true;
    uploadController.dispose();
    tryOnController.dispose();
    captureController.dispose();
    deviceController.dispose();
  }
}

Future<void> testerPumpEventQueue() async {
  await Future<void>.delayed(Duration.zero);
  await Future<void>.delayed(Duration.zero);
}

class FakeUploadGateway implements KioskCustomerUploadGateway {
  KioskCustomerUploadSession? nextSession;
  KioskCustomerUploadSession? nextStatusSession;
  final List<Object> createOutcomes = [];
  final List<String> createAccessTokens = [];
  String? createdAccessToken;
  String? consumedSessionId;
  PhotoAcquisitionPurpose? createdPurpose;
  PhotoAcquisitionPurpose? consumedPurpose;
  int createCalls = 0;

  @override
  Future<KioskCustomerUploadSession> createSession(
    String accessToken, {
    required PhotoAcquisitionPurpose purpose,
  }) async {
    createCalls += 1;
    createdAccessToken = accessToken;
    createdPurpose = purpose;
    createAccessTokens.add(accessToken);
    if (createOutcomes.isNotEmpty) {
      final outcome = createOutcomes.removeAt(0);
      if (outcome is KioskCustomerUploadSession) {
        return outcome;
      }
      if (outcome is KioskCustomerUploadException) {
        throw outcome;
      }
      if (outcome is Completer<KioskCustomerUploadSession>) {
        return outcome.future;
      }
    }
    return nextSession ?? waitingUploadSession('upload-session');
  }

  @override
  Future<KioskCustomerUploadSession> getSession({
    required String accessToken,
    required String sessionId,
  }) async {
    return nextStatusSession ?? nextSession ?? waitingUploadSession(sessionId);
  }

  @override
  Future<KioskCustomerUploadSession> cancelSession({
    required String accessToken,
    required String sessionId,
  }) async {
    return KioskCustomerUploadSession(
      sessionId: sessionId,
      status: KioskCustomerUploadStatus.cancelled,
      purpose: PhotoAcquisitionPurpose.model,
      expiresAt: DateTime.now(),
      serverTime: DateTime.now(),
      pollIntervalSeconds: 3,
    );
  }

  @override
  Future<KioskCustomerUploadSession> consumeSession({
    required String accessToken,
    required String sessionId,
    required PhotoAcquisitionPurpose purpose,
  }) async {
    consumedSessionId = sessionId;
    consumedPurpose = purpose;
    return KioskCustomerUploadSession(
      sessionId: sessionId,
      status: KioskCustomerUploadStatus.consumed,
      purpose: purpose,
      expiresAt: DateTime.now(),
      serverTime: DateTime.now(),
      pollIntervalSeconds: 3,
    );
  }

  @override
  Future<void> downloadReadyPhoto({
    required String readUrl,
    required String targetPath,
  }) async {}
}

class FakeDeviceGateway implements KioskDeviceGateway {
  FakeDeviceGateway({
    KioskDeviceCredentials? refreshedCredentials,
    this.refreshException,
  }) : refreshedCredentials =
           refreshedCredentials ?? testDeviceCredentials('refreshed-token');

  final KioskDeviceCredentials refreshedCredentials;
  final KioskDeviceException? refreshException;
  int pairingRequests = 0;
  int refreshCalls = 0;

  @override
  Future<KioskPairingSession> createPairingSession({
    required String installationId,
    required String platform,
    required String appVersion,
  }) async {
    pairingRequests += 1;
    final now = DateTime.now();
    return KioskPairingSession(
      pairingSessionId: 'pairing-session',
      pairingCode: '123456',
      provisioningSecret: 'provisioning-secret',
      expiresAt: now.add(const Duration(minutes: 8)),
      serverTime: now,
      ttlSeconds: 480,
      pollIntervalSeconds: 3,
    );
  }

  @override
  Future<KioskPairingStatusResult> getPairingStatus({
    required String sessionId,
    required String provisioningSecret,
  }) async {
    final now = DateTime.now();
    return KioskPairingStatusResult(
      status: KioskProvisioningStatus.waiting,
      serverTime: now,
      expiresAt: now.add(const Duration(minutes: 8)),
    );
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
  Future<KioskDeviceCredentials> refreshSession(String refreshToken) async {
    refreshCalls += 1;
    final exception = refreshException;
    if (exception != null) {
      throw exception;
    }
    return refreshedCredentials;
  }

  @override
  Future<KioskDeviceIdentity> me(String accessToken) {
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
  Future<KioskRuntimeConfiguration> configuration(String accessToken) async {
    return defaultRuntimeConfiguration;
  }
}

class FakeTryOnGateway implements KioskTryOnGateway {
  int createCalls = 0;
  KioskTryOnRequest? lastRequest;

  @override
  Future<KioskTryOnRun> createRun(KioskTryOnRequest request) async {
    createCalls += 1;
    lastRequest = request;
    return const KioskTryOnRun(id: 'run-1', status: KioskTryOnStatus.queued);
  }

  @override
  Future<KioskTryOnRun> getRun(String runId) async {
    return KioskTryOnRun(id: runId, status: KioskTryOnStatus.processing);
  }
}

class FakeTargetPreparer extends TryOnTargetPreparer {
  @override
  Future<TryOnPreparedTarget> prepare({
    required String originalPath,
    required CaptureScope scope,
    required CaptureTargetMetadata? targetMetadata,
    bool windowsFullFrameFallback = false,
  }) async {
    final file = File(originalPath);
    return TryOnPreparedTarget(
      file: file,
      metadata: TryOnTargetPreparationMetadata(
        originalPath: originalPath,
        preparedPath: originalPath,
        originalWidth: 1024,
        originalHeight: 1536,
        cropX: 0,
        cropY: 0,
        cropWidth: 1024,
        cropHeight: 1536,
        scope: scope,
        usedTargetRegion: false,
        windowsFullFrameFallback: true,
      ),
    );
  }
}

class FakeModelCoverageAnalyzer implements ModelCoverageAnalyzer {
  FakeModelCoverageAnalyzer(this.results);

  final List<Object> results;
  int calls = 0;

  @override
  Future<ModelCoverageAnalysis> analyze(File image) async {
    calls += 1;
    if (results.isEmpty) {
      return const ModelCoverageAnalysis.unavailable(
        'TEST_ANALYSIS_NOT_CONFIGURED',
      );
    }
    final next = results.removeAt(0);
    if (next is ModelCoverageAnalysis) {
      return next;
    }
    if (next is Future<ModelCoverageAnalysis>) {
      return await next;
    }
    throw StateError('Unsupported fake analyzer result.');
  }

  @override
  Future<void> dispose() async {}
}

class InMemoryDeviceStore implements KioskDeviceCredentialStore {
  String? refreshToken;

  @override
  Future<String> installationId() async => 'install-id';

  @override
  Future<String?> readRefreshToken() async => refreshToken;

  @override
  Future<void> writeRefreshToken(String token) async {
    refreshToken = token;
  }

  @override
  Future<void> clearRefreshToken() async {
    refreshToken = null;
  }
}

class FakeCameraService implements CameraService {
  final ValueNotifier<CameraState> _state = ValueNotifier(const CameraState());
  final StreamController<LiveCameraFrame> _frames =
      StreamController<LiveCameraFrame>.broadcast();

  @override
  ValueListenable<CameraState> get state => _state;

  @override
  Stream<LiveCameraFrame> get liveFrames => _frames.stream;

  @override
  Future<List<CameraDevice>> rediscoverDevices() async => [];

  @override
  Future<void> initialize({String? preferredCameraId}) async {}

  @override
  Future<void> selectCamera(CameraDevice device) async {}

  @override
  Future<void> updateOrientationMode(CameraOrientationMode mode) async {}

  @override
  Future<CameraCaptureResult> captureStill() {
    throw UnimplementedError();
  }

  @override
  Widget buildPreview(BuildContext context) => const SizedBox.shrink();

  @override
  Future<void> startLiveFrames() async {}

  @override
  Future<void> stopLiveFrames() async {}

  @override
  Future<void> dispose() async {
    await _frames.close();
  }
}

class FakeSettingsStore implements CameraSettingsStore {
  @override
  Future<String?> readPreferredCameraId() async => null;

  @override
  Future<void> savePreferredCameraId(String id) async {}

  @override
  Future<void> clearPreferredCameraId() async {}

  @override
  Future<int> readCaptureCountdownSeconds() async {
    return defaultCaptureCountdownSeconds;
  }

  @override
  Future<void> saveCaptureCountdownSeconds(int seconds) async {}

  @override
  Future<bool> readCaptureSoundsEnabled() async => true;

  @override
  Future<void> saveCaptureSoundsEnabled(bool enabled) async {}

  @override
  Future<CaptureAudioProfile> readCaptureAudioProfile() async =>
      defaultCaptureAudioProfile;

  @override
  Future<void> saveCaptureAudioProfile(CaptureAudioProfile profile) async {}

  @override
  Future<CameraOrientationMode> readCameraOrientationMode() async {
    return defaultCameraOrientationMode;
  }

  @override
  Future<void> saveCameraOrientationMode(CameraOrientationMode mode) async {}

  @override
  Future<bool> readMultiGarmentSelectionEnabled() async => true;

  @override
  Future<void> saveMultiGarmentSelectionEnabled(bool enabled) async {}

  @override
  Future<int> readMaxTryOnPicks() async => 5;

  @override
  Future<void> saveMaxTryOnPicks(int count) async {}

  @override
  Future<bool> readShowMyPicksCounter() async => true;

  @override
  Future<void> saveShowMyPicksCounter(bool enabled) async {}

  @override
  Future<bool> readSaveMyLooksQrEnabled() async => true;

  @override
  Future<void> saveSaveMyLooksQrEnabled(bool enabled) async {}
}

class FakeQualityAnalyzer implements KioskImageQualityAnalyzer {
  @override
  Future<ImageQualityResult> analyzeStillImage(
    String imagePath,
    ImageQualityTarget target,
  ) async {
    return createUnavailableImageQualityResult(width: 1024, height: 1536);
  }

  @override
  void dispose() {}
}
