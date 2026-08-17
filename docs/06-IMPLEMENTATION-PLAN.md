# SelfX Virtual Try-On

## Implementation Plan

**Version:** 1.0  
**Status:** ACTIVE BASELINE  
**Document Type:** Living Document  
**Last Updated:** 2026-08-11  
**Document:** `06-IMPLEMENTATION-PLAN.md`

---

## 1. Purpose

This document defines the recommended implementation order for the SelfX Virtual Try-On platform.

It translates the approved PRD, technical requirements, user journeys, UI/UX flows, and logical database design into practical development phases.

This is a **living implementation roadmap**.

The order, scope, and content of phases may evolve when:

- implementation reveals a better dependency order;
- product requirements change;
- provider capabilities change;
- testing reveals missing requirements;
- infrastructure constraints change;
- security or operational needs require redesign.

Material changes should update this document before or together with implementation.

---

## 2. Implementation Principles

Implementation should follow these rules:

1. Build the smallest coherent foundation first.
2. Do not scaffold every future integration immediately.
3. Do not jump ahead to Shopify, WooCommerce, or mobile before the core platform works.
4. Every database change requires a tracked Prisma migration.
5. Every major API change updates OpenAPI and related tests.
6. Tenant isolation and authorization are required from the first tenant-aware feature.
7. AI provider logic remains behind provider adapters.
8. Long-running Try-On generation remains asynchronous.
9. Every phase ends with tests and verification.
10. Coding agents must stop at the approved phase boundary unless explicitly instructed to continue.
11. Audit infrastructure is introduced incrementally when the first auditable actions appear, not deferred only to the final support/admin phase.
12. Real paid AI provider execution requires a minimal entitlement/quota decision point before provider submission.
13. Early phases include relevant engineering safeguards; final production hardening remains responsible for deeper operational readiness.

---

## 3. Phase Status Model

Each phase may use one of these states:

- `PLANNED`
- `IN_PROGRESS`
- `BLOCKED`
- `COMPLETED`
- `REVISED`

A phase may be revised when requirements change.

Completed production migrations should not be rewritten simply because the implementation plan changes.

---

# 4. Phase 0 — Repository & Engineering Foundation

**Status:** PLANNED

### Goal

Create the technical workspace without implementing business features.

### Implement

- npm workspace root
- Turborepo
- root `build:web` script for dependency-aware production web builds through
  Turborepo
- Node.js runtime configuration
- shared lint/format/typecheck configuration
- initial folder structure:
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
- environment-variable conventions
- `.gitignore`
- local development scripts
- basic README/start instructions

### Do Not Implement Yet

- authentication
- database business tables
- Try-On
- FASHN
- kiosk application
- integrations

### Verification

- `npm install` succeeds
- root lint/typecheck scripts work
- web/api/worker can each start with placeholder health output
- no secrets are committed

### Stop Condition

Repository scaffolding works and no business feature has been started.

---

# 5. Phase 1 — PostgreSQL & Prisma Foundation

**Status:** PLANNED

### Goal

Establish database connectivity and migration discipline.

### Implement

- PostgreSQL connection
- Prisma initialization
- base Prisma configuration
- UUIDv7 primary-ID strategy
- migration workflow
- CI/test database configuration
- first minimal migration

### Initial Tables

Only tables required for the next authentication/tenant phases should be created.

Likely initial entities:

- users
- user_sessions
- platform_role_assignments
- audit_logs foundation where needed for early security actions
- organizations
- organization_memberships
- stores
- membership_store_scopes

Exact ordering may be split across Phase 1 and Phase 3 if implementation benefits from smaller migrations.

### Verification

- clean database can be created from migration history
- `prisma migrate dev` works locally
- `prisma migrate deploy` works against a test/staging database
- UUIDv7 values persist as PostgreSQL native UUIDs
- migration history is reproducible
- UUIDv7 generation is application-layer unless a later approved implementation decision explicitly selects database-side generation

### Stop Condition

Prisma/PostgreSQL foundation is working and tracked migrations are established.

### Phase 1 Implementation Notes

Phase 1 uses `backend/database` as the canonical server-side Prisma workspace package.

The Prisma schema and tracked migration history live under:

```text
backend/database/prisma
```

UUIDv7 generation is application-layer. The selected Phase 1 implementation is the npm `uuid` package, wrapped by `backend/database/src/uuid.ts`, with primary IDs stored as PostgreSQL native `uuid` columns and no database-side UUID default.

Root database workflow scripts:

- `npm run db:validate`
- `npm run db:generate`
- `npm run db:migrate:dev`
- `npm run db:migrate:deploy`
- `npm run db:migrate:status`
- `npm run db:test:uuid`

---

# 6. Phase 2 — Staff/Admin Authentication & Sessions

**Status:** PLANNED

### Goal

Implement secure staff and admin authentication.

### Implement

- email/password login
- Argon2id password hashing
- short-lived JWT access token
- rotating revocable refresh session
- secure browser session flow
- logout
- logout all sessions
- password change/revocation behavior
- rate limiting
- auth audit events using the early audit foundation
- OpenAPI auth documentation

### Database Changes

May require:

- users
- user_sessions
- password/security metadata
- audit_logs if not already present

Create new migrations if not already present.

### Tests

- successful login
- invalid password
- revoked session
- refresh rotation
- refresh reuse detection where implemented
- disabled user
- logout
- session expiry

### Stop Condition

A user can authenticate securely and sessions can be revoked without implementing organization authorization yet.

---

# 7. Phase 3 — Organizations, Stores, Memberships & RBAC

**Status:** PLANNED

### Goal

Implement SelfX multi-tenancy and authorization boundaries.

### Implement

- organization registration/onboarding submission flow
- pending organization shell creation where needed
- organization application review lifecycle
- explicit platform approval/rejection/activation flow
- organization CRUD for ACTIVE organizations and platform-authorized review contexts
- store CRUD
- organization membership
- predefined roles
- permission-driven RBAC with centralized permission resolution/guards
- explicit store scopes using ALL_STORES versus SELECTED_STORES semantics
- separate SelfX platform role assignment handling
- active organization context as UI/application context only, not a trusted JWT security boundary
- explicit organization/store resource routes such as `/api/v1/organizations/:organizationId/...` and `/api/v1/organizations/:organizationId/stores/:storeId/...`
- server-side permission guards
- tenant-aware query patterns
- platform permissions for SelfX admins
- owner invariants for final active ORGANIZATION_OWNER protection
- normal tenant guard requiring organization status ACTIVE
- pending initial-owner membership activation on organization activation
- audit events for membership, role and store-scope changes

### Organization Onboarding Baseline

Registration is not activation.

Phase 3 must not implement `POST /organizations` or an equivalent registration endpoint as immediate creation of an `ACTIVE` organization with unrestricted owner access.

A registration may create:

- an organization shell with status `PENDING_ACTIVATION`;
- an `organization_applications` record;
- an intended initial `ORGANIZATION_OWNER` membership with status `PENDING_ACTIVATION`.

Application statuses:

- DRAFT
- SUBMITTED
- UNDER_REVIEW
- NEEDS_INFORMATION
- APPROVED
- REJECTED

Organization operational statuses:

- PENDING_ACTIVATION
- ACTIVE
- SUSPENDED
- ARCHIVED

An approved application may still leave the organization in `PENDING_ACTIVATION` while commercial, payment, document, verification or contract prerequisites remain.

Activation requirements must be configurable/evolving and must not be hard-coded to one universal checklist.

Phase 3 may support manual activation eligibility confirmation by an authorized SelfX platform administrator.

Phase 3 must not implement billing/payment processing or document uploads.

Platform review/approval endpoints must be separate from merchant tenant endpoints and protected by centralized platform permissions such as:

- ORGANIZATION_APPLICATION_REVIEW
- ORGANIZATION_APPLICATION_APPROVE
- ORGANIZATION_APPLICATION_REJECT
- ORGANIZATION_ACTIVATE
- ORGANIZATION_SUSPEND

Normal organization/store management APIs operate only on `ACTIVE` organizations unless an explicit onboarding/status or platform-review route says otherwise.

### Initial Role and Permission Baseline

Phase 3 implements the predefined organization/store roles:

- ORGANIZATION_OWNER
- ORGANIZATION_ADMIN
- ORGANIZATION_STAFF
- STORE_OWNER
- STORE_MANAGER
- STORE_STAFF
- KIOSK_OPERATOR

SelfX platform roles remain separate:

- SELFX_SUPPORT_ADMIN
- SELFX_SUPER_ADMIN

Platform roles must not be represented as merchant organization memberships.

First production `SELFX_SUPER_ADMIN` initialization uses a dedicated manual
operator bootstrap command for an empty production user database. Existing
development bootstrap scripts remain non-production only. The production
bootstrap requires `NODE_ENV=production`,
`SELFX_PRODUCTION_BOOTSTRAP_ENABLED=true`,
`SELFX_PRODUCTION_BOOTSTRAP_CONFIRM=CREATE_FIRST_SUPER_ADMIN`, dedicated admin
email/password/display-name inputs, standard email normalization and
`PasswordService` hashing. User creation and active platform role assignment
must happen atomically under a transaction-scoped advisory lock, with safe retry
only for the exact already-initialized admin. No public endpoint, signup route,
direct SQL workaround, schema migration, startup seed or demo production
account is introduced.

Permission baseline:

- ORGANIZATION_OWNER can read/update the organization, manage all stores, view memberships, invite/update staff, assign organization/store roles, change store scopes, suspend/reactivate staff and perform ownership-level actions.
- ORGANIZATION_ADMIN can read the organization, update normal organization settings, manage all stores, view memberships, invite staff, update normal staff memberships, assign non-owner roles, change store scopes and suspend/reactivate non-owner staff.
- ORGANIZATION_ADMIN cannot grant ORGANIZATION_OWNER, remove or demote the final active ORGANIZATION_OWNER, or perform ownership-transfer actions unless explicitly approved later.
- ORGANIZATION_STAFF can read permitted organization information and stores permitted by scope rules, with no organization, store-creation/deletion or membership administration.
- STORE_OWNER can read required organization information, manage assigned stores and read staff relevant to assigned stores, with no organization-wide administration, unrelated-store management or ownership-level organization actions.
- STORE_MANAGER can read required organization information, manage assigned stores and read staff relevant to assigned stores, with no organization-wide administration, unrelated-store management or organization membership administration.
- STORE_STAFF can read assigned-store information needed for operation, with no organization, store or membership administration.
- KIOSK_OPERATOR has only minimal staff-facing access required for assigned kiosk/store workflows, assigned-store scope only, and no organization or staff administration.

Future product, kiosk, analytics, integration and billing permissions may be added when those domains are implemented. Custom merchant roles remain out of scope.

Owner invariants:

- an organization must never lose its final active ORGANIZATION_OWNER through normal membership mutation;
- non-owner administrators cannot grant ORGANIZATION_OWNER;
- ownership transfer must eventually use an explicit controlled operation;
- ordinary role-update endpoints must not silently perform ownership transfer.

### Organization Context Rules

Do not place trusted organization/store authorization state in the staff JWT.

The access JWT remains primarily user/session identity.

For organization-scoped resources, the server must independently validate:

1. authenticated user;
2. active membership;
3. organization identity;
4. organization status is `ACTIVE`;
5. required permission;
6. store belongs to the organization where applicable;
7. store is within the user's authorized scope where applicable.

A frontend active-organization selector is UI state only and is never a security boundary.

A valid membership in a `PENDING_ACTIVATION`, `SUSPENDED` or `ARCHIVED` organization must not provide ordinary operational access.

### Store Scope Representation

Store authorization must be explicit.

Phase 3 must represent membership store access as:

- `ALL_STORES` — membership may access all stores in the organization only when its role/permissions allow all-store access;
- `SELECTED_STORES` — membership access is limited to rows in `membership_store_scopes`.

An empty `SELECTED_STORES` scope means no store access. It must never mean all stores.

### Required Security Tests

Tests must prove:

- user cannot access another organization;
- changing `organizationId` in the URL cannot bypass membership checks;
- changing `storeId` cannot access a store outside the organization;
- changing `storeId` cannot access an unauthorized store within the same organization;
- suspended membership has no tenant access;
- organization-wide scope behaves correctly;
- selected-store scope behaves correctly;
- platform roles do not accidentally become tenant memberships.
- pending organization registration does not expose normal tenant operations;
- approved application with `PENDING_ACTIVATION` organization does not expose normal tenant operations;
- organization activation requires platform permission and activates the intended owner membership as designed.

### Database Changes

Implement/refine:

- organizations
- organization_applications
- organization_application_documents as a logical/status foundation only if included in Phase 3 scope
- organization_memberships
- stores
- membership_store_scopes
- platform_role_assignments if not already present
- audit_logs for registration, review, approval/rejection, activation/suspension, membership/role/store-scope changes and manual activation requirement confirmations

Phase 3 requires a new tracked Prisma migration if the existing schema cannot represent ALL_STORES versus SELECTED_STORES unambiguously.

The current Phase 1 schema uses `membership_store_scopes` rows but does not include an explicit `store_scope_mode`, so Phase 3 must add this representation through a new migration. Do not edit the already-applied Phase 1 migration.

Phase 3 also requires a new tracked Prisma migration for onboarding/activation state because the current Phase 1 schema does not include `organization_applications`, `PENDING_ACTIVATION` organization status, or `PENDING_ACTIVATION` membership status.

Phase 3A implementation checkpoint:

- migration names: `20260811000001_phase_3a_enum_preparation` and `20260811000002_phase_3a_organization_onboarding`;
- API module: `backend/api/src/organizations/organizations.module.ts`;
- applicant routes: `/api/v1/organization-applications`;
- platform routes: `/api/v1/platform/organization-applications` and `/api/v1/platform/organizations/:organizationId/activate|suspend`;
- activation requirements table/model: `organization_activation_requirements` / `OrganizationActivationRequirement`;
- ordinary tenant active-organization check: `OrganizationTenantGuardService`.

Phase 3B implementation checkpoint:

- no new Prisma migration was required;
- merchant permission mapping: `backend/api/src/organizations/merchant-permissions.ts`;
- tenant authorization service: `backend/api/src/organizations/tenant-authorization.service.ts`;
- tenant management service: `backend/api/src/organizations/tenant-management.service.ts`;
- normal active-tenant routes are provided by `OrganizationsController`, `StoresController` and `MembershipsController`;
- store archive behavior uses existing `StoreStatus.CLOSED`.

Phase 3C implementation checkpoint:

- migration name: `20260811000003_phase_3c_security_hardening`;
- role/store-scope compatibility is centralized in `backend/api/src/organizations/merchant-permissions.ts` and enforced by `TenantManagementService`;
- store-scoped roles (`STORE_OWNER`, `STORE_MANAGER`, `STORE_STAFF`, `KIOSK_OPERATOR`) require `SELECTED_STORES`; `ORGANIZATION_OWNER` and `ORGANIZATION_ADMIN` require `ALL_STORES`; `ORGANIZATION_STAFF` may use either supported mode;
- membership store-scope requests accept at most 100 `storeIds`; duplicate IDs, cross-organization IDs, and `ALL_STORES` combined with explicit `storeIds` are rejected;
- final active owner demotion/suspension is protected by transaction-scoped PostgreSQL advisory locking and in-transaction validation;
- organization application status transitions use compare-and-set updates so stale concurrent transitions cannot both succeed;
- UUID path params are validated by the shared `SelfxUuidParamPipe`;
- safe Prisma error mapping is handled by `PrismaExceptionFilter`;
- logout revokes refresh sessions; already-issued short-lived access tokens may remain usable until their configured expiry;
- root flat ESLint includes Next.js-specific rules for `frontend/web`.

### Stop Condition

Multi-tenant authorization is working and tested before product/customer/Try-On features are built, including onboarding/application separation, explicit platform activation, owner invariants, permission-driven guards, organization ACTIVE status enforcement, and explicit all-store versus selected-store scope behavior.

---

# 8. Phase 4 — Shared Web Design System & Admin Shell

**Status:** PLANNED

### Goal

Create the reusable UI foundation before building many dashboard pages.

### Implement

- shadcn/ui as the primary SelfX web component system
- Tailwind CSS as secondary utility/layout infrastructure
- Mantine only by explicit user request
- `@selfx/ui`
- centralized SelfX semantic design tokens
- typography
- form conventions
- buttons
- cards
- tables
- dialogs
- status badges
- empty/loading/error states
- responsive shell
- sidebar/top navigation
- organization switcher

### Do Not Build Yet

Full product/kiosk/analytics modules.

### Verification

- shared components render consistently
- responsive navigation works
- permission-aware navigation can be supported

### Stop Condition

The web application has a stable shared SelfX design system and dashboard shell.

### CORE VTO-1 Roadmap Reprioritization

After Phase 4, SelfX intentionally prioritized an internal development
Virtual Try-On Lab before Product Catalog implementation.

CORE VTO-1 implements only:

- authenticated route `/app/try-on-lab`;
- OpenCV.js client-side image-quality preflight;
- person-image plus garment-image local upload;
- SelfX automatic garment/category/photo-type/generation-profile resolution
  after CORE VTO-1.2, with collapsed internal Lab overrides only;
- versioned API routes under `/api/v1/try-on-lab/runs`;
- server-side provider-neutral Try-On adapter boundary;
- FASHN `tryon-v1.6` adapter;
- temporary validated multipart upload and Base64 data URI provider transport;
- bounded TTL in-memory lab run registry.

CORE VTO-1 uploaded-image preflight policy:

- technical image validation is blocking and remains authoritative at the API
  boundary;
- image quality analysis is advisory for uploaded images;
- blur, dark/bright exposure, low contrast, low but technically valid
  resolution, body-region guidance and garment framing concerns are warnings;
- OpenCV analysis failure after technical validation succeeds is an
  `IMAGE_QUALITY_ANALYSIS_UNAVAILABLE` warning, not an image-invalid failure;
- warning confirmation is ephemeral in the lab and lets the tester re-upload or
  proceed anyway;
- future production analytics may retain warning codes and accepted overrides
  when durable TryOnRun persistence is implemented.

CORE VTO-1.1 Lab UX and telemetry foundation checkpoint:

- the internal Lab shows a passive authorized-use notice instead of a
  customer-style consent checkbox;
- customer-facing web, mobile and kiosk consent remains mandatory before
  camera access, customer photo upload or AI processing;
- the Lab page flow is Images -> Generate Try-On -> Result, using the Phase 4
  SelfX page standards;
- upload cards are compact, use contained image previews, sit side-by-side on
  desktop and stack on mobile;
- Generate Try-On is placed in the main workflow, not as a detached
  header action;
- the Result area keeps a responsive Person, Garment and Generated Try-On
  comparison with a larger preview modal;
- Try Another Garment preserves person input and clears garment, garment
  quality and run state; New Try-On clears both images, warning overrides and
  run state;
- the current run response exposes safe provider-neutral telemetry fields:
  SelfX run ID, channel, provider display metadata, model/profile, garment
  category/photo type, timestamps, elapsed time, status, stable failure code,
  quality warning codes and quality override accepted;
- telemetry must not contain raw sensitive images, generated Base64 telemetry
  fields, face/biometric embeddings, API keys, provider Authorization headers,
  internal stack traces or normal-UI provider prediction IDs;
- provider-neutral future telemetry channels are WEB_LAB, WEB_CUSTOMER, KIOSK,
  MOBILE, SHOPIFY, WOOCOMMERCE and PUBLIC_API. Only WEB_LAB is used here;
- audit logs remain separate from analytics, and durable TryOnRun,
  ProviderAttempt and telemetry persistence waits for the production Try-On
  orchestration/storage phase.

CORE VTO-1.2 automatic garment resolution checkpoint:

- normal Lab use no longer requires visible per-run category, garment photo
  type or generation profile selection;
- SelfX resolves direct-upload garment intent and photo type automatically
  through provider-neutral GenerationPolicyResolver rules;
- only `DIRECT_UPLOAD` is active now, while source contracts reserve
  `SELFX_CATALOG`, `SHOPIFY`, `WOOCOMMERCE` and `PUBLIC_API` for later trusted
  metadata sources;
- browser-side GarmentInputAnalyzer may lazy-load MediaPipe Tasks Vision Pose
  Landmarker for on-model body-coverage analysis, separate from OpenCV image
  quality analysis;
- product-only/no-person images resolve to AUTO/AUTO, upper-body on-model to
  TOP/ON_MODEL, lower-body on-model to BOTTOM/ON_MODEL, and full-body on-model
  triggers one ambiguity question;
- FULL_OUTFIT is retained as a provider-neutral intent distinct from
  ONE_PIECE;
- a collapsed internal Advanced settings area remains for authenticated
  development overrides only and records INTERNAL_LAB_OVERRIDE telemetry;
- safe current-run telemetry includes garment source, resolution sources,
  analysis confidence/body coverage and disambiguation state;
- no Product Catalog, commerce sync, live camera/kiosk capture, durable
  TryOnRun/ProviderAttempt persistence, quota/entitlement execution or paid
  provider automation is added in this checkpoint.

CORE VTO-1 does not implement:

- Product Catalog;
- live camera/WebRTC/kiosk capture;
- blocking pose/body landmark validation;
- durable customer assets/R2;
- production TryOnRun or ProviderAttempt persistence;
- durable analytics persistence or production analytics dashboards;
- Redis/BullMQ;
- entitlement/quota reservation;
- usage/billing;
- customer consent/history;
- 7-day media cleanup jobs.

Productionization remains in the approved later phases. CORE VTO-2 is reserved
for body-region/pose validation, and CORE VTO-3 is reserved for durable assets,
queueing, retention and production Try-On infrastructure.

### KIOSK-1 Reprioritized Implementation Slice

After CORE VTO-1 through CORE VTO-1.2 verified real provider generation,
SelfX approved a narrow kiosk hardware foundation before the full managed
kiosk backend and production kiosk Try-On flow.

KIOSK-1 implements only:

- standalone Flutter Windows desktop app in `mobile/kiosk`;
- `CameraService` abstraction with `CameraDevice`, `CameraCapabilities`,
  `CameraState`, `CameraCaptureResult` and `CameraFailure`;
- Windows camera adapter using Flutter `camera` plus `camera_windows`;
- camera enumeration, preferred camera restoration, operator camera selection,
  initialization, preview, still capture, rediscovery and recoverable failure
  states;
- local `preferredCameraId` persistence only;
- `KioskHomeScreen`, `CameraCaptureScreen`, `CaptureReviewScreen` and
  `CameraSettingsScreen`;
- temporary local capture lifecycle and cleanup on replacement/session reset
  where practical;
- still-image-only `opencv_dart` quality analysis after capture with
  versioned thresholds and SelfX `PASS`/`WARNING`/`BLOCKED` semantics;
- tests using fake camera and analyzer services so CI/automated checks do not
  require physical camera hardware.

KIOSK-1 explicitly does not implement:

- FASHN or any direct AI-provider connection;
- SelfX Try-On API upload/submission;
- product/catalog flow;
- customer consent production flow;
- live frame OpenCV;
- pose/body-landmark validation;
- QR handoff;
- kiosk provisioning/device auth/heartbeat;
- server-side camera settings;
- durable assets, R2, TryOnRun/ProviderAttempt, retention jobs, billing or
  payments.

KIOSK-1 dependency notes:

- Flutter SDK verified from local metadata as `3.44.1`, Dart `3.12.1`.
- `camera_windows 0.2.6+4` is selected for KIOSK-1 reliability and official
  Flutter ownership. It does not expose Windows live frame streaming.
- `opencv_dart 2.2.1+4` is selected for Windows still-image quality analysis
  and is compatible with Dart `3.12.1`.
- KIOSK-2 must preserve the camera/application abstraction and may replace the
  camera adapter to support sampled live frames for OpenCV and body-landmark
  readiness.

### KIOSK-1.5 Android Primary & Multi-Platform Hardening Slice

After KIOSK-1 verified Windows camera preview/capture with real hardware,
SelfX approved Android as the primary commercial kiosk deployment platform
while keeping Windows fully supported.

KIOSK-1.5 implements only:

- Android runner/build foundation in the existing `mobile/kiosk` Flutter app;
- Android camera permission for still-image capture, without microphone
  permission;
- Flutter `camera` Android CameraX path for enumeration, preview and still
  capture;
- continued Windows support through `camera_windows`;
- platform-neutral camera service wiring so Android/Windows camera details do
  not leak into kiosk screens;
- platform-scoped local `preferredCameraId` persistence;
- responsive hardening for Camera Capture, Capture Review and Camera Settings;
- Android portrait-first commercial kiosk presentation for SelfX's current
  32-inch and 42-inch vertically mounted rental kiosks, while Windows remains
  responsive in portrait and landscape windows;
- Android immersive/fullscreen foundation for kiosk presentation without
  production lock-task/device-owner provisioning;
- documentation for Android hardware testing, USB webcam uncertainty,
  hardware certification and future fleet operations.

KIOSK-1.5 explicitly does not implement:

- KIOSK-2 live frame analysis, MediaPipe pose or subject-aware exposure;
- direct FASHN/provider calls or SelfX Try-On API upload;
- product/catalog, QR handoff, kiosk provisioning, device authentication,
  heartbeat backend, remote fleet control or custom DPC/EMM;
- API Gateway, Redis/BullMQ, R2, durable TryOnRun, retention jobs, billing or
  production signing keys.

Future required milestone before broad SelfX kiosk rental rollout:

- kiosk device identity and provisioning;
- organization/store assignment;
- device authentication and token renewal;
- heartbeat/online state;
- app/version reporting;
- remote configuration;
- camera health and diagnostics;
- controlled dedicated-device/lock-task operations;
- fleet management and remote support workflows;
- SelfX Certified Kiosk Profile for known-good Android box/display/camera/APK
  combinations.

API Gateway remains intentionally deferred. Continue with Clients -> SelfX
NestJS API until Public API commercialization, major partner/commerce traffic,
centralized edge policy/rate-limit needs, independently routed backend services
or significant cross-channel API-management complexity justify adding one.
Application tenant authorization remains in SelfX even if a gateway is later
introduced.

### KIOSK-1.6 Assisted Customer Capture Slice

KIOSK-1.6 improves only the shared Flutter kiosk customer capture experience.

Implemented scope:

- explicit client capture workflow states: preview, preparing, countdown,
  capturing, analyzing, review, photo ready and error;
- portrait-first Android commercial presentation using shared adaptive layouts
  based on logical viewport dimensions/aspect ratio rather than physical inch
  sizes;
- customer **Take Photo** starts a countdown, with instant customer
  **Capture Now** removed;
- countdown duration is a local operator preference with allowed values 5, 10
  and 15 seconds, defaulting to 10 seconds;
- countdown/shutter/capture-success sounds are enabled by default, locally
  configurable off, output-only and non-blocking if playback fails;
- scripted countdown guidance appears outside the live preview in
  `CaptureGuidancePanel`, with large countdown number, final-three emphasis,
  lightweight animation and large **Cancel** action;
- camera preview remains reserved for the customer image, static framing guide
  and future camera-specific KIOSK-2 overlays;
- capture audio uses `CaptureAudioService` with local bundled offline profiles:
  Soft, Classic, Digital and Minimal. The selected profile is stored locally as
  `captureAudioProfile`, and customers do not choose it per capture session;
- capture-success audio plays only after still capture succeeds, and failure to
  play audio never changes the capture result;
- portrait capture, review, photo ready and settings screens stack content
  vertically for 32-inch/42-inch-style mounted displays, while wide Windows
  windows may retain side-by-side layouts;
- cancellation stops timers, invalidates the active countdown and prevents
  delayed capture;
- countdown completion captures exactly one still image and runs the existing
  post-capture OpenCV still-image analysis;
- Review keeps **Retake** and **Use Photo** with advisory quality warnings and
  blocking technical invalidity;
- **Use Photo** opens Photo Ready, while **Continue** remains a temporary local
  placeholder for a later product/catalog/Try-On phase;
- captures remain local and temporary, with cleanup on retake, replacement and
  session reset where practical.

KIOSK-1.6 explicitly does not implement:

- MediaPipe, live OpenCV, automatic readiness, person detection,
  multiple-person detection, body coverage, subject-aware exposure, distance
  estimation or pose stability;
- SelfX Try-On API upload, FASHN/provider calls, product/catalog selection,
  QR handoff, fleet backend, device auth, Redis/BullMQ, R2, durable TryOnRun,
  billing or API Gateway.

Verification for this slice should be proportional: format/analyze affected
Flutter source, run targeted kiosk tests for countdown cancellation,
single-capture behavior and local settings, and manually exercise the Windows
USB webcam flow when hardware/GUI access is available. Android runtime
verification must be reported as pending unless real Android hardware is
actually exercised.

KIOSK-1.6.1 adds only the capture guidance layout/audio correction. It does not
add KIOSK-2 live vision, provider calls, Try-On upload, product/catalog flow,
fleet backend or database/server changes.

### KIOSK-2A Live Capture Intelligence Slice

KIOSK-2A introduces on-device live capture readiness for Android while keeping
Windows fully supported through the KIOSK-1.6.1 scripted/still-capture path.

Implemented scope:

- customer CaptureScope selection before camera capture: TOP, BOTTOM and FULL
  BODY;
- CaptureScope remains session/local framing intent, not final garment taxonomy.
  FULL BODY may later resolve to ONE_PIECE, FULL_OUTFIT or another canonical
  garment semantic;
- SelfX-owned live frame abstraction with frame dimensions, timestamp, rotation,
  pixel format and plane metadata;
- Android live-frame implementation using Flutter `camera`/CameraX image
  streams where supported;
- Windows KIOSK-2B preparation only: `camera_windows` remains unchanged because
  it does not expose live image streams;
- `FrameAnalysisScheduler` with centralized target cadence of about 3 FPS,
  newest-frame-wins backpressure, stale-frame dropping and adaptive slowdown;
- semantic analyzer boundaries for pose/person observations and live image
  quality;
- `PrimarySubjectResolver` with provider-neutral PrimarySubject selection,
  visual prominence scoring, normalized TargetSubjectRegion construction and
  ephemeral subject locking;
- active Android ML Kit pose semantics are single tracked/prominent pose only
  with no reliable multi-person awareness. Do not claim background-bystander or
  meaningful-second-person blocking in the ML Kit path;
- `CaptureReadinessEngine` with scope-aware body coverage, locked
  PrimarySubject readiness, stability/debounce and bounded timeout;
- customer guidance stays in `CaptureGuidancePanel` below/beside the preview;
- preview contains the camera image plus subtle scope-aware framing overlay;
- subject-aware live lighting guidance improves on whole-frame brightness where
  practical using the PrimarySubject/TargetSubjectRegion;
- analyzer/live-frame failures degrade to partial/scripted capture rather than
  invalidating the camera;
- timeout exposes **Try Again** and **Capture Anyway**;
- **Capture Anyway** bypasses readiness/quality warnings only, not camera,
  capture, corrupt image or decode technical failures;
- local operator diagnostics for target/effective FPS, dropped frames and
  analyzer latency, PrimarySubject lock state, visual prominence, normalized
  target region, tracking age, analyzer mode and unsupported multi-person
  awareness without raw frame or landmark data;
- BOTTOM scope keeps enough face/full-person framing for current ML Kit pose
  continuity; it does not crop the live camera to legs only;
- full-resolution original stills remain preserved. KIOSK-2A.1 records only
  local ephemeral CaptureScope, PrimarySubject and normalized TargetSubjectRegion
  semantics for future target-only preparation.

KIOSK-2A explicitly does not implement:

- FASHN/provider calls, SelfX Try-On API upload, product/catalog selection, QR
  handoff, fleet backend, device auth, Redis/BullMQ, R2, billing, production
  spoken voice/TTS expansion or API Gateway;
- MediaPipe replacement, explicit multi-person detection, face/identity
  recognition, biometric persistence, target extraction, provider generation or
  compositing;
- Windows live-frame backend replacement. Stop before KIOSK-2B.

Future KIOSK-3 target-only contract:

```text
Original captured still
        ↓
PrimarySubject / TargetSubjectRegion
        ↓
TargetSubjectExtractor
        ↓
padded target model image
        ↓
SelfX API
        ↓
VTO provider
        ↓
generated target region
        ↓
TargetSubjectCompositor
        ↓
final image
```

SelfX owns target-subject selection. Future generation must dress the selected
customer only and leave unrelated/background people unchanged rather than
relying solely on a provider to guess the intended person.

Verification for this slice should include Dart format, `flutter analyze`,
targeted tests for scheduler/readiness/fallback/Capture Anyway semantics,
`flutter build apk --debug`, and Windows build validation when plugin/shared
configuration changes. Real Android-box + USB-webcam verification remains
pending until the certified hardware is available.

### KIOSK-2C Customer Home, Operator Access and Settings Responsiveness Slice

KIOSK-2C adds the kiosk shell around the existing local capture foundation.

Implemented scope:

- startup/default `mobile/kiosk` UI is the customer-facing home/idle
  presentation;
- local provider-neutral idle presentation model supports static/slideshow
  semantics and an offline fallback;
- bundled SelfX default wallpaper is used as the local fallback until
  organization/kiosk-specific wallpapers are managed from the SaaS dashboard;
- customer **Start Try-On** routes to CaptureScope selection and then the
  existing KIOSK-2A capture/readiness/review/photo-ready flow;
- no visible Camera Settings button on the home;
- hidden top-left double-tap hotspot reveals an operator icon temporarily;
- operator icon opens a 6-digit PIN challenge before settings;
- operator PIN verification is isolated behind `OperatorAccessVerifier`;
- production widgets do not hardcode plaintext PINs, persist PIN input or log
  PIN values;
- failed operator attempts lock operator access for 60 seconds after five
  failures while leaving customer Try-On available;
- leaving settings re-locks operator access;
- Camera Settings is grouped into Camera, Capture, Display, Diagnostics and
  System;
- settings layout scrolls in narrow/portrait Windows and Android kiosk
  viewports and keeps Windows support responsive.

KIOSK-2C explicitly does not implement:

- backend fleet sync, CMS APIs, SaaS dashboard wallpaper management, kiosk
  provisioning/device auth, remote configuration, Product Catalog, QR handoff,
  SelfX Try-On API upload,
  FASHN/provider calls, Redis/BullMQ, R2, billing, migrations or API Gateway.

Verification for this slice should include `flutter pub get`, Dart formatting,
`flutter analyze`, targeted kiosk widget/domain tests for home/operator access
and responsive settings behavior, Android debug APK build when practical, and
Windows build/manual camera validation when hardware and GUI access are
available.

### KIOSK-3A Real End-to-End Kiosk Try-On Generation Slice

KIOSK-3A proves the real kiosk Try-On loop through SelfX without introducing the
full production kiosk backend.

Implemented scope:

- Kiosk Home **Start Try-On** routes to customer-friendly garment image
  selection/preview before photo source choice.
- Provider-neutral kiosk garment input model supports direct local development
  images now and leaves catalog, captured garment and remote asset sources as
  future adapters.
- Normal customer UI does not expose raw local paths, KIOSK milestone labels,
  garment type overrides or photo-style controls. The temporary picker accepts
  supported image files and keeps garment semantics internal.
- Existing CaptureScope, assisted/live capture, PrimarySubject lock metadata,
  Review and Retake behavior are preserved.
- **Use Photo** prepares the full-resolution accepted capture for Try-On. When
  TargetSubjectRegion metadata exists, a padded target image is prepared from
  the original still; unsupported paths use full-frame fallback.
- `KioskTryOnGateway` posts multipart `personImage` and `garmentImage` to the
  SelfX API and polls the existing run until success, failure or timeout.
- The temporary development bridge uses `SELFX_KIOSK_API_BASE_URL` and
  `SELFX_KIOSK_DEV_ACCESS_TOKEN`; it is disabled when either value is missing.
- The kiosk never calls FASHN/provider APIs directly and never stores
  `FASHN_API_KEY`.
- Generation UI displays safe progress and failure states without provider IDs,
  raw HTTP errors, image bytes/Base64 telemetry, stack traces or secrets.
- Result UI displays the generated image directly and supports Try Another
  Garment, Retake Photo and Finish cleanup paths.
- Retry polling for an existing run does not create another paid submission.

KIOSK-3A explicitly does not implement:

- Organizations, Stores expansion, Users/RBAC expansion, Product Catalog,
  physical garment capture, Shopify/WooCommerce source sync, managed kiosk
  provisioning/device auth, fleet heartbeat/configuration, QR handoff, target
  compositing, durable TryOnRun persistence, R2 assets, Redis/BullMQ, billing,
  migrations, API Gateway or backend provider changes.

Verification for this slice should include `flutter pub get`, focused Dart
formatting where practical, `flutter analyze`, targeted kiosk pipeline tests and
existing kiosk camera/home tests. Automated tests must use fake gateways and
must not call real providers. Manual validation should perform at most one paid
provider generation unless a separate test budget is approved. Platform APK and
Windows release builds are not required for this Dart/UI integration slice.

### KIOSK-4A Device Provisioning and Platform Fleet Slice

KIOSK-4A replaces the temporary kiosk user-token bridge for commercial device
identity. Production Try-On generation is connected by KIOSK-4B.

Implemented scope:

- `KioskDevice`, `KioskPairingSession` and `KioskDeviceSession` persistence
  models and migration;
- backend-generated six-digit numeric pairing codes with leading-zero support;
- HMAC pairing-code digest using `KIOSK_PAIRING_CODE_PEPPER`;
- exact `KIOSK_PAIRING_TTL_SECONDS=480` expiry;
- private provisioning secret for kiosk polling and one-time provisioning
  grant;
- anonymous controlled provisioning session create/status endpoints;
- superadmin `/api/v1/admin/kiosks` fleet list, assignment options, pair,
  activate, deactivate, revoke and soft-delete endpoints;
- `PLATFORM`, `ORGANIZATION` and `STORE` assignment validation;
- dedicated kiosk-device access token type `kiosk_device_access`;
- revocable/rotatable kiosk device refresh sessions;
- `session/me` and heartbeat reload current device state from the database;
- kiosk device lifecycle uses `ACTIVE`, `INACTIVE`, `REVOKED` and `DELETED`.
  Only `ACTIVE` devices can authenticate; `DELETED` devices are hidden from the
  normal fleet list while audit history remains;
- Flutter secure storage for device refresh credential and stable random
  installation ID;
- Flutter startup router: no credential -> pairing, valid credential ->
  `session/me` -> customer home, revoked/invalid -> clear and pair;
- pairing screen with six-digit code, backend-time countdown, visual progress
  and automatic code rotation;
- minimum SaaS Kiosks page with Pair New Kiosk modal plus activate,
  deactivate, revoke and delete actions.

KIOSK-4A explicitly does not implement:

- Product Catalog, full Roles/Permissions, Organizations management UI, CMS
  wallpaper sync, remote commands, OTA, analytics/deep telemetry, FASHN changes,
  Shopify, WooCommerce, billing, Redis/BullMQ or API Gateway.

Verification for this slice should include Prisma schema validation, API
typecheck/build, targeted kiosk provisioning/device-auth tests, web typecheck,
Flutter analyze and targeted pairing/startup tests. Platform APK/Windows builds
are not required unless native secure-storage compilation requires separate
platform validation.

Manual verification:

1. Start completely unpaired kiosk.
2. Pairing screen appears.
3. Confirm six numeric digits.
4. Confirm timer begins near 08:00.
5. Confirm visual progress decreases.
6. In Superadmin SaaS open Kiosks.
7. Choose Pair New Kiosk.
8. Enter displayed code.
9. Name kiosk.
10. Choose PLATFORM or organization/store assignment.
11. Pair.
12. Physical kiosk detects approval.
13. Device credentials established.
14. Customer home opens.
15. Restart kiosk.
16. Confirm it restores device identity without re-pairing.
17. Revoke kiosk from Superadmin.
18. Confirm device eventually rejects session and returns to pairing.
19. Confirm new code appears.

### KIOSK-4B Device-Authenticated Production Kiosk Try-On Slice

KIOSK-4B replaces the KIOSK-3A temporary development generation bridge with a
production commercial path for active paired kiosk devices.

Implemented scope:

- production device-authenticated routes:
  `POST /api/v1/kiosk/try-on/runs` and
  `GET /api/v1/kiosk/try-on/runs/:runId`;
- route authentication requires the KIOSK-4A access-token type
  `kiosk_device_access` and rejects human/staff tokens;
- every create/status request reloads current `KioskDevice` status and
  assignment from the database and requires `ACTIVE`;
- `PLATFORM`, `ORGANIZATION` and `STORE` execution context is copied from the
  current device record into the run;
- `KioskTryOnRun` persistence model and migration with device ownership,
  assignment context, required `clientRequestId`, execution status,
  result/error fields and seven-day expiry;
- unique `(kiosk_device_id, client_request_id)` idempotency so retrying the
  same customer generation attempt returns the same SelfX run and does not
  submit another paid provider job;
- production kiosk endpoint works independently of `TRYON_LAB_ENABLED`;
- internal Try-On Lab remains guarded by `TRYON_LAB_ENABLED=true`;
- both Lab and kiosk production paths use the shared provider-neutral
  `TryOnExecutionService` and centralized FASHN adapter;
- Flutter `KioskTryOnGateway` uses `SELFX_KIOSK_API_BASE_URL`, the existing
  `KioskDeviceSessionController` and the device refresh flow instead of
  `SELFX_KIOSK_DEV_ACCESS_TOKEN`;
- revoked/inactive/deleted/unpaired device errors stop generation, clear local
  device auth and route back to pairing;
- customer **Finish** continues to clear customer state while retaining valid
  paired device identity.

KIOSK-4B explicitly does not implement:

- Product Catalog, Organizations management, full RBAC, QR result continuation,
  checkout, billing, Redis/BullMQ, API Gateway, Shopify, WooCommerce, target
  compositing, provider client code in Flutter or broad fleet telemetry.

Verification for this slice should include Prisma schema validation/generation,
API typecheck/build, targeted kiosk production Try-On/idempotency tests,
existing lab gating tests, Flutter analyze and targeted gateway/session tests.
Platform APK and Windows builds are not required because no native platform
configuration changed.

Manual verification:

1. Start a fresh/unpaired kiosk with `SELFX_KIOSK_API_BASE_URL`.
2. Pair it through Superadmin **Kiosks -> Pair New Kiosk**.
3. Confirm customer home opens without a human/staff token.
4. Select one garment.
5. Capture or upload one customer photo.
6. Tap **Use Photo** once.
7. Confirm one `/api/v1/kiosk/try-on/runs` run is created with the device token.
8. Confirm polling reaches generated result through the server-side FASHN
   adapter.
9. Tap **Finish**.
10. Confirm customer capture/result/garment state is cleared and the kiosk
    remains paired.

### KIOSK-4C Secure Customer Mobile QR Photo Upload Slice

KIOSK-4C adds a secure phone-upload person-photo source to the existing paired
kiosk flow. Production kiosk Try-On orchestration is KIOSK-4B.

Implemented scope:

- `KioskCustomerUploadSession` persistence model and tracked migration;
- server-only high-entropy QR capability generation, HMAC digest storage and
  exact `KIOSK_CUSTOMER_UPLOAD_TTL_SECONDS=300` expiry;
- device-authenticated kiosk create/status/cancel/consume upload-session
  endpoints;
- public capability-only status/upload-intent/complete endpoints;
- bodyless customer-upload device requests that send no JSON `Content-Type`
  unless an actual JSON body is present, while multipart requests keep
  client-generated boundaries;
- mobile-upload device auth recovery that refreshes once for
  `DEVICE_TOKEN_INVALID` or `DEVICE_TOKEN_EXPIRED`, retries the original
  request once, routes `DEVICE_UNPAIRED`, `DEVICE_REVOKED`, `DEVICE_DELETED`
  and `DEVICE_INACTIVE` to pairing, and keeps non-auth upload failures in the
  upload retry/cancel flow;
- short-lived signed object-storage PUT/read URLs generated by SelfX only;
- backend image validation for supported MIME type, file signature, byte size
  and dimensions before `READY`;
- public Next.js `/upload/[capability]` page outside the authenticated app
  shell/session provider;
- Flutter kiosk **Use Your Phone** flow with QR display, countdown, polling, ready
  preview, upload-another and use-photo actions;
- Flutter QR reliability behavior: preparation state before valid session,
  countdown only from backend `expiresAt/serverTime`, viewport-derived QR size,
  explicit retry/cancel create-failure UI, safe no-secret diagnostics and QR
  renewal on expiry;
- Flutter photo source choice follows garment selection/preview, with the
  existing CaptureScope resolved internally from provider-neutral garment
  semantics;
- temporary local storage handoff from ready mobile upload into the existing
  capture/generation flow.

KIOSK-4C explicitly does not implement:

- Product Catalog, customer accounts/history, QR result continuation, checkout,
  billing, Redis/BullMQ, API Gateway or provider calls from Flutter.

Verification for this slice should include Prisma validation/generation, API
typecheck/build plus customer-upload service tests, web typecheck/build plus
public upload page tests, `flutter analyze` and targeted kiosk tests around the
photo-source/mobile-upload flow, including compact viewport layout and failure
state tests. APK and Windows builds are not required unless native dependency
behavior specifically requires platform compilation.

### KIOSK-5A Dual Photo Acquisition Slice

KIOSK-5A extends the paired kiosk flow so both garment and model/person photos
can be acquired through either kiosk camera or phone QR upload before one
production Try-On submission.

Implemented scope:

- customer garment scope choice: **Top**, **Bottom** and **Full Outfit**;
- garment acquisition source choice: kiosk camera or phone QR upload;
- garment review with **Choose Another** and **Continue**;
- model/person acquisition source choice: kiosk camera or phone QR upload;
- purpose-bound customer-upload sessions using `MODEL` or `GARMENT`, persisted
  in `kiosk_customer_upload_sessions.purpose`;
- backend consume guard so `GARMENT` sessions cannot be consumed as `MODEL`
  sessions and vice versa;
- customer-acquired garment references map internally to provider-neutral
  garment reference semantics without exposing provider terms in customer UI;
- Finish clears garment, model/person capture, run and result while preserving
  valid paired device identity.

Verification for this slice should include Prisma generation/validation,
customer-upload purpose mismatch tests, API typecheck/build, web public upload
page tests/typecheck/build, `flutter analyze`, targeted kiosk acquisition and
mobile-upload tests, and manual acquisition checks for garment kiosk + model
kiosk, garment phone + model kiosk, garment kiosk + model phone and garment
phone + model phone. Do not run multiple paid provider generations; use at most
one controlled paid smoke generation after acquisition is verified.

### KIOSK-5B Fidelity and Compatibility Slice

Implemented scope:

- garment reference profile resolution so verified person-worn references may
  use ON_MODEL internally, while product/hanger/unknown references use AUTO;
- internal ModelCoverage for accepted model/person photos;
- centralized model/category compatibility: UPPER_BODY supports TOP only,
  LOWER_BODY supports BOTTOM only, FULL_BODY supports TOP, BOTTOM, FULL_OUTFIT
  and ONE_PIECE, and UNKNOWN does not silently assume support;
- Try Another Garment retains compatible model/photo coverage and clears
  garment/run/result/clientRequestId state;
- incompatible retained model/category choices request an updated model photo
  with simple customer guidance before generation;
- backend kiosk Try-On creation refuses known incompatible model/category
  metadata before provider execution;
- category selector selected/inactive visual rules are atomic and centered so
  selected text never becomes invisible.

KIOSK-5B.1 still-image model coverage adds:

- a provider-neutral `ModelCoverageAnalyzer` for downloaded phone model photos;
- Android still-file coverage analysis using the existing ML Kit pose semantics;
- fail-safe Windows/unavailable handling that leaves coverage UNKNOWN;
- no CaptureScope/category-to-coverage mapping for phone uploads;
- no model coverage analysis for garment uploads;
- replacement model uploads clear previous coverage before new analysis;
- TOP/upper-body compatibility follows existing shoulder/hip semantics and does
  not require knees, ankles or feet;
- KIOSK CAMERA FINAL-STILL COVERAGE VERIFICATION DEFERRED.

KIOSK-5B does not implement Product Catalog, Try-On Max migration, another AI
provider, billing, API Gateway, RBAC, Organizations or Windows live pose
pipeline. Try-On Max may later be A/B tested for difficult layered or
fit-sensitive references, but it is not selected automatically in this phase.

Verification should include `flutter analyze`, targeted kiosk compatibility,
acquisition and Try-On tests, targeted backend kiosk Try-On tests, API
typecheck/build and shared package build. No APK or Windows build is required.

### KIOSK-6A SaaS-Controlled Kiosk Configuration

Implemented scope:

- per-device `KioskDeviceConfiguration` persistence with ordered
  `KioskDeviceConfigurationAsset` records and tracked Prisma migration;
- monotonic per-device configuration versions starting from bundled default
  version `1`;
- superadmin `GET`/`PUT`
  `/api/v1/admin/kiosks/:deviceId/configuration` protected by
  `KIOSKS_CONFIGURE`;
- device-authenticated `GET /api/v1/kiosk/configuration`;
- `session/me` and heartbeat version discovery through
  `latestConfigurationVersion` without returning the full configuration body;
- validated display, capture and experience configuration fields;
- validated HTTPS, uploaded object-storage or bundled presentation image
  references;
- SaaS presentation image upload intent API and web upload control for static
  and slideshow kiosk presentation imagery;
- Flutter runtime configuration parsing, non-secret local cache, asset download
  before activation and offline fallback to the last valid cache or bundled
  defaults;
- customer home presentation, capture countdown/sound settings and enabled
  garment intent category buttons use the active runtime configuration;
- operator Display settings show safe remote/cache/fallback sync status.

Explicitly not implemented:

- remote camera preference, pending stable certified hardware identifiers;
- Product Catalog, Shopify/WooCommerce sync, remote reboot/commands, OTA,
  premium audio asset distribution, deep telemetry, billing, Redis/BullMQ,
  API Gateway or provider changes.

Verification should include Prisma validation/generation, targeted backend
configuration tests, web typecheck/build, `flutter analyze` and targeted kiosk
runtime-configuration tests. APK and Windows builds are not required.

### KIOSK-6A.2 Portrait Camera Orientation & External Camera Calibration

Implemented scope:

- shared Flutter kiosk camera-orientation domain with Auto, 0, 90, 180 and
  270 degree modes;
- local operator Camera Settings control for physical camera mount
  calibration, available for connected cameras even when external-camera sensor
  orientation metadata is unavailable or unreliable;
- local persistence through non-sensitive kiosk settings storage;
- central camera-service resolver used by garment and model/person capture;
- aspect-ratio-preserving preview viewport with cover/crop behavior instead of
  fixed 16:9 stretching;
- manual capture normalization for calibrated external cameras with a single
  reported normalization step;
- live-frame rotation metadata and TargetSubjectRegion normalized transforms
  for 0/90/180/270 degree coordinate spaces.

Explicitly not implemented:

- remote/SaaS camera orientation management, Product Catalog, FASHN/provider
  changes, RBAC, Organizations, API Gateway, release APK generation or native
  Android manifest changes.

Verification should include `flutter analyze`, targeted camera orientation
tests, `kiosk_camera_foundation_test.dart` and directly affected
capture/readiness tests. APK build is not required because Android native
configuration did not change.

### SELFX-DESIGN-SYSTEM-2 Premium Cross-Application Design System

Implemented scope:

- semantic web design tokens for SelfX primary `#FF7119`, hover, pressed,
  on-primary, surfaces, borders, text, status, radius and shadows;
- shadcn-compatible CSS variables map primary controls to SelfX orange;
- shadcn-compatible CSS variables aligned so `primary` maps to SelfX orange and
  `primary-foreground` maps to white;
- secondary/inactive button treatment remains light/white with dark text and
  neutral border;
- danger/destructive semantics remain red;
- Flutter kiosk tokens mirror the shared semantics without sharing CSS;
- kiosk primary/elevated/filled buttons use SelfX orange and white text;
- kiosk secondary/outlined buttons use white surface, dark text and neutral
  border;
- kiosk selected grouped controls use the same orange/white selected treatment;
- kiosk operator settings redesigned into Camera, Capture, Display, Audio,
  Diagnostics and System categories with responsive rail/tabs;
- normal camera UI prioritizes human-readable labels while raw hardware IDs
  live under diagnostics/hardware details;
- camera preview is bounded and aspect-ratio preserving;
- SELFX-DESIGN-CLEANUP-1 removes kiosk/Windows glassmorphism in favor of solid
  premium cards/buttons, neutral borders, restrained shadows and readable
  controls over wallpaper/slideshow imagery.

Explicitly not implemented:

- Organizations, Stores, Users, Roles, Permission matrix, RBAC backend changes,
  migrations, kiosk fleet management, device provisioning, CMS wallpaper sync,
  FASHN/provider changes, API Gateway, billing or premium sound asset
  generation.

Verification for this slice should include web UI package typecheck where Node
is available, directly affected web tests if practical, `flutter analyze` and
directly affected kiosk widget tests. Platform APK/Windows builds are not
required because this is a UI/theme-only change.

### Phase 4 / SELFX-UI-MIGRATION-1 Implementation Notes

Phase 4 was revised again by SELFX-UI-MIGRATION-1: shadcn/ui is now the primary
SelfX web UI/component framework. The approved hierarchy is:

```text
SelfX application UI
        ↓
@selfx/ui
        ↓
shadcn/ui primitives
        ↓
SelfX semantic tokens/components/wrappers
```

The current Shadcn-first implementation uses:

- shared shadcn/base UI primitives in `packages/ui/src/components`;
- SelfX shell, state, layout and card components in `packages/ui/src/selfx`;
- semantic CSS tokens in `packages/ui/src/styles/globals.css`;
- `#FF7119` mapped through `--selfx-primary`, with white
  `--selfx-on-primary` foreground;
- orange selected/active button semantics, white/dark/border secondary
  treatment and red destructive semantics.

Tailwind CSS remains installed for simple layout utilities, compatibility and
occasional application-specific spacing. It is not the primary component
system.

shadcn/ui is configured for the current npm-workspace monorepo with:

- app config: `frontend/web/components.json`;
- shared package config: `packages/ui/components.json`;
- shared design tokens and Tailwind entrypoint:
  `packages/ui/src/styles/globals.css`;
- Next PostCSS entrypoint: `frontend/web/postcss.config.mjs`;
- primary shadcn-derived primitives in `packages/ui/src/components`.

The current shadcn primitive set includes:

- Button;
- Input;
- Label;
- Card;
- Badge;
- Avatar;
- DropdownMenu;
- Sheet;
- Dialog;
- Separator;
- Skeleton;
- Tooltip;
- Breadcrumb.
- Alert;
- Textarea;
- Table.

New normal admin UI must use existing SelfX shadcn-based components first.
Mantine or another UI toolkit requires an explicit user request. Mantine
runtime usage and dependencies are retired from current SelfX web/UI source
after the Try-On Lab migration.

SELFX-UI-MIGRATION-1.1 current-screen status:

- `/`, `/login`, authenticated app shell/header/sidebar/account controls,
  `/app/dashboard`, placeholder module routes and organization/access state
  routes and `/app/try-on-lab` use Shadcn-first SelfX components and semantic
  tokens.
- `@selfx/ui` exposes public components and consumer types, including
  `SelfxNavItem`, through the package root. Frontend apps must not import
  private `@selfx/ui/selfx/*` source-tree paths.
- Kiosk screens continue to use Flutter-native SelfX theme semantics; Shadcn is
  not used in Flutter.
- Flutter adds reusable solid SelfX button semantics and applies them to
  customer home, operator reveal, operator PIN and premium CaptureScope
  selection surfaces without changing camera/capture business logic.

Initial authenticated shell routes live under:

```text
frontend/web/app/app
```

The Phase 4 shell includes normal workspace navigation placeholders and state
routes for no active organization, onboarding/pending activation, suspended
organization and forbidden access. These routes do not implement product,
store, staff, kiosk, analytics, integration, billing, Public API or platform
review business workflows.

Phase 4 page/layout standards foundation:

- layout primitives are implemented in `packages/ui/src/selfx/page-layout.tsx`;
- filter composition is implemented in `packages/ui/src/selfx/filter-bar.tsx`;
- card standards are implemented in `packages/ui/src/selfx/summary-card.tsx`;
- standard exports are available from `@selfx/ui`;
- `PageContainer` supports `wide`, `medium` and `form` width modes;
- standard page anatomy is `PageContainer` → `PageHeader` →
  `PageSection`/content;
- approved page archetypes are Dashboard, List, Detail, Form, Settings and
  Workflow pages;
- standard card patterns are `StatCard`, `SectionCard`, `SummaryCard`,
  `ActionCard` and `TableContainer`;
- future list pages should use `FilterBar` and `TableContainer` with explicit
  pagination/footer regions;
- future forms should use `FormPageContainer`, `FormSection` and `FormActions`;
- arbitrary per-page spacing systems, nested cards for page structure and
  generic fixed-height cards are not approved.

Frontend session awareness is implemented in `frontend/web/lib/session.tsx`.
The web app uses the existing Phase 2 staff/admin auth APIs, keeps access
tokens in React memory only, and relies on the existing HttpOnly refresh-cookie
architecture. The active organization selector uses `GET /api/v1/organizations`
for ACTIVE organizations available to the authenticated user and remains UI
state only.

Production web API traffic uses same-origin `/api/v1/*` requests from the
browser. `frontend/web/next.config.ts` owns a Next.js rewrite to the deployed
SelfX API through server-only `SELFX_API_UPSTREAM_URL`; browser code does not
receive this value. In production, removing `NEXT_PUBLIC_API_URL` and
`NEXT_PUBLIC_SELFX_API_BASE_URL` makes `frontend/web/lib/api.ts` use relative
same-origin requests. Local development may keep an explicit public localhost
API URL. The browser-facing wrapper in `frontend/web/lib/api.ts` must use
direct statically analyzable `process.env.NEXT_PUBLIC_API_URL`,
`process.env.NEXT_PUBLIC_SELFX_API_BASE_URL` and `process.env.NODE_ENV`
references rather than passing an indirect env object, while pure resolution
logic remains separately testable. Try-On Lab API helpers use the same routing
semantics and preserve multipart uploads.

`SessionProvider` still refreshes on mount so reload, direct URL and new-tab
entry restore sessions through the HttpOnly refresh cookie. The access token
remains in React memory only. Internal AppShell navigation uses a
provider-neutral navigation callback from `@selfx/web` into `@selfx/ui`; normal
left-clicks use Next.js client routing, while anchor hrefs remain available for
copy link, middle-click and modified-click behavior. This same-origin web proxy
is not an API Gateway, and tenant authorization remains in SelfX API.

---

# 9. Phase 5 — Product & Catalog Domain

**Status:** PLANNED

### Goal

Implement the normalized SelfX garment/product model.

### Implement

- products
- product variants
- product-store availability
- VTO eligibility/configuration
- native product management APIs
- product list/detail web screens
- pagination/filter/search
- source type support

### Database Changes

Likely:

- products
- product_variants
- product_store_availability

### Tests

- tenant isolation
- store availability
- pagination
- bounded collection APIs with default page size 25 and standard maximum page size 100 unless explicitly documented otherwise
- product status/VTO eligibility
- unauthorized modifications

### Stop Condition

Organizations can manage VTO-ready products without Shopify/WooCommerce integration yet.

---

# 10. Phase 6 — Asset Storage & Upload Pipeline

**Status:** PLANNED

### Goal

Add secure image/media handling.

### Implement

- storage abstraction
- Cloudflare R2 adapter
- private bucket configuration
- signed upload URLs
- signed read URLs
- asset metadata
- file-size/type/signature validation
- original/derived asset distinction
- asset ownership invariants
- customer asset expiry metadata

### Database Changes

Implement:

- assets

### Tests

- unauthorized asset access denied
- upload authorization
- invalid file rejected
- customer asset expiry saved correctly
- product asset does not inherit 7-day retention automatically
- arbitrary orphaned sensitive assets cannot be created

### Stop Condition

SelfX can securely upload/store/retrieve product and customer media without Try-On generation.

---

# 11. Phase 7 — Core Try-On Domain

**Status:** PLANNED

### Goal

Create provider-neutral Try-On business entities and APIs.

### Implement

- Try-On sessions
- Try-On records
- canonical statuses
- person/garment/result asset relationships
- Try-On creation validation
- entitlement hook points
- minimal entitlement/quota decision-point design before real paid provider execution
- asynchronous API response
- Try-On status endpoint
- idempotent creation support
- durable consent records

### Database Changes

Implement:

- consent_records
- idempotency_records as needed for retry-sensitive Try-On creation
- tryon_sessions
- tryons

### Do Not Implement Yet

Real FASHN execution.

### Tests

- valid Try-On creation
- anonymous/customer flows
- tenant/store ownership
- idempotent request behavior
- same idempotency key with different fingerprint returns an idempotency conflict
- durable consent record is created without storing raw sensitive content
- invalid asset/product handling

### Stop Condition

SelfX can create and track a provider-neutral queued Try-On without calling an AI provider.

---

# 12. Phase 8 — Redis, BullMQ & Worker Foundation

**Status:** PLANNED

### Goal

Add reliable asynchronous execution.

### Implement

- managed/local Redis configuration
- BullMQ
- worker process
- Try-On orchestration queue
- job retry/backoff
- idempotent worker pattern
- graceful shutdown
- queue health checks
- durable DB/queue reconciliation design

### Tests

- queued job processed
- retryable failure retries
- duplicate job does not duplicate business effects
- worker restart recovery
- queue full/backpressure behavior

### Stop Condition

Background work is reliable before introducing paid AI calls.

---

# 13. Phase 9 — AI Provider Abstraction & FASHN Integration

**Status:** PLANNED

### Goal

Connect the first real VTO provider without coupling SelfX to it.

### Prerequisites

- Core Try-On records and provider-neutral state exist.
- Queue/worker foundation exists.
- A minimal entitlement/quota decision point exists before paid provider submission.
- The design supports atomic reservation before paid provider execution.
- Retries/provider attempts cannot double-count one customer generation.

### Implement

- provider interface
- FASHN adapter
- provider router
- `INTERACTIVE_STANDARD` generation profile
- FASHN v1.6 mapping
- provider attempt records
- provider error normalization
- provider webhook/poll reconciliation
- provider concurrency/rate control
- per-attempt latency/cost metadata
- enforcement of the minimal entitlement/quota gate before real provider execution

### Database Changes

Implement:

- provider_attempts
- entitlement/quota support only as minimally required before paid execution, without implementing the full subscription/billing UI

### Tests

- adapter unit tests with mocks
- provider routing
- retryable vs non-retryable error mapping
- provider-capacity queueing
- one active provider attempt per Try-On
- no client receives provider secrets
- quota/entitlement denial prevents paid provider submission
- provider retries do not double-count a customer generation

### Real Provider Verification

Run a small controlled FASHN smoke test only after mock-based tests pass.

### Stop Condition

One complete provider-neutral Try-On can successfully generate using FASHN.

---

# 14. Phase 10 — Customer Image Retention & Cleanup

**Status:** PLANNED

### Goal

Enforce the approved 7-day customer-image lifecycle.

### Implement

- cleanup worker
- expiry queries
- R2 deletion
- metadata update
- storage lifecycle safety-net configuration
- non-image history preservation

### Tests

- expired customer image deleted
- expired Try-On result deleted
- product garment image not deleted
- cleanup is idempotent
- deleted image cannot be accessed afterward

### Stop Condition

Customer image retention is automated and verifiable.

---

# 15. Phase 11 — Kiosk Device Backend

**Status:** PLANNED

### Goal

Implement kiosk registration, pairing, device sessions, health, and configuration.

### Implement

- kiosk records
- pairing codes
- device authorization/session
- token renewal/revocation
- heartbeat
- remote configuration
- basic remote commands
- version tracking
- kiosk APIs

### Database Changes

Implement:

- kiosks
- kiosk_pairing_codes
- kiosk_device_sessions
- kiosk_heartbeats
- kiosk_remote_commands

### Tests

- pair
- invalid/expired pairing code
- token renewal
- unpair
- revoked device
- heartbeat
- store/organization isolation

### Stop Condition

A kiosk device can securely pair and maintain a managed SelfX device session.

---

# 16. Phase 12 — Flutter Kiosk Application

**Status:** PLANNED

### Goal

Build the end-to-end kiosk customer Try-On experience.

### Implement

- Flutter kiosk project
- pairing screen
- secure device credential storage
- heartbeat
- remote config
- welcome/idle
- consent
- catalog browser
- customer capture
- physical garment capture
- upload
- queued/processing UI
- Try-On result
- retry/retake
- session cleanup
- offline/degraded behavior
- diagnostics

### Tests

- pairing
- camera flow
- session reset
- network failure
- Try-On recovery
- customer data cleanup
- unpair handling

### Stop Condition

A real kiosk can complete both approved Try-On scenarios safely.

---

# 17. Phase 13 — QR Handoff & Customer Continuation

**Status:** PLANNED

### Goal

Allow kiosk users to continue securely on their phone.

### Implement

- handoff token generation
- handoff validation
- QR rendering
- mobile web continuation page
- product link/details
- optional result display
- token expiry/revocation
- kiosk cleanup after finish

### Database Changes

Implement:

- handoff_tokens

### Tests

- valid token
- expired token
- reused token according to policy
- wrong tenant/context
- no raw customer data in QR

### Stop Condition

Customer can scan a kiosk QR and continue safely to product/merchant information.

---

# 18. Phase 14 — Customer Accounts & Saved History

**Status:** PLANNED

### Goal

Add global SelfX customer identity and saved Try-On history.

### Implement

- customers
- email OTP
- phone OTP
- Google
- Apple
- customer identities
- customer sessions
- anonymous-to-authenticated continuation
- Try-On history
- expired-image placeholder behavior

### Database Changes

Implement:

- customers
- customer_identities
- customer_sessions

### Tests

- each auth method
- secure account linking
- no unsafe automatic merge
- customer sees only their history
- expired images absent after retention window

### Stop Condition

Customers can authenticate and access their permitted SelfX history.

---

# 19. Phase 15 — Organization Web Dashboards

**Status:** PLANNED

### Goal

Complete operational organization/store management UI.

### Implement

- dashboard
- stores
- staff
- products
- kiosks
- Try-On activity
- analytics basics
- permission-aware navigation
- generated result access for authorized Store Managers only
- no original customer photo access for Store Managers

### Tests

- role-specific views
- store scoping
- result-access restrictions
- loading/empty/error states

### Stop Condition

Organization users can operate the core platform from the SelfX web dashboard.

---

# 20. Phase 16 — Usage, Entitlements & SaaS Subscription Layer

**Status:** PLANNED

### Goal

Implement SelfX-owned commercial controls without coupling them to one payment provider.

### Implement

- subscription state
- plan versions
- organization entitlements
- usage ledger
- usage idempotency
- quota reservation
- trial rules
- grace/suspension
- usage dashboard

This phase completes the commercial subscription/plan/billing-facing entitlement model.
It does not remove the requirement for a minimal entitlement/quota gate before paid AI execution in Phase 9.

### Database Changes

Implement:

- subscriptions
- plan_versions
- organization_entitlements
- usage_events
- optional usage aggregates

### Tests

- trial time/usage limits
- quota race conditions
- provider retry does not double-count customer usage
- suspension preserves data

### Stop Condition

SelfX can enforce commercial entitlements and usage independent of Stripe/Razorpay.

---

# 21. Phase 17 — Public API

**Status:** PLANNED

### Goal

Release the first external developer-facing SelfX integration surface.

### Implement

- scoped API keys
- API key creation/revocation
- Public API routes
- upload authorization
- Try-On creation/status
- usage endpoint where approved
- webhook endpoints
- webhook signing/retry/delivery tracking
- public OpenAPI documentation
- sandbox/production-ready credential model

### Database Changes

Implement:

- api_keys
- webhook_endpoints
- webhook_deliveries

### Tests

- scope enforcement
- revoked key
- rate limit
- webhook signatures
- duplicate webhook handling
- API backward compatibility

### Stop Condition

An external organization can integrate VTO without accessing internal admin APIs.

---

# 22. Phase 18 — Shopify Integration

**Status:** PLANNED

### Goal

Integrate SelfX with Shopify while leaving Shopify commerce intact.

### Implement

- installable Shopify app
- authorization/install flow
- integration record
- initial catalog sync
- product/variant mapping
- product webhooks
- reconciliation
- VTO eligibility management
- Theme App Extension
- customer Try-On UI

### Database Changes

Implement/refine:

- integrations
- integration_events
- external_product_mappings

### Tests

- install/uninstall
- product create/update/delete sync
- webhook authenticity
- missed-webhook reconciliation
- merchant tenant isolation
- Shopify checkout remains unchanged

### Stop Condition

A Shopify merchant can install SelfX and enable Try-On on selected products.

---

# 23. Phase 19 — WooCommerce Integration

**Status:** PLANNED

### Goal

Integrate SelfX with WooCommerce using a dedicated plugin.

### Implement

- WordPress/WooCommerce plugin
- SelfX connection flow
- product synchronization
- external mappings
- signed webhook handling
- reconciliation
- VTO eligibility
- storefront Try-On UI

### Tests

- connect/disconnect
- authentication failure
- product synchronization
- webhook signatures
- retry/reconciliation
- WooCommerce checkout remains unchanged

### Stop Condition

A WooCommerce merchant can install the plugin and enable SelfX Try-On.

---

# 24. Phase 20 — Customer Flutter Mobile Application

**Status:** PLANNED

### Goal

Build the dedicated customer mobile experience after core APIs are stable.

### Implement

- Flutter customer app
- customer login
- product browsing where applicable
- Try-On
- image capture/upload
- result
- saved history
- merchant deep-link/product continuation
- secure token storage
- SelfX design language

### Stop Condition

Customers can use SelfX Try-On and history from a personal mobile device.

---

# 25. Phase 21 — SelfX Support, Impersonation & Platform Operations

**Status:** PLANNED

### Goal

Complete controlled operational support tools.

### Implement

- SelfX platform dashboard
- organization support view
- impersonation sessions
- visible impersonation banner
- audit records and audit review UI, building on the earlier audit foundation
- AI provider operational view
- integration health
- system health

### Database Changes

Implement/refine:

- audit_logs
- impersonation_sessions

### Tests

- permission checks
- audit actor/effective context
- impersonation expiry
- secret hiding
- tenant isolation

### Stop Condition

SelfX support can diagnose customer issues safely without bypassing audit/security boundaries.

---

# 26. Phase 22 — Billing Provider Integration

**Status:** PLANNED / OPTIONAL FOR INITIAL SALES

### Goal

Connect a payment processor only when SelfX business operations require automated SaaS billing.

### Possible Providers

- Razorpay
- Stripe
- another approved provider
- manual enterprise billing

### Implement When Needed

- billing-provider adapter
- checkout/subscription creation
- signed billing webhooks
- idempotent provider event handling
- invoice/payment management
- SelfX canonical subscription updates

### Important Boundary

This phase is for **organization → SelfX SaaS billing**.

It is not customer garment checkout.

### Stop Condition

Chosen provider updates SelfX subscription state reliably without becoming the sole entitlement source.

---

# 27. Phase 23 — Production Hardening

**Status:** PLANNED

### Goal

Prepare the system for serious production usage.

### Implement / Validate

- staging/production isolation
- CI/CD
- migration gates
- backup/PITR
- restore test
- health/readiness
- structured logs
- error monitoring
- operational metrics
- provider health
- queue alerts
- rate limits
- security headers
- dependency scanning
- load testing
- query/index review
- N+1 audit
- secret-management review
- customer-retention verification
- rollback procedure

### Stop Condition

Production readiness checklist passes and known P0/P1 security/reliability issues are resolved.

### Boundary

Final production hardening is not the first time basic safeguards appear.
Earlier phases must already include the safeguards relevant to their scope, such as lint, typecheck, build validation, migration validation when migrations exist, secrets discipline, request/correlation IDs when API work begins, basic structured logging, sensitive endpoint rate limiting, tenant isolation tests, health/readiness checks, and security-aware error handling.
This phase focuses on deeper production work such as load/stress testing, backup/restore drills, advanced alerts, capacity planning, rollback validation, query/index tuning at scale, provider failure drills, and full operational readiness review.

### API Readiness Checkpoint

The API maintains separate operational endpoints:

- `/health` is process/application liveness and remains DB-independent.
- `/ready` is core API readiness and currently probes PostgreSQL with a minimal
  connectivity query.
- PostgreSQL readiness failure returns HTTP 503 with sanitized output.
- FASHN, Redis, Shopify, WooCommerce, email and other external dependencies do
  not automatically affect `/ready`; provider/integration health belongs to
  separate diagnostics unless a dependency becomes required for core API
  traffic.
- Railway currently keeps deployment healthchecks on `/health`; `/ready`
  remains the PostgreSQL readiness probe and is not the Railway deployment
  healthcheck path for now.
- Railway production API deployments must listen on Railway's injected `PORT`
  and bind to `0.0.0.0`. `API_PORT` remains the local SelfX development
  override/fallback before the final `3001` default.
- A previous Railway deployment healthcheck failed because the API ignored
  Railway `PORT`, so `/health` could not reach the NestJS process on the port
  Railway expected.
- Railway `@selfx/web` builds should use the root `npm run build:web` command
  instead of `npm run build --workspace=@selfx/web`. The root command lets
  Turborepo build internal workspace dependencies first, including compiling
  `@selfx/shared` to `dist` before Next.js builds `@selfx/web`; `@selfx/ui`
  participates through the workspace graph where applicable.
- The web Railway Start Command remains `npm run start --workspace=@selfx/web`.
  Frontend deployment remains pending until the Railway clean build succeeds
  with the dependency-aware command.
- For production web session recovery, Railway `@selfx/web` must add
  `SELFX_API_UPSTREAM_URL=https://selfxapi-production.up.railway.app` as a
  server-only variable and remove `NEXT_PUBLIC_API_URL` and
  `NEXT_PUBLIC_SELFX_API_BASE_URL` when they point at the backend host.
  Railway `@selfx/api` should keep exact `CORS_ORIGINS` for the web origin,
  keep `COOKIE_SECURE=true`, temporarily leave current cookie SameSite config
  until same-origin proxying is verified, then return `COOKIE_SAME_SITE=lax`
  once login and refresh are proven to use the web origin. Keep `COOKIE_DOMAIN`
  unset. Production verification must confirm login and refresh requests use the
  web origin, no browser request falls back to `http://localhost:3001` or the
  API Railway host, refresh includes a Cookie header and returns HTTP 200,
  sidebar navigation does not reload the document, F5/direct URL/new tab restore
  the session, and logout clears it.
- First production platform administration is initialized manually with
  `npm run production:bootstrap-admin` after the API build exists in the target
  production environment. Operators must temporarily set the required
  production bootstrap variables, run the command once, remove the bootstrap
  gates and temporary credential variables from Railway, apply the variable
  removal as needed, and verify normal frontend login. The command remains safe
  on later attempts because the empty-database invariant and exact-admin retry
  check prevent creating another first admin.

---

# 28. Phase Dependency Summary

Recommended order:

```text
Repository Foundation
        ↓
Database / Prisma
        ↓
Authentication
        ↓
Tenancy / RBAC
        ↓
Design System
        ↓
Products
        ↓
Storage
        ↓
Try-On Domain
        ↓
Minimal Entitlement / Quota Gate
        ↓
Queues / Workers
        ↓
FASHN
        ↓
Retention
        ↓
Kiosk Backend
        ↓
Kiosk App
        ↓
QR Handoff
        ↓
Customer Accounts
        ↓
Organization Dashboard
        ↓
Usage / Entitlements
        ↓
Public API
        ↓
Shopify
        ↓
WooCommerce
        ↓
Mobile App
        ↓
Support / Operations
        ↓
Billing Automation if needed
        ↓
Production Hardening
```

Some later phases may overlap once the foundation is stable, but no phase should violate its dependencies.

---

# 29. Per-Phase Coding Agent Procedure

When Codex is asked to implement a phase, it should:

1. read `AGENTS.md`;
2. read the applicable sections of all six project documents;
3. inspect the existing repository;
4. summarize current state;
5. identify exact files/modules to change;
6. identify database migration needs;
7. identify API/OpenAPI impact;
8. identify tenant/security implications;
9. identify audit/logging implications;
10. identify pagination/idempotency implications for APIs;
11. implement only the approved phase;
12. add/update tests;
13. run lint/typecheck/tests/build as applicable;
14. report completed work;
15. report any unresolved conflicts;
16. stop before the next phase.

Codex must not silently implement future phases.

---

# 30. Migration Procedure During Implementation

For every database-changing phase:

```text
Update logical schema document if needed
        ↓
Update schema.prisma
        ↓
Generate new migration
        ↓
Review migration SQL
        ↓
Apply to local/test DB
        ↓
Run tests
        ↓
Validate clean DB migration history
        ↓
Deploy through controlled migration process
```

Already-applied production migration files should not normally be rewritten.

---

# 31. Change Management

This implementation plan may change.

When requirements change:

1. identify affected phases;
2. update relevant living documents;
3. determine whether completed code/schema needs migration;
4. add or revise implementation tasks;
5. preserve deployed migration history;
6. add regression tests;
7. continue from the revised approved baseline.

A completed phase does not mean its code can never change.

It means the phase's original acceptance criteria were satisfied at that point in time.

---

# 32. Initial Build Priority

The first actual implementation work should focus on:

1. repository scaffolding;
2. database/migration foundation;
3. early audit foundation as soon as auditable actions appear;
4. authentication;
5. multi-tenancy/RBAC;
6. product/storage/Try-On foundations;
7. minimal entitlement/quota gate before paid provider execution;
8. asynchronous worker architecture;
9. first real FASHN generation;
10. kiosk backend and kiosk application.

Shopify, WooCommerce, Public API, and mobile should not block proving the core kiosk Try-On product.

---

# 33. First MVP Completion Target

The first meaningful kiosk MVP should be considered complete when:

- organization/store structure exists;
- staff/admin can manage required store/product/kiosk configuration;
- kiosk can pair securely;
- kiosk can browse/select a garment;
- kiosk can capture a customer;
- kiosk can capture a physical garment where enabled;
- customer consent is recorded;
- Try-On is queued asynchronously;
- FASHN v1.6 generates a result through the SelfX provider layer;
- provider capacity overflow queues safely;
- customer sees the result;
- customer can reuse the same photo for another garment in-session;
- QR handoff works;
- customer session is cleared;
- customer images/results follow the 7-day retention rule;
- usage is measurable;
- tenant isolation tests pass;
- critical logs/health checks exist.

This MVP does not require:

- native customer checkout;
- Shopify;
- WooCommerce;
- customer mobile app;
- Google fallback;
- custom SelfX AI model;
- automated SaaS payment processing.

---

# 34. Status

**Implementation Plan v1.0 — ACTIVE BASELINE**

This is a living roadmap.

It may be revised as the product evolves, but implementation must always follow the latest approved baseline and preserve migration, security, API, and tenant-isolation discipline.
