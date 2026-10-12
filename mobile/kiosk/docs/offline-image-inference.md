# Optional offline TensorFlow Lite infrastructure

`lib/src/inference` is independent of try-on APIs and catalog navigation. Phase 2
connects it to accepted person-photo lifecycle events in the capture controller.
No new UI, permissions, backend fields or persistence have been added.

## Phase 2: accepted person-photo analysis

The shared `CaptureSessionController._setAcceptedPersonPhoto` hook schedules
analysis after successful acceptance from either `usePhoto()` (camera review)
or `acceptMobileUpload()` (after download and existing validation). Neither caller
awaits inference; photo-ready state, navigation and generation proceed normally.
Pending/unaccepted photos, rejected photos and garment uploads do not trigger it.

Android production composition injects one `ObjectModelValidationAnalyzer` with
one existing `TfliteImageInferenceService` for the capture controller's lifetime.
This reuses lazy model initialization and existing worker preprocessing. Windows
and tests without an injected analyzer keep optional analysis disabled.

`captureController.personImageAnalysis.snapshot` exposes an independent local
notifier with idle, pending, available or unavailable state. The current typed
result is `ObjectModelValidationAnalysis`: ordinary MobileNet labels are only
infrastructure validation, never gender, Men/Women filtering or recommendations.
`AcceptedPersonImageAnalyzer` / `AcceptedPersonImageAnalysis` form an extension
boundary for a future separately approved clothing-based analyzer and its typed
result; no clothing model, recommendation mapping or carousel is implemented.

Repeated acceptance of the same path/creation timestamp is deduplicated. One
inference runs at a time with one latest pending image, avoiding the service's
busy response and unbounded queues. If photos are replaced rapidly, superseded
pending photos are skipped. Completion is published only for the current accepted
image revision. Results/failures remain in session memory; nothing is logged,
persisted or added to backend request contracts. Completion does not notify
capture/session UI listeners or change readiness/quality/try-on decisions.

Clearing/replacing the accepted photo, retake, reset and controller disposal clear
the snapshot and invalidate pending/late callbacks. Retake/reset clear analysis
immediately before asynchronous capture cleanup. An already running native call
may finish, but its stale output is discarded; existing file deletion remains
owned by the capture/upload flow. The model stays reusable across session resets
and is disposed with the capture controller. Failures, including thrown adapter
exceptions, produce unavailable analysis without interrupting the customer flow.

Phase 2 verification: nine focused integration/lifecycle tests passed using a
controlled inference service; Flutter static analysis passed with no issues.
No Phase 2 APK was built and no new physical-device run was performed. Real
full-resolution photo latency remains a hardware check.

## Usage

```dart
final inference = TfliteImageInferenceService();
// Optional warm-up after the UI starts, not on the capture-critical path.
final unavailable = await inference.initialize();
final result = await inference.classifyFile(localCapturedOrDownloadedImagePath);
// Alternatively: await inference.classifyBytes(encodedJpegPngOrWebpBytes).
if (result.isSuccess) {
  // Use result.predictions locally for an explicitly approved object task.
} else {
  // Ignore this optional result and keep the existing workflow usable.
}
await inference.dispose();
```

Both sources accept encoded still images, not camera YUV planes or remote URLs.
Mobile uploads must first use the existing download/acceptance flow. Retain the
service for reuse, release it at the end of its owner's lifetime, and discard
stale results if a photo changes. No image or prediction is logged, written to
disk or transmitted by the service; existing source-file cleanup remains with
the existing capture/upload owner. Flutter's managed memory is not secure erasure.

The persistent worker owns initialization/allocation, local file reads, decoding,
EXIF orientation, crop/resize, invocation and postprocessing. Model assets are
loaded asynchronously through Flutter's asset bundle. CPU inference uses one
thread by default (configurable 1–4), without GPU or NNAPI delegates. Busy calls
return immediately instead of accumulating a queue. Initialization and inference
have a 30-second timeout. Disposal sends shutdown after any active invocation,
then closes resources. A stuck worker is terminated after the timeout; native
fatal crashes and out-of-memory process termination cannot be caught in Dart.

Limits: 20 MiB encoded input, 24 megapixels, first image frame only. Unsupported
formats such as HEIC, corrupt files, oversized inputs, missing/incompatible
models and native-loader errors return typed unavailable results. Center cropping
is the sample classifier's preprocessing policy, not capture/body framing logic.
Decoding/orienting full-resolution images can temporarily use tens to hundreds
of megabytes; these bounds are safety caps, not a low-memory certification.

The adapter supports one RGB NHWC tensor (dimensions up to 512), uint8 raw-pixel
or float32 normalized input, and one `[1,N]` uint8/float32 probability output.
Float input defaults to `(pixel - 127.5) / 127.5`; configure the model contract
explicitly. It rejects other tensor types/shapes. It does not guess logits,
quantized int8 preprocessing, custom operators or label offsets. A different
model must have its preprocessing, outputs, source and license reviewed first.

Initialization failure is cached for the service lifetime; create a new service
to retry. Inference timeouts reset the worker for a subsequent lazy retry.

## Android compatibility

- Target for this adapter: Android 11+ (API 30+) phones, tablets and kiosk/TV
  boxes with a supported Android userspace ABI. Device type alone proves nothing.
- Existing app configuration is preserved: Flutter's current SDK defaults are
  compile/target 36, minimum 24, NDK 28.2.13676358; Java 17; AGP 9.0.1.
  This slice does not raise the whole app's minimum SDK or certify older devices.
  Upstream tflite_flutter documents API 26 as its runtime minimum.
- `tflite_flutter` is pinned to 0.12.1. Its Android build uses LiteRT 1.4.0,
  including CPU native libraries. No manual JNI files or Gradle ABI restrictions
  are added. The upstream plugin also depends on its GPU artifact, but this
  service never constructs a GPU delegate.
- Inspected LiteRT 1.4.0 AAR contains `libtensorflowlite_jni.so` for
  `armeabi-v7a` (ARM32), `arm64-v8a` (ARM64), `x86` and `x86_64`.
  Flutter release targets are ARM32, ARM64 and x86_64; 32-bit x86 is not a
  supported deployment target. ARM64 is preferred; some ARM64 chips run a
  32-bit Android userspace and need the ARM32 artifact.
- x86_64 emulator support for this CPU runtime does not guarantee compatibility
  of the whole app's existing ML Kit, OpenCV and MediaPipe plugins.
- 0.12.1's upstream release notes report 16 KiB support. The final APK's complete
  CPU library's ELF load segments were also inspected: all four ABIs are aligned
  to 16 KiB. The final APK's complete native dependency set (including the plugin's
  GPU artifact) and packaging still need verification on newer devices.
- Existing TV behavior is unchanged: portrait/touch-oriented kiosk UI and normal
  Android launcher activity; no Leanback launcher, D-pad UX or camera guarantees
  have been introduced. A box must support the app's existing camera stack.
- Windows customer flows are unchanged. This optional adapter returns
  `unsupportedPlatform` before accessing FFI; no Windows inference DLL is bundled.
- Debug APK build and ARM64 device inference were verified on 2026-10-12:
  I2304, Android API 36, device `10BEAN0Q8K002LD`. Release/R8 packaging,
  other ABIs and Android API 30 hardware remain unverified.

### Plugin JVM target alignment

The host Gradle runtime uses JDK 24. `tflite_flutter` 0.12.1 explicitly sets
Java source/target compatibility to 11 but does not set a Kotlin target; this
environment selected Kotlin JVM 24 and failed compatibility validation.
`android/build.gradle.kts` now scopes an explicit Kotlin JVM 11 target to
the `tflite_flutter` module's Kotlin compilation tasks. The app remains JVM 17;
Android minimum SDK, dependencies, host JDK and target validation are unchanged.
No Pub Cache files were modified.

## Hardware smoke check

After the operator/user builds locally, use an Android 11+ device with USB debugging:

```powershell
flutter pub get
flutter devices
adb shell getprop ro.product.cpu.abilist
adb shell getprop ro.build.version.sdk
adb shell getconf PAGE_SIZE
flutter run -d <device-id> -t lib/tflite_smoke.dart
```

This optional entry point starts the unchanged kiosk app and runs the bundled
model once on a synthetic RGB image. Expect
`SelfX offline TFLite smoke: success; outputs=5; elapsedMs=...` in the console.
It logs only status, output count and elapsed time. It does not access customer
photos or alter selections. Repeat in release mode (`--release`) to check R8 and
release packaging. Normal releases continue using `lib/main.dart`.

Observed debug result on the device above:
`SelfX offline TFLite smoke: success; outputs=5; elapsedMs=237`.
The requested `flutter run` built and installed successfully, but lost its VM
service connection during startup. The success line was verified in the running
SelfX process's ADB log. This synthetic-image timing is one smoke measurement,
not a full-resolution capture or sustained-performance benchmark.

During the first verification attempt, the installed version code was 2001
and the debug build was 1. Flutter automatically uninstalled/reinstalled after
`INSTALL_FAILED_VERSION_DOWNGRADE`; this can reset local pairing/settings.
For future checks against a newer installed build, use a suitable
`--build-number` to avoid a version-code downgrade. A differently signed build
can still require a separate controlled installation decision.

Test the smoke check with networking disabled to verify offline inference (the
kiosk's separate pairing/try-on services can still need network). Then call
`classifyFile` with an approved local ordinary-object image to assess actual
predictions. Check peak memory/latency, repeated calls, missing/corrupt inputs,
concurrent calls/disposal, and camera smoothness on each certified ARM32/ARM64
box/tablet/phone. Verify x86_64 separately if emulators are required. No universal
latency or Android TV box compatibility is claimed.

Sources:

- https://pub.dev/packages/tflite_flutter/versions/0.12.1
- https://pub.dev/packages/tflite_flutter/changelog
- https://github.com/tensorflow/flutter-tflite
- Model provenance and full license: `assets/models/object_classifier/`.

## Files added or updated

All paths below are relative to `mobile/kiosk`:

- `pubspec.yaml`, `pubspec.lock`: pinned dependency and bundled assets.
- `windows/flutter/generated_plugins.cmake`: generated FFI plugin registration.
- `lib/src/inference/image_inference.dart`: contracts and transient results.
- `lib/src/inference/image_classification_processing.dart`: image preparation/ranking.
- `lib/src/inference/tflite_image_inference_service.dart`: Android CPU worker adapter.
- `lib/src/inference/accepted_person_image_analysis.dart`: typed analyzer boundary
  and validation-only adapter over the existing inference service.
- `lib/src/inference/person_image_analysis_controller.dart`: transient state,
  acceptance deduplication, serial work and stale-result suppression.
- `lib/src/session/capture_session_controller.dart`: shared acceptance/cleanup hooks.
- `lib/src/app/selfx_kiosk_app.dart`: Android production analyzer injection.
- `lib/tflite_smoke.dart`: optional physical-device validation entry point.
- `test/image_inference_test.dart`: six focused preprocessing/lifecycle checks.
- `test/person_image_analysis_integration_test.dart`: focused camera/upload
  acceptance, nonblocking execution, deduplication, failures and lifecycle checks.
- `assets/models/object_classifier/mobilenet_quant.tflite`, `labels.txt`,
  `LICENSE`, `README.md`: validation model, labels, license and provenance.
- `README.md`, `docs/offline-image-inference.md`: usage and device limitations.

Verification performed: Flutter static analysis, six focused host tests, model
FlatBuffer tensor/quantization inspection, SHA-256, and LiteRT AAR ABI/ELF alignment
inspection. The subsequent JVM-target fix was verified by a debug Android build,
installation and successful synthetic-image inference on the device above.
Release/R8 packaging, classification accuracy and broader hardware performance
remain unverified.
