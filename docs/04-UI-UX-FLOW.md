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

# SelfX Virtual Try-On

## UI/UX Flow & Screen Specification

**Version:** 1.0  
**Status:** APPROVED BASELINE  
**Document:** `04-UI-UX-FLOW.md`

---

## 1. Purpose

This document defines the screen-level UI/UX flow for the SelfX Virtual Try-On platform.

It converts the approved product requirements and user journeys into:

- application areas;
- screens;
- navigation;
- user actions;
- loading/empty/error states;
- permission-aware behavior;
- responsive behavior;
- shared interaction conventions.

This document does not define database tables, API schemas, or implementation order.

Those belong in:

- `05-DATABASE-SCHEMA.md`
- `06-IMPLEMENTATION-PLAN.md`

---

## 2. UI/UX Principles

All SelfX interfaces should follow these principles:

- Clear primary action on every screen.
- Minimal friction in Try-On flows.
- Consistent status language across web, kiosk, mobile, Shopify, and WooCommerce.
- No raw AI-provider terminology in customer-facing interfaces.
- Permission-aware UI that hides or disables actions users cannot perform.
- Server-side authorization remains authoritative even when UI hides controls.
- Sensitive customer images must never appear outside approved contexts.
- Shared design language across SelfX-owned interfaces.
- Merchant-embedded Try-On may inherit merchant branding while preserving SelfX interaction patterns.
- Loading, empty, offline, suspended, permission-denied, and failure states must be designed intentionally.

---

## 3. SelfX Design System

### Web Foundation

- Next.js
- Mantine as the primary SelfX web UI/component framework
- Tailwind CSS
- shadcn/ui as a secondary component source only when justified
- shared SelfX UI package/design tokens

### Phase 4 Web Implementation

The initial web design-system implementation lives in `packages/ui`.

Mantine is the primary implementation of the SelfX web design language.
`packages/ui` owns:

```text
packages/ui/src/theme
packages/ui/src/styles/globals.css
```

The centralized SelfX Mantine theme defines common colors, typography, spacing,
radii, shadows, focus behavior and component defaults. Semantic SelfX tokens
must map through this centralized theme/token layer so future organization
white-labeling can override branding safely.

shadcn/ui is configured for the monorepo through:

```text
frontend/web/components.json
packages/ui/components.json
```

shadcn/ui remains available as a secondary component source, but it must not be
the default choice for app shell, navigation, common controls, forms, cards,
state views or normal admin UI.

Tailwind CSS remains secondary utility/layout infrastructure and compatibility
support. It must not become a parallel component design system.

Application-specific shell composition lives in `frontend/web`, while reusable
web primitives and SelfX shell/state components live in `packages/ui`.

The Phase 4 route shell reserves documented navigation areas without
implementing their business workflows.

### CORE VTO-1 Try-On Lab UI

The internal development route `/app/try-on-lab` is a guarded authenticated
workflow page for testing the core person-image plus garment-image VTO loop
before Product Catalog and production VTO infrastructure.

The lab screen uses the shared Phase 4 layout primitives:

```text
PageContainer
→ PageHeader
→ PageSection
→ SectionCard
```

Main screen areas:

- subtle Internal Lab badge/notice near the page heading;
- passive authorized-use notice: "Internal testing only. Upload only images you
  are authorized to process.";
- Images section;
- person-image upload and preview;
- garment-image upload and preview;
- OpenCV.js quality preflight results for each image;
- Generate Try-On section;
- concise message: "Try-On settings are selected automatically.";
- automatic garment intent/photo type/profile summary;
- collapsed Advanced settings area for internal Lab overrides only;
- optional ambiguity modal when the garment image appears to contain multiple
  clothing areas;
- Generate Try-On action at the end of the Generate Try-On section;
- Result section;
- generation state and stable SelfX run ID;
- compact provider-neutral generation details;
- responsive comparison of original person image, garment image and generated
  result;
- Try Another Garment and New Try-On actions.

OpenCV.js must be lazy-loaded only when this lab is used. UI quality messages
must use normal SelfX language such as resolution, exposure, contrast and blur
warnings, not raw OpenCV terminology.

Uploaded-image preflight uses three user-facing states:

- `PASS` — technically valid and no significant detected quality concern.
- `WARNING` — technically valid, but quality may reduce Try-On result quality.
  The tester may re-upload or proceed anyway.
- `BLOCKED` — technically invalid, unsafe or unusable. The tester cannot
  generate until the input is replaced.

Technical validation remains blocking for invalid files, unsupported formats,
corrupt/undecodable images, unsafe MIME/signature mismatches, hard size limits
and invalid/zero dimensions. Quality concerns such as blur, low brightness,
overexposure, low contrast, low resolution, unusual framing, person framing and
garment framing are advisory for uploaded images.

If OpenCV analysis fails after the upload is technically valid, the UI must show
an advisory analysis-unavailable warning and unavailable/null metrics rather
than fake `0x0`, sharpness `0`, brightness `0` or contrast `0` metrics.

When Generate Try-On is pressed with one or more warnings, show a Mantine-first
confirmation modal titled "Image quality warning". The modal groups issues
under "Person photo" and "Garment photo" and offers:

- Re-upload — close the modal so the tester can replace inputs.
- Proceed anyway — continue through the existing SelfX API to provider flow.

Proceed-anyway confirmation applies only to the current unchanged input state.
Changing either image recalculates warnings and resets the warning override.
If both images pass, Generate Try-On proceeds without the warning modal.

CORE VTO-1.2 removes default visible garment category, garment photo type and
generation profile controls from the normal Lab workflow. SelfX resolves those
settings automatically. Direct-upload garment images may be analyzed with a
lazy-loaded browser-only pose/body-coverage analyzer to infer no-person,
upper-body on-model, lower-body on-model, full-body on-model or unknown. The
analysis is advisory and provider-neutral; it does not identify the exact
garment, classify fashion attributes or perform biometrics.

If the garment image appears full-body/on-model and therefore ambiguous, show a
Mantine-first modal titled "We found multiple clothing areas in this image.
Which item would you like to try on?" The choices are:

- Upper garment — shirts, tops, jackets and similar upper-body items.
- Lower garment — pants, skirts, shorts and similar lower-body items.
- One-piece — dresses, jumpsuits and single garments covering both areas.
- Full outfit — use the complete outfit shown in the reference image.

The selected disambiguation intent is retained for the unchanged garment image.
Replacing the garment image clears stale analysis, disambiguation and internal
override state. FULL_OUTFIT is a provider-neutral intent distinct from
ONE_PIECE.

The internal Lab does not use a customer-style consent checkbox. It uses the
authorized-use notice above because it is a guarded staff/development tool.
Customer web, mobile and kiosk experiences still require consent before camera
access, customer photo upload or AI processing.

Upload cards should stay compact. On desktop, person and garment cards appear
side-by-side with consistent dimensions and image previews approximately
260-320px high where practical. Images use `object-fit: contain` and preserve
aspect ratio. On mobile, upload cards stack vertically.

Completed result comparison keeps three panels on desktop: Person, Garment and
Generated Try-On. Tablet and mobile layouts may stack responsively. Clicking an
image opens a larger Mantine Modal preview. No before/after slider is included
in CORE VTO-1.1.

After a run, the default Lab view shows a compact run summary and prioritizes
the result comparison. Technical provider/model/resolution telemetry is
collapsed by default under Run diagnostics. That diagnostic disclosure may show
status, provider display name, model, profile, garment source, garment intent,
garment category, garment photo type, resolution sources, analysis body
coverage/confidence, elapsed time, quality warnings, disambiguation state and
whether the quality override was accepted. It must not show FASHN API keys,
provider Authorization headers, Base64 payloads, raw image contents, internal
stack traces or provider prediction IDs in normal Lab UI.

Try Another Garment preserves the person image and clears garment, garment
quality, prior result and run state. New Try-On clears person, garment, result,
warning overrides and run state. Blob URL cleanup must remain correct.

CORE VTO-1.1 exposes only safe current-run telemetry in the Lab UI. It does not
build a production analytics dashboard or fake aggregate analytics from the
temporary in-memory registry. Durable telemetry persistence waits for the
production TryOnRun/ProviderAttempt/storage phase.

OpenCV's primary future production role is live camera/capture quality guidance.
Kiosk/live capture may use OpenCV more strictly because SelfX can guide the user
before taking the photo. CORE VTO-1 does not implement live camera, WebRTC,
pose/body-landmark capture readiness or kiosk functionality.

This screen must not expose FASHN prediction IDs, provider credentials, raw
provider stack traces or durable production consent claims.

### Flutter Foundation

- Flutter-native components
- same SelfX typography, spacing, status semantics, and interaction hierarchy

### KIOSK-1 Windows Camera Foundation UI

The KIOSK-1 Flutter kiosk app uses four local development screens:

- `KioskHomeScreen` — minimal SelfX kiosk development home with **Start Camera
  Test** and **Camera Settings** actions, clearly marked as KIOSK-1 foundation.
- `CameraCaptureScreen` — large camera preview, current camera status, static
  framing guide, large touch-friendly **Capture** action, initialization,
  unavailable, permission/error and retry states.
- `CaptureReviewScreen` — captured image, quality summary, **Retake** and
  **Use Photo**. **Use Photo** only accepts the local capture into the
  development session and never submits to FASHN or SelfX Try-On APIs.
- `CameraSettingsScreen` — detected cameras, preferred camera, connection
  status, preview, basic capabilities, **Refresh Cameras** and **Test Camera**.

KIOSK-1 capture guidance is static:

- `TOP` -> upper/full body guidance.
- `BOTTOM` -> lower/full body guidance.
- `ONE_PIECE` -> full body guidance.
- `AUTO` -> full body recommended.

The UI must not claim live body detection, pose detection, garment
classification or automatic full/upper/lower detection in KIOSK-1.

Quality UI uses SelfX-friendly language and the same core states as the web
lab: `PASS`, `WARNING` and `BLOCKED`.
Warnings such as blur, dark lighting, overexposure, low contrast and low
resolution are advisory in KIOSK-1 and normally allow **Use Photo**.
Genuine technical invalidity blocks **Use Photo**.
OpenCV analysis failure must appear as an advisory unavailable-analysis warning
with unavailable metrics rather than fake zero metrics.

Temporary captures are local only.
Retake/session reset should clear old captures where practical.
The kiosk app must not show product selection, customer consent, AI generation,
QR handoff, provider identifiers or direct FASHN actions in KIOSK-1.

### KIOSK-1.5 Android Primary Kiosk UI

KIOSK-1.5 keeps the same local development screens and makes them
multi-platform:

- Android is the primary commercial kiosk display target.
- Windows remains supported for Windows kiosks and desktop camera testing.
- The app remains one Flutter application under `mobile/kiosk`.
- Android commercial kiosk screens are portrait-first for SelfX's current
  32-inch and 42-inch vertically mounted displays, while Windows remains
  responsive in both portrait and landscape windows.
- Screens adapt from logical viewport dimensions and aspect ratio rather than
  hardcoded physical inch sizes or one Windows resolution.
- Camera Settings must handle long hardware names without horizontal overflow.
- Capture, Review and Settings screens should collapse from wide two-column
  layouts into scrollable stacked layouts on constrained windows or smaller
  displays.
- Dropdowns should use expanded/ellipsis behavior for long camera names.
- Android immersive/fullscreen presentation is appropriate for kiosk
  foundation testing, while operator/development escape remains available.
- Production lock-task/device-owner/dedicated-device UX and remote fleet
  controls are deferred.

Android camera UX:

- Camera access is requested through the platform camera flow.
- The UI must distinguish camera unavailable, permission denied, permission
  blocked/permanently denied and recoverable camera errors in SelfX-friendly
  language.
- Camera Settings remains common across Android and Windows and may show
  platform diagnostics such as CameraX or `camera_windows` only in the
  operator/development context.
- Integrated and external cameras are displayed as normal camera options when
  the platform exposes them.

Quality UX remains the KIOSK-1 still-capture flow. Whole-frame brightness is
only an initial quality signal because bright backgrounds can mask a backlit
person. Subject-aware exposure/backlight readiness belongs to KIOSK-2.

### KIOSK-1.6 Assisted Capture UI

KIOSK-1.6 replaces instant customer capture with an assisted customer capture
flow shared by Android and Windows.

Commercial display baseline:

- SelfX currently deploys/rents primarily 32-inch and 42-inch vertically
  mounted kiosks;
- Android kiosk UX is portrait-first;
- Windows desktop/kiosk operation remains responsive across portrait and
  landscape windows;
- physical inch size is not hardcoded into layout behavior.

Customer camera screen:

- primary action is **Take Photo**;
- no instant customer **Capture Now** control is shown;
- live camera preview remains visible during countdown;
- portrait composition prioritizes SelfX header/status, a large/tall live
  preview, standing full-body framing, minimal text and lower-region touch
  controls;
- the camera preview is reserved for customer image, static framing and future
  camera-specific overlays;
- `CaptureGuidancePanel` renders countdown/customer guidance outside the
  preview, below it in portrait layouts and beside it in wide layouts;
- countdown guidance uses a very large number, clear instruction text, final
  3/2/1 emphasis, lightweight scale/fade animation and a prominent **Cancel**
  action;
- guidance text is scripted and instructional only, such as "Step into
  position", "Move to a comfortable distance from the kiosk", "Face the camera
  and center yourself" and "Hold still";
- guidance must not say "ready", "detected", "perfect position", "lighting is
  good" or similar live-analysis claims.

Local Camera/Operator Settings include a Capture Experience section:

- Countdown: 5 seconds, 10 seconds or 15 seconds; default 10 seconds;
- Capture sounds: On/Off; default On;
- Sound profile: Soft, Classic, Digital or Minimal; default Soft;
- Preview Sound: operator-only local audio preview.

Customers do not choose countdown duration during each capture session.
Customers do not choose sound profiles during capture. Countdown, shutter and
capture-success sounds require no microphone permission. Sound failure falls
back to silent capture without blocking the customer flow. Capture-success audio
plays only after still capture succeeds.

Capture state UI:

- preparing/countdown keeps the preview visible with guidance outside the
  preview;
- capturing shows a brief "Capturing..." state;
- analyzing shows "Checking your photo..." and refers only to still-image
  technical/quality processing, not AI body analysis;
- review shows captured image, quality summary, **Retake** and **Use Photo**;
- Photo Ready shows "Your photo is ready for this Try-On session" with
  **Retake** and **Continue**;
- Continue shows the temporary local-session placeholder until garment
  selection and production Try-On submission are implemented.

Quality behavior remains SelfX-friendly:

- technical invalidity can block **Use Photo**;
- warnings such as blur, exposure, contrast, low resolution and analysis
  unavailable are advisory and allow **Retake** or **Use Photo**;
- temporary captures remain local and are cleaned on retake/replacement/session
  reset where practical.

KIOSK-1.6 does not implement MediaPipe, live OpenCV readiness, person or
multiple-person detection, body coverage, subject-aware exposure, distance
estimation, product/catalog selection, QR handoff, SelfX API upload or provider
generation.

The portrait capture canvas should remain suitable for future KIOSK-2 overlays
such as shoulders/hips/knees/ankles guides, full-body coverage, move-back
guidance, subject-lighting warnings and multi-person warnings, without claiming
those capabilities in KIOSK-1.6.

### Core Design Tokens

The design system should define:

- primary/secondary brand colors;
- backgrounds and surfaces;
- borders;
- typography scale;
- spacing scale;
- radius;
- elevation/shadows;
- success;
- warning;
- error;
- info;
- disabled state;
- focus state;
- loading state.

### Component Consistency

Common patterns should be reused for:

- page headers;
- cards;
- forms;
- tables;
- filters;
- search;
- dialogs;
- drawers;
- tabs;
- badges;
- alerts;
- empty states;
- confirmation prompts;
- pagination;
- skeleton/loading states.

### Page & Layout Standards

SelfX web pages must use the shared Mantine-first layout primitives from
`@selfx/ui` rather than local one-off layout systems.

Standard page anatomy:

```text
PageContainer
→ PageHeader
→ optional StatGrid
→ PageSection / SectionHeader
→ approved content card or workflow surface
```

Page width modes:

- `wide` — dashboard, list and broad admin workspace pages;
- `medium` — detail and settings pages;
- `form` — create/edit forms.

Spacing conventions:

- desktop: 24–32px page padding, 24px major section gap, 16–20px card/grid gap,
  20–24px card padding;
- tablet: 20–24px page padding and about 20px major section gap;
- mobile: about 16px page padding, section gap and card padding.

Approved page archetypes:

- Dashboard Page: `PageHeader` → `StatGrid` → `PageSection` content;
- List Page: `PageHeader` → optional `StatGrid` → `FilterBar` →
  `TableContainer` → pagination/footer;
- Detail Page: `PageHeader` → summary → tabs/sections → related information;
- Form Page: `PageHeader` → constrained `FormPageContainer` → `FormSection`
  → `FormActions`;
- Settings Page: `PageHeader` → settings navigation/content sections;
- Workflow Page: specialized flow layout that still follows SelfX typography,
  spacing, state and control standards.

Approved card patterns:

- `StatCard` for label/value/trend summaries;
- `SectionCard` for titled content sections;
- `SummaryCard` for compact summary information;
- `ActionCard` for icon/title/description/action prompts;
- `TableContainer` for future table surfaces with explicit footer/pagination
  space.

Forms use one column by default. Two-column layout is reserved for closely
related compact fields and must collapse to one column on mobile. Labels appear
above fields and validation/help text must remain visually predictable.

Cards should normally size to content, use centralized radius/border/shadow
tokens and avoid hover treatment unless interactive. Do not nest cards simply to
create page spacing.

---

## 4. Global Web Application Structure

The primary SelfX web application should support these major areas:

- Authentication
- Organization registration/onboarding status
- Organization selection
- Organization/Store portal
- SelfX Super Admin
- SelfX Support
- Customer account
- QR continuation
- Public/developer settings where applicable

The exact route names may evolve during implementation.

---

# 5. Authentication UI

## 5.1 Staff/Admin Login Screen

### Purpose

Authenticate organization staff, organization admins, and SelfX platform users.

### Main Elements

- SelfX logo
- email field
- password field
- sign-in button
- forgot password
- optional MFA step when enabled

### States

- default
- submitting
- invalid credentials
- account suspended
- MFA required
- too many attempts
- server unavailable

---

## 5.2 Customer Authentication Screen

### Available Methods

- Email OTP
- Phone OTP
- Google
- Apple

### Flow

1. Customer chooses sign-in method.
2. Identity verification screen opens.
3. Verification succeeds.
4. User returns to the interrupted customer flow.

### OTP Screen

Should include:

- masked destination;
- OTP fields;
- verify button;
- resend control;
- countdown where appropriate;
- change email/phone;
- rate-limit feedback.

---

## 5.3 Organization Registration / Onboarding Status

### Purpose

Allow prospective organization owners to submit and track onboarding without exposing normal operational tenant functionality before activation.

### Registration Flow

1. User enters required applicant and organization information.
2. User submits registration.
3. UI confirms submission and shows onboarding status.
4. User can return to the onboarding/status area.

### Applicant Status States

Show clear status language for:

- draft;
- registration submitted;
- under review;
- more information/documents required;
- approved but activation pending;
- activated;
- rejected.

### Activation Boundary

Do not show the normal organization dashboard, store management, staff management, product management, kiosk operation, paid Try-On controls or normal tenant business APIs until the organization is `ACTIVE`.

An approved application may still show activation pending when commercial, payment, document, verification or contract prerequisites remain.

---

# 6. Organization Selection

Shown only when a user belongs to multiple organizations.

### Main Elements

- current user
- organization cards/list
- organization name
- organization status
- role
- switch action

### Behavior

Selecting an organization changes the active organization context.

The UI must not assume the selected organization is valid without backend confirmation.

Organizations in `PENDING_ACTIVATION`, `SUSPENDED` or `ARCHIVED` state must be visually distinguishable from active organizations.

Selecting a pending organization should route to the approved onboarding/status experience rather than the normal operational dashboard.

---

# 7. Organization / Store Portal Navigation

Recommended primary navigation:

- Dashboard
- Stores
- Staff
- Products
- Kiosks
- Try-On Activity
- Analytics
- Integrations
- Developer / API
- Usage & Billing
- Settings

Items appear only when allowed by role/entitlement.

A store-scoped user may see only the applicable store context.

This portal is the normal operational tenant experience and should only be shown for `ACTIVE` organizations unless a specific onboarding/status route is being shown instead.

---

# 8. Organization Dashboard

### Main Purpose

Provide an operational summary.

### Suggested Sections

- active stores
- online/offline kiosks
- Try-Ons today
- Try-On success rate
- recent activity
- usage summary
- integration health
- alerts/issues

### States

- loading
- no stores yet
- no Try-Ons yet
- partial data
- degraded integration
- suspended subscription

---

# 9. Store Management

## 9.1 Store List

### Elements

- search
- status filter
- store name
- location
- kiosk count
- staff count
- product count
- actions

### Actions

- create store
- open store
- edit store
- deactivate where permitted

---

## 9.2 Create/Edit Store

### Form Areas

- store name
- store code if required
- address/location details
- contact details
- status
- store-specific configuration

### States

- validation errors
- permission denied
- save in progress
- save successful
- save failed

---

## 9.3 Store Detail

Recommended tabs:

- Overview
- Staff
- Products
- Kiosks
- Try-On Activity
- Analytics
- Settings

---

# 10. Staff Management

## 10.1 Staff List

### Elements

- search
- role filter
- store filter
- status filter
- staff name/email
- role
- store scope
- status

### Actions

- invite staff
- edit access
- suspend/reactivate
- revoke sessions where permitted

---

## 10.2 Invite Staff

### Flow

1. Enter identity information.
2. Select predefined role.
3. Select organization/store scope.
4. Review.
5. Send invitation.

The UI must prevent assigning scopes/roles that the inviter cannot grant.

---

## 10.3 Staff Access Editor

### Sections

- role
- permissions summary
- allowed stores
- account status

Use clear warning/confirmation states for access removal or suspension.

---

# 11. Product Management

## 11.1 Product List

### Elements

- search
- source filter: SelfX / Shopify / WooCommerce / API
- VTO status filter
- store availability filter
- product image
- product name
- source
- VTO status
- stores
- last sync where relevant

### Actions

- create native product
- open product
- enable/disable VTO
- sync/retry where appropriate

---

## 11.2 Product Detail

Recommended sections:

- Product Information
- Garment Images
- VTO Configuration
- Store Availability
- External Mapping
- Integration Sync Status

Commerce fields imported from Shopify/WooCommerce should be visually identified as externally managed where appropriate.

---

## 11.3 VTO Configuration

### Controls

- VTO enabled/disabled
- approved garment image
- supported garment category
- organization/store availability
- generation profile if user is allowed to configure it

Provider-specific technical settings should not be exposed to normal merchant users.

---

# 12. Kiosk Management

## 12.1 Kiosk List

### Elements

- kiosk name
- store
- online/offline state
- app version
- last heartbeat
- pairing state
- health badge

### Filters

- store
- status
- version
- pairing state

---

## 12.2 Pair Kiosk

### Flow

1. Admin selects Pair Kiosk.
2. Pairing code/QR input appears.
3. Admin selects store.
4. Admin enters kiosk name.
5. Admin confirms.
6. Success screen shows paired device.

### Error States

- invalid/expired pairing code
- code already used
- permission denied
- device already paired

---

## 12.3 Kiosk Detail

Recommended tabs/sections:

- Overview
- Device Health
- Configuration
- Recent Activity
- Version
- Remote Actions

### Remote Actions

- refresh config
- force sync
- reset session
- disable
- unpair

Sensitive actions require confirmation.

---

# 13. Try-On Activity

## 13.1 Try-On List

Merchant-visible Try-On activity should show only data permitted by the PRD and user role.

Possible fields:

- Try-On ID
- product
- store
- channel
- status
- created time
- completion time

Generated-result visibility must follow approved Store Manager access rules.

Original customer photograph must not be shown to Store Managers.

---

## 13.2 Try-On Detail

Possible sections:

- status
- product
- store
- channel
- timestamps
- generated result where permitted
- provider-neutral error/status summary
- operational references for authorized SelfX staff

Raw provider credentials and sensitive customer data must never appear.

---

# 14. Analytics

### Main Views

- Try-Ons over time
- success/failure rate
- top products
- store comparison
- channel distribution
- kiosk utilization
- usage against allowance

SelfX Super Admin may additionally see:

- provider distribution
- provider latency
- provider cost
- queue health
- failure ratios

Charts should use the SelfX design system even when a specialized chart library is used.

---

# 15. Integrations

## 15.1 Integration List

Cards/rows for:

- Shopify
- WooCommerce
- future integrations

### Status

- connected
- syncing
- healthy
- degraded
- authentication required
- disconnected

---

## 15.2 Integration Detail

Recommended sections:

- connection status
- connected store/site
- last successful sync
- last reconciliation
- recent errors
- product count
- sync action
- disconnect action

Secrets are never displayed.

---

# 16. Developer / Public API UI

Visible only when Public API entitlement is enabled.

## 16.1 API Key List

### Elements

- key name
- prefix
- environment
- scopes
- created date
- last used
- status

### Actions

- create key
- revoke
- rotate where supported

The secret is shown only once at creation.

---

## 16.2 Create API Key

### Flow

1. Enter key name.
2. Select environment.
3. Select scopes.
4. Create.
5. Show secret once.
6. Require user acknowledgement before leaving.

---

## 16.3 Webhook Settings

### Elements

- endpoint URL
- subscribed events
- status
- secret rotation
- recent deliveries
- retry status

---

# 17. Usage & Billing

### Sections

- current subscription/trial
- usage this period
- generation allowance
- API allowance if applicable
- store/kiosk entitlement usage
- billing status
- invoices/payment management where enabled

### Trial State

Show both:

- time remaining
- generation usage remaining

### Suspended State

Clearly explain what is restricted without implying organization data is deleted.

---

# 18. SelfX Super Admin Navigation

Recommended areas:

- Platform Dashboard
- Organization Applications
- Organizations
- Stores
- Users
- Kiosks
- Try-Ons
- AI Providers
- Usage
- Subscriptions
- Integrations
- System Health
- Audit Logs
- Support

Platform actions must be permission-aware.

---

# 18.1 Organization Application Review UI

SelfX platform-admin UI should eventually include organization onboarding review.

### Main Views

- pending organization applications;
- application detail;
- applicant/business details;
- requirements/documents status;
- review notes;
- commercial status when available;
- audit history for review and activation actions.

### Actions

Actions appear only with explicit platform permissions:

- start review;
- request more information;
- approve application;
- reject application;
- activate organization;
- suspend organization.

### UI Rules

- Approval and activation are distinct actions.
- Application status and organization operational status must both be visible where applicable.
- `APPROVED` application with `PENDING_ACTIVATION` organization is a valid state.
- Review notes and metadata must not expose secrets or raw sensitive documents.
- Document upload/review implementation is deferred until the approved storage/document phase.
- Commercial/payment automation is deferred; manual confirmation by an authorized SelfX platform administrator may be shown as an activation prerequisite signal.

---

# 19. SelfX Platform Dashboard

Recommended high-level widgets:

- total organizations
- active stores
- active kiosks
- Try-On volume
- success rate
- queue depth
- provider health
- integration incidents
- subscription/usage alerts

Do not expose sensitive customer images on the platform dashboard.

---

# 20. AI Provider Operations UI

SelfX-only operational area.

### Possible Information

- provider name
- enabled/disabled
- health
- current capacity
- queue depth
- recent latency
- failure rate
- routing role
- configuration version

Provider credentials must never be displayed after secure configuration.

Normal organization users do not need provider-specific screens.

---

# 21. Support View

### Purpose

Allow authorized SelfX Support staff to inspect organization/store operational state.

### UI Rules

- clear Support Mode banner
- organization context always visible
- secrets hidden
- original customer photos hidden unless an explicit future policy permits otherwise
- sensitive actions audited

---

# 22. Impersonation UI

### Start Impersonation

1. Select organization.
2. Select store/context where applicable.
3. Select approved effective role/context.
4. Enter support reason.
5. Confirm.

### During Impersonation

Persistent banner must show:

- impersonation active
- target organization/store
- effective context
- exit action

The UI must never make impersonation visually indistinguishable from a normal login session.

---

# 23. Customer Kiosk Screen Flow

Recommended flow:

Welcome / Idle  
→ Consent  
→ Choose Try-On Type  
→ Select Garment OR Capture Physical Garment  
→ Customer Capture  
→ Preview  
→ Generate  
→ Queued / Processing  
→ Result  
→ Try Another / QR / Finish  
→ Session Cleanup  
→ Welcome / Idle

---

# 24. Kiosk Welcome / Idle Screen

### Purpose

Attract customer attention and start a clean session.

### Elements

- organization/store branding
- SelfX/white-label branding as entitled
- primary **Start Try-On** button
- optional promotional/product content
- privacy/help entry

No previous customer state may be visible.

---

# 25. Kiosk Consent Screen

### Elements

- concise privacy/AI processing notice
- image-retention summary
- disclosure about authorized Store Manager access to generated results as approved by the PRD
- Accept & Continue
- Cancel

Customer cannot proceed to capture without required consent.

---

# 26. Kiosk Try-On Type Selection

Where Scenario 2 is enabled:

- **Choose From Store Catalog**
- **Capture Physical Garment**

If physical garment capture is disabled, skip this screen.

---

# 27. Kiosk Catalog Browser

### Elements

- product grid
- garment image
- product name
- price if available
- category/filter/search
- availability where relevant

### Product Detail

- images
- product details
- variants where useful
- Try It On
- back to catalog

No checkout button is required.

---

# 28. Kiosk Customer Capture

### Elements

- live camera preview
- body-position guide
- clear capture button
- help/guidance
- cancel/back

### Preview Screen

- captured image
- Retake
- Continue

Do not display technical camera/provider errors to the customer.

---

# 29. Kiosk Physical Garment Capture

### Elements

- garment positioning guide
- camera preview
- capture button
- capture tips

### Preview

- garment photo
- Retake
- Continue

If input validation fails, explain the correction in customer-friendly language.

---

# 30. Kiosk Generating Screen

The kiosk must never freeze while AI runs.

### States

- validating
- queued
- processing
- recovering/retrying
- completed
- failed

### UX

Use friendly status text such as:

- Preparing your Try-On
- Your Try-On is in the queue
- Creating your look
- Almost ready

Do not display:

- provider name;
- provider request ID;
- HTTP errors;
- internal queue names.

Provide Cancel/Start Over only when safe.

---

# 31. Kiosk Result Screen

### Main Elements

- generated result
- selected product
- Try Another
- Retake
- QR / Continue on Phone
- Finish

If multiple garments are supported in-session, allow customer to return to the catalog without requiring another person photo.

---

# 32. Kiosk Failure Screen

Failure UI should distinguish recoverable actions without exposing technical details.

Possible actions:

- Retry
- Retake Photo
- Choose Another Garment
- Start Over
- Finish

If service is temporarily unavailable, provide a clear non-blaming message.

---

# 33. Kiosk Offline Screen

If connectivity is unavailable:

- explain Try-On generation requires connection;
- optionally allow cached product browsing;
- provide retry connection action;
- do not silently retain large amounts of customer imagery for later submission.

---

# 34. Kiosk QR Handoff Screen

### Elements

- QR code
- selected product
- brief instruction
- expiration guidance if appropriate
- Finish

The QR itself contains only the opaque SelfX handoff token/link.

---

# 35. Customer Mobile / Web Product Flow

Recommended product screen:

- product image/gallery
- product name
- merchant
- price
- variants where applicable
- product details
- **Try It On**
- **Continue to Store / Buy at Merchant** where appropriate

The purchase destination belongs to the merchant.

---

# 36. Customer Mobile / Web Try-On Flow

Product  
→ Try It On  
→ Choose/Re-use Person Image  
→ Consent if required  
→ Preview  
→ Generate  
→ Queued/Processing  
→ Result  
→ Save / Try Another / Continue to Merchant

Authenticated users may access history.

Anonymous users may be prompted to sign in only when they choose to save/access later.

---

# 37. Customer History UI

### List

- result thumbnail while retained
- product
- merchant
- date/time
- status

### Expired Image State

When image retention expires:

- do not show a broken image;
- show a clear placeholder;
- retain permitted product/history metadata;
- allow merchant product continuation where valid.

---

# 38. QR Mobile Continuation

When customer scans kiosk QR:

### Possible Screen

- generated result where still permitted
- selected product
- merchant
- product details
- continue to merchant
- sign in to save

Expired/invalid handoff tokens should show a clear expired-session screen rather than a generic server error.

---

# 39. Shopify Storefront Try-On UI

SelfX appears alongside the normal Shopify product experience.

Typical placement:

Product information  
→ variant selection  
→ **Try It On**  
→ Add to Cart / Buy Now

Try-On may open as:

- modal;
- drawer;
- embedded panel;
- another approved theme-extension pattern.

Core flow:

Start Try-On  
→ person image  
→ preview  
→ generate  
→ result  
→ close/continue shopping

Shopify checkout remains unchanged.

---

# 40. WooCommerce Storefront Try-On UI

The WooCommerce experience follows the same SelfX Try-On interaction model as Shopify.

Merchant styling may differ, but the Try-On steps and status behavior should remain recognizable.

WooCommerce cart/checkout remains unchanged.

---

# 41. Shared Loading States

Every major data-driven screen should define:

- initial skeleton/loading;
- inline action loading;
- background refresh;
- retry state.

Avoid blank screens with only a spinner when meaningful skeletons/statuses can be shown.

---

# 42. Shared Empty States

Examples:

- No stores yet → Create Store
- No staff yet → Invite Staff
- No products → Add/Connect Products
- No kiosks → Pair Kiosk
- No API keys → Create API Key
- No Try-Ons → explain that activity will appear after first generation
- No integrations → Connect Shopify/WooCommerce

Empty states should usually include the next useful action when the user has permission.

---

# 43. Shared Error States

Errors should be grouped into user-meaningful categories:

- validation error
- permission denied
- subscription/entitlement restriction
- network error
- service temporarily unavailable
- Try-On input problem
- Try-On provider failure
- integration authentication required

Do not expose stack traces or raw provider errors.

---

# 44. Permission-Aware UI

The UI must respect roles and scopes.

Examples:

- Store Staff should not see platform billing.
- Store Manager should not see unrelated stores.
- Organization Admin may see organization-wide controls if permitted.
- SelfX Support sees only support-authorized functions.
- Public API settings appear only with entitlement and permission.

Hiding controls is a UX measure only; backend authorization remains mandatory.

---

# 45. Suspended / Grace State UX

When an organization is in pending activation, grace or suspended state:

- show a clear banner/status;
- explain affected capabilities;
- preserve access to allowed business data;
- provide resolution/contact/billing action where appropriate;
- do not imply data has been deleted.

Pending activation should direct the applicant to onboarding/status actions and must not expose normal operational dashboard functionality.

Try-On generation may be disabled while read-only/management capabilities remain according to policy.

---

# 46. Responsive Web Behavior

Organization/SelfX dashboards should primarily optimize for desktop/tablet administration while remaining usable on smaller screens.

Responsive rules should include:

- collapsible navigation;
- stacked cards;
- responsive tables or alternate list/card views;
- dialogs/drawers appropriate to screen size;
- accessible touch targets.

---

# 47. Accessibility

SelfX web UI should follow standard accessibility practices including:

- keyboard navigation;
- visible focus;
- semantic form labels;
- accessible dialogs;
- meaningful status text;
- sufficient contrast;
- alternative text where appropriate.

Camera/Try-On instructions should use both visual and textual cues when practical.

---

# 48. Confirmation Patterns

Sensitive actions require explicit confirmation.

Examples:

- unpair kiosk;
- disable staff;
- revoke API key;
- disconnect integration;
- start impersonation;
- suspend organization where applicable.

Confirmation dialogs should clearly state impact and avoid vague labels like “Are you sure?” without context.

---

# 49. Notification Patterns

Use consistent UI notifications:

- toast for lightweight success;
- inline validation for form issues;
- banner for persistent system/organization state;
- modal/dialog for destructive confirmation;
- dedicated screen for full-flow failures.

---

# 50. UI/UX Guardrails

Do not:

- show raw provider terminology to customers;
- expose secrets in admin screens;
- expose original customer images to Store Managers;
- make customers log in before basic anonymous kiosk Try-On;
- place checkout/payment UI on the kiosk in the initial product;
- create inconsistent screen patterns for the same action across modules;
- introduce another full design system without justification;
- rely on hidden UI controls as authorization;
- display previous customer kiosk data after session reset;
- use permanent public customer-image URLs.

---

# 51. Status

**UI/UX Flow & Screen Specification v1.0 — APPROVED BASELINE**

This document is sufficient to guide detailed Figma/design work and implementation planning while leaving exact visual styling and component composition to the approved SelfX design system.
