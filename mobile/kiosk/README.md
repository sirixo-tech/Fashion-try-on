# SelfX Kiosk

Flutter kiosk app for the KIOSK-2A live capture intelligence foundation.

Android is the primary commercial kiosk platform. SelfX currently deploys/rents
primarily 32-inch and 42-inch vertically mounted kiosks, so Android commercial
UX is portrait-first. Windows remains a fully supported secondary
kiosk/desktop platform with responsive portrait and landscape window operation.

KIOSK-2A includes local camera discovery, preview, preferred-camera selection,
customer CaptureScope selection, Android on-device live readiness where image
streams are supported, graceful scripted fallback, configurable local audio
profiles, temporary local capture storage, responsive kiosk screens, Photo
Ready, and advisory post-capture image quality checks. It intentionally does not
upload images, call the SelfX API, run paid AI/provider generation, or implement
the production customer try-on flow.

## Local commands

```powershell
flutter pub get
dart format --output=none --set-exit-if-changed lib test
flutter analyze
flutter test
flutter build apk --debug
flutter build apk --release
flutter build windows
```

## Boundaries

- The Windows camera implementation is isolated behind `CameraService`.
- Android uses Flutter `camera` with the endorsed CameraX implementation
  through the same `CameraService`.
- Android commercial presentation is portrait-first. The app does not hardcode
  physical 32-inch/42-inch sizes; layouts adapt to logical viewport dimensions
  and aspect ratio.
- Windows uses the same screens and remains usable in portrait and landscape
  windows.
- Customer capture starts with CaptureScope selection: Top, Bottom or Full Body.
  This is framing/readiness intent, not final garment taxonomy. Full Body may
  later resolve to One Piece, Full Outfit or another canonical garment semantic.
- Customer capture uses **Take Photo** -> preparation/live readiness where
  supported -> stable final 3/2/1 -> automatic capture. The normal customer flow
  does not show instant **Capture Now**.
- Countdown duration is a local operator setting: 5, 10 or 15 seconds. Default
  is 10 seconds.
- Android live readiness is scope-aware and checks the selected PrimarySubject,
  semantic pose/body coverage, target framing, subject lighting, blur/stability
  signals and analyzer availability where supported.
- The current Android ML Kit pose adapter returns at most one tracked/prominent
  pose and requires the face to remain visible. It does not provide reliable
  active multi-person awareness, background-bystander classification or
  competing-person blocking.
- SelfX selects one prominent customer as the local PrimarySubject using visual
  prominence signals such as apparent body area, centrality, capture-guide
  overlap, pose visibility and confidence. This is not true physical distance
  measurement.
- The PrimarySubject is locked ephemerally across frames so small movement,
  confidence jitter or brief background motion does not immediately switch the
  intended Try-On model. The lock releases after subject absence, retake, Try
  Again/session reset or CaptureScope restart.
- TOP does not require ankles; BOTTOM focuses on lower-body visibility; FULL
  BODY needs suitable shoulders, hips, knees and ankles/feet visibility.
- BOTTOM still keeps enough full-person/face framing for current ML Kit pose
  continuity; it does not crop the camera view to legs only.
- Portrait capture prioritizes a large/tall live preview, full-body framing
  space, distance-readable countdown/guidance and large lower-region actions.
- Countdown/customer guidance renders in `CaptureGuidancePanel` outside the
  preview. The preview is reserved for the customer image, static framing guide
  and future camera-specific overlays.
- The preview framing guide adapts to CaptureScope and never displays raw
  skeletons, landmark dots or technical confidence values.
- Live analysis targets about 3 FPS initially, uses newest-frame-wins
  backpressure, drops stale frames and can adapt down on slower hardware so the
  preview stays smooth.
- Multi-person diagnostics are reported as unsupported for the current ML Kit
  path. Future explicit multi-person analysis may be revisited if hardware
  testing shows wrong-person targeting, target switching, bystanders harming
  generation quality or store requirements for ambiguity detection.
- Readiness requires stable/debounced samples. A single lucky frame does not
  start capture.
- If readiness times out, **Try Again** and **Capture Anyway** are shown.
  Capture Anyway bypasses readiness/quality warnings only, not technical camera,
  capture, corrupt image or decode failures.
- Capture sounds are enabled by default, can be disabled locally, require no
  microphone permission and never block capture if playback fails.
- Sound profile is an operator-only local setting: Soft, Classic, Digital or
  Minimal. The selected `captureAudioProfile` is scoped to local kiosk settings.
- Shutter/capture-success audio plays only after still capture succeeds. Capture
  failure must not play a success cue.
- Current bundled audio is non-verbal and offline. Production spoken cues such
  as "Photo captured" must be supplied or recorded into local assets before use;
  network TTS, random downloaded audio and copyrighted third-party audio are not
  part of this foundation.
- Captures are copied to an OS temporary SelfX kiosk directory and can be
  cleared by the session controller.
- Original captured images remain unmodified; any quality analysis work uses
  derived in-memory or temporary analysis data.
- KIOSK-2A.1 preserves the full-resolution original still and records only
  local ephemeral CaptureScope, PrimarySubject and normalized TargetSubjectRegion
  semantics for future target-only preparation. No destructive crop/upload is
  performed.
- OpenCV quality checks are advisory except for technical invalid/decode
  failures.
- **Use Photo** opens Photo Ready. **Continue** is a temporary local placeholder
  until product/catalog and Try-On submission are implemented.
- `camera_windows` does not provide Windows live image streams, so Windows uses
  scripted assisted capture and still capture. Windows live frames are KIOSK-2B
  and must reuse the same readiness engine.
- Android USB webcam support depends on whether the Android box exposes the
  camera through CameraX. Dedicated UVC support is deferred until certified
  hardware testing proves it is necessary.
- Android immersive/fullscreen presentation is enabled for kiosk foundation
  testing in portrait. Production lock-task/device-owner management is
  deferred.

## Android Hardware Checklist

1. Enable Developer options on the Android box.
2. Enable USB debugging.
3. Connect with USB and run `adb devices`.
4. Build the debug APK with `flutter build apk --debug`.
5. Install with `adb install -r build/app/outputs/flutter-apk/app-debug.apk`.
6. Launch with `adb shell monkey -p com.selfx.kiosk 1`.
7. Grant camera permission when prompted.
8. Test built-in camera preview/capture/review.
9. Plug in the USB webcam, open Camera Settings and refresh cameras.

## Assisted Capture Checklist

Portrait kiosk check, where possible: approximately 1080 x 1920 logical
viewport.

1. Open camera.
2. Select **Top**, **Bottom** or **Full Body**.
3. Confirm the primary action is **Take Photo**.
4. Press **Take Photo** and verify readiness/countdown guidance appears below the preview
   in portrait without covering the camera image.
5. Press **Cancel** during final countdown and verify no delayed capture occurs.
6. Start again and verify stable readiness starts final 3/2/1 when live frames
   are available, or scripted fallback works when live frames are unavailable.
7. Preview each Sound profile in Camera Settings.
8. Toggle Capture sounds off in Camera Settings and verify capture still works
   silently.
9. Let countdown finish and verify exactly one photo is captured and success
   audio occurs only after capture.
10. Confirm **Checking your photo...**, Review, **Retake**, **Use Photo** and
   Photo Ready.

## KIOSK-2A Privacy & Diagnostics

- Live frames are processed locally and are not persisted, uploaded, sent to
  FASHN/provider services or logged as bytes/base64.
- Pose/landmark output is ephemeral capture assistance and must not become
  biometric identity, persisted raw landmarks or pose history.
- Operator diagnostics may show target/effective FPS, dropped frames and
  analyzer latency, PrimarySubject lock state, visual prominence, normalized
  target region, tracking age and the active analyzer mode. They must not show
  customer images, frame bytes or raw pose data.
- Future KIOSK-3 must target garment generation at the selected PrimarySubject,
  not every visible person. The approved future target path is original still ->
  PrimarySubject/TargetSubjectRegion -> target extractor -> padded model image
  -> SelfX API/provider -> generated target region -> compositor, leaving
  unrelated/background people unchanged.
- Android box + USB webcam live-readiness behavior remains hardware verification
  pending until the certified SelfX kiosk hardware is tested.
