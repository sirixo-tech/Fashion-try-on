## Document Evolution

This is a living document.

The contents represent the currently approved product/design/technical baseline
and may be updated as implementation, testing, business requirements, provider
capabilities, or operational requirements evolve.

Material changes must:

1. be intentional;
2. remain consistent with related project documents;
3. update affected documentation;
4. include required database migrations/API changes/tests where applicable;
5. not silently invalidate already deployed behavior.

# SelfX Virtual Try-On Platform

## Product Requirements Document — PRD v1.0

**Status:** APPROVED BASELINE
**Product Type:** Multi-Tenant SaaS / AI Virtual Try-On Platform
**Initial Production Channel:** SelfX Retail Kiosks
**Future Channels:** Public API, Mobile, Shopify, WooCommerce, Web SDK and partner integrations

---

# 1. Purpose

SelfX Virtual Try-On is an AI-powered SaaS platform that allows customers to visualize themselves wearing garments before purchasing them.

The platform must support physical retail stores as well as future ecommerce and third-party integrations through one centralized SelfX backend.

SelfX must not be designed as only a kiosk application.

The kiosk is the first customer-facing channel of a broader SaaS platform.

---

# 2. Core Product Scenarios

## PRD-TRYON-001 — Catalog Garment Try-On

A customer must be able to:

1. Upload or capture a photograph of themselves.
2. Select a garment from the permitted retailer catalog.
3. Start Virtual Try-On.
4. Receive an AI-generated image showing themselves wearing the selected garment.

---

## PRD-TRYON-002 — Physical Garment Try-On

Where enabled, a customer must be able to:

1. Upload or capture a photograph of themselves.
2. Capture a photograph of a physical garment.
3. Confirm the garment image.
4. Start Virtual Try-On.
5. Receive an AI-generated image showing themselves wearing the captured garment.

---

# 3. Product Vision

SelfX must act as the central platform for:

- Customer Virtual Try-On
- Organizations
- Stores/branches
- Customers
- Staff
- Roles and access
- Products and garments
- Kiosks
- AI generation
- Usage
- Subscriptions
- Trials
- Analytics
- Integrations
- SelfX administration
- Support
- Auditability

The long-term channel model is:

SelfX Platform
→ Retail Kiosks
→ Public API
→ Mobile Applications
→ Shopify
→ WooCommerce
→ Web SDK / Widget
→ Custom Integrations

All channels must share the same SelfX backend.

---

# 4. Mandatory Architecture Principle

Client applications must communicate with SelfX.

The required logical architecture is:

Customer / Client Application
→ SelfX Platform
→ AI Provider

Direct client-to-AI-provider integration is prohibited.

Examples of clients include:

- Kiosk
- Flutter application
- Shopify application
- WooCommerce plugin
- Web widget
- Public API customer

AI-provider credentials must never be exposed to these clients.

---

# 5. AI Provider Independence

SelfX must not be permanently tied to one AI provider.

The platform may initially use:

- FASHN AI

Future providers may include:

- Google Virtual Try-On
- Other third-party Virtual Try-On providers
- SelfX-hosted AI models

Changing AI providers must not require changes to the client-facing SelfX integrations.

SelfX must be capable of recording which provider/model handled a Virtual Try-On.

Detailed routing, retry, fallback, provider limits and provider API implementation belong in the Technical Requirements & System Design document.

---

# 6. Product Goals

SelfX must:

1. Generate Virtual Try-On images quickly.
2. Produce visually realistic results.
3. Preserve customer identity as accurately as practical.
4. Preserve garment appearance as accurately as practical.
5. Support image upload.
6. Support camera capture.
7. Support catalog garments.
8. Support physical garment capture.
9. Support organizations with one or multiple stores.
10. Support independent retailers.
11. Support staff management.
12. Support role- and scope-based access.
13. Support SelfX Super Administration.
14. Support SelfX customer support.
15. Support controlled impersonation.
16. Support managed kiosk devices.
17. Track AI and customer usage.
18. Track provider cost where available.
19. Support subscriptions and trials.
20. Provide merchant analytics.
21. Support multiple channels through one backend.
22. Support future external API customers.
23. Avoid unnecessary vendor lock-in.
24. Scale into a commercial SaaS platform.

---

# 7. Non-Goals

The initial product does not guarantee:

- Exact physical fit.
- Exact garment sizing.
- Body measurements.
- Exact size recommendations.
- Replacement of physical fitting rooms.
- Replacement of professional fashion photography.
- Live AR Try-On.
- Video Try-On.
- Custom garment generation.
- Full inventory management.
- POS functionality.

These may be considered separately in future releases.

---

# 8. Tenant Model

## PRD-ORG-001 — Organization

An Organization represents a SelfX SaaS customer.

Examples:

- Clothing brand
- Retail chain
- Independent retailer
- Franchise
- Ecommerce business
- Enterprise customer

Each organization is an independent tenant.

Organization A must never gain unauthorized access to Organization B data.

---

## PRD-STORE-001 — Stores / Branches

An organization may contain one or multiple stores.

Example:

Organization
→ Hyderabad Store
→ Tirupati Store
→ Bengaluru Store

Each store belongs to an organization.

Stores may have their own:

- Staff
- Managers
- Kiosks
- Product availability
- Usage
- Analytics
- Settings

---

## PRD-STORE-002 — Independent Retailer

An independent retailer must use the same architecture.

Example:

Independent Retailer
→ Organization
→ One Store

SelfX must not maintain a separate backend architecture for individual store owners.

---

# 9. User Account Model

## PRD-USER-001 — Multi-Organization Membership

A single platform user may belong to multiple organizations.

Example:

User
→ Organization A — Store Manager
→ Organization B — Consultant / Staff

A user account must therefore not be permanently restricted to one organization.

---

## PRD-USER-002 — Multi-Store Membership

Authorized staff may have access to multiple stores within an organization.

Example:

Regional Manager
→ Tirupati
→ Hyderabad
→ Chennai

Other staff may only have access to one store.

Access must respect assigned scope.

---

# 10. Major User Types

SelfX must support at least:

### Customer

Uses Virtual Try-On.

### Organization Owner

Highest-level organization-side authority.

### Organization Administrator

Manages permitted organization operations.

### Organization Staff

Performs assigned organization-level functions.

### Store Owner

Manages one or more assigned stores.

### Store Manager

Manages permitted store operations.

### Store Staff

Performs restricted store-level tasks.

### Kiosk Operator

Performs permitted kiosk-related operations.

### SelfX Support Administrator

Provides controlled customer support.

### SelfX Super Administrator

Manages the SelfX SaaS platform.

Exact role/permission mappings belong in Technical Requirements.

---

# 11. Staff Management

## PRD-STAFF-001

Authorized organization administrators must be able to:

- Invite staff.
- Assign predefined roles.
- Assign one or multiple stores.
- Change store assignments.
- Modify permitted staff access.
- Suspend staff.
- Reactivate staff.
- Disable staff.

---

## PRD-STAFF-002

Authorized Store Owners/Managers may manage staff within their permitted store scope.

They must not manage staff belonging exclusively to stores outside their authorized scope.

---

## PRD-STAFF-003

The initial product will use predefined SelfX roles.

Custom organization-created roles are not required in PRD v1.

---

# 12. Customer Access

## PRD-CUSTOMER-001 — Anonymous Usage

Customers must be able to use basic Virtual Try-On without creating an account.

Account creation must not block the initial kiosk Try-On experience.

---

## PRD-CUSTOMER-002 — Account Requirement

A customer account is required when the customer wants to:

- Save Try-On results.
- Access saved results later.
- Access previous Try-On history.
- Use account-dependent continuation functionality.

---

## PRD-CUSTOMER-003 — Authentication Methods

Customer authentication should support:

- Phone OTP
- Email OTP
- Approved social authentication

Social authentication may include providers such as Google and Apple where supported.

Detailed authentication implementation belongs in Technical Requirements.

---

# 13. Global SelfX Customer Account

## PRD-CUSTOMER-004

A customer's SelfX account must be platform-wide rather than retailer-specific.

The same SelfX customer account may be used across participating organizations.

Example:

SelfX Customer Account
→ Brand A Try-Ons
→ Brand B Try-Ons
→ Brand C Try-Ons

Merchant tenant isolation must remain enforced even though the customer identity exists across SelfX.

One merchant must not automatically gain visibility into the customer's interactions with another merchant.

---

# 14. Customer Consent

## PRD-PRIVACY-001

Customer consent must be collected before:

- Camera access.
- Capturing a customer photograph.
- Uploading a customer photograph.
- Processing the photograph through Virtual Try-On.

The experience must clearly communicate that AI processing is involved.

---

# 15. Customer Image Reuse

## PRD-TRYON-010

A customer must be able to upload/capture their photograph once and reuse it for multiple garments during the same Try-On session.

The customer must not be required to retake their photograph for every garment unless:

- They choose to.
- The current image is invalid.
- The session expires.
- A technical requirement requires a new image.

---

# 16. Multiple Garment Behavior

## PRD-TRYON-011

SelfX must support channel-dependent garment selection behavior.

Examples:

### Kiosk

May allow:

Customer Photo
→ Garment A
→ Garment B
→ Garment C

with multiple Try-On results.

### Shopify

May naturally start from:

Current Shopify Product
→ Try It On

Both channels must use the same underlying SelfX platform.

Exact concurrency/job behavior belongs in Technical Requirements.

---

# 17. Customer Images and Results

## PRD-RESULT-001 — Result

Successful Virtual Try-On must provide a generated result image.

Customers should be able to:

- View result.
- Try another garment.
- Retry where permitted.
- Save result when authenticated.
- Access permitted history.

---

## PRD-RESULT-002 — Download / Sharing

Organizations must be able to configure whether customers may:

- Download generated results.
- Share generated results.

SelfX may provide sensible platform defaults.

---

# 18. Saved Try-On History

## PRD-RESULT-010

Registered customers must be able to view saved Try-On history.

History may contain:

- Product/garment information
- Retail organization
- Store where applicable
- Try-On date
- Generated result while it remains retained

---

# 19. Image and Result Retention

## PRD-PRIVACY-010

Customer original photographs and generated Try-On images will normally be retained for:

**7 days.**

---

## PRD-PRIVACY-011

After seven days:

- Original customer images must be deleted.
- Generated Try-On images must be deleted.

---

## PRD-PRIVACY-012

Deletion of images does not require deletion of the customer's entire Try-On history entry.

SelfX may retain non-image history information such as:

- Product
- Organization
- Store
- Date/time
- Channel
- Generation status

where permitted.

The expired history entry must not continue to expose the deleted customer/generated image.

---

# 20. Merchant Access to Customer Results

## PRD-PRIVACY-020

Authorized Store Managers may view generated customer Try-On results associated with their permitted store.

They must not automatically receive access to the customer's original photograph.

---

## PRD-PRIVACY-021

Per the current product decision, Store Manager access to generated Try-On results does not require a separate per-result customer consent action beyond the general SelfX customer consent/privacy terms.

This permission must:

- Be limited to authorized Store Managers.
- Be restricted to the appropriate store/organization.
- Follow the applicable retention period.
- Be auditable where appropriate.

SelfX must clearly disclose applicable merchant access in the customer privacy/consent experience.

---

# 21. Products and Garments

## PRD-PRODUCT-001

SelfX must manage product information necessary for Virtual Try-On.

SelfX is not intended to become a complete inventory/POS platform.

---

## PRD-PRODUCT-002

Products may originate from:

- SelfX merchant dashboard
- Shopify
- WooCommerce
- Approved external APIs
- Future integrations

---

## PRD-PRODUCT-003

Products may be configured as:

- Available organization-wide.
- Available only in selected stores.

SelfX must support both models.

---

## PRD-PRODUCT-004

Externally synchronized products must maintain a relationship between:

External Product
↔ SelfX Product

Detailed synchronization and ownership rules belong in Technical Requirements.

---

# 22. Physical Garment Capture

## PRD-GARMENT-001

Where enabled, a customer must be able to photograph a physical garment.

SelfX should determine whether the garment image is sufficiently suitable for Virtual Try-On.

The user should be able to:

- Capture.
- Retake.
- Confirm.

Detailed image preprocessing belongs in Technical Requirements.

---

## PRD-GARMENT-002 — CORE VTO-1 Internal Validation

SelfX may use a guarded internal development Try-On Lab to validate person-image
plus physical-garment-image Virtual Try-On quality before exposing the final
production customer/kiosk workflow.

This lab must preserve the mandatory product boundaries:

- clients still communicate only with SelfX;
- AI-provider credentials are never exposed to clients;
- provider-specific values remain behind SelfX provider adapters;
- customer-facing consent, durable assets, retention, usage and production
  Try-On history are not implied by the development lab.

Uploaded-image preflight in the lab must separate technical validation from
quality analysis:

- technical validation may block generation for non-images, unsupported
  formats, corrupt/undecodable images, unsafe MIME/signature mismatches, hard
  upload size limits and invalid or zero dimensions;
- quality analysis is advisory for uploaded images. Blur, dark lighting,
  overexposure, low contrast, low but technically valid resolution and
  suboptimal body/garment framing should be warnings, not normal blockers;
- if OpenCV quality analysis cannot complete after technical validation
  succeeds, the user should be allowed to re-upload or proceed anyway;
- unavailable analysis metrics must not be shown as fake `0x0` dimensions or
  zero-valued sharpness/brightness/contrast metrics;
- future production analytics may compare detected warning codes and accepted
  overrides with generated Try-On quality.

CORE VTO-1.1 further distinguishes internal lab policy from customer consent:

- the internal authenticated Lab shows an authorized-use notice rather than a
  customer consent checkbox;
- the notice states that internal testers should upload only images they are
  authorized to process;
- this does not weaken PRD-PRIVACY-001. Customer web, mobile and kiosk flows
  still require consent before camera access, customer photo upload or AI
  processing;
- the Lab may expose safe current-run telemetry for development feedback, but
  it must not store or expose raw person images, garment images, generated
  Base64 payloads, provider credentials, Authorization headers or provider
  prediction IDs in normal Lab UI.

CORE VTO-1.2 further defines automatic garment resolution expectations:

- normal customers, kiosk users and public/commerce Try-On consumers should not
  configure technical garment category, garment photo type or generation
  profile parameters during normal Try-On;
- SelfX should resolve those values from trusted catalog/commerce metadata,
  direct-upload analysis, safe fallback policy or one focused ambiguity answer
  where truly needed;
- store/site/catalog products include SelfX-native catalog products, Shopify
  products synchronized through a future SelfX Shopify integration and
  WooCommerce products synchronized through a future SelfX WooCommerce
  integration. CORE VTO-1.2 defines this normalization contract but does not
  implement Shopify or WooCommerce synchronization;
- `FULL_OUTFIT` is a provider-neutral customer intent for a multi-garment look
  and remains distinct from `ONE_PIECE`, such as a dress or jumpsuit;
- body-coverage analysis may help identify product-like/no-person,
  upper-body-on-model, lower-body-on-model, full-body-on-model or unknown
  framing, but it does not identify the exact clothing item and must fall back
  safely when confidence is low or analysis is unavailable.

---

# 23. Kiosk Requirements

## PRD-KIOSK-001

Every managed kiosk must be associated with:

Organization
→ Store
→ Kiosk

---

## PRD-KIOSK-002

Authorized users must be able to:

- Register/pair kiosks.
- Assign kiosk to a store.
- View kiosk status.
- Identify online/offline state.
- Suspend kiosk.
- Reactivate kiosk.
- Revoke/unpair kiosk.
- View kiosk usage.
- View kiosk-related statistics.

---

## PRD-KIOSK-003

Kiosks must authenticate as devices.

Employee passwords must not be used as permanent kiosk credentials.

---

## PRD-KIOSK-004 — KIOSK-1 Windows Camera Foundation

SelfX may implement an early Windows desktop kiosk camera and capture
foundation before the full managed kiosk Try-On flow.

This foundation supports local development/operator camera testing only:

- Windows desktop is the initial kiosk platform target.
- The kiosk hardware may use an integrated camera or an external USB/UVC
  webcam. SelfX treats both consistently as camera devices.
- Multiple cameras may be detected and selected. SelfX must not permanently
  assume camera index `0`.
- Preferred camera selection in KIOSK-1 is local device configuration, not
  server-side kiosk configuration.
- Captured customer/person images remain temporary and local in KIOSK-1.
- KIOSK-1 does not upload images, create Try-Ons, call FASHN or require provider
  credentials.
- OpenCV may analyze the captured still image for quality warnings after
  capture. Live frame processing and pose/body-landmark validation are deferred.
- OpenCV analysis failure is not equivalent to an invalid captured image.

The full production kiosk customer flow still requires consent, device
authentication, SelfX API upload/orchestration, durable assets, retention,
entitlement/quota and provider execution through the central SelfX backend.

## PRD-KIOSK-005 — KIOSK-1.5 Android Primary Kiosk Platform

Android is the primary commercial SelfX kiosk deployment platform for rented
SelfX kiosk hardware. Windows remains a fully supported secondary platform for
Windows kiosks, desktop testing and future Windows capture workflows.

SelfX continues to use one Flutter kiosk application under `mobile/kiosk`.
Platform-specific camera details must remain behind `CameraService`.

KIOSK-1.5 product rules:

- Android boxes with touch displays are the primary kiosk deployment target.
- Windows remains supported and must not be described as deprecated.
- Android initially uses Flutter `camera` through the endorsed CameraX path.
- Integrated cameras, external/USB cameras and multi-camera hardware are all
  conceptual `CameraDevice` values.
- Android USB webcam support depends on what the selected Android box exposes
  through CameraX; a dedicated UVC stack is deferred until certified hardware
  testing proves it is necessary.
- Kiosk capture requires camera permission only. Microphone permission is not
  required for still-image capture.
- Preferred camera selection remains local device configuration, not
  server-side kiosk configuration.
- Android commercial kiosk UX is portrait-first because SelfX currently
  deploys/rents primarily 32-inch and 42-inch vertically mounted displays.
- Windows remains responsive across portrait and landscape desktop/window
  operation.
- Kiosk UI must adapt from actual logical viewport dimensions and aspect ratio,
  not hardcode physical 32-inch/42-inch panel sizes.
- KIOSK-1.5 keeps the KIOSK-1 still-capture quality flow and does not implement
  continuous live vision.
- Whole-frame brightness can miss subject backlighting, so subject-aware
  exposure/backlight readiness belongs to KIOSK-2.
- Production kiosk rental rollout will require managed device identity,
  provisioning, store assignment, device auth, heartbeats, app/version
  reporting, camera health, remote diagnostics/configuration and
  dedicated-device management in a later milestone.
- SelfX should certify known-good kiosk hardware combinations rather than
  promise support for every Android box/webcam combination.

KIOSK-1.5 does not implement FASHN/provider access, production Try-On upload,
device provisioning/auth, fleet backend, QR handoff, billing, API Gateway or
KIOSK-2 live vision.

## PRD-KIOSK-006 — KIOSK-1.6 Assisted Customer Capture Experience

SelfX kiosk customer capture should use an assisted countdown experience before
still-image capture.

KIOSK-1.6 product rules:

- The normal customer camera screen exposes **Take Photo** and starts a
  countdown. It does not expose an instant customer **Capture Now** action.
- Portrait Android kiosk capture prioritizes a large/tall live preview,
  standing full-body framing, distance-readable countdown/guidance in a panel
  below the preview and lower-region touch actions. Countdown/customer guidance
  must not live inside the camera preview.
- The default countdown is 10 seconds.
- Operators may configure the local device countdown to 5, 10 or 15 seconds.
  Customers do not choose this duration during each session.
- Countdown guidance is scripted and time-based only. It must not imply live
  detection of person position, body coverage, lighting, pose, distance or
  readiness.
- Countdown, shutter and capture-success sounds are allowed, enabled by default
  and configurable off locally. No microphone permission is required.
- Operators may select a local capture sound profile: Soft, Classic, Digital or
  Minimal. The customer does not choose the sound profile during capture.
- Capture-success audio must occur only after a still photo is actually
  captured. Capture failure must not play a success cue.
- Countdown cancellation must safely return to preview and prevent delayed
  capture.
- Countdown completion captures exactly one still image, then runs the existing
  post-capture OpenCV quality analysis.
- Review continues to show captured image, quality summary, **Retake** and
  **Use Photo**.
- Technical invalidity may block use. Quality warnings remain advisory, so the
  customer may retake or use the photo.
- **Use Photo** transitions to a Photo Ready state. **Continue** is only a
  temporary local placeholder until the approved product/catalog/Try-On phase.
- Captured photos remain local and temporary in KIOSK-1.6. They are not
  uploaded, sent to FASHN/provider services or persisted server-side.

KIOSK-1.6 does not implement MediaPipe, live OpenCV, person/multiple-person
detection, body coverage, subject-aware exposure, automatic readiness,
product/catalog selection, QR handoff, SelfX Try-On API upload, device
provisioning/auth, fleet backend, API Gateway or provider execution.

## PRD-KIOSK-007 — KIOSK-2A Live Capture Intelligence

SelfX kiosk capture should guide the customer with on-device live readiness
before the final still photo is taken. KIOSK-2A applies first to Android, the
primary commercial kiosk platform. Windows remains fully supported for the
KIOSK-1.6.1 preview/still-capture experience, with Windows live frames deferred
to KIOSK-2B.

KIOSK-2A product rules:

- Live analysis runs locally on the kiosk. Live video frames are not uploaded to
  SelfX, sent to FASHN/provider services, logged or persisted.
- Before camera capture, the customer selects a provider-neutral CaptureScope:
  TOP, BOTTOM or FULL BODY.
- CaptureScope affects capture framing/readiness and later search/policy space.
  It is not the final garment category. FULL BODY must not be treated as
  permanently equivalent to ONE_PIECE; later garment resolution may choose
  ONE_PIECE, FULL_OUTFIT or another canonical garment semantic.
- TOP readiness emphasizes appropriate upper-body visibility and does not
  require ankles. BOTTOM readiness emphasizes lower-body visibility. FULL BODY
  requires suitable full-body visibility.
- With the current Android ML Kit pose path, BOTTOM must still preserve enough
  full-person/face framing for pose continuity. BOTTOM emphasizes lower-body
  readiness; it does not mean intentionally cropping the live camera to legs
  only.
- Capture starts with preparation/guidance, then waits for stable readiness
  before the final 3/2/1 countdown. Do not blindly capture when the preparation
  timer expires.
- READY requires stability/debounce across analyzed samples.
- If readiness is not achieved within a bounded window, the kiosk shows **Try
  Again** and **Capture Anyway**.
- **Capture Anyway** bypasses readiness/quality warnings only. It must not
  bypass unavailable camera, failed still capture, corrupt image, decode failure
  or other technical failures.
- SelfX selects one PrimarySubject per capture session: the prominent/target
  customer selected as the local Try-On model, not an identity-recognized
  person. Selection uses visual prominence such as apparent body size,
  centrality, capture-guide overlap, pose visibility and confidence, not true
  physical distance.
- The current ML Kit pose path exposes only one tracked/prominent pose and does
  not provide reliable active multi-person awareness. Do not claim background
  bystander classification or meaningful-second-person blocking while using this
  adapter. Explicit multi-person analysis is deferred until real hardware
  testing proves it is needed.
- The PrimarySubject target is locked ephemerally across frames to reduce
  transient switching and releases after absence or session/scope reset. It is
  not identity recognition and must not create persistent biometric state.
- Dynamic customer guidance remains below the camera. The camera preview
  contains the customer image, subtle scope-aware framing overlay and future
  camera-specific overlays only.
- Subject-aware lighting guidance should improve on KIOSK-1 whole-frame
  brightness limitations where practical, without claiming professional
  photometric accuracy.
- Live pose/landmark data is ephemeral capture assistance. SelfX must not
  persist raw landmarks, pose histories, biometric identifiers or embeddings.
- KIOSK-2A.1 may prepare a normalized TargetSubjectRegion for the selected
  PrimarySubject while preserving the full-resolution original still. Future
  KIOSK-3 generation must target the selected customer only; SelfX must not
  rely solely on the AI provider guessing which visible person should be dressed.
  Unrelated/background people should remain unchanged through future target
  extraction and compositing.

KIOSK-2A does not implement FASHN/provider calls, SelfX Try-On API upload,
product/catalog selection, QR handoff, device provisioning/auth, fleet backend,
API Gateway, Redis/BullMQ, R2, billing, production spoken voice/TTS expansion or
permanent biometric data.

## PRD-DESIGN-002 — Premium Cross-Application Design System

SelfX must present one cohesive premium visual language across SaaS web,
Windows kiosk/application, Android kiosk and future mobile applications.

Product rules:

- The primary SelfX action and selected-control color is `#FF7119`.
- Primary buttons use `#FF7119` with white foreground.
- Secondary/inactive buttons use white/light backgrounds, dark text and neutral
  borders.
- Danger/destructive actions remain semantically red and must not use the
  orange primary simply for brand consistency.
- Default buttons are rounded rectangles around an 8-10px visual radius, not
  global pill buttons.
- The SaaS web application should be modern, premium, professional, clean and
  information-dense where appropriate.
- Glassmorphism is not a mandatory SaaS web style. Windows/mobile/kiosk may use
  it selectively where it improves presentation and readability.
- shadcn/ui controls are preferred for SaaS buttons, segmented controls, tabs,
  menus, forms, badges and status indicators.
- Flutter kiosk/mobile implementations use matching SelfX visual semantics with
  Flutter-native components. Reusable glass-capable button primitives may be
  used selectively for premium kiosk controls, while primary actions remain
  visibly `#FF7119` with white foreground.
- Normal customer kiosk screens must not expose implementation labels such as
  wallpaper mode or platform readiness; those belong to operator
  Display/Diagnostics views.
- The SelfX design tokens are the source of truth for future Organizations,
  Stores, Users, Roles, Permissions, Catalog, Kiosks, Try-On, Reports, Audit
  and Settings modules.
- The required `#FF7119` plus white text combination may need an accessible
  action variant before formal WCAG AA compliance.

## PRD-KIOSK-008 — KIOSK-2C Customer Home and Operator Access

SelfX kiosks should open into a customer-facing idle home instead of operator
settings or technical camera-test controls. KIOSK-2C adds this kiosk shell while
keeping Android primary and Windows fully supported.

KIOSK-2C product rules:

- Startup/default UI is the customer kiosk home with local/offline static or
  slideshow presentation content and a clear **Start Try-On** action.
- Customer flow is Kiosk Home -> Start Try-On -> CaptureScope selection ->
  existing capture/review/photo-ready flow.
- Camera Settings must not be visible from the home. Operator access is hidden
  behind a top-left double-tap hotspot that reveals an operator icon briefly.
- The operator icon opens a 6-digit PIN challenge before local settings. It must
  not open settings directly.
- Operator PIN checking is isolated behind a provider-neutral verifier. Widgets
  must not hardcode production PINs, persist plaintext PINs or log PIN input.
- After five failed attempts, operator access locks for 60 seconds. Customer
  Try-On must remain available during operator lockout.
- A correct PIN unlocks settings for that visit only. Leaving settings re-locks
  operator access; no persistent local unlock is created.
- Operator settings must be grouped as Camera, Capture, Display, Diagnostics and
  System and remain scrollable/responsive in Android portrait and Windows
  portrait, landscape and narrow windows.
- SELFX-DESIGN-SYSTEM-2 refines operator settings into Camera, Capture,
  Display, Audio, Diagnostics and System categories. Normal operator UI shows
  human-readable camera labels; raw hardware IDs belong under diagnostics or
  hardware details.
- Idle presentation uses a local/offline fallback and a provider-neutral model
  that can later be backed by CMS or fleet configuration.
- The bundled SelfX wallpaper is the default kiosk wallpaper until
  organization/kiosk-specific wallpapers can be managed from the SaaS dashboard.

KIOSK-2C does not implement backend fleet sync, kiosk provisioning/device auth,
remote content management, SelfX Try-On API upload, product/catalog selection,
FASHN/provider calls, API Gateway, migrations or new database persistence.

## PRD-KIOSK-009 — KIOSK-3A Real Kiosk Try-On Generation

SelfX kiosks must be able to complete a real provider-backed Try-On generation
through SelfX after the customer selects a garment, captures a photo and accepts
the review image. This phase proves the end-to-end kiosk product loop while
keeping production device management and catalog expansion separate.

KIOSK-3A product rules:

- Customer flow is Kiosk Home -> Start Try-On -> garment image selection ->
  CaptureScope -> assisted/live capture -> Review/Retake -> Try-On generation
  progress -> generated result.
- The kiosk must submit to SelfX, not directly to FASHN or another provider.
  Provider credentials remain backend-only.
- Manual local garment-image input is acceptable for this milestone. Product
  Catalog selection, physical garment capture, commerce-synced garments and QR
  handoff remain future product work.
- Generation uses the accepted full-resolution customer capture. If local
  PrimarySubject/TargetSubjectRegion metadata is available, SelfX may prepare a
  padded target input from the original still; otherwise the full frame is used.
- The generated provider result is displayed directly in KIOSK-3A. Final
  target-region compositing and background-person preservation remain future
  work.
- The customer must see bounded async progress and safe failure choices such as
  retry polling, retake photo, choose another garment or finish.
- Ordinary retry actions must not create duplicate paid provider submissions for
  the same accepted capture/run.
- Session finish, retake and try-another-garment actions must clear customer
  image/result state so the next customer cannot see prior data.

KIOSK-3A does not implement Organizations, Stores expansion, RBAC expansion,
managed kiosk device auth, fleet management, Product Catalog, physical garment
capture, QR handoff, billing, API Gateway, provider client code in Flutter,
database migrations or new persistence semantics.

## PRD-KIOSK-010 — KIOSK-4A Device Provisioning and Platform Fleet

SelfX kiosks must use production device provisioning before commercial device
Try-On endpoints are connected. A new or unpaired kiosk must show a pairing
screen and must not enter the normal customer home until it has a valid active
device identity.

KIOSK-4A product rules:

- Pairing codes are backend-generated, exactly six numeric digits and valid for
  exactly 8 minutes. Leading zeroes are valid.
- The kiosk displays the code, an `MM:SS` countdown and a visual timer derived
  from backend `expiresAt` and `serverTime`.
- Expired codes automatically rotate to a new backend-generated pairing session.
- Superadmins use **Kiosks -> Pair New Kiosk**, enter the physical kiosk code,
  name the kiosk and select `PLATFORM`, `ORGANIZATION` or `STORE` assignment.
- Kiosk records belong to the SelfX platform fleet. Superadmin users are not
  modeled as kiosk owners.
- `PLATFORM` assignment requires no organization/store. `ORGANIZATION` requires
  an organization. `STORE` requires an organization and a store belonging to it.
- Pairing is one-time use and atomically creates the active kiosk device.
- Device credentials belong only to the physical kiosk. Superadmin browsers must
  never receive device credentials or provisioning secrets.
- A paired kiosk restores its device session on restart without re-pairing.
- Revoked/unpaired kiosks clear local device credentials and return to pairing.
- KIOSK-4A introduces future fleet permission capabilities:
  `kiosks.view`, `kiosks.pair`, `kiosks.update`, `kiosks.assign`,
  `kiosks.revoke`, `kiosks.configure`. In this phase, SelfX Superadmin is
  authorized.

KIOSK-4A does not implement production kiosk Try-On endpoints, Product Catalog,
full Roles/Permissions, CMS wallpaper sync, remote commands, OTA updates, deep
telemetry, FASHN changes, Shopify, WooCommerce, billing, Redis/BullMQ or API
Gateway. Production device-authenticated kiosk Try-On belongs to KIOSK-4B.

## PRD-KIOSK-011 — KIOSK-4C Secure Customer Mobile Photo Upload

SelfX kiosks may let a customer use their personal phone to provide the person
photo for the current kiosk Try-On session. This is an alternate photo input
source for the existing kiosk flow, not a customer account or QR continuation
feature.

KIOSK-4C product rules:

- After garment selection and CaptureScope selection, the customer may choose
  **Take Photo** on the kiosk or **Use My Phone**.
- The kiosk displays a QR code for a short-lived customer upload session owned
  by the active kiosk device.
- The QR code contains only an opaque capability URL. It must not expose raw
  customer data, kiosk assignment data, object-storage keys, image URLs,
  provider data, access tokens or secrets.
- Customer upload links expire after five minutes and cannot be reused after
  expiry, cancellation or consumption.
- The phone upload page accepts only supported image files and requires an
  explicit customer upload action after photo selection.
- SelfX validates the uploaded image before the kiosk can select it.
- Once ready, the kiosk previews the uploaded photo, lets the customer upload
  another photo or select the ready photo, then continues the current kiosk
  Try-On flow.
- Temporary uploaded customer photos remain subject to the approved customer
  image privacy and retention rules.

KIOSK-4C does not implement production device-authenticated kiosk Try-On
orchestration, Product Catalog, persistent customer accounts, QR result
handoff/continuation, checkout, billing, Redis/BullMQ, API Gateway or provider
client code in Flutter.

---

# 24. QR Kiosk-to-Mobile Handoff

## PRD-QR-001

QR handoff is part of the initial MVP.

A kiosk customer must be able to scan a SelfX-generated QR code and continue the permitted customer journey on a personal device.

Possible continuation includes:

- Viewing the current Try-On session.
- Accessing generated results.
- Signing into/creating a SelfX customer account.
- Saving results.
- Opening product information.
- Continuing toward purchase.

Detailed token/security/session behavior belongs in Technical Requirements.

---

# 25. SelfX Super Administration

## PRD-ADMIN-001

SelfX Super Admin must provide platform-level management of:

- Organizations
- Stores
- Users/staff
- Kiosks
- Subscriptions/commercial configurations
- Trials
- Usage
- AI-provider usage
- AI cost
- Integrations
- Platform analytics
- Support
- Impersonation
- Audit information

---

# 26. SelfX Support View

## PRD-SUPPORT-000

The first production SelfX platform super administrator must be initialized
through a controlled one-time operator bootstrap, not through public signup,
direct SQL inserts, demo accounts or a hidden browser setup route.

The production bootstrap may be used only for an empty production user database
and must create the first user plus active `SELFX_SUPER_ADMIN` platform role as
one atomic operation. A safe retry may report that the exact first administrator
is already initialized, but the bootstrap must not become a general production
user-creation or password-reset mechanism.

Temporary bootstrap secrets must be removed after successful initialization.
Normal production login uses the standard staff/admin authentication flow after
the first platform administrator exists.

## PRD-SUPPORT-001

Authorized SelfX personnel must be able to inspect a client environment for support without requesting customer passwords.

Support View should be read-only.

Support may inspect permitted:

- Organization
- Store
- Products
- Staff configuration
- Kiosks
- Integrations
- Usage
- Try-On status/errors
- Relevant diagnostics

---

# 27. Controlled Impersonation

## PRD-SUPPORT-010

Authorized SelfX administrators must be able to impersonate an organization/store context when support requires operational access.

Example:

SelfX Administrator
→ Organization A
→ Tirupati Store
→ Store Manager Context

---

## PRD-SUPPORT-011

Impersonation must:

- Never expose customer passwords.
- Never expose provider secrets.
- Be explicitly visible.
- Identify active organization/store context.
- Identify the acting SelfX administrator.
- Be permission controlled.
- Be time limited.
- Support immediate exit.
- Be auditable.

Detailed security controls belong in Technical Requirements.

---

## PRD-SUPPORT-012

Production web staff/admin authentication must support reliable session
restoration after reload, direct URL open and normal internal navigation without
exposing refresh tokens to browser JavaScript.

The SelfX web application may use a same-origin web proxy/BFF boundary for
browser API traffic so HttpOnly refresh cookies remain first-party to the web
origin. This web proxy must not become a general API Gateway or move tenant
authorization out of the SelfX API. Non-web clients may continue to call the
SelfX API directly through approved client-specific authentication.

---

# 28. Usage Tracking

## PRD-USAGE-001

SelfX must record Virtual Try-On usage.

Usage should be attributable where applicable to:

- Organization
- Store
- Kiosk
- Channel
- Integration
- Product
- Try-On
- AI provider/model
- Generation status
- Provider usage/cost
- Timestamp

---

# 29. Subscription / Commercial Model

## PRD-COMMERCIAL-001

SelfX must not require every customer to use one identical commercial model.

Organizations may have configurable commercial agreements.

Examples may include:

- Standard SaaS plan
- Custom subscription
- Enterprise contract
- Usage-based pricing
- Negotiated limits
- Custom kiosk arrangements

---

## PRD-COMMERCIAL-002

Commercial configuration may control:

- Successful Try-On allowance
- Stores
- Kiosks
- Users
- API access
- API limits
- Integrations
- Analytics
- Branding
- Support level
- Other entitlements

Exact pricing is outside PRD v1.

---

# 30. Free Trial

## PRD-TRIAL-001

SelfX must support trial plans that may include both:

- Time limit
- Generation limit

Example concept:

Trial expires when either:

- Trial duration expires, or
- Allowed Try-On generation quota is exhausted

Exact commercial values will be configured separately.

---

# 31. Non-Payment / Commercial Suspension

## PRD-SUB-001

Organizations must not be immediately deleted when payment/commercial status expires.

The expected lifecycle is conceptually:

Active
→ Payment/Commercial Issue
→ Grace Period
→ Suspended

---

## PRD-SUB-002

During suspension:

- New billable functionality may be restricted.
- Virtual Try-On generation may be disabled.
- Existing business data should remain preserved according to platform retention policy.
- Authorized SelfX personnel must be able to restore access after resolution.

Exact payment handling belongs in Technical Requirements.

---

# 32. White-Label Capability

## PRD-BRAND-001

Higher commercial tiers may support configurable branding.

Possible capabilities include:

- Client logo
- Brand name
- Theme/accent customization
- SelfX branding visibility
- White-label customer-facing experience

Exact customization options belong in UI/UX and Technical Requirements.

---

# 33. Organization Onboarding

## PRD-ORG-010

SelfX must support both:

### SelfX-Managed Onboarding

SelfX administrator creates/configures an organization.

### Self-Service Onboarding

A new customer may register and create a SelfX organization.

Self-service availability may be controlled during launch.

## PRD-ORG-011 — Registration Is Not Activation

An organization must never become operational immediately simply because a user registers or submits it.

Organization registration and organization activation are separate actions.

Approved lifecycle:

1. User submits organization registration.
2. Organization/application enters pending onboarding or review.
3. SelfX reviews required information and documents where applicable.
4. Commercial, pricing, payment or contract requirements may be evaluated.
5. Authorized SelfX platform administrator approves activation.
6. Organization becomes active.
7. Normal organization, store, product, kiosk and Try-On functionality becomes available.

## PRD-ORG-012 — Onboarding Application Lifecycle

The onboarding/application lifecycle is separate from the operational organization status.

Baseline application states:

- DRAFT
- SUBMITTED
- UNDER_REVIEW
- NEEDS_INFORMATION
- APPROVED
- REJECTED

Baseline organization operational states:

- PENDING_ACTIVATION
- ACTIVE
- SUSPENDED
- ARCHIVED

An approved application does not necessarily mean the organization is active.

Example:

```text
application_status = APPROVED
organization_status = PENDING_ACTIVATION
```

This is valid when a commercial, payment, document, verification or contract prerequisite still remains.

## PRD-ORG-013 — Activation Requirements

Activation requirements may depend on organization type, commercial model, launch policy, geography, risk, or SelfX operational requirements.

Possible activation requirements include:

- required business information;
- required organization documents;
- identity/business verification;
- commercial terms;
- pricing agreement;
- subscription selection;
- payment;
- enterprise contract;
- other SelfX-defined onboarding requirements.

SelfX must not hard-code one universal requirement set.

Initially, activation eligibility may be confirmed manually by an authorized SelfX platform administrator. Later billing, payment, document or verification automation may supply activation signals without redesigning the organization lifecycle.

## PRD-ORG-014 — Applicant and Initial Owner

The person who submits an organization may be recorded as the intended initial `ORGANIZATION_OWNER`.

Submitting an organization must not grant normal active tenant operation immediately.

Before organization activation, the applicant must not receive normal store management, membership administration, product management, kiosk operation, paid Try-On execution, or normal tenant business API access except explicitly approved onboarding/status functionality.

When the organization becomes `ACTIVE`, the approved initial owner membership becomes usable for normal tenant authorization.

---

# 34. Analytics

## PRD-ANALYTICS-001

SelfX should provide platform, organization and store analytics.

Potential metrics include:

- Total Try-Ons
- Successful Try-Ons
- Failed Try-Ons
- Most tried garments
- Most active stores
- Try-Ons by kiosk
- Try-Ons by channel
- Usage trends
- Generation performance
- AI cost
- Customer engagement
- Add-to-cart conversion where available
- Purchase conversion where available

---

## PRD-ANALYTICS-002

Data visibility must follow access scope.

### SelfX Super Admin

Platform-wide visibility.

### Organization

Organization-level and permitted store data.

### Store

Permitted store data only.

---

# 35. Channel Identification

## PRD-CHANNEL-001

Every Virtual Try-On should identify its originating channel where applicable.

Provider-neutral channel taxonomy:

- WEB_LAB
- WEB_CUSTOMER
- KIOSK
- MOBILE
- SHOPIFY
- WOOCOMMERCE
- PUBLIC_API

Only WEB_LAB is used by the CORE VTO-1.1 internal development Lab. Production
customer and partner channels must use the same SelfX backend and may not call
AI providers directly.

This must support usage, analytics and reporting.

---

# 36. Public API

## PRD-API-001

After stabilization of the core kiosk/SaaS system, Public API is the highest-priority external expansion.

SelfX must expose approved capabilities programmatically to external customers/partners.

Potential API capabilities include:

- Authentication
- Product access
- Image handling
- Create Virtual Try-On
- Retrieve status
- Retrieve result
- Usage information
- Completion notifications where supported

Exact API endpoints and payloads belong in Technical Requirements.

---

# 37. Mobile Application

## PRD-MOBILE-001

The SelfX backend must support a future mobile application, expected initially to be developed using Flutter.

The mobile application may support:

- Customer authentication.
- Customer account.
- Product retrieval.
- Camera capture.
- Image upload.
- Virtual Try-On.
- Saved Try-Ons.
- QR handoff.
- Result viewing.
- Purchase continuation.

The Flutter application must consume SelfX APIs and must not communicate directly with the AI provider.

---

# 38. Shopify

## PRD-SHOPIFY-001

SelfX should support a Shopify application/integration.

It should enable a merchant to:

- Connect Shopify to their SelfX organization.
- Associate a Shopify store.
- Synchronize/map relevant products.
- Enable Virtual Try-On on eligible products.
- Attribute usage to the correct organization/store/integration.
- Manage connection status.

Detailed Shopify implementation belongs in Technical Requirements.

---

# 39. WooCommerce

## PRD-WOO-001

SelfX should support a WooCommerce plugin/integration offering equivalent core Virtual Try-On capabilities.

The plugin must communicate with SelfX rather than directly with the AI provider.

Detailed implementation belongs in Technical Requirements.

---

# 40. Security Requirements

At product level, SelfX must:

- Prevent cross-organization access.
- Prevent unauthorized cross-store access.
- Protect customer images.
- Protect authentication credentials.
- Protect integration/provider credentials.
- Use secure authentication.
- Use role/scope-based authorization.
- Protect administrative functionality.
- Protect device authentication.
- Protect impersonation.
- Maintain appropriate auditability.

Exact technical controls belong in Technical Requirements.

---

# 41. Privacy Requirements

SelfX must:

- Collect appropriate customer consent.
- Clearly explain AI image processing.
- Enforce the approved retention period.
- Protect original customer photos.
- Protect generated results.
- Restrict merchant image access according to product rules.
- Protect customer history across retailers.
- Prevent one merchant from viewing another merchant's customer interaction data.
- Maintain privacy-aware analytics.

---

# 42. Reliability Requirements

SelfX must handle gracefully:

- Invalid customer images.
- Invalid garment images.
- AI generation failure.
- AI-provider unavailability.
- Internet/connectivity failure.
- Timeouts.
- Kiosk connectivity problems.
- Subscription/quota restrictions.
- Authorization failures.

The user interface must not crash or enter an unsafe state due to these conditions.

---

# 43. Performance Requirements

Core application interactions must remain responsive.

Virtual Try-On generation must be treated as a long-running operation.

The customer-facing interface must:

- Acknowledge requests quickly.
- Display generation status.
- Remain responsive during AI processing.
- Display completed results when available.

Exact timeout, concurrency and queue implementation belongs in Technical Requirements.

---

# 44. Scalability Requirements

The architecture must support growth from:

Initial:

- SelfX-owned retail locations
- Limited organizations
- Limited kiosks
- Hundreds/thousands of Try-Ons

toward:

- Thousands of organizations
- Thousands of stores
- Thousands of kiosks
- Ecommerce traffic
- Public API customers
- Mobile traffic
- Millions of Try-Ons per month

Detailed infrastructure scaling belongs in Technical Requirements.

---

# 45. MVP Scope

PRD v1 MVP consists of:

## Core SaaS

- Authentication
- Global customer accounts
- Organization management
- Store management
- Staff management
- Predefined role/scope access
- Multi-organization membership
- Multi-store staff access
- SelfX Super Admin
- Support View
- Controlled impersonation
- Basic auditability

## Customer Experience

- Anonymous basic Try-On
- Customer registration/login
- Phone OTP
- Email OTP
- Approved social login
- Saved history
- Seven-day image/result retention
- QR kiosk-to-mobile handoff

## Products

- Product/garment management
- Organization-wide products
- Store-specific products
- Garment images
- Physical garment capture
- External product mapping foundation

## Virtual Try-On

- Customer image upload
- Camera capture
- Customer-image reuse within a session
- Catalog garment selection
- Multiple garment support according to channel
- Image validation
- AI generation
- Result status
- Result display
- Retry
- Save result
- Configurable download/share

## AI

- Provider-independent SelfX interface
- Initial AI provider integration
- Provider usage tracking
- Basic provider cost tracking

## Retail / Kiosk

- Kiosk registration/pairing
- Store assignment
- Device authentication
- Status monitoring
- Customer Virtual Try-On flow
- QR mobile handoff

## Commercial

- Organization commercial configuration
- Subscription/entitlements foundation
- Trial with time + generation limits
- Grace period
- Suspension
- White-label entitlement foundation

## Analytics

- SelfX platform analytics
- Organization analytics
- Store analytics
- Product/Try-On/usage/channel statistics

---

# 46. Post-MVP Priorities

After the core SelfX SaaS/kiosk system is stable:

1. Public API
2. Additional API/partner capabilities
3. Flutter mobile application
4. SelfX Web Widget / SDK
5. Shopify integration
6. WooCommerce integration
7. Advanced analytics
8. Conversion attribution
9. Advanced billing
10. Additional AI providers
11. Intelligent provider routing/fallback

The exact sequence after Public API may change according to business priority.

---

# 47. Future Features

Possible future features include:

- Live AR Virtual Try-On
- Video Try-On
- Size recommendation
- Body-measurement-assisted sizing
- Complete outfit Try-On
- AI fashion assistant
- Outfit recommendations
- Customer wardrobe
- Personalized recommendations
- Loyalty integration
- Advanced conversion attribution
- Enterprise SSO
- Custom merchant roles
- Advanced white labeling
- SelfX-hosted AI models
- Additional ecommerce integrations

---

# 48. Product Success Metrics

SelfX should monitor:

## Technical

- Virtual Try-On success rate
- AI quality
- Generation duration
- Platform availability
- Provider failure rate
- Kiosk availability
- API reliability

## Product / Business

- Try-Ons per customer/session
- Try-Ons per organization
- Try-Ons per store
- Try-Ons by channel
- Most tried products
- Customer engagement
- Add-to-cart conversion where measurable
- Purchase conversion where measurable
- Active organizations
- Active kiosks

## Financial

- Provider cost per generation
- Cost per Try-On
- AI cost by organization
- Revenue by organization
- Subscription/commercial usage
- Gross margin

Exact target thresholds will be finalized using AI proof-of-concept and production data.

---

# 49. Mandatory Product Boundaries for Implementation

Coding agents and developers must observe the following boundaries.

### Boundary 1

Do not implement client applications that call FASHN, Google or another AI provider directly.

### Boundary 2

Do not make users permanently belong to only one organization.

### Boundary 3

Do not assume staff can access only one store.

### Boundary 4

Do not implement an independent-store backend separate from the normal organization/store model.

### Boundary 5

Do not allow cross-organization data access.

### Boundary 6

Do not allow unauthorized cross-store access.

### Boundary 7

Do not expose AI-provider or integration secrets to customer-facing clients.

### Boundary 8

Do not turn SelfX into a full POS/inventory system as part of PRD v1.

### Boundary 9

Do not make kiosk authentication depend on an employee's permanent credentials.

### Boundary 10

Do not permanently store customer images beyond the approved retention policy.

### Boundary 11

Deleting customer images after seven days must not require deleting non-image Try-On history/analytics that SelfX is permitted to retain.

### Boundary 12

Store Managers may see generated results for their permitted store but must not automatically see original customer photographs.

### Boundary 13

Customer SelfX accounts are global across participating retailers, but merchant data access remains tenant-isolated.

### Boundary 14

AI-provider implementation must remain replaceable.

### Boundary 15

Technical implementation decisions must not silently change these product requirements.

### Boundary 16

Do not make organization registration automatically activate an operational tenant. Review, approval and activation are explicit SelfX platform-controlled lifecycle steps.

---

# 50. Documents Governing Implementation

This PRD defines:

**WHAT SelfX must do and the product rules that implementation must preserve.**

Implementation must additionally follow these project documents:

## Document 2 — Technical Requirements & System Design

Defines:

- Tech stack
- System architecture
- APIs
- Authentication implementation
- RBAC implementation
- Kiosk architecture
- AI integration
- Queues/jobs
- Storage
- Infrastructure
- Security
- Shopify/WooCommerce technical integration
- Scaling
- Deployment

## Document 3 — User Journey & System Flow

Defines:

- Customer journeys
- Organization journeys
- Store journeys
- Staff journeys
- SelfX Admin journeys
- Kiosk journeys
- QR handoff
- Support/impersonation flows

## Document 4 — UI/UX Flow & Screen Specification

Defines:

- Screens
- Navigation
- Actions
- Forms
- Loading states
- Error states
- Permission-based UI
- Responsive behaviour
- Figma requirements

## Document 5 — Database & Schema Design

Defines:

- Entities
- Relationships
- Tables
- Fields
- Foreign keys
- Indexes
- Tenant scope
- Membership model
- Retention fields
- Audit schema
- Migrations

## Document 6 — Implementation Plan

Defines:

- Development phases
- Dependencies
- Tasks
- Priorities
- Acceptance checks
- Tests
- Verification
- Rollout plan

---

# 51. Coding Agent Instruction

Before implementing a feature, the coding agent must:

1. Identify the relevant PRD requirement.
2. Check the Technical Requirements document for implementation constraints.
3. Check the User Journey document for expected behavior.
4. Check the UI/UX document for client behavior where applicable.
5. Check the Database & Schema document before altering persistence.
6. Follow the active Implementation Plan phase.
7. Avoid introducing architecture that conflicts with future Shopify, WooCommerce, mobile or Public API clients.
8. Preserve multi-tenancy, store scope and provider independence.
9. Avoid making undocumented product decisions.
10. Surface contradictions or missing requirements before making irreversible architectural decisions.

---

# 52. PRD Status

All major product questions required for the initial product baseline have been resolved.

**Status: APPROVED — PRD v1.0**

Further implementation detail must be added to the appropriate supporting document rather than unnecessarily expanding this PRD.

A new PRD version should only be required when the product itself materially changes.
