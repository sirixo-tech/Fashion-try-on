# SelfX Kiosk

Flutter kiosk app for the KIOSK-3A customer home, capture intelligence and real
SelfX Try-On generation foundation.

Android is the primary commercial kiosk platform. SelfX currently deploys/rents
primarily 32-inch and 42-inch vertically mounted kiosks, so Android commercial
UX is portrait-first. Windows remains a fully supported secondary
kiosk/desktop platform with responsive portrait and landscape window operation.

KIOSK-3A includes a customer-facing idle home, Start Try-On entry,
customer CaptureScope selection, local camera discovery, preview,
preferred-camera selection, Android on-device live readiness where image
streams are supported, graceful scripted fallback, configurable local audio
profiles, temporary local capture storage, responsive kiosk screens, hidden
operator PIN access, advisory post-capture image quality checks, manual garment
image input, async SelfX Try-On submission/polling and generated-result display.
The Flutter app calls SelfX only; it never calls FASHN/provider APIs directly
and never stores provider credentials.

KIOSK-4A adds production device provisioning. A new or revoked kiosk now starts
on **Pair this kiosk** and reaches customer home only after SelfX establishes an
active device identity.

KIOSK-4C adds **Use My Phone** as a secure customer photo source for paired
kiosks. The kiosk displays a five-minute QR upload session, polls SelfX for a
validated ready photo, downloads the selected photo into temporary local capture
storage, marks the session consumed and continues the existing generation flow.
It does not add provider calls, Product Catalog or production KIOSK-4B Try-On
orchestration.

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

For KIOSK-3A development generation, launch with explicit API configuration:

```powershell
flutter run `
  --dart-define=SELFX_KIOSK_API_BASE_URL=http://localhost:3001 `
  --dart-define=SELFX_KIOSK_DEV_ACCESS_TOKEN=<staff-access-token>
```

The SelfX API must have `TRYON_LAB_ENABLED=true` and server-side provider
credentials such as `FASHN_API_KEY`. Do not put `FASHN_API_KEY` or any provider
secret in Flutter defines, kiosk assets or committed files. The development
bridge is disabled when the API base URL or development access token is absent.

For KIOSK-4A device provisioning, launch with the SelfX API base URL:

```powershell
flutter run `
  --dart-define=SELFX_KIOSK_API_BASE_URL=https://selfxapi-production.up.railway.app
```

Device provisioning does not use `SELFX_KIOSK_DEV_ACCESS_TOKEN`. The backend
must provide the KIOSK-4A server-side peppers/secrets and
`KIOSK_PAIRING_TTL_SECONDS=480`.

For KIOSK-4C mobile photo upload, the kiosk still uses only
`SELFX_KIOSK_API_BASE_URL`. The backend must provide customer-upload session
configuration, public web base URL and private object-storage configuration.

## Boundaries

- The Windows camera implementation is isolated behind `CameraService`.
- Android uses Flutter `camera` with the endorsed CameraX implementation
  through the same `CameraService`.
- Android commercial presentation is portrait-first. The app does not hardcode
  physical 32-inch/42-inch sizes; layouts adapt to logical viewport dimensions
  and aspect ratio.
- Windows uses the same screens and remains usable in portrait and landscape
  windows.
- The app starts on the customer kiosk home/idle presentation. The home shows
  the SelfX brand, local/offline static or slideshow presentation content and a
  single **Start Try-On** action.
- If no active device refresh credential exists, startup routes to the pairing
  screen instead of this customer home.
- The bundled `assets/wallpapers/selfx-default-kiosk-wallpaper.png` image is
  the default local wallpaper for all kiosk apps until organization/kiosk
  wallpaper changes are managed from the SaaS dashboard.
- Camera Settings is not visible on the home. A hidden top-left double-tap
  reveals a temporary operator icon, which opens a 6-digit PIN challenge before
  settings.
- Operator PIN verification is isolated behind `OperatorAccessVerifier`.
  Widgets must not hardcode production PINs, persist plaintext PINs or log PIN
  input.
- Five failed operator attempts lock operator access for 60 seconds. Customer
  **Start Try-On** remains available while operator access is locked.
- Leaving Camera Settings re-locks operator access. Unlock is not persistent
  across visits.
- Camera Settings is grouped into Camera, Capture, Display, Diagnostics and
  System sections and must remain vertically scrollable on narrow Windows and
  portrait kiosk layouts.
- SELFX-DESIGN-SYSTEM-2 upgrades this into **Operator Settings** with Camera,
  Capture, Display, Audio, Diagnostics and System categories, a rail on wide
  layouts, tabs on compact layouts, bounded preview and technical IDs under
  hardware details.
- Kiosk primary actions use SelfX orange `#FF7119` with white text. Secondary
  actions use white/light surfaces, dark text and neutral borders. Destructive
  actions remain red.
- Reusable `SelfxGlassButton` primitives provide primary, secondary, selected,
  ghost and danger semantics for glass-capable Windows/Android kiosk UI.
  Primary glass buttons remain visibly SelfX orange with white text; secondary
  and inactive buttons use light/frosted surfaces, dark text and visible
  borders.
- Glass-style panels may be used selectively in kiosk/operator UI, but
  readability and camera performance take priority. Do not blur large live
  camera areas unnecessarily.
- The customer home does not show development presentation labels such as
  wallpaper mode or platform readiness in normal customer mode. Technical
  presentation status belongs in operator Display or Diagnostics surfaces.
- CaptureScope selection uses premium light/frosted cards with icon,
  description and arrow affordance rather than permanently solid-orange cards.
- Idle presentation assets are local/offline in this foundation. Future
  organization dashboard or fleet-driven presentation updates must preserve the
  same provider-neutral presentation model and offline fallback.
- Customer capture starts with CaptureScope selection: Top, Bottom or Full Body.
  This is framing/readiness intent, not final garment taxonomy. Full Body may
  later resolve to One Piece, Full Outfit or another canonical garment semantic.
- KIOSK-3A starts the customer Try-On flow with manual local garment image
  input before CaptureScope. Product Catalog browsing, captured garment input,
  Shopify/WooCommerce sources and remote asset selection remain future work.
- KIOSK-4A pairing codes are generated by SelfX API, exactly six numeric digits
  and valid for exactly 8 minutes. Leading zeroes are valid.
- KIOSK-4C phone upload QR codes contain only opaque customer upload
  capabilities. They do not include object keys, storage URLs, kiosk IDs,
  organization/store IDs, customer data, provider IDs or auth tokens.
- Customer upload sessions expire after five minutes, use backend
  `expiresAt/serverTime` for countdown and cannot be reused after cancellation,
  expiry, rejection replacement, consumption or deletion.
- The kiosk preview for a phone upload appears only after backend validation
  marks the upload `READY`.
- **Use This Photo** downloads the ready upload to temporary local capture
  storage and then consumes the upload session before generation continues.
- Pairing countdown and progress use backend `expiresAt/serverTime`, not a
  local hardcoded start time.
- Expired pairing sessions rotate automatically to a new backend-generated code.
- The pairing screen must never display provisioning secret, device refresh
  credential, access token, JWT or hashes.
- The stable installation ID is random and local; it is not authentication and
  is not derived from MAC address, camera ID, serial number or person identity.
- Device refresh credentials are stored with `flutter_secure_storage` using
  platform secure storage. Do not move them to SharedPreferences or plain files.
- Device access tokens are short-lived and kept in memory.
- On restart, secure refresh credential -> device refresh -> `session/me` ->
  customer home.
- If refresh/session/me/heartbeat reports revoked or unpaired device state, the
  kiosk clears device credentials and returns to pairing.
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
- Sound profile is an operator-only local setting. Current bundled development
  profiles are Soft, Classic, Digital and Minimal; the premium UI semantics are
  prepared for SelfX Signature, Soft, Studio, Minimal and Muted when production
  sound assets are supplied.
- Shutter/capture-success audio plays only after still capture succeeds. Capture
  failure must not play a success cue.
- Current bundled audio is non-verbal and offline. Production spoken cues such
  as "Photo captured" must be supplied or recorded into local assets before use;
  network TTS, random downloaded audio and copyrighted third-party audio are not
  part of this foundation.
- Shadcn/ui does not apply to Flutter. Kiosk screens use Flutter-native SelfX
  theme semantics matching web primary, secondary, selected and danger actions.
- Operator reveal and PIN use the same reusable glass-capable visual language
  while preserving hidden reveal timing, verifier abstraction, six-digit secure
  input and lockout behavior.
- Captures are copied to an OS temporary SelfX kiosk directory and can be
  cleared by the session controller.
- Original captured images remain unmodified; any quality analysis work uses
  derived in-memory or temporary analysis data.
- KIOSK-2A.1 preserves the full-resolution original still and records only
  local ephemeral CaptureScope, PrimarySubject and normalized TargetSubjectRegion
  semantics for target preparation.
- KIOSK-3A prepares a padded Try-On person input from the original still when
  TargetSubjectRegion metadata is available. Windows and unsupported live-frame
  paths use full-frame fallback.
- OpenCV quality checks are advisory except for technical invalid/decode
  failures.
- **Use Photo** submits to SelfX generation when the KIOSK-3A development bridge
  is configured. Missing bridge configuration shows a safe kiosk-not-configured
  message instead of calling a provider directly.
- Generation uses bounded async polling. Retrying an existing run continues
  polling and does not create another paid provider submission.
- The result screen displays the generated provider image directly. Target-only
  compositing and background-person preservation remain future work.
- Finish, retake and try-another-garment actions clear ephemeral customer
  capture, prepared target, garment and run/result state according to the
  customer flow.
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

## KIOSK-4A Pairing Checklist

1. Clear local device credentials or install fresh.
2. Launch kiosk with `SELFX_KIOSK_API_BASE_URL`.
3. Confirm **Pair this kiosk** appears instead of customer home.
4. Confirm six numeric digits are shown.
5. Confirm countdown starts near `08:00`.
6. Confirm timer progress decreases.
7. In SelfX SaaS Superadmin, open **Kiosks**.
8. Choose **Pair New Kiosk**.
9. Enter the displayed code.
10. Name the kiosk.
11. Choose `PLATFORM`, `ORGANIZATION` or `STORE`.
12. Pair.
13. Confirm the physical kiosk detects approval and enters customer home.
14. Restart kiosk and confirm it restores without re-pairing.
15. Revoke from Superadmin and confirm the kiosk returns to pairing after auth
    rejection/heartbeat.

## KIOSK-4C Mobile Upload Checklist

1. Launch a paired kiosk with `SELFX_KIOSK_API_BASE_URL`.
2. Start Try-On, choose a garment image path and select CaptureScope.
3. Confirm the photo source screen offers **Take Photo** and **Use My Phone**.
4. Choose **Use My Phone**.
5. Confirm a QR code, countdown and waiting status appear.
6. Scan the QR on a phone browser.
7. Confirm the public page opens without staff login.
8. Take or choose a supported image and confirm a preview appears.
9. Press **Upload Photo**.
10. Confirm the kiosk changes from waiting/uploading to a ready photo preview.
11. Choose **Upload Another** and confirm a fresh QR/session appears.
12. Repeat upload, then choose **Use This Photo**.
13. Confirm the kiosk continues to generation progress.
14. Cancel an upload and confirm the kiosk returns without accepting that
    capability.
15. Let a QR expire and confirm a new QR is required.

## Assisted Capture Checklist

Portrait kiosk check, where possible: approximately 1080 x 1920 logical
viewport.

1. Launch the app and confirm it opens on the customer kiosk home.
2. Confirm there is no visible Camera Settings action on the home.
3. Press **Start Try-On**.
4. Enter/select a local garment image path.
5. Select **Top**, **Bottom** or **Full Body**.
6. Confirm the primary action is **Take Photo**.
7. Press **Take Photo** and verify readiness/countdown guidance appears below the preview
   in portrait without covering the camera image.
8. Press **Cancel** during final countdown and verify no delayed capture occurs.
9. Start again and verify stable readiness starts final 3/2/1 when live frames
   are available, or scripted fallback works when live frames are unavailable.
10. Double-tap the hidden top-left operator hotspot, enter the operator PIN and
   open Camera Settings.
11. Preview each Sound profile in Camera Settings.
12. Toggle Capture sounds off in Camera Settings and verify capture still works
   silently.
13. Let countdown finish and verify exactly one photo is captured and success
   audio occurs only after capture.
14. Confirm **Checking your photo...**, Review, **Retake** and **Use Photo**.
15. With KIOSK-3A API defines configured, confirm **Use Photo** opens generation
   progress and then the generated result.
16. Without KIOSK-3A API defines configured, confirm **Use Photo** shows a safe
   kiosk-not-configured message.

## KIOSK-3A Paid Generation Checklist

Perform this checklist only when a real provider smoke test is intentionally
approved. Limit the smoke test to one paid generation.

1. Start the SelfX API with `TRYON_LAB_ENABLED=true` and backend-only
   `FASHN_API_KEY`.
2. Obtain a valid staff/admin access token through the existing authenticated
   development flow.
3. Launch the kiosk with `SELFX_KIOSK_API_BASE_URL` and
   `SELFX_KIOSK_DEV_ACCESS_TOKEN`.
4. Select one local garment image, capture one customer test photo and tap
   **Use Photo** once.
5. Confirm progress reaches the result screen and the generated image renders.
6. Confirm **Try Another Garment**, **Retake Photo** and **Finish** clear the
   expected state without showing previous customer data.
7. Do not repeat paid generations unless a separate test budget is approved.

## KIOSK-2A Privacy & Diagnostics

- Live frames are processed locally and are not persisted, uploaded, sent to
  FASHN/provider services or logged as bytes/base64.
- Pose/landmark output is ephemeral capture assistance and must not become
  biometric identity, persisted raw landmarks or pose history.
- Operator diagnostics may show target/effective FPS, dropped frames and
  analyzer latency, PrimarySubject lock state, visual prominence, normalized
  target region, tracking age and the active analyzer mode. They must not show
  customer images, frame bytes or raw pose data.
- KIOSK-3A targets generation using the selected PrimarySubject region where
  available and falls back to full frame where not. It displays the provider
  result directly. Future target compositing should preserve unrelated or
  background people when that phase is implemented.
- Android box + USB webcam live-readiness behavior remains hardware verification
  pending until the certified SelfX kiosk hardware is tested.
