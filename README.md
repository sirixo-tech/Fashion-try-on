# SelfX Virtual Try-On

SelfX is a multi-tenant SaaS platform for AI-powered clothing Virtual Try-On.

This repository is currently implemented through Phase 4 plus the CORE VTO-1
internal development Try-On Lab. It includes repository foundation,
PostgreSQL/Prisma, staff authentication, organization
registration/review/activation, active organization/store/membership RBAC, the
Mantine-primary SelfX design system, authenticated admin shell, and a guarded
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

Phase 4 UI architecture:

- Mantine is the primary web UI/component framework.
- `packages/ui` owns the shared SelfX Mantine theme, provider and reusable web
  components.
- shadcn/ui remains installed only as a secondary component source; generated
  shadcn files live in `packages/ui/src/components`.
- Tailwind remains secondary utility/layout infrastructure and compatibility
  support, not the primary component system.
- New common admin UI should import reusable SelfX components from `@selfx/ui`
  and use Mantine-first components by default.

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
  systems outside the shared SelfX Mantine theme and `@selfx/ui` primitives.

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

## KIOSK-2A Live Android Primary Kiosk Capture

`mobile/kiosk` is now one standalone Flutter kiosk application for the
SelfX-owned camera and capture foundation. Android is the primary commercial
kiosk deployment target, while Windows remains a fully supported secondary
kiosk/desktop platform. The app is kept outside npm workspaces and does not
reuse React, Mantine or shadcn packages.

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
- Customer flow is Kiosk Home -> CaptureScope selection -> Camera -> live
  preparation/readiness -> stable final 3/2/1 -> still capture -> Review ->
  Photo Ready.
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
- **Use Photo** now opens a Photo Ready state. **Continue** is a temporary
  local placeholder until product/catalog/Try-On submission is implemented.
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
