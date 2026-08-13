# SelfX Kiosk

Flutter kiosk app for the KIOSK-1.6.1 assisted camera and capture foundation.

Android is the primary commercial kiosk platform. SelfX currently deploys/rents
primarily 32-inch and 42-inch vertically mounted kiosks, so Android commercial
UX is portrait-first. Windows remains a fully supported secondary
kiosk/desktop platform with responsive portrait and landscape window operation.

KIOSK-1.6.1 includes local camera discovery, preview, preferred-camera
selection, scripted assisted countdown capture, configurable local audio
profiles, temporary local capture storage, responsive kiosk screens, Photo
Ready, and advisory OpenCV-based image quality checks. It intentionally does
not upload images, call the SelfX API, run paid AI/provider generation, or
implement the production customer try-on flow.

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
- Customer capture uses **Take Photo** -> countdown -> automatic capture. The
  normal customer flow does not show instant **Capture Now**.
- Countdown duration is a local operator setting: 5, 10 or 15 seconds. Default
  is 10 seconds.
- Countdown guidance is scripted and time-based. It does not detect person
  position, multiple people, body coverage, lighting, pose, distance or
  readiness.
- Portrait capture prioritizes a large/tall live preview, full-body framing
  space, distance-readable countdown/guidance and large lower-region actions.
- Countdown/customer guidance renders in `CaptureGuidancePanel` outside the
  preview. The preview is reserved for the customer image, static framing guide
  and future camera-specific overlays.
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
- OpenCV quality checks are advisory except for technical invalid/decode
  failures.
- **Use Photo** opens Photo Ready. **Continue** is a temporary local placeholder
  until product/catalog and Try-On submission are implemented.
- `camera_windows` does not provide Windows live image streams, so KIOSK-1 uses
  still capture only. KIOSK-2 may replace the adapter for live capture guidance.
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
2. Confirm the primary action is **Take Photo**.
3. Press **Take Photo** and verify countdown guidance appears below the preview
   in portrait without covering the camera image.
4. Press **Cancel** and verify no delayed capture occurs.
5. Start again and verify final 3/2/1 emphasis.
6. Preview each Sound profile in Camera Settings.
7. Toggle Capture sounds off in Camera Settings and verify capture still works
   silently.
8. Let countdown finish and verify exactly one photo is captured and success
   audio occurs only after capture.
9. Confirm **Checking your photo...**, Review, **Retake**, **Use Photo** and
   Photo Ready.
