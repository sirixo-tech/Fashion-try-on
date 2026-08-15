# SelfX Virtual Try-On

SelfX is a multi-tenant SaaS platform for AI-powered clothing Virtual Try-On.

This repository is currently implemented through Phase 4 plus the CORE VTO-1
internal development Try-On Lab. It includes repository foundation,
PostgreSQL/Prisma, staff authentication, organization
registration/review/activation, active organization/store/membership RBAC, the
Shadcn-first SelfX design system, authenticated admin shell, and a guarded
lab route for proving person-image plus garment-image Virtual Try-On.

The CORE VTO-1 lab intentionally contains no Product Catalog, durable Try-On
records, Redis/BullMQ queueing, R2/object storage, kiosk capture, customer
accounts, integrations, operational dashboards or billing implementation.

## Requirements

- Node.js 24 LTS
- npm 11

## Install

```bash
npm install
```

## Development

```bash
npm run dev
```

Run individual services:

```bash
npm run dev:web
npm run dev:api
npm run dev:worker
```

Production web builds should use the root Turborepo command so internal
workspace packages build before Next.js consumes them:

```bash
npm run build:web
```

This command builds `@selfx/shared` to `dist` before `@selfx/web`; `@selfx/ui`
also participates through the workspace dependency graph. Railway `@selfx/web`
deployments should use `npm run build:web` as the Build Command instead of
directly running `npm run build --workspace=@selfx/web`. The Railway Start
Command remains `npm run start --workspace=@selfx/web`. Frontend deployment is
pending until the Railway clean build succeeds with this command.

For a production-mode local web smoke test on the approved SelfX web port:

```bash
npm run start:local --workspace @selfx/web
```

Current Phase 0 structure:

```text
frontend/web
backend/api
backend/worker
packages/ui
packages/api-client
packages/shared
packages/config
mobile/kiosk
mobile/customer-app
integrations/shopify
integrations/woocommerce
```

Phase 4 web design-system files:

```text
frontend/web/components.json
frontend/web/app/app
packages/ui/components.json
packages/ui/src/theme
packages/ui/src/components
packages/ui/src/selfx
packages/ui/src/styles/globals.css
```

Phase 4 / SELFX-UI-MIGRATION-1 UI architecture:

- shadcn/ui is the primary web UI/component framework for SelfX web.
- `packages/ui` owns shared SelfX semantic tokens, shadcn-based primitives and
  reusable web components.
- Mantine is retired from current SelfX web runtime usage. Future Mantine or
  other external UI toolkit use requires an explicit user request.
- Tailwind remains secondary utility/layout infrastructure and compatibility
  support, not the primary component system.
- New common admin UI should use existing SelfX shadcn-based components first,
  then small custom Tailwind only where no suitable primitive exists. Another
  UI library requires an explicit user request.

Phase 4 page/layout standards:

- Page anatomy is `PageContainer` → `PageHeader` → `PageSection`/content.
- Width modes are `wide` for dashboard/list/admin workspaces, `medium` for
  detail/settings pages and `form` for create/edit forms.
- Standard card surfaces are `StatCard`, `SectionCard`, `SummaryCard`,
  `ActionCard` and `TableContainer`.
- Future list pages should compose `FilterBar` and `TableContainer` with an
  explicit pagination/footer region rather than creating one-off table chrome.
- Forms should use `FormPageContainer`, `FormSection` and `FormActions` with
  one-column layout by default and responsive collapse for compact grouped
  fields.
- New pages should not invent arbitrary spacing, card shadows, radii or visual
  systems outside the shared SelfX semantic tokens and `@selfx/ui` primitives.

SELFX-DESIGN-SYSTEM-2 establishes the shared SelfX visual language for SaaS web
and kiosk/mobile applications:

- SelfX primary action and selected-control color is `#FF7119` with white text.
- Primary, active and selected controls use semantic design tokens rather than
  page-specific color literals.
- Secondary/inactive buttons use white/light surfaces, dark text and neutral
  borders.
- Danger actions remain semantically red.
- Default buttons are rounded rectangles, not global pills.
- shadcn/ui is the preferred SaaS web component system.
- SaaS web uses a premium clean SaaS direction with restrained solid surfaces.
- Windows/mobile/kiosk no longer use glassmorphism as a SelfX visual direction.
  Use solid cards/buttons, clear neutral borders, restrained shadows and strong
  hierarchy. Customer wallpaper/slideshow remains supported, but controls over
  imagery should be solid/readable or backed by simple scrims rather than blur.
- The `#FF7119` and white text product requirement may need an accessible
  action variant before formal WCAG AA compliance.
- SELFX-UI-MIGRATION-1 migrates the current shell, auth, state and placeholder
  pages now to avoid double redesign work before Organizations, Roles,
  Permissions, Catalog, Kiosks, Reports, Audit and Settings expansion.

Current web migration status:

- Migrated to Shadcn-first SelfX components: `/`, `/login`, authenticated app
  shell/header/sidebar/account controls, `/app/dashboard`, placeholder module
  routes, organization/access state routes and `/app/try-on-lab`.
- Frontend consumers import public SelfX components and types from `@selfx/ui`;
  do not depend on private `@selfx/ui/selfx/*` source-tree paths.
- Future SaaS modules must start from the Shadcn-first SelfX primitives and
  page patterns instead of adding new Mantine screens.

## CORE VTO-1 Try-On Lab

The internal development lab is available at:

```text
http://localhost:3002/app/try-on-lab
```

Required local settings:

```text
TRYON_LAB_ENABLED=true
FASHN_API_KEY=<server-side local key>
```

`FASHN_API_KEY` must remain server-side only and must never use a
`NEXT_PUBLIC_*` variable.

The lab uses:

- browser-side OpenCV.js quality preflight, lazy-loaded only on the lab route;
- browser-side MediaPipe Tasks Vision garment body-coverage analysis,
  lazy-loaded only when a garment image needs direct-upload ambiguity
  resolution;
- validated multipart uploads to the SelfX API;
- server-side Base64 data URI transport to FASHN for this development slice;
- provider-neutral SelfX run IDs with provider IDs kept server-side;
- a bounded one-hour in-memory run registry.

The Lab multipart contract keeps `personImage` and `garmentImage` as the
original selected binary files. Browser-side OpenCV and MediaPipe operate on
analysis copies only. Resolver metadata is sent as explicit string fields;
unavailable optional values such as MediaPipe confidence use the API-supported
empty value rather than JavaScript `null`, `undefined`, objects or arrays.

Uploaded-image preflight separates technical validation from quality analysis:

- technical validation remains blocking for invalid images, unsupported
  formats, corrupt/undecodable files, unsafe MIME/signature mismatches, hard
  size limits and invalid/zero dimensions;
- quality analysis is advisory for uploads. Blur, dark/bright exposure, low
  contrast, low resolution and framing concerns appear as warnings;
- if OpenCV quality analysis cannot complete for an otherwise technically valid
  upload, the lab shows an analysis-unavailable warning rather than fake `0x0`
  or zero-valued metrics;
- testers may re-upload or proceed anyway after reviewing grouped person-photo
  and garment-photo warnings.

OpenCV's stricter production role is reserved for future live camera/kiosk
capture guidance, where SelfX can guide the user before taking the photo.

CORE VTO-1.2 refines the internal lab workflow:

- the lab shows a passive notice: "Internal testing only. Upload only images
  you are authorized to process.";
- the lab does not show a customer-style consent checkbox;
- customer web/mobile/kiosk consent remains mandatory in the production
  architecture before camera access, upload or AI processing;
- the page flow is Images -> Generate Try-On -> Result;
- upload cards use compact, consistent previews with contained image fitting;
- default Try-On settings are selected automatically by provider-neutral
  resolution policy rather than visible category/photo/profile controls;
- full-body/on-model garment uploads ask one focused ambiguity question;
- collapsed Advanced settings remain available only for internal debugging
  overrides;
- completed runs show a three-column comparison on desktop with responsive
  stacking and larger preview modals;
- completed runs keep technical provider/model/resolution telemetry collapsed
  under Run diagnostics by default;
- Try Another Garment preserves the person photo and clears garment/run state;
- New Try-On clears all images, warning overrides and run state;
- the current lab run exposes safe provider-neutral telemetry fields only.

MediaPipe runtime details for CORE VTO-1.2:

- npm package: `@mediapipe/tasks-vision@0.10.35`;
- WASM assets are downloaded at runtime from the version-pinned jsDelivr path
  `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm`;
- pose model asset is downloaded at runtime from the versioned Google
  MediaPipe model path
  `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`;
- MediaPipe estimates on-model body coverage only. It does not identify the
  exact garment, perform biometrics, or replace catalog metadata.

Future store/site/catalog products include SelfX-native catalog products,
Shopify products synchronized through a future SelfX Shopify integration and
WooCommerce products synchronized through a future SelfX WooCommerce
integration. CORE VTO-1.2 defines the normalization contract only; it does not
implement Shopify or WooCommerce synchronization.

This is temporary development infrastructure. Production VTO still requires the
approved durable assets, customer consent, entitlement/quota,
TryOnRun/ProviderAttempt, queue/worker, telemetry persistence and retention
phases. The lab does not create a production analytics dashboard or durable
analytics table.

## KIOSK-2C Customer Kiosk Home and Operator Access

`mobile/kiosk` is now one standalone Flutter kiosk application for the
SelfX-owned camera and capture foundation. Android is the primary commercial
kiosk deployment target, while Windows remains a fully supported secondary
kiosk/desktop platform. The app is kept outside npm workspaces and does not
reuse React, Mantine or shadcn packages.

KIOSK-2C keeps the KIOSK-2A live capture foundation and adds the production
kiosk shell expected on the floor: a customer-facing idle home, hidden operator
access and responsive local settings.

- The kiosk starts on a customer home/idle presentation, not camera settings or
  technical test controls.
- Customer home uses the reusable SelfX solid primary CTA and no longer
  shows development presentation labels such as static wallpaper or platform
  readiness in normal customer mode.
- The current customer flow is Kiosk Home -> Start Try-On -> intended garment
  scope -> garment photo by kiosk camera or phone QR -> garment review -> model
  photo by kiosk camera or phone QR -> generation progress -> generated result.
- The home has no visible Camera Settings button. A hidden top-left double-tap
  reveals operator access briefly.
- Operator access opens a 6-digit PIN challenge before settings. The UI calls
  the provider-neutral verifier and does not store, log or hardcode plaintext
  production PINs.
- Operator reveal and PIN use solid premium surfaces with clear borders and
  restrained shadows rather than frosted/glass treatments.
- Five failed PIN attempts lock operator access for 60 seconds. Customer
  Try-On remains available during operator lockout.
- Settings unlock only for the current visit. Leaving settings re-locks
  operator access.
- Local settings are grouped as Camera, Capture, Display, Diagnostics and
  System, and remain scrollable/responsive in Android portrait and Windows
  portrait, landscape and narrow windows.
- SELFX-DESIGN-SYSTEM-2 upgrades operator settings into Camera, Capture,
  Display, Audio, Diagnostics and System categories with a premium navigation
  rail/tabs, bounded camera preview, human-readable camera labels and technical
  IDs tucked under diagnostics.
- CaptureScope uses the standardized selectable-button pattern: selected is
  SelfX orange with white text and orange border; inactive choices are white
  with dark text and neutral borders.
- Idle presentation is local/offline with static or slideshow semantics. The
  bundled SelfX wallpaper is the default fallback until organization/kiosk
  wallpaper management is added to the SaaS dashboard.

KIOSK-2A implements local camera testing plus the assisted customer capture
experience with on-device live readiness where Android image streams are
available:

- Android boxes with touch displays are the primary target.
- Current commercial SelfX rental kiosks primarily use 32-inch and 42-inch
  vertically mounted displays, so Android kiosk UX is portrait-first.
- Windows desktop remains supported for Windows kiosks and camera testing.
- Windows remains responsive in portrait and landscape desktop/window
  operation.
- The Android camera path uses Flutter `camera` with the endorsed CameraX
  implementation.
- The Windows camera path uses Flutter `camera` with `camera_windows`.
- Integrated cameras and external USB/UVC webcams are treated consistently as
  `CameraDevice` instances behind `CameraService`.
- Multiple cameras can be enumerated and selected.
- The preferred camera ID is local device configuration stored through
  `shared_preferences` with platform scoping; it is not server-side kiosk
  configuration.
- KIOSK-2A's local capture flow was Kiosk Home -> CaptureScope selection ->
  Camera -> live preparation/readiness -> stable final 3/2/1 -> still capture
  -> Review -> Photo Ready; KIOSK-3A now routes the accepted photo onward to
  generation when the development bridge is configured.
- Customer-selected `CaptureScope` values are TOP, BOTTOM and FULL BODY. They
  affect framing/readiness and future search/policy space, but are not final
  garment taxonomy. FULL BODY may later resolve to ONE_PIECE, FULL_OUTFIT or
  another canonical garment semantic.
- Customer capture uses **Take Photo** -> preparation/readiness -> final
  countdown -> automatic still capture. The instant customer **Capture Now**
  flow has been removed.
- Countdown duration is a local operator preference with allowed values 5, 10
  and 15 seconds. Existing installs default to 10 seconds.
- Capture sounds are enabled by default and can be disabled locally. They use
  offline output-only sound profiles and require no microphone permission.
- Android KIOSK-2A samples local camera frames for on-device pose/readiness and
  subject-aware quality guidance. Live frames are not uploaded, persisted,
  logged as bytes/base64 or sent to FASHN/provider services.
- Live analysis targets about 3 FPS initially, uses newest-frame-wins
  backpressure, drops stale frames and never builds an unbounded local frame
  queue. Adaptive cadence protects smooth camera preview on lower-powered boxes.
- Readiness is scope-aware, stable/debounced and PrimarySubject based. The
  current Android ML Kit pose path exposes only the tracked/prominent pose, so
  it does not claim reliable active multi-person detection.
- SelfX selects one prominent customer as the local PrimarySubject for the
  capture session using visual prominence signals such as apparent body area,
  centrality, capture-guide overlap, pose visibility and confidence. This is
  not true physical distance measurement.
- The PrimarySubject is locked ephemerally across frames to reduce switching
  from confidence jitter or background movement, and releases after absence or
  session/scope reset.
- The client capture workflow uses explicit states for preview, preparing,
  countdown, capturing, analyzing, review, photo ready and error so cancellation
  and live readiness remain predictable.
- Screens adapt from actual logical viewport dimensions and aspect ratio.
  Physical 32-inch/42-inch panel size is not hardcoded into layout logic.
- Portrait capture prioritizes a large/tall camera preview, distance-readable
  countdown/guidance and lower-region touch actions for standing customers.
- Dynamic customer guidance stays below the camera in `CaptureGuidancePanel`.
  The preview contains only camera image, subtle scope-aware framing overlay and
  future camera-specific overlays.
- Bounded readiness timeout exposes **Try Again** and **Capture Anyway**.
  Capture Anyway bypasses readiness/quality warnings only, not unavailable
  camera, capture, corrupt image or decode failures.
- Android USB webcam support depends on whether the certified Android box
  exposes that camera through CameraX. Dedicated UVC integration is deferred
  until real hardware requires it.
- `camera_windows` supports Windows camera enumeration, preview and still
  capture, but does not expose Windows live image streams. Windows live frames
  are KIOSK-2B and must reuse the same readiness engine.
- Captured images stay temporary and local; KIOSK-2A does not upload to SelfX,
  call FASHN or require `FASHN_API_KEY`.
- The original full-resolution still remains preserved. KIOSK-2A.1 records only
  local ephemeral CaptureScope, PrimarySubject and normalized TargetSubjectRegion
  semantics for future target-only preparation; it does not crop destructively.
- `opencv_dart` runs only after still capture for blur, brightness, exposure,
  contrast and resolution quality checks. The original capture is preserved
  while analysis operates on a derived/downscaled copy.
- Advisory quality warnings normally still allow **Use Photo**; technical
  invalidity blocks use. OpenCV analysis failure is a warning, not captured
  image invalidity.
- **Use Photo** now opens KIOSK-3A generation when the development bridge is
  configured. Missing bridge configuration produces a safe kiosk-not-configured
  message rather than a direct provider call.
- Pose/body landmark data is ephemeral capture assistance only, not biometric
  persistence. Customer UI does not expose raw skeletons, landmark dots,
  confidence values or technical CV metrics.
- Subject-aware live lighting improves on the KIOSK-1 whole-frame brightness
  limitation by checking the PrimarySubject target region where practical.
- Future KIOSK-3 generation must target the selected customer only. SelfX must
  not rely solely on an AI provider guessing which visible person should be
  dressed; unrelated/background people should remain unchanged through future
  target extraction and compositing.
- Android fullscreen/immersive presentation is prepared for kiosk use, but
  production lock-task/device-owner management and fleet operations are future
  milestones.
- API Gateway work remains deferred; the approved backend path is still Clients
  -> SelfX NestJS API until Public API/partner/edge-management scale justifies
  a gateway.

KIOSK-3A added the first real end-to-end kiosk Try-On generation bridge:

- Customer flow is Kiosk Home -> Start Try-On -> intended garment scope ->
  garment photo source -> garment review -> model/person photo source ->
  generation progress -> generated result.
- The kiosk calls the SelfX API only. It never calls FASHN directly and never
  stores `FASHN_API_KEY`.
- The original bridge targeted the guarded development Try-On Lab API. Normal
  paired kiosks now use the KIOSK-4B production device-authenticated endpoint.
- KIOSK-5A replaces the customer-facing temporary local garment picker with
  physical garment photo acquisition. Garment and model/person photos can each
  come from the kiosk camera or phone QR upload. Product Catalog,
  Shopify/WooCommerce sources and QR result handoff remain future work.
- Normal customer UI does not expose raw garment paths, KIOSK milestone labels,
  garment type overrides or photo-style controls. Provider-neutral garment
  semantics remain internal and are mapped to existing CaptureScope behavior.
- Full-resolution accepted captures are preserved. Android target metadata is
  used to prepare a padded customer target image where available; Windows and
  unsupported live-frame paths fall back to the full frame.
- Generation uses async status polling with bounded timeout and customer-safe
  messages. Retry polling does not create another paid run.
- The generated provider result is displayed directly. Final target-region
  compositing is not implemented in this slice.

Useful kiosk commands:

```bash
cd mobile/kiosk
flutter pub get
dart format --output=none --set-exit-if-changed .
flutter analyze
flutter test
flutter build apk --debug
flutter build apk --release
flutter build windows
```

KIOSK-4B production generation for a paired kiosk requires only the SelfX API
base URL in Flutter:

```bash
flutter run \
  --dart-define=SELFX_KIOSK_API_BASE_URL=http://localhost:3001
```

The kiosk uses its paired device session for `/api/v1/kiosk/try-on/runs`.
`SELFX_KIOSK_DEV_ACCESS_TOKEN` is not required for normal paired generation,
and `TRYON_LAB_ENABLED=true` is not required for the production kiosk endpoint.
The API still needs provider credentials such as `FASHN_API_KEY` configured
server-side only. Perform at most one paid provider generation for manual smoke
verification unless a separate test budget is approved.

The internal Web Try-On Lab remains separate at `/app/try-on-lab` and
`/api/v1/try-on-lab/runs`; it is still guarded by staff/admin auth and
`TRYON_LAB_ENABLED=true`.

KIOSK-4A adds production kiosk device provisioning:

- A new/unpaired kiosk starts on **Pair this kiosk**, not customer home.
- The SelfX API generates exactly six numeric digits and returns
  `expiresAt/serverTime`; the kiosk derives the countdown and progress from
  those server values.
- Pairing codes live for exactly 8 minutes and rotate automatically when
  expired.
- Superadmin SaaS uses **Kiosks -> Pair New Kiosk** to enter the displayed code,
  name the device and assign it to `PLATFORM`, `ORGANIZATION` or `STORE`.
- Kiosks belong to the SelfX platform fleet. Superadmin users are actors, not
  device owners.
- Superadmins can activate/deactivate kiosk devices, revoke credentials and
  soft-delete devices from the normal fleet list while retaining audit history.
- Device credentials are dedicated kiosk-device credentials, not human user
  tokens. `typ` is `kiosk_device_access`.
- Flutter stores the device refresh credential in OS-backed secure storage;
  access tokens live in memory.
- Revoked kiosks clear local device credentials and return to pairing.

KIOSK-4B connects paired device auth to production Try-On:

- `POST /api/v1/kiosk/try-on/runs` creates a device-owned production run from
  multipart `personImage`, `garmentImage` and a required `clientRequestId`.
- `GET /api/v1/kiosk/try-on/runs/:runId` returns status only to the device that
  owns the run.
- The backend reloads live device status and assignment for every create/status
  request and accepts only `ACTIVE` device tokens with
  `typ: "kiosk_device_access"`.
- The same device plus the same `clientRequestId` returns the same run and does
  not submit a duplicate paid provider job.
- Production kiosk Try-On and the internal Try-On Lab share the provider-neutral
  SelfX Try-On execution service and FASHN adapter.
- Run persistence records ownership, assignment context, idempotency key,
  provider execution state, result/error and expiry without storing raw person
  or garment input bytes.
- If a device is revoked during generation, polling stops, local device auth is
  cleared and the kiosk returns to pairing. Customer **Finish** still clears
  only customer session state and keeps a valid paired device identity.

SelfX kiosk typography uses Manrope for headings and Inter for body, buttons
and labels. SaaS sidebar navigation uses the shared `@selfx/ui` AppShell/sidebar
boundary with shadcn sidebar-style composition and Inter menu typography.

Required server-side `@selfx/api` variables for KIOSK-4A:

```bash
KIOSK_PAIRING_CODE_PEPPER=<long random server secret>
KIOSK_PROVISIONING_SECRET_PEPPER=<long random server secret>
KIOSK_DEVICE_REFRESH_TOKEN_PEPPER=<long random server secret>
KIOSK_DEVICE_JWT_SECRET=<long random server secret>
KIOSK_PAIRING_TTL_SECONDS=480
KIOSK_DEVICE_ACCESS_TOKEN_TTL_SECONDS=900
KIOSK_DEVICE_REFRESH_SESSION_TTL_SECONDS=2592000
```

Flutter still needs `SELFX_KIOSK_API_BASE_URL` as a Dart define so the kiosk can
reach SelfX API provisioning and production Try-On endpoints. It no longer
needs `SELFX_KIOSK_DEV_ACCESS_TOKEN` for paired commercial kiosk operation.

KIOSK-4C/KIOSK-5A add secure customer mobile photo upload for paired kiosks:

- The kiosk uses purpose-bound phone upload sessions for both garment and
  model/person photos.
- The garment source step offers **Take a Photo** or **Use Your Phone** after
  the customer chooses Top, Bottom or Full Outfit.
- The model/person photo source step offers **Take Photo** or **Use Your Phone**.
- **Use Your Phone** creates a five-minute customer upload session and displays
  a QR code containing only an opaque capability URL.
- Bodyless customer-upload create/status/cancel/consume requests send
  `Accept: application/json` and device bearer auth, but no JSON
  `Content-Type` unless a JSON request body is actually present.
- The kiosk shows a preparation state until session creation succeeds. It does
  not show `00:00` before a valid `expiresAt/serverTime` pair exists.
- The QR screen sizes the QR from available viewport space so Windows resize,
  Windows portrait/landscape and Android portrait keep the countdown, status
  and cancel action reachable.
- Creation failures show a safe retry/cancel state and log only safe diagnostics
  such as endpoint path, HTTP status, canonical code and duration.
- `DEVICE_TOKEN_INVALID` and `DEVICE_TOKEN_EXPIRED` during customer-upload
  device requests trigger one forced KIOSK-4A device refresh and retry once.
  `DEVICE_UNPAIRED`, `DEVICE_REVOKED`, `DEVICE_DELETED` and `DEVICE_INACTIVE`
  return the kiosk to pairing. Non-auth upload failures stay in the upload
  retry/cancel state and do not clear a healthy kiosk pairing.
- The public web route `/upload/[capability]` lets the customer take or choose a
  photo, previews it locally and uploads only after explicit confirmation.
- SelfX signs a short-lived object-storage upload URL, validates the stored
  image and lets the kiosk select only a validated `READY` upload.
- The kiosk downloads the ready upload into temporary local storage, marks it
  consumed with the expected purpose and continues to garment review or
  generation as appropriate.
- Expired QR sessions stop polling and are replaced with a fresh backend
  customer upload session before the customer uses the QR again.
- KIOSK-4C does not implement Product Catalog, QR result continuation, billing,
  Redis/BullMQ, API Gateway or provider calls from Flutter.

Additional server-side `@selfx/api` variables for KIOSK-4C:

```bash
KIOSK_CUSTOMER_UPLOAD_TOKEN_PEPPER=<long random server secret>
KIOSK_CUSTOMER_UPLOAD_TTL_SECONDS=300
SELFX_PUBLIC_WEB_BASE_URL=https://selfxweb-production.up.railway.app
OBJECT_STORAGE_ENDPOINT=<s3-compatible endpoint>
OBJECT_STORAGE_REGION=<region>
OBJECT_STORAGE_BUCKET=<private bucket>
OBJECT_STORAGE_ACCESS_KEY_ID=<server-side access key>
OBJECT_STORAGE_SECRET_ACCESS_KEY=<server-side secret key>
```

Android hardware smoke checklist:

```bash
adb devices
flutter install -d <device-id>
adb shell monkey -p com.selfx.kiosk 1
```

Enable Android developer options, USB debugging and camera permission before
testing. Test built-in camera first, then plug in the USB webcam, open Camera
Settings and refresh detected cameras.

Default local ports:

- Web: `http://localhost:3002`
- API: `http://localhost:3001`
- PostgreSQL: `localhost:5433`

In Railway production, the API listens on Railway's injected `PORT` value and
binds to `0.0.0.0` so public networking and deployment healthchecks can reach
the NestJS process. `API_PORT` remains the local SelfX development
override/fallback, with `3001` as the final local default.

Production SelfX Web sends normal browser API traffic to same-origin
`/api/v1/*` paths. Next.js rewrites those requests server-side to the deployed
SelfX API configured by server-only `SELFX_API_UPSTREAM_URL`, for example:

```text
SELFX_API_UPSTREAM_URL=https://selfxapi-production.up.railway.app
```

Do not prefix this variable with `NEXT_PUBLIC_`. In production Railway web
deployments, remove `NEXT_PUBLIC_API_URL` and
`NEXT_PUBLIC_SELFX_API_BASE_URL` so browser fetches use same-origin relative
paths instead of cross-site API-host requests. The API refresh cookie remains
HttpOnly and path-scoped to `/api/v1/auth`; the browser does not need a
third-party API cookie and no refresh token is exposed to JavaScript. Local
development may still use `NEXT_PUBLIC_API_URL=http://localhost:3001` for a
direct local API.

Client-side API URL code must reference `process.env.NEXT_PUBLIC_API_URL` and
`process.env.NEXT_PUBLIC_SELFX_API_BASE_URL` directly so Next.js can inline
browser environment values correctly. Do not route browser env resolution
through an indirect `process.env` object. Production must never silently fall
back to `http://localhost:3001`; if public API URL variables are absent in
production, browser requests default to same-origin `/api/v1/*`.

The API exposes separate liveness and readiness endpoints:

```text
GET /health
GET /ready
```

`/health` is lightweight process liveness and does not query PostgreSQL.
`/ready` verifies core API readiness by probing PostgreSQL connectivity. A
database outage returns HTTP 503 with a sanitized readiness response. FASHN and
other external providers are intentionally excluded from core readiness and
belong in separate diagnostics/provider-health checks. The deployed Railway API
currently keeps Railway's healthcheck path on `/health`; a previous deployment
healthcheck failed because the API ignored Railway `PORT` and listened only on
the local `API_PORT` fallback. `/ready` remains available as the PostgreSQL
readiness probe but is not the Railway deployment healthcheck path for now.

## Local Bootstrap

Create the first local staff user explicitly:

```bash
npm run auth:bootstrap
```

Assign that existing local user the development-only SelfX platform admin role
explicitly:

```bash
npm run platform:bootstrap
```

Both commands require their corresponding `SELFX_*_BOOTSTRAP_ENABLED` variables
and are blocked in `NODE_ENV=production`.

## Production Platform Admin Bootstrap

Local users are not production users. A first Railway production
`SELFX_SUPER_ADMIN` must be created with the dedicated one-time operator command
after the API has been built:

```bash
npm run production:bootstrap-admin
```

This root command runs `npm run bootstrap:production-admin --workspace
@selfx/api`, which executes the compiled API script
`node dist/scripts/bootstrap-production-admin.js`.

The production command runs only with:

```text
NODE_ENV=production
SELFX_PRODUCTION_BOOTSTRAP_ENABLED=true
SELFX_PRODUCTION_BOOTSTRAP_CONFIRM=CREATE_FIRST_SUPER_ADMIN
SELFX_PRODUCTION_ADMIN_EMAIL=<first production admin email>
SELFX_PRODUCTION_ADMIN_PASSWORD=<temporary strong password>
SELFX_PRODUCTION_ADMIN_DISPLAY_NAME=<optional display name>
```

The command is manual, one-time and operator-only. It requires an empty
production user database, creates the first `User` and active
`SELFX_SUPER_ADMIN` assignment atomically, and safely no-ops only when the
exact requested admin is already initialized. It does not reset passwords,
promote arbitrary users, create a public signup/setup endpoint or run during
normal application startup.

After a successful production bootstrap, remove or disable
`SELFX_PRODUCTION_BOOTSTRAP_ENABLED`, remove the temporary production bootstrap
email/password/confirmation variables from Railway, redeploy/apply the variable
removal as needed, then test login through the production frontend using the
standard auth flow.

After deploying the same-origin web API proxy, verify production auth in
Chrome:

- login request URL is
  `https://selfxweb-production.up.railway.app/api/v1/auth/login`;
- refresh request URL is
  `https://selfxweb-production.up.railway.app/api/v1/auth/refresh`;
- refresh includes a Cookie header and returns HTTP 200;
- sidebar navigation does not reload the document;
- Dashboard and Stores remain authenticated after navigation;
- F5 reload, direct `/app/stores` and a new tab restore the session through
  `SessionProvider` refresh;
- logout clears the session.

Because a production refresh token was exposed during manual debugging, revoke
or logout all existing production administrator sessions after verification,
then sign in again and use the newly created clean session.

Same-origin proxy production verification remains pending until the deployed
browser Network tab confirms login and refresh use the web origin rather than
localhost or the API Railway host.

Create/update temporary local demo logins for each current platform and
merchant role explicitly:

```bash
npm run demo:bootstrap
```

These accounts all use the local-only `SELFX_DEMO_LOGIN_PASSWORD` from `.env`.
The current local value is `SelfXLocalAdmin123!`.

| Role                       | Email                             |
| -------------------------- | --------------------------------- |
| Existing local super admin | `admin@selfx.local`               |
| SELFX_SUPER_ADMIN          | `platform.superadmin@selfx.local` |
| SELFX_SUPPORT_ADMIN        | `platform.support@selfx.local`    |
| ORGANIZATION_OWNER         | `owner@selfx.local`               |
| ORGANIZATION_ADMIN         | `org.admin@selfx.local`           |
| ORGANIZATION_STAFF         | `org.staff@selfx.local`           |
| STORE_OWNER                | `store.owner@selfx.local`         |
| STORE_MANAGER              | `store.manager@selfx.local`       |
| STORE_STAFF                | `store.staff@selfx.local`         |
| KIOSK_OPERATOR             | `kiosk.operator@selfx.local`      |

## Database

The canonical Prisma schema and migration history live in:

```text
backend/database/prisma
```

Copy `.env.example` to `.env` and set `DATABASE_URL` for local development.
Use `TEST_DATABASE_URL` for isolated migration/integration checks.

Useful commands:

```bash
npm run db:validate
npm run db:generate
npm run db:migrate:dev
npm run db:migrate:deploy
npm run db:migrate:status
npm run db:test:uuid
```

SelfX primary IDs are generated in the application layer with UUIDv7 and stored
as PostgreSQL native `uuid` columns. The Phase 1 implementation uses the npm
`uuid` package from `backend/database`.

## Verification

```bash
npm run lint
npm run typecheck
npm run build
npm run format:check
npm test --workspace @selfx/web
```

## Phase Boundary

CORE VTO-1 implements only the internal development Try-On Lab. Products,
customer auth/history, production Try-On persistence, Redis/BullMQ, R2 assets,
kiosk functionality, integrations, operational dashboards, Public API
functionality and billing must be implemented only when their later phases are
explicitly approved.
