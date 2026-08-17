# SelfX Virtual Try-On — Project Instructions

## Project Overview

This repository contains the SelfX Virtual Try-On Platform.

SelfX is a multi-tenant SaaS platform for AI-powered clothing Virtual Try-On.

The initial production channel is SelfX retail kiosks.

The platform is being designed to later support:

- Public API
- Flutter mobile applications
- Shopify
- WooCommerce
- Web integrations
- Partner integrations

All channels must use the same SelfX backend and core business logic.

---

# Project Documentation

Project requirements are maintained in `/docs`.

The planned project documents are:

1. `docs/01-PRD.md`
2. `docs/02-TECHNICAL-REQUIREMENTS.md`
3. `docs/03-USER-JOURNEYS.md`
4. `docs/04-UI-UX-FLOW.md`
5. `docs/05-DATABASE-SCHEMA.md`
6. `docs/06-IMPLEMENTATION-PLAN.md`

These documents together define the approved system.

Do not treat one document as a replacement for the others.

---

# Document Responsibilities

## PRD

`docs/01-PRD.md`

Defines WHAT the product must do and mandatory product/business rules.

Product behavior must not silently contradict the PRD.

---

## Technical Requirements & System Design

`docs/02-TECHNICAL-REQUIREMENTS.md`

Defines HOW the platform must technically operate.

This includes:

- Tech stack
- Architecture
- APIs
- Authentication
- Authorization
- Multi-tenancy
- AI integration
- Storage
- Queueing
- Infrastructure
- Security
- Scaling
- Deployment
- External integrations

---

## User Journey & System Flow

`docs/03-USER-JOURNEYS.md`

Defines expected workflows for:

- Customers
- Organization owners/admins
- Store owners/managers/staff
- SelfX support
- SelfX super administrators
- Kiosks
- External integrations

---

## UI/UX Flow

`docs/04-UI-UX-FLOW.md`

Defines:

- Screens
- Navigation
- Forms
- Actions
- Loading states
- Error states
- Permission-dependent UI
- User interactions

---

## Database & Schema

`docs/05-DATABASE-SCHEMA.md`

Defines:

- Entities
- Tables
- Relationships
- Foreign keys
- Constraints
- Indexes
- Tenant relationships
- Retention-related data
- Audit-related data

Do not introduce major persistence structures that contradict this document.

---

## Implementation Plan

`docs/06-IMPLEMENTATION-PLAN.md`

Defines:

- Development phases
- Implementation order
- Dependencies
- Verification requirements
- Testing requirements

Do not independently implement later phases unless explicitly requested.

---

# Mandatory Architecture Rules

## 1. Central SelfX Backend

All clients must communicate with SelfX.

Required logical architecture:

Client
→ SelfX API
→ SelfX Backend
→ AI Provider

Clients include:

- Kiosk
- Public API consumers
- Flutter
- Shopify
- WooCommerce
- Web applications

Clients must never directly communicate with FASHN, Google Virtual Try-On,
or another AI provider using provider credentials.

---

## 2. AI Provider Independence

AI-provider-specific implementation must remain isolated.

The platform may initially use FASHN AI.

It must remain possible to later introduce:

- Google Virtual Try-On
- Other providers
- SelfX-hosted models

Do not spread FASHN-specific logic throughout the application.

---

## 3. Multi-Tenancy

Organizations are independent tenants.

Never allow unauthorized access between organizations.

All tenant-owned resources must be protected server-side.

Do not rely only on frontend filtering for tenant isolation.

---

## 4. Organization and Store Model

An organization may contain one or multiple stores.

An independent retailer must use:

Organization
→ One Store

Do not create a completely separate backend model for individual stores.

Organization registration and organization activation are separate actions.

An organization must never become operational immediately simply because a user
registers or submits it. Registration creates or updates an onboarding
application and may create a pending organization shell. Normal organization,
store, product, kiosk, membership and paid Try-On functionality is available
only after an authorized SelfX platform administrator activates the
organization.

Organization review, approval, activation and suspension belong to the SelfX
platform authorization domain, not merchant organization roles. Use centralized
platform permission resolution for platform approval actions.

---

## 5. Users and Membership

A user may belong to multiple organizations.

Do not model the user account as permanently belonging to exactly one organization.

A user may also have access to multiple stores within an organization.

Authorization must consider:

- User
- Organization membership
- Role
- Permissions
- Store scope

SelfX platform roles are separate from organization memberships.

Do not model SelfX Support Admins or SelfX Super Admins as members of a fake
or internal merchant organization.

Organization/store roles include:

- ORGANIZATION_OWNER
- ORGANIZATION_ADMIN
- ORGANIZATION_STAFF
- STORE_OWNER
- STORE_MANAGER
- STORE_STAFF
- KIOSK_OPERATOR

SelfX platform roles include:

- SELFX_SUPPORT_ADMIN
- SELFX_SUPER_ADMIN

Platform authorization and organization/store authorization are separate
concerns.

Initial organization/store RBAC must be permission-driven. Do not scatter
role-name checks such as `role === "ADMIN"` through controllers. Centralize
permission resolution from user, active organization membership, role and store
scope.

Do not place trusted organization/store authorization state in staff JWTs. Staff
access JWTs remain primarily user/session identity. Organization and store
authorization must be validated server-side from explicit resource routes and
database state.

Store scope must explicitly distinguish all-store access from selected-store
access. An empty selected-store scope must never be interpreted as all stores.

An organization must never lose its final active `ORGANIZATION_OWNER` through
normal membership mutation. Non-owner administrators cannot grant
`ORGANIZATION_OWNER`, and ownership transfer requires an explicit controlled
operation.

---

## 6. Staff

Organizations and stores may manage staff according to their authorized scope.

Store administrators must not automatically access other stores.

---

## 7. Customer Accounts

Customers may use basic Virtual Try-On anonymously.

A customer account is required to save and later access Try-On history.

Customer accounts are SelfX-wide rather than permanently tied to a single merchant.

Merchant data isolation must still be preserved.

---

## 8. Customer Images

Customer photographs are sensitive information.

Follow the approved PRD privacy and retention rules.

Do not introduce indefinite or permanent customer-image storage unless
explicitly approved.

Do not expose sensitive images through unrestricted public URLs.

Customer consent must have a durable record where required for audit, legal or
operational needs. A timestamp on a Try-On session is not sufficient as the
long-term consent design.

Customer-sensitive assets must have explicit ownership or an explicit linked
business resource from which authorization can be derived. Store Manager access
to generated results must never imply access to original customer photographs.

Customer person images and physical customer-session garment captures expire no
later than seven days from successful upload/storage creation. Generated Try-On
results expire no later than seven days from successful result creation/storage.
Derived sensitive provider inputs inherit an equal or shorter retention period.
Product/catalog garment assets are not subject to this seven-day customer-image
retention rule.

---

## 9. Kiosks

Kiosks authenticate as devices.

Do not use employee credentials as permanent kiosk authentication.

Every managed kiosk belongs to an organization and store.

---

## 10. Inventory Boundary

SelfX is not intended to become a full POS or inventory-management platform.

Only implement product/catalog functionality required for Virtual Try-On and
approved integrations.

---

## 11. SelfX Administration

SelfX must support controlled customer support and impersonation.

Impersonation must never expose:

- Customer passwords
- AI provider credentials
- Integration secrets

Sensitive impersonation actions must remain attributable to the actual
SelfX administrator.

---

# Development Rules

Before implementing a feature:

1. Read the relevant project documents.
2. Inspect the existing implementation.
3. Understand current behavior.
4. Identify applicable requirements.
5. Identify affected modules/files.
6. Consider tenant, authorization, API and persistence implications.
7. Make the smallest coherent change required.
8. Add or update relevant tests.
9. Run appropriate validation.
10. Report what changed and how it was verified.

---

# Architecture Discipline

Prefer a maintainable modular architecture.

Do not introduce microservices without an approved architectural reason.

Do not duplicate backend business logic for:

- Kiosk
- Mobile
- Shopify
- WooCommerce
- Public API

where shared SelfX services should be used.

Do not expose server-side secrets through frontend environment variables.

Do not trust organization IDs, store IDs, roles or permissions supplied
by clients without server-side authorization.

Validate external input.

Use explicit contracts and types.

## Web UI Architecture

shadcn/ui is the primary SelfX web UI and component framework.

The approved web UI hierarchy is:

SelfX application UI
→ `@selfx/ui`
→ shadcn/ui primitives
→ centralized SelfX semantic tokens/components/wrappers

`packages/ui` is the shared SelfX web design-system boundary. Reusable React
web UI belongs there.

Frontend applications must consume public `@selfx/ui` exports for shared
components and types. Do not import private `@selfx/ui/selfx/*` source-tree
paths from `frontend/web`.

Mantine or another UI toolkit may be used only when the user explicitly
requests that library. Do not treat Mantine, MUI, Chakra, Ant Design or
another toolkit as equal default choices for new SelfX web work.

Tailwind CSS remains secondary styling infrastructure for simple layout
utilities, existing compatibility and occasional application-specific spacing.
Do not recreate shadcn components with ad hoc Tailwind or create a parallel
Tailwind component system.

Common web UI such as navigation, app shell, controls, forms, cards, user
menus, badges, alerts, loaders, modals, drawers, tabs, tooltips and admin
layouts should be shadcn-first. Custom Try-On, camera and image-processing
experiences remain SelfX-specific components built on the approved UI
architecture.

## CORE VTO-1 Development Lab

The repository includes an internal authenticated development Try-On Lab at
`/app/try-on-lab` and matching versioned API routes under
`/api/v1/try-on-lab/runs`.

This lab intentionally proves the core person-image plus garment-image VTO loop
before Product Catalog and production Try-On infrastructure. It is not the
production customer/kiosk/public API Try-On architecture.

Rules for this lab:

- it must remain guarded by `TRYON_LAB_ENABLED=true` and staff/admin
  authentication;
- it is an internal administrative/development tool and shows an authorized-use
  notice instead of a customer-style consent checkbox;
- customer-facing web, mobile and kiosk flows still require consent before
  camera access, customer photo upload or AI image processing;
- the lab flow is organized as Images, Generate Try-On and Result; normal use
  relies on automatic garment/photo/profile resolution rather than visible
  technical setup controls;
- upload cards should remain compact, with person and garment side-by-side on
  desktop, stacked on mobile, and previews using contained image fitting rather
  than consuming most of the page height;
- completed lab runs should keep the person, garment and generated-result
  comparison, with larger previews available through a SelfX dialog;
- repeated garment testing may preserve the person photo while clearing garment,
  run and garment-quality state; New Try-On clears both images, run state and
  warning overrides;
- OpenCV.js is used only as a browser-side image-quality/preprocessing layer
  and is lazy-loaded from the lab route;
- uploaded-image quality analysis is advisory: blur, exposure, contrast,
  low-resolution and framing concerns are warnings that allow the tester to
  re-upload or proceed anyway;
- technical image validation is separate and remains blocking for invalid
  images, unsupported formats, corrupt/undecodable files, unsafe MIME/signature
  mismatch, hard upload size limits and zero/invalid dimensions;
- OpenCV analysis failure is not automatically an image validation failure. If
  the uploaded image is technically valid but analysis cannot complete, show an
  advisory warning with unavailable metrics instead of fake zero metrics;
- OpenCV does not generate Try-On images, identify people, perform biometrics
  or prove body pose/visibility;
- uploaded body-region and garment-framing guidance is advisory unless a later
  provider or production policy defines a real technical requirement;
- OpenCV's primary future production role is live camera/capture quality
  guidance. Kiosk/live capture may use OpenCV more strictly because SelfX can
  guide the user before taking the photo;
- original upload files remain the provider inputs unless a later approved
  phase changes the media pipeline;
- Try-On Lab multipart requests must keep `personImage` and `garmentImage` as
  binary file fields and encode resolver telemetry as strings. Optional
  resolver metadata such as unavailable confidence or absent body coverage must
  be omitted or sent with the API-supported empty-string representation, never
  as JavaScript `null`, `undefined`, objects, arrays or stringified
  `[object Object]`;
- FASHN remains server-side behind the provider-neutral SelfX adapter;
- CORE VTO-1.2 resolves direct-upload garment intent and garment photo type
  automatically through distinct provider-neutral responsibilities:
  `GarmentInputAnalyzer` analyzes arbitrary uploaded garment references,
  `GenerationPolicyResolver` resolves provider-neutral policy, and provider
  routers/adapters remain separate provider-execution concerns;
- the only active garment source in CORE VTO-1.2 is `DIRECT_UPLOAD`. Future
  source concepts are `SELFX_CATALOG`, `SHOPIFY`, `WOOCOMMERCE` and
  `PUBLIC_API`, where trusted SelfX/catalog or normalized commerce metadata
  will take precedence before optional classifiers or AUTO fallback;
- future store/site/catalog products include SelfX-native catalog products,
  Shopify products synchronized through a future SelfX Shopify integration and
  WooCommerce products synchronized through a future SelfX WooCommerce
  integration. This is a normalization contract only; Shopify/WooCommerce sync
  is not implemented in CORE VTO-1.2;
- MediaPipe/body-coverage analysis is separate from OpenCV quality analysis.
  It may infer no-person/product-like, upper-body model, lower-body model,
  full-body model or unknown framing, but it does not recognize the exact
  garment or perform biometrics;
- direct uploads resolve product-like/no-person and low-confidence/analysis
  failure cases safely to AUTO; upper-body on-model resolves to TOP,
  lower-body on-model resolves to BOTTOM, and full-body on-model prompts one
  focused ambiguity question;
- `FULL_OUTFIT` is a provider-neutral garment intent distinct from
  `ONE_PIECE`; provider-specific handling remains inside provider adapters;
- the Lab retains collapsed internal Advanced settings for authenticated
  development overrides only. Normal customer/kiosk/Public API UX must not
  expose technical garment category, garment photo type or generation-profile
  controls;
- CORE VTO-1.2 may expose safe current-run telemetry in the lab response and UI:
  SelfX run ID, channel, provider display metadata, model/profile, garment
  inputs, resolution sources, analysis confidence/body coverage where
  available, disambiguation state, timestamps, elapsed time, status, stable
  failure code, quality warning codes and quality override state;
- technical provider/model/resolution telemetry in the Lab UI should be
  collapsed under diagnostics by default so the result comparison remains the
  primary post-generation experience;
- lab telemetry must not include raw person or garment image contents,
  generated Base64 telemetry fields, provider prediction IDs, API keys,
  Authorization headers, stack traces or other secrets;
- audit logs are not general analytics storage, and durable TryOnRun,
  ProviderAttempt and telemetry persistence remains deferred to the approved
  production Try-On orchestration/storage phase;
- temporary Base64/provider transport and the in-memory bounded TTL run
registry must be replaced by durable assets, TryOnRun/ProviderAttempt records,
queue/worker orchestration, entitlement/quota checks and retention cleanup in
the approved later phases.

## KIOSK-1 Windows Camera & Capture Foundation

`mobile/kiosk` is a standalone Flutter Windows desktop kiosk application for
the KIOSK-1 camera foundation. It must remain separate from `frontend/web` and
backend services, and Flutter must not be forced into npm workspaces.

KIOSK-1 rules:

- Windows desktop is the initial kiosk target.
- Integrated cameras and external USB/UVC webcams are both modeled as
  `CameraDevice` values behind `CameraService`; do not create separate business
  workflows for integrated versus USB cameras.
- Do not permanently assume camera index `0`. Use the most stable camera
  identifier exposed by the adapter, persist only `preferredCameraId` locally,
  rediscover when the preferred camera is missing, and let the operator select
  another detected camera.
- The current Windows camera adapter uses Flutter `camera` plus
  `camera_windows`, hidden behind `CameraService`.
- `camera_windows` is acceptable for KIOSK-1 preview and still capture, but its
  lack of Windows live image streaming is a documented KIOSK-2 limitation.
  Future KIOSK-2 hardware/provider changes must preserve the application
  abstractions.
- KIOSK-1 screens are limited to `KioskHomeScreen`, `CameraCaptureScreen`,
  `CaptureReviewScreen` and `CameraSettingsScreen`.
- KIOSK-1 uses static framing guidance only. Do not claim automatic body,
  pose, upper/lower/full-body or garment detection in the kiosk UI.
- OpenCV analysis runs only after still capture using `opencv_dart`; live
  OpenCV belongs to KIOSK-2.
- Captured originals remain local and temporary. Preserve the original capture,
  analyze a derived/downscaled copy, clean replaced/session captures where
  practical, and do not commit test photos.
- Quality analysis uses SelfX semantics: `PASS`, `WARNING`, `BLOCKED`.
  Advisory quality warnings can normally proceed; technical invalidity blocks
  use. OpenCV analysis failure must surface as
  `IMAGE_QUALITY_ANALYSIS_UNAVAILABLE` and must not invalidate an otherwise
  valid capture.
- KIOSK-1 must not upload captures, call SelfX Try-On APIs, call FASHN, include
  provider credentials or require `FASHN_API_KEY`.
- Flutter kiosk UI mirrors SelfX design language with Flutter-native
  components. Do not install Mantine, shadcn or React UI packages into Flutter.
- Pose/body-landmark validation, live frame processing, QR handoff, kiosk
  provisioning/device auth, product/catalog flow, durable assets, R2,
  TryOnRun/ProviderAttempt persistence, retention jobs, billing and provider
  execution remain out of scope.

## KIOSK-1.5 Android Primary & Multi-Platform Kiosk Foundation

Android is the primary commercial SelfX kiosk deployment platform because
SelfX rents and operates physical kiosks for stores and organizations. Windows
remains a fully supported secondary kiosk/desktop platform and must not be
deprecated or weakened.

KIOSK-1.5 rules:

- `mobile/kiosk` remains one Flutter kiosk application. Do not create separate
  Android and Windows kiosk apps.
- Kiosk UI/session logic must remain platform-independent and use
  `CameraService`.
- Android uses Flutter `camera` with the endorsed CameraX implementation as
  the initial camera path.
- Windows remains supported through Flutter `camera` plus `camera_windows`.
- Integrated cameras, external cameras and multiple cameras are all modeled as
  `CameraDevice` values. Do not assume camera index `0` or front camera.
- Android USB webcam support depends on whether the selected Android box
  exposes the webcam through CameraX. A dedicated UVC adapter is deferred until
  actual certified hardware testing proves it is required.
- Preferred camera IDs remain local device configuration and should be scoped
  so Android and Windows camera identifiers are not treated as interchangeable.
- External camera orientation calibration is local physical-device
  configuration. Use the shared camera-orientation resolver and operator
  fallback modes Auto, 0, 90, 180 and 270 degrees; do not add per-screen
  preview rotation hacks or remote SaaS camera-orientation configuration in
  this kiosk slice.
- Request only camera permission for kiosk capture. Do not request microphone
  permission unless an approved audio feature exists.
- Android commercial kiosk screens are portrait-first for SelfX's current
  32-inch and 42-inch vertically mounted rental kiosks. Windows remains
  responsive in portrait and landscape desktop/window operation. Fix overflows
  with normal Flutter layout primitives rather than one-resolution or physical
  inch assumptions.
- Android may use immersive/fullscreen presentation for the kiosk foundation,
  but production dedicated-device/lock-task management is a future operational
  milestone.
- OpenCV still-image quality analysis remains after capture only. Continuous
  OpenCV, subject-aware exposure, pose/body landmarks and capture readiness
  remain KIOSK-2.
- Real hardware testing showed whole-frame brightness can pass a strongly
  backlit person when the background is bright. Treat KIOSK-1/KIOSK-1.5
  global brightness as an initial signal only; KIOSK-2 must improve this with
  subject-aware analysis.
- Future broad rental rollout requires kiosk device identity, provisioning,
  store assignment, device authentication, heartbeat/online state, app/version
  reporting, remote configuration, camera health, diagnostics, dedicated-device
  mode and fleet management. Do not implement those in KIOSK-1.5.
- SelfX should certify known-good hardware combinations using a future SelfX
  Certified Kiosk Profile rather than promising every Android box/webcam
  combination works.
- Do not introduce an API Gateway in KIOSK-1.5. Continue with Clients -> SelfX
  NestJS API and re-evaluate gateway/edge API management only when Public API
  commercialization, partner traffic, WAF/edge policy, centralized
  per-client quotas/rate limits, multiple routed backend services or major
  cross-channel API-management complexity justifies it.
- KIOSK-1.5 must not implement FASHN/provider calls, SelfX Try-On upload,
  KIOSK-2 live vision, product/catalog flow, QR handoff, fleet backend,
  device auth, Redis/BullMQ, R2, durable TryOnRun, billing or API Gateway.

## KIOSK-1.6 Assisted Customer Capture Experience

KIOSK-1.6 improves the customer-facing photo capture experience while keeping
the same Android-primary, Windows-supported Flutter kiosk app.

KIOSK-1.6 rules:

- SelfX currently deploys/rents physical kiosks primarily with 32-inch and
  42-inch vertically mounted displays. This is a commercial hardware baseline,
  not a hardcoded Flutter layout size.
- Android commercial kiosk UX is portrait-first. Windows remains fully
  supported and responsive in both portrait and landscape windows.
- Shared kiosk screens must adapt from available logical viewport dimensions
  and aspect ratio. Do not create separate 32-inch and 42-inch implementations.
- Portrait capture composition should prioritize header/status, a large/tall
  live preview reserved for camera/framing overlays, a separate lower
  `CaptureGuidancePanel` for countdown/customer guidance, minimal instruction
  text and lower-region touch actions.
- Normal customer capture shows **Take Photo** and starts an assisted countdown.
  Do not expose an instant customer **Capture Now** control.
- Default countdown duration is 10 seconds. Local operator settings may choose
  only 5, 10 or 15 seconds. Customers do not choose the timer per session.
- Countdown guidance is scripted and time-based. It must not claim person
  position, body coverage, lighting, pose, distance or readiness was detected.
- Countdown, shutter and capture-success sounds are enabled by default and may
  be disabled in local kiosk settings. They require no microphone permission,
  and audio failure must not block capture.
- Capture audio uses the shared `CaptureAudioService` abstraction with local
  offline bundled cues and operator-selectable profiles: Soft, Classic, Digital
  and Minimal. The selected `captureAudioProfile` is local device configuration.
  Customers do not choose sound profiles.
- Capture-success audio must play only after still capture succeeds. If capture
  fails, no success cue or spoken success message may be played.
- KIOSK-1.6.1 uses non-verbal bundled cues for development. Production spoken
  assets such as "Photo captured" must be supplied or recorded before use; do
  not download random audio, use network TTS or include copyrighted audio.
- Assisted capture behavior is common Flutter code shared by Android and
  Windows. Do not create platform-specific countdown flows unless a real native
  difference requires it.
- The capture lifecycle uses explicit client workflow states: preview,
  preparing, countdown, capturing, analyzing, review, photo ready and error.
  This prevents double capture, timer races and unsafe cancellation, and leaves
  a clean insertion point for KIOSK-2 readiness signals.
- Countdown cancellation must immediately return to preview, stop timers and
  prevent any delayed capture.
- After countdown completion the app captures exactly one still image, preserves
  the original local capture, runs existing post-capture OpenCV quality
  analysis and opens Review.
- Review keeps **Retake** and **Use Photo**. Technical invalidity may block;
  quality warnings remain advisory and can still proceed.
- **Use Photo** transitions to a real Photo Ready state. Continue remains only a
  temporary local placeholder until product/catalog/Try-On phases are approved.
- Captures remain local and temporary. Do not upload, persist to a gallery, call
  SelfX Try-On APIs or call FASHN/provider services.
- Current KIOSK-1.x quality limitations remain: whole-frame brightness can miss
  backlit subjects, the app cannot identify the intended customer, detect
  multiple people or determine body coverage. These belong to KIOSK-2 live,
  subject-aware analysis.
- Portrait camera surfaces should remain suitable for future KIOSK-2 overlays
  such as full-body framing, body-region guides, move-back guidance,
  subject-lighting warnings and multi-person warnings, without implementing
  those features in KIOSK-1.6.
- Do not introduce MediaPipe, live OpenCV, automatic readiness, product/catalog
  selection, QR handoff, fleet backend, device auth, Redis/BullMQ, R2, durable
  TryOnRun, billing or API Gateway in KIOSK-1.6.

## KIOSK-2A Live Capture Intelligence Foundation

KIOSK-2A adds on-device live capture intelligence to the existing Android
primary, Windows-supported Flutter kiosk app.

KIOSK-2A rules:

- Android is the first live-analysis platform. Windows keeps the KIOSK-1.6.1
  preview, still capture, countdown, post-capture quality review and local
  temporary capture behavior. Windows live image streaming remains KIOSK-2B.
- Do not remove or weaken Windows support, and do not replace the Windows camera
  backend in KIOSK-2A without a separate KIOSK-2B decision.
- Live camera frames are processed locally on the kiosk. Do not upload live
  video frames, send continuous frames to FASHN/provider services, log frame
  bytes/base64 or persist live frames.
- The customer selects a provider-neutral `CaptureScope` before camera capture:
  TOP, BOTTOM or FULL BODY. CaptureScope affects capture framing/readiness and
  later search/policy space, but it is not the final canonical garment taxonomy.
  FULL BODY must not be collapsed permanently to ONE_PIECE; future resolution may
  still choose ONE_PIECE, FULL_OUTFIT or another canonical garment semantic.
- The camera preview remains for the camera image, subtle scope-aware framing
  overlay and future camera-specific overlays. Dynamic customer guidance remains
  below the camera in `CaptureGuidancePanel`.
- Preview, captured stills, live-analysis rotation metadata and
  TargetSubjectRegion semantics must remain orientation-consistent. Portrait
  kiosk previews must preserve camera aspect ratio with cover/crop behavior
  instead of stretching a landscape camera buffer into a portrait viewport.
- Live analysis targets approximately 3 FPS initially, but this cadence is
  centralized and adaptive for lower-powered Android boxes. Camera preview
  smoothness has priority over analysis frequency.
- Local frame processing uses newest-frame-wins backpressure. Do not queue every
  frame, do not create an unbounded live-frame queue and do not introduce
  Redis/BullMQ/server queues for local frames.
- Use provider/plugin-neutral boundaries: `LiveCameraFrame`,
  `FrameAnalysisScheduler`, semantic pose/image-quality analyzer adapters and
  `CaptureReadinessEngine`. Do not build one giant CameraAIService.
- Pose/landmark output is ephemeral semantic capture assistance only. Do not
  persist raw landmarks, pose histories, biometric identifiers, embeddings or
  customer identity templates.
- Readiness is scope-aware: TOP emphasizes upper-body visibility, BOTTOM
  emphasizes lower-body visibility, and FULL BODY requires suitable shoulders,
  hips, knees and ankles/feet visibility. Do not require ankles for TOP.
- Use a primary-person model. Insignificant background people may be tolerated,
  but a meaningful second person competing in the capture region must block
  READY and show friendly guidance.
- READY requires stability/debounce across several analyzed samples. Do not start
  final 3/2/1 from one lucky frame. If the customer becomes substantially invalid
  during final countdown, cancel/pause capture only after stable semantic invalid
  evidence rather than one noisy sample.
- Use bounded readiness waiting. If readiness is not achieved, show Try Again and
  Capture Anyway. Capture Anyway bypasses readiness/quality warnings only; it
  must not bypass unavailable camera, corrupt capture, decode failure or genuine
  technical failures.
- Live pose/OpenCV/image-quality failures must degrade capture assistance, not
  invalidate the camera. If live frames are unsupported, fall back to KIOSK-1.6
  scripted assisted capture.
- Improve KIOSK-1 whole-frame brightness limitations with subject-aware lighting
  where practical, using primary-person/body-region approximations and
  customer-friendly guidance. Do not display fake physical distance or technical
  CV metrics in customer UI.
- Operator diagnostics may show safe local analysis duration, effective FPS,
  dropped frames, pose latency, image-quality latency and readiness state. Do
  not show raw landmarks, frame bytes or technical confidence values to
  customers.
- Do not add FASHN/provider calls, kiosk SelfX Try-On API upload, product
  catalog flow, QR handoff, fleet backend/device auth, Redis/BullMQ, R2,
  billing, runtime TTS expansion, production spoken voice work or API Gateway in
  KIOSK-2A.

## KIOSK-2C Customer Home, Operator Access & Responsive Settings

KIOSK-2C adds the customer-facing kiosk shell around the existing Android
primary, Windows-supported capture foundation.

KIOSK-2C rules:

- `mobile/kiosk` must start on a customer-facing kiosk home/idle presentation,
  not camera settings, diagnostics or technical test controls.
- The customer flow is Kiosk Home -> Start Try-On -> garment selection/preview
  -> photo source choice -> existing capture/readiness/review/photo-ready flow.
- Camera Settings must not be visible on the home screen.
- Operator access uses a hidden top-left double-tap hotspot that reveals an
  operator icon temporarily, then a 6-digit PIN challenge before settings.
- PIN verification must go through `OperatorAccessVerifier`. Do not hardcode
  production plaintext PINs in widgets, persist plaintext PINs or log PIN input.
- A development/demo verifier may use a derived verifier value only.
- Five failed operator attempts lock operator access for 60 seconds. Customer
  Try-On must remain available during operator lockout.
- A successful PIN unlocks settings only for the current settings visit.
  Leaving settings must re-lock operator access; do not create persistent
  unlock state.
- Local operator settings must be grouped as Camera, Capture, Display,
  Diagnostics and System.
- Settings must remain vertically scrollable/responsive in Android portrait and
  Windows portrait, landscape and narrow desktop windows.
- Idle presentation uses local/offline static or slideshow semantics with an
  offline fallback and a provider-neutral model suitable for future CMS/fleet
  content.
- The bundled SelfX default wallpaper remains the kiosk fallback; SaaS kiosk
  configuration may replace it with validated uploaded or hosted presentation
  images.
- Do not add backend fleet sync, CMS APIs, kiosk provisioning/device auth,
  Product Catalog, QR handoff, SelfX Try-On API upload, FASHN/provider calls,
  migrations, Redis/BullMQ, R2, billing or API Gateway in KIOSK-2C.

## KIOSK-3A Real Kiosk Try-On Generation

KIOSK-3A connects the existing Flutter kiosk capture foundation to real
provider-backed Try-On generation through SelfX. It is a narrow end-to-end
pipeline milestone, not the full managed production kiosk backend.

KIOSK-3A rules:

- Customer flow is Kiosk Home -> Start Try-On -> garment image selection ->
  CaptureScope -> assisted/live capture -> Review/Retake -> SelfX Try-On
  submission -> bounded async polling -> generated result.
- The Flutter kiosk must call only SelfX backend APIs. It must never call FASHN
  or another AI provider directly and must never store `FASHN_API_KEY`.
- Until production kiosk device provisioning/auth exists, any kiosk-to-API
  bridge must be an explicit development bridge, disabled unless configured and
  free of committed secrets.
- KIOSK-3A may use temporary local garment-image input through a native
  picker/preview. Product Catalog, captured garment workflows and
  commerce-synced garment sources remain future work but must fit the
  provider-neutral garment-input abstraction.
- Normal customer-facing kiosk garment selection must use a customer-friendly
  image picker/preview flow for the temporary local garment image. Do not show
  raw filesystem path fields, milestone labels such as KIOSK-3A, or technical
  garment intent/photo-type override controls to customers.
- Until Product Catalog or garment capture is implemented, the temporary
  garment picker keeps provider-neutral garment semantics internally and maps
  those semantics to the existing CaptureScope model before photo-source
  selection.
- Person input uses the full-resolution accepted still. When
  PrimarySubject/TargetSubjectRegion metadata is available, prepare a padded
  target image from the original still; Windows or unsupported live-frame paths
  may fall back to the full frame.
- KIOSK-3A displays the generated provider result directly. Target-region
  compositing and background-person preservation are future work.
- Generation must be asynchronous with bounded polling, customer-safe progress
  and failure messages, and no duplicate paid run creation from ordinary retry
  actions.
- Finish, retake and try-another-garment actions must clear ephemeral customer
  session state appropriately. Do not log image bytes, Base64 payloads, provider
  prediction IDs, provider secrets or raw auth tokens.
- Do not add Organizations, Stores expansion, RBAC expansion, fleet/device
  backend, kiosk pairing, migrations, Redis/BullMQ, R2, billing, QR handoff,
  API Gateway or provider-specific client code in KIOSK-3A.

## KIOSK-4A Device Provisioning & Platform Fleet Foundation

KIOSK-4A introduces production kiosk device provisioning and replaces the
temporary user-access-token bridge as the commercial kiosk authentication path.

KIOSK-4A rules:

- A brand-new or unpaired kiosk must start on the pairing screen, not the
  customer home.
- Pairing codes are backend-generated six-digit numeric strings. Leading zeroes
  are valid; treat codes as strings and validate with `^\d{6}$`.
- Pairing sessions live exactly 8 minutes. Backend `expiresAt` and `serverTime`
  are the source of truth for the kiosk countdown and progress indicator.
- Expired codes are permanently invalid and kiosks automatically request a new
  session/code.
- Store pairing-code digests using dedicated server-only HMAC pepper. Do not
  store plaintext pairing codes when avoidable.
- The kiosk receives a private high-entropy provisioning secret; superadmins see
  or enter only the six-digit code.
- Pairing is one-time and transaction-safe. Successful claim creates/activates a
  `KioskDevice` atomically and cannot be replayed.
- Kiosks belong to the SelfX platform fleet. Assignment scope may be
  `PLATFORM`, `ORGANIZATION` or `STORE`; superadmin users are actors, not kiosk
  owners.
- STORE assignment must validate that the selected store belongs to the selected
  organization.
- Superadmin pairing UI uses **Pair New Kiosk** and must not create abandoned
  placeholder devices.
- KIOSK-4A authorizes SelfX superadmins for fleet pairing, activate,
  deactivate, revoke and soft-delete actions and
  documents future capabilities: `kiosks.view`, `kiosks.pair`,
  `kiosks.update`, `kiosks.assign`, `kiosks.revoke`, `kiosks.delete`,
  `kiosks.configure`.
- Device credentials use dedicated kiosk-device access tokens with
  `typ: "kiosk_device_access"` and revocable/rotatable refresh sessions.
- Do not store device refresh credentials in SharedPreferences/plain files.
  Flutter uses OS-backed secure storage.
- Device JWT claims are minimal. On device requests, reload current device
  status/assignment from the database rather than trusting org/store claims.
- Revoked devices must fail refresh/session/me/heartbeat, clear local device
  credentials and return to pairing.
- Inactive devices must fail device-authenticated operation until reactivated.
  Deleted kiosk devices are soft-deleted from the normal fleet list while audit
  and pairing history remain intact.
- Superadmin browsers must never receive provisioning secrets, device refresh
  credentials or permanent device credentials.
- KIOSK-4A established device identity only. Production device-authenticated
  kiosk Try-On is implemented separately in KIOSK-4B.
- Do not add Product Catalog, CMS wallpaper sync,
  remote commands, OTA updates, deep telemetry, FASHN changes, Redis/BullMQ,
  billing or API Gateway in KIOSK-4A.

## KIOSK-4B Device-Authenticated Production Kiosk Try-On

KIOSK-4B replaces the KIOSK-3A development generation bridge with a commercial
device-authenticated production Try-On path for paired kiosks.

KIOSK-4B rules:

- Normal paired kiosks call `POST /api/v1/kiosk/try-on/runs` and
  `GET /api/v1/kiosk/try-on/runs/:runId` with a device access token.
- Production kiosk Try-On must require `typ: "kiosk_device_access"` and must
  reject human `typ: "access"` tokens.
- Every kiosk Try-On request reloads current `KioskDevice` status and
  assignment from the database. Do not trust organization/store context from
  Flutter or JWT claims.
- Only `ACTIVE` devices may create/read kiosk Try-On runs. `INACTIVE`,
  `REVOKED`, `DELETED` and unpaired devices must fail and the kiosk must return
  to pairing where appropriate.
- `PLATFORM`, `ORGANIZATION` and `STORE` devices are valid. Run context is
  derived server-side from the current device record.
- Internal Try-On Lab and production kiosk Try-On are separate API surfaces.
  `TRYON_LAB_ENABLED` gates only `/api/v1/try-on-lab/runs`; it must not be
  required for `/api/v1/kiosk/try-on/runs`.
- Both Lab and kiosk production runs must use the shared provider-neutral SelfX
  Try-On execution service and centralized provider adapters. Do not duplicate
  FASHN request construction or place provider logic in Flutter.
- `FASHN_API_KEY` remains server-side on `@selfx/api` only. Flutter must never
  receive provider credentials, provider auth headers or provider prediction
  IDs.
- Kiosk production run creation must include a `clientRequestId`. The same
  device plus the same `clientRequestId` returns the same SelfX run and must
  not submit a second paid provider generation.
- `KioskTryOnRun` persistence stores device ownership, current assignment
  context, idempotency key, safe provider metadata, status/result/error fields
  and expiry. It must not store raw person or garment input bytes.
- A kiosk may read only runs owned by its device context unless a later
  approved administrative result-access surface defines broader semantics.
- Flutter generation uses the existing KIOSK-4A device session controller and
  refresh flow. `SELFX_KIOSK_DEV_ACCESS_TOKEN` is not part of the normal paired
  kiosk generation path.
- Device auth rejection during generation stops polling, clears device auth and
  routes the kiosk back to pairing. Heartbeat remains independent.
- Finish, Retake and Try Another Garment continue to clear customer capture,
  prepared input, run/result and garment state as appropriate without clearing
  the paired device identity.
- Do not add Product Catalog, Organizations management, full RBAC, CMS
  wallpaper sync, checkout, billing, Redis/BullMQ, API Gateway, Shopify,
  WooCommerce, target compositing or fleet telemetry in KIOSK-4B.

## KIOSK-4C Secure Customer Mobile QR Photo Upload

KIOSK-4C adds a secure personal-phone photo upload option to the existing
paired kiosk capture flow. It is only an alternate customer person-photo input
source. Production kiosk Try-On orchestration is KIOSK-4B.

KIOSK-4C rules:

- Customer flow after garment selection resolves the existing CaptureScope
  internally, then offers **Take Photo** and **Use My Phone**.
- **Use My Phone** creates a backend customer upload session for the active
  kiosk device and renders a QR code.
- Bodyless kiosk requests, including customer-upload create/status/cancel and
  consume, must not send `Content-Type: application/json`. Use JSON
  `Content-Type` only when a JSON request body is actually sent.
- The QR URL contains only a high-entropy opaque capability. It must not contain
  kiosk IDs, organization/store IDs, raw object keys, customer data, image URLs,
  provider IDs, auth tokens or secrets.
- Customer upload sessions expire after exactly five minutes. Backend
  `expiresAt/serverTime` drives kiosk countdown and progress.
- The kiosk QR screen must remain responsive in Windows landscape/portrait,
  shorter or narrow Windows windows and Android portrait. QR size is derived
  from available viewport space, and controls must remain reachable.
- Before a valid upload session exists, the kiosk shows a preparation state and
  must not show a fake `00:00` countdown. The countdown appears only after
  backend `expiresAt/serverTime` is available.
- Session creation failures must stop indefinite loading and show a safe retry
  and cancel state. Diagnostics may log endpoint path, HTTP status, safe code
  and duration, but never tokens, capability URLs, QR secrets or image bytes.
- `DEVICE_TOKEN_INVALID` and `DEVICE_TOKEN_EXPIRED` during customer-upload
  device requests use one forced device-session refresh and retry once.
  `DEVICE_UNPAIRED`, `DEVICE_REVOKED`, `DEVICE_DELETED` and `DEVICE_INACTIVE`
  clear invalid device authentication and return to pairing. Non-auth customer
  upload failures must not clear a healthy kiosk pairing.
- Capability plaintext is never stored; store only a digest using a dedicated
  server-only pepper.
- Customer browsers request a short-lived signed object-storage upload URL from
  SelfX, then complete validation through SelfX. Object keys are generated
  server-side only.
- The backend validates content type, signature, size and image dimensions
  before marking an upload `READY`.
- The kiosk polls the device-authenticated session endpoint, previews only a
  short-lived read URL for a `READY` photo, downloads the accepted image into
  temporary local capture storage, marks the session consumed and continues the
  existing generation flow.
- Cancel, expiry, rejection and replacement must clean up stored objects
  best-effort and must not allow a cancelled/expired upload to become ready.
- Expired kiosk QR sessions must stop polling and rotate to a fresh backend
  upload session before displaying a usable QR again.
- The public upload page must not require staff `SessionProvider` auth.
- Device-session diagnostics may report only safe state such as refresh
  credential availability, restoration success/failure code and upload request
  status. They must not log access tokens, refresh tokens, authorization
  headers, capability URLs, signed URLs or image bytes.
- KIOSK-4C does not implement Product Catalog, persistent customer accounts, QR
  result continuation, billing, Redis/BullMQ, API Gateway or provider calls
  from Flutter.

## SELFX-DESIGN-SYSTEM-2 Cross-Application Visual Language

The SelfX primary action and selected-control color is `#FF7119` with white
foreground. Do not scatter this literal through pages or widgets; use the
SelfX web semantic tokens and Flutter kiosk tokens.

Design-system rules:

- Primary buttons use SelfX orange background, white text and orange border.
- Active/selected segmented actions use the same SelfX orange treatment.
- Secondary/inactive and outline buttons use white/light surfaces, dark text
  and semantic neutral borders.
- Danger/destructive actions remain semantically red, not orange.
- Buttons default to premium rounded rectangles around an 8-10px visual radius;
  do not make all buttons pill-shaped.
- shadcn/ui is the default SaaS web component/interaction system. Mantine or
  another web UI toolkit requires an explicit user request or a documented
  temporary migration-safety exception.
- SaaS web uses modern, premium, clean surfaces with restrained borders,
  shadows, spacing and typography.
- Windows/mobile/kiosk no longer use glassmorphism as a SelfX visual direction.
  Prefer solid surfaces, clear neutral borders, restrained shadows and strong
  hierarchy. Wallpaper/slideshow imagery may remain on customer home, but
  controls over imagery must use readable solid surfaces or simple scrims rather
  than blur.
- Flutter kiosk controls use reusable solid SelfX button semantics. Primary
  buttons remain SelfX orange with white text and orange border;
  secondary/inactive buttons remain white/light with dark text and visible
  neutral borders; selected grouped controls use the primary orange/white
  treatment; danger remains red.
- Kiosk application typography uses Manrope for headings and Inter for body,
  buttons and labels: H1 44-52px/700, H2 30-36px/650-700, section headings
  22-26px/600, body 18-20px/400, subtext 16-18px/400, buttons 18-20px/600 and
  small labels 14-16px/500.
- SaaS sidebar navigation uses the shared `@selfx/ui` AppShell/sidebar boundary
  with shadcn sidebar-style composition and Inter-led menu typography.
- Normal customer home must not show implementation labels such as wallpaper
  mode or platform readiness; technical presentation status belongs in
  operator settings or diagnostics.
- Kiosk operator settings use categories Camera, Capture, Display, Audio,
  Diagnostics and System, with human-readable camera labels in normal UI and
  raw hardware IDs only under diagnostics/hardware details.
- Camera previews in operator settings must be bounded, aspect-ratio
  preserving and must not dominate settings controls.
- The requested `#FF7119` plus white text is a product requirement but may need
  an accessible action variant before formal WCAG AA compliance.
- Future Organizations, Stores, Users, Roles, Permissions, Catalog, Kiosks,
  Try-On, Reports, Audit and Settings modules must use the shared SelfX design
  system instead of one-off visual systems.

Future organization white-labeling must map through centralized SelfX semantic
tokens rather than scattered hard-coded styles.

SelfX web pages must use the shared Phase 4 page/layout primitives from
`@selfx/ui` instead of inventing one-off page scaffolds. The approved hierarchy
is shadcn/ui → SelfX semantic tokens → SelfX layout primitives → approved page templates →
business pages. Standard page primitives include `PageContainer`, `PageHeader`,
`PageSection`, `SectionHeader`, `StatGrid`, `StatCard`, `SectionCard`,
`SummaryCard`, `ActionCard`, `TableContainer`, `FilterBar`,
`FormPageContainer`, `FormSection` and `FormActions`.

Approved page width modes are `wide` for dashboards, list pages and admin
workspaces, `medium` for detail/settings pages, and `form` for create/edit
forms. Page padding, section gaps, card padding, card radius, borders and
shadows should come from centralized SelfX semantic tokens and these shared
components. Future pages must avoid arbitrary per-page visual systems, nested
cards as page structure, unnecessary fixed card heights, and unbounded table or
list surfaces without a pagination region.

Critical authorization and tenant boundaries must have tests.

SelfX primary business identifiers use UUIDv7 stored as PostgreSQL native
`uuid` values. The SelfX application layer generates UUIDv7 IDs unless a later
approved implementation decision explicitly chooses a database-side mechanism.
External provider/platform identifiers remain separate, and security tokens are
not UUIDs.

Potentially unbounded collection APIs must be paginated. Default page size is
25, the standard maximum page size is 100, clients may not request unlimited
results, sorting must be deterministic, and filter/search/sort fields must be
allowlisted.

Retry-sensitive mutations must use idempotency where retries could duplicate
expensive, billable, security-sensitive or externally visible work. Idempotency
keys are scoped to the authenticated actor/credential plus operation, request
fingerprints must be checked, conflicts must use stable machine-readable errors,
and idempotency records must have bounded retention.

Audit logging must be introduced incrementally when auditable actions first
appear. Do not leave the audit foundation only for the later support/admin
experience.

Real paid AI provider execution must not happen before a minimal
entitlement/quota decision point exists. The design must support atomic quota
reservation before paid execution, and retries/provider attempts must not
double-count one customer generation.

Early phases must include relevant engineering safeguards such as lint,
typecheck, build validation, migration validation when migrations exist, secrets
discipline, request/correlation IDs when API work begins, basic structured
logging, sensitive endpoint rate limiting, tenant isolation tests, health checks,
and security-aware error handling. Final production hardening remains a later,
deeper operational phase.

---

# Handling Missing Requirements

Do not invent important product behavior when documentation is unclear.

If a requirement is ambiguous or conflicting:

1. Identify the affected requirement/document.
2. Explain the ambiguity.
3. Provide reasonable implementation options.
4. Explain the impact of each option.
5. Wait for a product decision before implementing an irreversible design.

Do not silently modify product requirements.

---

# Implementation Plan Discipline

Once implementation begins, follow `docs/06-IMPLEMENTATION-PLAN.md`.

When assigned a phase:

- Implement that phase and required prerequisites only.
- Do not automatically start later phases.
- Complete required verification.
- Report remaining issues.
- Stop before moving into the next phase unless instructed.

---

# Current Project State

The project has completed the Phase 0 repository and engineering foundation.

The current canonical repository structure is:

- `frontend/web`
- `backend/api`
- `backend/worker`
- `mobile/kiosk`
- `mobile/customer-app`
- `integrations/shopify`
- `integrations/woocommerce`
- `packages/ui`
- `packages/api-client`
- `packages/shared`
- `packages/config`

Phase 1 and later product, database, authentication, tenant, Try-On, provider,
kiosk, integration, and billing functionality must not begin until explicitly
requested and must follow the active implementation plan.
