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

## User Journeys & System Flows

**Version:** 1.0  
**Status:** APPROVED BASELINE  
**Document:** `03-USER-JOURNEYS.md`

---

## STORE-1 Journey Addendum

**Status:** UPDATED

New Store management journeys use the hierarchy:

```text
SelfX Platform
→ Store
→ Kiosks
```

### SelfX Super Administrator — Store Management

Preconditions:

- The user is authenticated as an authorized SelfX platform administrator.

Main flow:

1. Administrator opens Stores.
2. Administrator creates a Store with name, slug and optional contact/location
   profile.
3. SelfX stores the merchant tenant internally and returns it as a product
   Store.
4. Administrator opens the Store Dashboard.
5. Administrator reviews Store status, kiosk counts and Store-owned kiosks.
6. Administrator may edit Store profile details, deactivate/reactivate the
   Store, pair a kiosk or configure a Store-owned kiosk.

Alternate flows:

- Duplicate Store slug returns a conflict.
- Unauthorized platform user is denied before Store mutation.
- Inactive Store remains visible but cannot receive new kiosk pairing or
  assignment.
- A kiosk from another Store is not accessible through nested Store kiosk
  routes.

End state:

- Store details remain durable.
- Store-owned kiosk assignment and configuration remain intact.
- Product UI uses Store terminology.

---

## 1. Purpose

This document defines the major end-to-end user and system journeys for the SelfX Virtual Try-On platform.

It explains:

- who starts each journey;
- what must already be true;
- the normal flow;
- important alternate/failure flows;
- the expected end state.

This document does not define detailed UI layouts, component styling, database tables, or implementation tasks.

Those belong in:

- `04-UI-UX-FLOW.md`
- `05-DATABASE-SCHEMA.md`
- `06-IMPLEMENTATION-PLAN.md`

---

## 2. Journey Principles

All journeys must follow these platform rules:

- All clients use the SelfX backend.
- Customers may perform basic Try-On anonymously.
- Customer authentication is required to save and later access Try-On history.
- Customer images and generated Try-On images follow the approved 7-day retention policy.
- Organizations and stores remain tenant-isolated.
- Kiosks authenticate as devices, not as staff users.
- AI generation is asynchronous and queue-based.
- One normal Try-On uses one active provider attempt at a time.
- Provider capacity overflow is queued.
- Shopify/WooCommerce remain responsible for commerce checkout.
- Kiosk checkout/payment is not part of the initial product.
- QR handoff is used to continue from kiosk to mobile/product destination.
- Staff access is limited by organization, role, permission, and store scope.

---

# 3. Customer Journeys

## 3.1 Anonymous Kiosk Customer — Catalog Garment Try-On

### Primary Actor

Customer

### Supporting Actors

- SelfX kiosk
- SelfX backend
- AI provider
- Merchant product catalog

### Preconditions

- Kiosk is paired to an organization and store.
- Kiosk is online.
- Store has at least one VTO-enabled garment.
- Kiosk configuration and catalog are available.

### Main Flow

1. Customer approaches the kiosk.
2. Kiosk starts a new customer session.
3. Customer is shown the required privacy/AI-processing consent.
4. Customer accepts consent.
5. Customer browses available garments.
6. Customer selects a garment.
7. Customer starts the Try-On flow.
8. Kiosk opens the customer camera flow.
9. Customer positions themselves using on-screen guidance.
10. Customer captures a photo.
11. Kiosk shows a preview.
12. Customer either retakes or confirms the photo.
13. Kiosk requests authorized upload access from SelfX.
14. Customer photo is uploaded to private SelfX storage.
15. SelfX validates the Try-On request.
16. SelfX creates a Try-On record.
17. SelfX checks organization entitlement/quota.
18. SelfX queues the generation.
19. Customer sees a non-blocking generation/progress state.
20. A worker receives the Try-On job.
21. Provider Router selects the allowed provider.
22. Provider adapter submits the generation request.
23. SelfX receives/reconciles the provider result.
24. Generated result is stored privately in SelfX storage.
25. Try-On becomes completed.
26. Kiosk displays the generated result.
27. Customer may:
    - try the same person image with another garment;
    - retake their photo;
    - select the product as an item of interest;
    - finish the session.
28. If the customer selects the product, the kiosk may offer QR handoff.
29. Customer finishes or the session expires.
30. Kiosk clears all customer-specific local session data.
31. Kiosk returns to the idle state.

### Alternate / Failure Flows

- Customer rejects consent → Try-On does not proceed.
- Camera permission/device fails → kiosk shows a recoverable camera error.
- Customer image is unsuitable → customer is asked to retake.
- Provider capacity is full → Try-On remains queued.
- Primary provider is unavailable → approved routing policy may use another provider.
- No fallback is allowed → request remains queued or fails gracefully according to policy.
- Generation returns unrecoverable input failure → customer is asked to retake/change input.
- Internet becomes unavailable before submission → generation cannot start.
- Internet is lost after submission → kiosk recovers the existing Try-On by ID when connectivity returns.
- Session is abandoned → kiosk clears customer data after timeout.

### End State

- Customer sees a Try-On result or a clear failure/retry state.
- Customer-specific kiosk state is cleared.
- Try-On metadata is retained according to policy.
- Original and generated customer images follow the 7-day retention rule.

---

## 3.2 Kiosk Customer — Physical Garment Capture Try-On

### Primary Actor

Customer

### Preconditions

- Kiosk is paired and online.
- Physical garment capture is enabled for the store/channel.
- Camera is available.

### Main Flow

1. Customer starts a new kiosk session.
2. Customer accepts the required consent.
3. Customer selects the physical-garment Try-On option.
4. Customer chooses intended garment scope: Top, Bottom or Full Outfit.
5. Customer adds the garment photo using either the kiosk camera or a phone QR
   upload.
6. Customer confirms or retakes/chooses another garment photo.
7. Customer adds their own model/person photo using either the kiosk camera or a
   phone QR upload.
8. Customer confirms or retakes/chooses another model/person photo.
9. Person and garment images are uploaded through authorized SelfX upload flows.
10. SelfX creates the Try-On.
11. Request is validated and queued.
12. Provider Router selects the provider.
13. Worker processes the generation.
14. Result is stored privately.
15. Customer views the completed Try-On.
16. Customer may retry with another garment/photo.
17. Customer may continue through QR handoff if an associated product/destination exists.
18. Customer finishes.
19. Kiosk clears the session.

### Alternate / Failure Flows

- Garment image is unsupported/low quality → recapture requested.
- Provider rejects the garment/photo combination → customer receives a recoverable explanation.
- Product is not mapped to an ecommerce destination → QR may provide only available product information or be unavailable.
- Connectivity/provider failure → normal queue/retry/failure handling applies.

### End State

Same retention and session-cleanup rules as the catalog Try-On journey.

---

## 3.2.1 Internal Development Tester — CORE VTO-1 Try-On Lab

### Primary Actor

Authenticated SelfX staff/developer tester

### Preconditions

- Staff/admin authentication is available.
- `TRYON_LAB_ENABLED=true` in the controlled development environment.
- `FASHN_API_KEY` is configured server-side for real provider smoke testing, or
  the provider is mocked during automated tests.
- In production web deployments, browser API requests use same-origin
  `/api/v1/*` paths through the web proxy; the Lab keeps multipart uploads on
  the same API path shape.

### Main Flow

1. Tester opens `/app/try-on-lab`.
2. SelfX shows an internal authorized-use notice: "Internal testing only.
   Upload only images you are authorized to process."
3. Tester uploads a local person image and a local garment image in the Images
   section.
4. Browser-side OpenCV.js is lazy-loaded for image-quality preflight.
5. SelfX displays provider-neutral quality metrics, blocking problems and
   warnings.
6. Technical validation blocks only invalid, unsupported, corrupt/undecodable,
   oversized or unsafe uploads.
7. Quality concerns such as blur, exposure, low contrast, low resolution and
   body/garment framing are warnings for uploaded images.
8. If warnings exist, tester may re-upload or choose Proceed anyway. OpenCV
   analysis failure after technical validation appears as an advisory
   analysis-unavailable warning, not an image-invalid failure.
9. SelfX automatically resolves garment intent, garment photo type and the
   balanced interactive generation profile from direct-upload analysis and
   platform policy.
10. If the garment image appears to include multiple clothing areas, SelfX asks
    one focused question: "We found multiple clothing areas in this image.
    Which item would you like to try on?" Choices are Upper garment, Lower
    garment, One-piece and Full outfit.
11. Tester starts Generate Try-On from the Generate Try-On section.
12. Web submits validated multipart input and safe warning, resolution and
    override metadata
   to the SelfX API.
13. SelfX API validates file count, size, MIME type, image signatures and
   decodable dimensions.
14. SelfX creates an ephemeral UUIDv7 lab run ID and submits through the
   provider-neutral adapter.
15. The FASHN adapter maps SelfX values to FASHN `tryon-v1.6`.
16. Web polls SelfX by lab run ID.
17. Tester sees safe current-run telemetry details, including automatic
    resolution source and confidence where available.
18. Tester sees the person image, garment image and generated result or a
    provider-neutral failure state in the Result section.
19. Tester may choose Try Another Garment to retain the person image while
    clearing garment, garment-quality and run state, or New Try-On to clear all
    images, warning overrides and run state.

The Lab retains a collapsed internal Advanced settings area for development
overrides of garment intent, garment photo type and generation profile. This is
not part of the normal customer, kiosk or public API user journey.

For uploaded images, body-region recommendations are advisory unless a
downstream provider or later approved production policy defines a real
technical requirement. Future kiosk/live capture will use OpenCV more strictly
for guided capture readiness because SelfX controls the camera flow.

### Boundary

This is not the production kiosk/customer/public API Try-On journey. It does
not create durable Try-On records, customer consent records, assets,
ProviderAttempt rows, queue jobs, usage ledger entries or 7-day retention jobs.
The absence of a customer-style consent checkbox in the internal Lab does not
change customer-facing consent requirements.

---

## 3.3 Reuse Customer Photo for Multiple Garments

### Primary Actor

Customer

### Preconditions

- Customer has already captured/confirmed a photo in the active session.
- The current customer session has not expired.

### Main Flow

1. Customer completes one Try-On.
2. Customer chooses another garment.
3. SelfX reuses the approved person image from the active session.
4. A new Try-On record is created for the new garment.
5. New Try-On is queued and generated.
6. Customer sees the new result.
7. Customer may repeat this flow for additional garments.

### Rules

- Reuse is scoped to the customer/session unless account-based history explicitly permits another approved flow.
- Reuse must not extend image retention beyond approved policy.
- Another kiosk customer must never inherit the previous customer's image.

---

## 3.4 QR Handoff — Kiosk to Mobile

### Primary Actor

Customer

### Preconditions

- Customer has an active kiosk session.
- A completed or valid handoff state exists.
- QR handoff is enabled.

### Main Flow

1. Customer selects QR handoff.
2. Kiosk requests a handoff token from SelfX.
3. SelfX creates a short-lived opaque handoff token.
4. Kiosk displays a QR code containing a SelfX handoff URL/token.
5. Customer scans the QR using their phone.
6. SelfX validates the token.
7. Customer sees the allowed handoff experience.
8. Depending on the flow, customer may see:
   - product details;
   - selected product;
   - merchant product link;
   - generated Try-On result where allowed;
   - sign-in/save option.
9. If customer wants to save history, they authenticate or create a SelfX customer account.
10. If customer wants to purchase, they continue to the merchant's product destination.
11. Merchant handles checkout/payment.

### Security Rules

- QR must not contain raw customer-image URLs.
- QR must not contain passwords, API keys, or provider data.
- Handoff token must be short-lived and scoped.
- Expired/revoked token must fail safely.

### End State

Customer has securely continued the kiosk experience on their phone without SelfX becoming the merchant checkout system.

---

## 3.5 Registered Customer — Mobile/Web Try-On

### Primary Actor

Registered Customer

### Preconditions

- Customer has a SelfX account.
- Customer is authenticated.
- A participating organization's product is available.

### Main Flow

1. Customer opens a garment/product detail screen.
2. Customer selects **Try It On**.
3. Customer chooses an existing permitted person image or captures/uploads a new image.
4. Customer accepts required processing consent when applicable.
5. Image is uploaded securely.
6. SelfX creates and queues the Try-On.
7. Customer sees generation progress.
8. SelfX completes the Try-On.
9. Customer views the result.
10. Completed Try-On appears in the customer's saved history according to policy.
11. Customer may continue to the merchant's purchase destination.
12. Merchant handles checkout/payment.

### Alternate Flows

- Login session expired → customer re-authenticates.
- Product is no longer VTO-enabled → Try-On option is hidden/disabled.
- Product becomes unavailable → merchant source-of-truth status is respected.
- Try-On fails → retry/retake flow is offered.

---

## 3.6 Customer Registration / Sign-In

### Primary Actor

Customer

### Supported Methods

- Email OTP
- Phone OTP
- Google
- Apple

### Main Flow

1. Customer selects sign in/save.
2. Customer chooses an authentication method.
3. Identity is verified.
4. SelfX resolves or creates the global SelfX customer account.
5. If safe/approved, the new identity may be linked to an existing SelfX customer.
6. SelfX establishes its own customer session.
7. Customer continues to their intended action.
8. Applicable anonymous session history may be associated with the authenticated customer when permitted.

### Failure Flows

- Invalid/expired OTP → retry within configured limits.
- OAuth failure → return to sign-in choices.
- Identity-link conflict → do not silently merge accounts.
- Rate limit exceeded → temporary safe lockout/retry response.

---

## 3.7 Customer Saved Try-On History

### Primary Actor

Registered Customer

### Main Flow

1. Customer opens Try-On history.
2. SelfX returns only that customer's permitted history.
3. History may include:
   - product;
   - merchant/organization;
   - store where applicable;
   - channel;
   - timestamp;
   - status;
   - result image while still within retention.
4. Customer opens a history item.
5. If image retention has expired, SelfX may show non-image history without the deleted original/result image.
6. Customer may continue to the merchant product link where still valid.

### End State

Customer history remains usable without violating the 7-day image-retention policy.

---

## 3.2.2 Staff/Admin Web Session Restoration

### Primary Actor

Authenticated SelfX staff or platform administrator

### Main Flow

1. User signs in through the production web origin.
2. Browser sends `POST /api/v1/auth/login` to the same web origin.
3. Next.js proxies the request to SelfX API using the server-only upstream URL.
4. SelfX API returns the access token response and sets the HttpOnly refresh
   cookie on the browser-facing `/api/v1/auth` path.
5. User clicks internal AppShell navigation such as Stores or Dashboard.
6. The shell uses client-side routing, so the in-memory access token remains
   available and the document is not reloaded.
7. User reloads, opens a direct `/app/stores` URL or opens a new tab.
8. `SessionProvider` mounts, calls `POST /api/v1/auth/refresh` on the same web
   origin, the browser sends the refresh cookie, and the authenticated session
   is restored if the refresh session is valid.

### Notes

The refresh token is never exposed to JavaScript or stored in localStorage or
sessionStorage. The same-origin web proxy does not replace SelfX API tenant
authorization and is not a general API Gateway.

---

# 4. Organization and Store Journeys

## 4.0 Production Platform Initialization

### Primary Actor

SelfX production operator

### Main Flow

1. Operator deploys the SelfX API and web frontend against the production
   PostgreSQL database.
2. Operator confirms production health and readiness are online.
3. Operator sets the temporary production bootstrap gates and first-admin
   email/password/display-name variables in the production API environment.
4. Operator manually runs the one-time production platform admin bootstrap
   command against the deployed API environment.
5. SelfX verifies the production user database is empty, locks the bootstrap
   transaction, creates the first user and assigns active `SELFX_SUPER_ADMIN`
   atomically.
6. Operator removes the temporary bootstrap gates and credential variables from
   Railway and applies the variable removal as needed.
7. The initialized platform administrator signs in through the standard
   production frontend login flow.

### Alternate / Refusal Flows

- If `NODE_ENV` is not production or either explicit safety gate is missing,
  the command refuses without database mutation.
- If users already exist in any incompatible state, the command refuses without
  resetting passwords, promoting users or changing email addresses.
- If the exact first administrator is already active with active
  `SELFX_SUPER_ADMIN`, a retry reports initialization complete and performs no
  mutation.

### Boundary

There is no public bootstrap endpoint, setup route, signup shortcut, direct SQL
procedure or automatic startup seed for creating the first production platform
administrator.

## 4.1 Organization Creation — SelfX Admin

### Primary Actor

SelfX Super Admin

### Main Flow

1. SelfX admin opens organization management.
2. Admin creates a new organization shell or onboarding application.
3. Admin enters required organization information.
4. SelfX records onboarding/application status separately from organization operational status.
5. Organization status begins as `PENDING_ACTIVATION` unless an explicit activation action is completed.
6. Initial commercial, document, contract or entitlement requirements may be reviewed manually.
7. Intended organization owner/admin access may be recorded, but normal tenant operation is not available before activation.
8. Authorized SelfX platform administrator approves or rejects the application.
9. If activation prerequisites are satisfied, authorized SelfX platform administrator activates the organization.
10. Audit events are recorded for creation/submission, review, approval/rejection and activation.

### End State

Organization exists in onboarding/review or becomes `ACTIVE` only after explicit platform activation.

---

## 4.2 Organization Self-Registration

### Primary Actor

Prospective Organization Owner

### Main Flow

1. User begins SelfX organization registration.
2. User verifies account identity.
3. User provides organization information.
4. SelfX creates or updates an onboarding application.
5. A pending organization shell may be created with operational status `PENDING_ACTIVATION`.
6. The submitting user may be recorded as the intended initial `ORGANIZATION_OWNER`.
7. The intended owner membership remains pending activation and cannot perform normal tenant operations.
8. Application status moves through `SUBMITTED`, `UNDER_REVIEW`, `NEEDS_INFORMATION`, `APPROVED` or `REJECTED`.
9. SelfX reviews required information, documents and commercial prerequisites according to the applicable onboarding model.
10. Authorized SelfX platform administrator approves or rejects the application.
11. If the application is approved but activation prerequisites remain, the organization stays `PENDING_ACTIVATION`.
12. When all required activation conditions are satisfied, authorized SelfX platform administrator activates the organization.
13. The approved initial owner membership becomes active and usable for normal tenant authorization.
14. User may proceed to organization setup only after activation.

### Notes

Self-service onboarding may be gated during early rollout without changing the underlying architecture.

Registration is not activation. A submitted or approved application must not expose normal store management, membership administration, product management, kiosk operation, paid Try-On execution or normal tenant business APIs before organization activation.

---

## 4.2.1 Organization Applicant Status

### Primary Actor

Prospective Organization Owner

### Preconditions

- User has submitted or drafted an organization application.

### Main Flow

1. User opens the organization onboarding/status area.
2. SelfX shows the current application status:
   - DRAFT;
   - SUBMITTED;
   - UNDER_REVIEW;
   - NEEDS_INFORMATION;
   - APPROVED;
   - REJECTED.
3. SelfX separately shows the organization operational status where a pending organization shell exists:
   - PENDING_ACTIVATION;
   - ACTIVE;
   - SUSPENDED;
   - ARCHIVED.
4. If more information or documents are required, user sees the requested items and permitted next action.
5. If application is approved but activation is pending, user sees that activation prerequisites remain.
6. If organization becomes active, user can enter the normal organization setup/dashboard according to their membership permissions.
7. If application is rejected, user sees the approved rejection/status messaging and any permitted follow-up path.

### Rule

The applicant status experience is explicitly approved onboarding/status functionality and is not the normal operational organization dashboard.

---

## 4.3 Create and Configure Store

### Primary Actor

Organization Owner/Admin

### Preconditions

- User has store-management permission.
- Organization operational status is `ACTIVE`.
- User has an active membership in the active organization.

### Main Flow

1. User opens store management.
2. User creates a store/branch.
3. User enters store details.
4. SelfX creates the store under the current organization.
5. User configures relevant store settings.
6. User assigns staff where needed.
7. Products may be enabled/assigned for the store.
8. Kiosks may later be paired to the store.
9. Audit event is recorded.

### Security Rule

Store must always belong to the active authorized organization.

---

## 4.4 Independent Retailer Onboarding

### Primary Actor

Independent Retailer

### Rule

An independent retailer uses the normal structure:

Organization → One Store

### Flow

The onboarding journey is the same as organization + store onboarding.

A separate special backend architecture must not be created for independent stores.

---

## 4.5 Staff Invitation and Access Assignment

### Primary Actor

Authorized Organization/Store Administrator

### Main Flow

1. Admin opens staff management.
2. Admin chooses **Invite Staff**.
3. Admin enters staff identity details.
4. Admin selects a predefined role.
5. Admin selects organization/store scope.
6. SelfX validates that the inviter is allowed to grant that scope.
7. Invitation is created.
8. Staff member accepts invitation and authenticates.
9. Membership becomes active.
10. Audit event is recorded.

### Alternate Flows

- User already has a SelfX account → membership is added to the existing user.
- User already belongs to another organization → existing identity is reused; memberships remain separate.
- Inviter attempts to grant a higher scope than allowed → request denied.

---

## 4.6 Modify / Suspend Staff

### Primary Actor

Authorized Organization/Store Administrator

### Main Flow

1. Admin selects a staff membership.
2. Admin changes role/store scope or suspends access.
3. SelfX validates authorization.
4. Membership is updated.
5. Active permissions immediately reflect the change.
6. Sessions may be revoked where required.
7. Audit event is recorded.

### Security Rule

Removing access must not depend on waiting for a long-lived client token to expire.

---

## 4.7 Organization Switching for Multi-Organization User

### Primary Actor

Staff/Admin User

### Preconditions

- User belongs to more than one organization.

### Main Flow

1. User signs in once.
2. SelfX shows permitted organizations.
3. User selects an organization.
4. Frontend updates active organization context.
5. Each backend request independently validates membership.
6. User works within that organization's allowed store scope.
7. User may switch to another permitted organization later.

### Security Rule

Changing an organization ID manually must not grant access.

---

# 5. Product and Catalog Journeys

## 5.1 Native SelfX Product Creation

### Primary Actor

Authorized Organization User

### Main Flow

1. User opens product management.
2. User creates a product/garment.
3. User enters required product information.
4. User uploads/selects garment image.
5. Product is assigned organization-wide or to selected stores.
6. VTO eligibility/configuration is defined.
7. Product becomes available to approved channels.

### Boundary

SelfX stores only the product/catalog information required for Try-On and approved integrations.

It is not a full inventory/POS workflow.

---

## 5.2 Imported Product Configuration

### Primary Actor

Authorized Merchant User

### Preconditions

- Shopify/WooCommerce integration is connected.
- Product has been synchronized.

### Main Flow

1. User opens synchronized products.
2. User selects a product.
3. SelfX shows imported commerce information.
4. User enables/disables VTO.
5. User selects/configures the garment image where required.
6. User configures store availability or VTO-specific settings.
7. SelfX stores VTO-specific configuration without replacing the external commerce source of truth.

---

# 6. Kiosk Management Journeys

## 6.0 Internal Operator — KIOSK-1 Camera Foundation

### Primary Actor

SelfX developer or authorized kiosk operator validating kiosk hardware.

### Preconditions

- The Flutter kiosk app is running on Windows desktop.
- KIOSK-1 is being used for local camera development only.
- A physical camera may or may not be connected.

### Main Flow

1. Operator opens the SelfX kiosk development home.
2. Operator starts camera test or opens camera settings.
3. Kiosk enumerates available Windows camera devices.
4. Integrated and external USB/UVC cameras are shown through the same device
   selection model.
5. If a locally preferred camera exists and is still available, kiosk attempts
   to initialize it.
6. If the preferred camera is missing, kiosk rediscovers cameras and lets the
   operator select another device.
7. Operator views a large live preview with static framing guidance.
8. Operator captures one still image.
9. The original capture remains local and temporary.
10. OpenCV analyzes a derived/downscaled copy for image quality.
11. Kiosk shows the captured image, quality summary, **Retake** and
    **Use Photo**.
12. **Retake** deletes/replaces the local capture where practical.
13. **Use Photo** accepts the capture into the local development session only.

### Alternate / Failure Flows

- No camera detected -> show no-camera state and refresh action.
- Camera permission/access denied -> show recoverable camera error.
- USB camera is unplugged or preview/capture fails -> dispose safely,
  rediscover devices and allow retry/selection.
- OpenCV analysis fails after the image is technically readable -> show an
  advisory analysis-unavailable warning rather than invalidating the capture.
- Technical invalidity, corrupt capture or unreadable file -> block **Use
  Photo** until retake.

### Boundary

KIOSK-1 does not collect production customer consent, upload images, create
Try-Ons, call SelfX Try-On APIs, call FASHN, perform live OpenCV, run
pose/body-landmark detection, show product selection, perform QR handoff or
store server-side camera configuration.

## 6.0.1 Internal Operator — KIOSK-1.5 Android Primary Validation

### Primary Actor

SelfX developer or authorized kiosk operator validating Android kiosk hardware.

### Preconditions

- The Flutter kiosk app is built as an Android APK.
- Android is the primary kiosk deployment target.
- Windows remains supported for desktop and Windows kiosk testing.
- SelfX commercial rental kiosks currently use primarily 32-inch and 42-inch
  vertically mounted displays.
- A physical Android box may or may not be attached during development.

### Main Flow

1. Operator installs the SelfX kiosk APK on an Android box.
2. Operator launches the same `mobile/kiosk` Flutter application.
3. The app presents portrait-first kiosk screens with immersive presentation.
4. Operator grants camera permission when Android requests it.
5. Kiosk enumerates cameras exposed through Android CameraX.
6. Integrated and externally exposed cameras are shown through the same
   `CameraDevice` selection model.
7. Operator selects or restores a locally preferred camera.
8. Operator verifies preview, still capture, quality review, **Retake** and
   local-only **Use Photo**.
9. Operator plugs in a USB webcam where hardware supports it and refreshes
   detected cameras.

### Alternate / Failure Flows

- Android camera permission denied -> show a recoverable permission/camera
  error.
- Camera permission permanently denied -> instruct the operator to enable it in
  Android settings.
- USB webcam does not appear through CameraX -> record the hardware limitation;
  do not add a UVC stack until certified hardware testing proves it is needed.
- No Android hardware is attached during development -> automated tests and APK
  builds can still pass, with hardware verification pending.

### Boundary

KIOSK-1.5 does not implement production kiosk pairing, fleet management, live
OpenCV, pose/body landmarks, subject-aware exposure, SelfX Try-On API upload,
FASHN/provider calls, catalog/product flow or QR handoff.

## 6.0.2 Customer/Operator — KIOSK-1.6 Assisted Capture Validation

### Primary Actor

Customer or authorized kiosk operator validating customer capture UX.

### Preconditions

- The same Flutter kiosk app is running on Android or Windows.
- A camera is available and initialized.
- KIOSK-1.6 is still a local capture foundation; no SelfX Try-On upload or
  provider execution is connected.

### Main Flow

1. Customer/operator opens the customer camera screen.
2. The screen shows **Take Photo** and does not show instant **Capture Now**.
3. Customer/operator presses **Take Photo**.
4. Kiosk reads the local countdown duration preference, defaulting to 10
   seconds when unset.
5. Kiosk shows the live preview with only camera/framing overlays.
6. Kiosk shows countdown/customer guidance in a separate guidance panel below
   the preview on portrait kiosk displays.
7. Kiosk shows scripted guidance such as stepping into position, moving to a
   comfortable distance, centering and holding still.
8. If sounds are enabled locally, kiosk plays countdown cues and selected local
   sound-profile cues. If sound fails or is disabled, capture continues
   silently.
9. Customer/operator may press **Cancel** during countdown.
10. If cancelled, kiosk stops the timer, prevents delayed capture and returns to
   preview.
11. If countdown completes, kiosk captures exactly one still photo.
12. After still capture succeeds, kiosk may play shutter/capture-success audio.
    If capture fails, no success cue is played.
13. Kiosk shows **Checking your photo** while existing OpenCV still-image
    analysis runs.
14. Kiosk opens Review with captured image, quality summary, **Retake** and
    **Use Photo**.
15. **Retake** clears/replaces the local temporary capture and returns to
    preview.
16. **Use Photo** accepts non-blocked captures and opens Photo Ready.
17. Photo Ready shows **Retake** and **Continue**.
18. **Continue** shows the temporary local-session placeholder until product
    selection and Try-On submission are approved in a later phase.

### Alternate / Failure Flows

- Countdown preference is missing or unsupported -> kiosk uses 10 seconds.
- Technical invalidity/corrupt capture -> **Use Photo** remains blocked until
  retake.
- Quality warnings, including analysis unavailable, remain advisory -> customer
  may retake or use the photo.
- Camera capture fails -> kiosk enters a recoverable error state and allows
  retry/preview recovery; capture-success audio is not played.

### Boundary

KIOSK-1.6 scripted guidance is not live readiness detection. It does not detect
person position, multiple people, body coverage, pose, lighting, distance or
subject exposure. Those capabilities belong to KIOSK-2 live subject-aware
analysis.

## 6.0.3 Customer/Operator — KIOSK-2A Live Capture Readiness

### Primary Actor

Customer, assisted by an authorized kiosk operator when needed.

### Preconditions

- The same Flutter kiosk app is running on Android or Windows.
- Android is the primary live-readiness platform.
- Windows remains supported; if live frames are unavailable, the app falls back
  to scripted assisted capture.
- KIOSK-2A does not upload frames, submit Try-On requests or call FASHN/provider
  services.

### Main Flow

1. Customer opens the kiosk capture flow.
2. Customer selects CaptureScope: **TOP**, **BOTTOM** or **FULL BODY**.
3. Kiosk opens the camera screen with the matching subtle framing guide inside
   the preview.
4. Customer presses **Take Photo**.
5. On Android with live frame support, kiosk samples local frames at an adaptive
   target of about 3 FPS and evaluates readiness on-device.
6. Customer guidance stays below the preview in `CaptureGuidancePanel`.
7. Kiosk guides the customer with friendly messages such as **Move back
   slightly**, **Center yourself**, **More light is needed**, **Hold still**,
   **Almost ready** or **Ready**.
8. Kiosk selects one local PrimarySubject: the prominent/target customer who is
   the intended model for this capture session. This uses visual prominence,
   not true physical distance or identity recognition.
9. With the current ML Kit pose path, the kiosk receives only one
   tracked/prominent pose. It must not claim reliable active multi-person
   detection, background-bystander classification or competing-person blocking.
10. The selected PrimarySubject is locked ephemerally across analyzed frames so
    small movement, confidence jitter or brief background motion does not
    immediately switch the intended model.
11. READY must remain stable across several analyzed samples.
12. Once readiness is stable, kiosk starts the final 3/2/1 countdown without
    switching to a different subject mid-countdown.
13. If the locked subject becomes substantially invalid or absent during final
    countdown, kiosk may return to guidance after stable invalid evidence.
14. Countdown completion captures one full-resolution still photo.
15. Kiosk preserves the original still and local normalized TargetSubjectRegion
    semantics without destructive cropping or upload.
16. Existing post-capture OpenCV analysis runs and Review opens.

### Alternate / Failure Flows

- Live frame streaming unsupported -> use KIOSK-1.6 scripted assisted capture.
- Pose/live quality analyzer failure -> degrade guidance, do not invalidate the
  camera.
- Readiness timeout -> show **Try Again** and **Capture Anyway**.
- **Capture Anyway** bypasses readiness/quality warnings only; technical camera,
  capture, corrupt image and decode failures remain blocking.
- Android box + USB webcam behavior remains hardware verification pending until
  SelfX tests the certified hardware.
- Portrait Android display + external camera rotated sideways -> authorized
  operator opens local Camera Settings, uses Camera Orientation Auto first, then
  selects 90 or 270 degrees if needed. The preview updates immediately, the
  captured garment/model photo remains upright in review and the same
  calibration persists after app restart. The Camera Orientation control remains
  available even when the USB/external camera reports no reliable sensor
  orientation metadata.

### Boundary

CaptureScope is customer-facing framing intent, not final garment taxonomy.
FULL BODY may later resolve to ONE_PIECE, FULL_OUTFIT or another canonical
garment semantic. BOTTOM emphasizes lower-body readiness but keeps enough
full-person/face framing for current ML Kit pose continuity. Pose/landmark and
PrimarySubject lock data are local, ephemeral and must not be persisted as
biometric identity or raw pose history.

Future KIOSK-3 must target garment generation at the selected PrimarySubject
only. SelfX must not rely solely on the provider guessing which visible person
should be dressed; unrelated/background people should remain unchanged through
future target extraction and compositing.

## 6.0.4 Customer/Operator — KIOSK-2C Customer Home and Operator Access

### Primary Actors

- Customer
- Authorized kiosk operator

### Preconditions

- The same Flutter kiosk app is running on Android or Windows.
- KIOSK-2C is still local/offline for kiosk presentation and settings access.
- No backend fleet sync, device pairing or Try-On upload is implemented in this
  slice.

### Customer Flow

1. Kiosk launches to the customer-facing idle home.
2. The home shows the bundled SelfX default wallpaper, local/offline
   presentation content and **Start Try-On**.
3. Customer taps **Start Try-On**.
4. Kiosk opens CaptureScope selection.
5. Customer selects **TOP**, **BOTTOM** or **FULL BODY**.
6. Kiosk continues into the existing KIOSK-2A capture/readiness/review/photo
   ready flow.

### Operator Flow

1. Operator double-taps the hidden top-left hotspot on the home.
2. Kiosk reveals an operator icon for a short configured duration.
3. Operator taps the icon.
4. Kiosk prompts for a 6-digit operator PIN.
5. If the PIN is accepted, kiosk opens local Camera Settings.
6. When the operator leaves settings, access is re-locked.

### Alternate / Failure Flows

- Incorrect PIN -> show a generic rejection message without logging the PIN.
- Five failed PIN attempts -> lock operator access for 60 seconds.
- Operator access locked -> customer **Start Try-On** remains usable.
- Reveal timer expires -> operator icon hides and the customer home remains
  unchanged.
- Narrow or portrait settings viewport -> settings content scrolls instead of
  overflowing.

### Boundary

KIOSK-2C does not create persistent operator sessions, backend operator auth,
fleet/device management, CMS synchronization, Product Catalog, Try-On upload or
provider execution. Organization/kiosk wallpaper changes from the SaaS dashboard
remain future work.

## 6.0.4A Customer/Operator — KIOSK-3A Real Kiosk Try-On Generation

### Primary Actors

- Customer
- Authorized kiosk operator or SelfX developer configuring the temporary bridge

### Preconditions

- Flutter kiosk app is running on Android or Windows.
- SelfX API is reachable.
- Backend Try-On Lab generation is enabled and authenticated for development
  validation.
- Kiosk runtime defines `SELFX_KIOSK_API_BASE_URL` and an explicit development
  access token. No provider key is present in Flutter.
- Customer can choose a supported local garment image through the temporary
  picker/preview flow for this milestone.

### Customer Flow

1. Kiosk launches to the customer home.
2. Customer taps **Start Try-On**.
3. Customer chooses a supported garment image and previews it.
4. Kiosk keeps garment semantics internal and resolves the existing
   CaptureScope behavior without showing garment type or photo-style controls.
5. Customer chooses **Take Photo**.
6. Kiosk runs the existing assisted/live capture flow.
7. Customer reviews the accepted full-resolution capture.
8. Customer taps **Use Photo**.
9. Kiosk prepares the person input from the original capture, using
   TargetSubjectRegion when available or full-frame fallback when not.
10. Kiosk submits the run to SelfX and shows generation progress.
11. Kiosk polls the existing run until success, failure or timeout.
12. On success, kiosk opens the result screen with the generated image.
13. Customer may try another garment, retake the photo or finish.

### Alternate / Failure Flows

- Missing API configuration -> show a safe kiosk-not-configured message.
- Missing/invalid garment image -> ask for another garment image before
  capture/generation.
- Network slow or unstable during polling -> continue retrying the existing run
  within the bounded timeout.
- Generation timeout -> offer retry polling, retake photo or choose another
  garment without creating duplicate paid submissions for the existing run.
- Generation failure -> show customer-safe failure text without provider IDs,
  raw HTTP details or stack traces.
- Finish -> clear capture, garment, prepared input, run and result state.

### Boundary

KIOSK-3A uses the existing SelfX backend Try-On path as a development bridge.
It does not implement managed kiosk device auth, fleet sync, Product Catalog,
physical garment capture, QR handoff, target compositing, billing, API Gateway,
new database persistence or provider calls from Flutter.

## 6.0.4B Kiosk/Superadmin — KIOSK-4A Device Provisioning

### Primary Actors

- Physical SelfX kiosk
- SelfX Superadmin

### Preconditions

- Kiosk app is installed and can reach SelfX API.
- Kiosk has no active device refresh credential, or the existing credential has
  been revoked/cleared.
- Superadmin is authenticated in SelfX SaaS.

### Main Flow

1. Kiosk launches and checks secure storage for device credentials.
2. If no valid credential exists, kiosk opens **Pair this kiosk**.
3. Kiosk requests a backend pairing session.
4. Kiosk displays six numeric digits, an `MM:SS` countdown and timer progress.
5. Superadmin opens **Kiosks** in SelfX SaaS.
6. Superadmin chooses **Pair New Kiosk**.
7. Superadmin enters the displayed code, names the kiosk and selects
   `PLATFORM`, `ORGANIZATION` or `STORE` assignment.
8. Backend atomically consumes the code, creates the kiosk device and stores the
   assignment.
9. Kiosk polling detects `PAIRED`, exchanges the one-time provisioning grant and
   stores the device refresh credential in secure storage.
10. Kiosk calls `session/me` and enters customer home.
11. On restart, kiosk refreshes/restores device identity without re-pairing.
12. Superadmin may later deactivate or reactivate the kiosk from the fleet page.
13. Superadmin may delete the kiosk from the normal fleet list when it should no
    longer be managed as an active fleet record.

### Alternate / Failure Flows

- Pairing timer reaches zero -> kiosk requests a new pairing session/code.
- Invalid/expired code -> Superadmin sees "Pairing code expired or invalid."
- Missing provisioning secret during kiosk poll -> request is rejected without
  leaking session details.
- Cross-organization store assignment -> pairing is rejected.
- Temporary network failure during startup -> kiosk shows recoverable retry and
  does not immediately erase a valid identity.
- Inactive device -> device-authenticated operation is blocked until
  reactivated.
- Revoked device -> refresh/session/me/heartbeat fails, kiosk clears device
  credential state and returns to pairing.
- Deleted device -> device-authenticated operation is blocked and the kiosk is
  removed from the normal fleet list while audit history remains.

### Boundary

KIOSK-4A establishes device identity and fleet lifecycle. KIOSK-4B connects
that device identity to production Try-On generation.

## 6.0.4B.1 Customer/Kiosk — KIOSK-4B Production Device Try-On

### Primary Actors

- Kiosk customer
- Active paired SelfX kiosk
- SelfX API

### Preconditions

- Kiosk has an active paired device session.
- SelfX API is reachable.
- Backend provider configuration such as `FASHN_API_KEY` is present
  server-side.
- `TRYON_LAB_ENABLED` may be false; the production kiosk endpoint does not use
  the internal Lab flag.

### Main Flow

1. Kiosk restores or refreshes its device session and opens customer home.
2. Customer taps **Start Try-On**.
3. Customer selects and previews a garment input.
4. Customer chooses **Take Photo** or **Use Your Phone**.
5. Kiosk obtains the accepted person photo and prepared target input.
6. Kiosk submits multipart `personImage`, `garmentImage` and one
   `clientRequestId` to `POST /api/v1/kiosk/try-on/runs` with its device access
   token.
7. Backend validates `typ: "kiosk_device_access"`, reloads the current device
   record, requires `ACTIVE`, derives assignment context and creates or returns
   the idempotent device-owned run.
8. The shared provider-neutral Try-On execution service submits to the server
   FASHN adapter.
9. Kiosk polls `GET /api/v1/kiosk/try-on/runs/:runId` using the same device
   session and refresh flow.
10. On success, kiosk opens the result screen with the generated image.
11. Customer may try another garment, retake the photo or finish.
12. Finish clears customer capture, prepared input, garment, run and result
    state but keeps the paired device identity.

### Alternate / Failure Flows

- Missing API base URL -> kiosk shows a safe configuration message.
- Expired access token -> kiosk refreshes through the existing device session
  flow and retries the current status/create request safely.
- Same device retries the same `clientRequestId` -> backend returns the same run
  and does not submit a second paid provider generation.
- Device A requests Device B's run -> backend returns not found.
- Inactive/revoked/deleted/unpaired device -> backend rejects the request; kiosk
  stops polling, clears device auth and returns to pairing where appropriate.
- Provider failure -> kiosk shows customer-safe failure text without provider
  IDs, auth details, stack traces or raw HTTP payloads.

### Boundary

KIOSK-4B does not implement Product Catalog, Organizations management, full
RBAC, QR result continuation, checkout, billing, Redis/BullMQ, API Gateway,
target compositing, Shopify, WooCommerce or provider client code in Flutter.

## 6.0.4C Customer/Kiosk — Secure Mobile Photo Upload

### Primary Actors

- Kiosk customer
- Active paired SelfX kiosk
- Customer phone browser

### Preconditions

- Kiosk is paired and online.
- Customer is in either the garment-photo or model/person-photo acquisition step.
- SelfX API object-storage upload configuration is available.

### Main Flow

1. Kiosk opens a purpose-specific phone upload choice for either garment photo
   or model/person photo acquisition.
2. Customer chooses **Use Your Phone**.
3. Kiosk shows a preparing state while it creates a customer upload session
   with its device access token.
4. After session creation succeeds, the kiosk displays a QR code, five-minute
   countdown and waiting status derived from backend `expiresAt/serverTime`.
5. Customer scans the QR code with their phone.
6. Phone opens the public SelfX upload page without staff login.
7. Customer takes a photo or chooses one from the phone.
8. Customer confirms **Upload Photo**.
9. Browser asks SelfX for a signed upload intent and uploads only to the
   server-generated object key.
10. Browser calls SelfX to complete validation.
11. Kiosk polling sees `READY` and shows the uploaded photo preview.
12. Customer chooses **Use This Photo**.
13. Kiosk downloads the ready photo into temporary local storage, marks the
   upload session consumed with the expected purpose and continues to garment
   review or generation as appropriate.

### Alternate / Failure Flows

- Countdown expires -> upload session becomes `EXPIRED`; customer scans a new QR
  if they still want phone upload.
- Session creation fails -> kiosk shows safe **Try Again** and **Cancel**
  actions instead of an indefinite spinner. Safe diagnostics may show only a
  canonical code/status, never tokens or capability values.
- Expired or invalid device access token during customer-upload create/status
  -> kiosk attempts one device-session refresh, retries the upload request once
  if refresh succeeds, and does not loop.
- Unpaired, revoked, deleted or inactive device state during customer upload ->
  kiosk clears invalid device auth and returns to pairing.
- Non-auth upload failures such as normal HTTP 400 validation failures, 409,
  429, 5xx, timeout or connection errors -> kiosk stays in the upload
  retry/cancel flow and does not clear a healthy pairing.
- Customer cancels on kiosk -> upload session becomes `CANCELLED` and any stored
  object is deleted best-effort.
- Customer uploads invalid, corrupt, oversized or unsupported image -> backend
  marks the session `REJECTED`; kiosk stays in upload flow and can create a new
  QR.
- Customer wants another phone photo -> kiosk cancels/replaces the old session
  and creates a fresh capability.
- Network interruption -> kiosk keeps polling with safe waiting text; cancelled
  or expired sessions cannot later become ready.
- Purpose mismatch -> backend rejects consume. A garment upload cannot silently
  become the model/person photo and a model/person upload cannot silently become
  the garment reference.

### Boundary

KIOSK-4C introduced the secure phone-upload source and KIOSK-5A reuses it for
both garment and model/person inputs. This does not implement Product Catalog,
QR result handoff, persistent customer accounts, checkout, billing, API Gateway
or provider calls from Flutter.

## 6.0.4D Customer/Kiosk — KIOSK-5B Fidelity and Compatibility

### Main Flow

1. Customer completes a Try-On and reaches the generated result.
2. Customer chooses **Try Another Garment**.
3. Kiosk retains the accepted model/person photo, its internal ModelCoverage and
   paired device identity.
4. Kiosk clears the previous garment, garment reference metadata, run, result
   and client request ID.
5. Customer chooses **Top**, **Bottom** or **Full Outfit** again.
6. If the retained model photo is compatible with the selected category, the
   kiosk skips model acquisition and continues to garment acquisition/review.
7. If the retained model photo is not compatible, the kiosk asks for an updated
   photo before generation.
8. When the model/photo source is phone upload, the kiosk downloads the
   backend-validated image, resolves internal ModelCoverage from the still image
   and accepts the photo only after that analysis completes.
9. Replacing a phone-uploaded model photo clears the previous internal coverage
   before resolving coverage for the new image.

### Customer Guidance

- Bottom incompatibility shows **Update your photo to try bottoms** and "We
  need to see more of your lower body for this item."
- Full Outfit incompatibility shows **Update your photo to try a full outfit**
  and "We need a full-body photo for this item."
- The customer never sees `UPPER_BODY`, `LOWER_BODY`, `FULL_BODY`,
  ModelCoverage, provider requirements or a compatibility matrix.
- Phone-upload UNKNOWN/unavailable analysis uses the same update-photo guidance
  and must not claim technical pose, landmark or body-part detection details.

### Boundary

SelfX internally resolves garment reference semantics. Product/hanger/unknown
garment references use safe AUTO provider photo-type behavior, while verified
person-worn references may map to ON_MODEL internally. KIOSK-5B does not add
Product Catalog, Try-On Max, another provider, billing, RBAC or Windows live
pose analysis. KIOSK-5B.1 does not add Windows still-image pose analysis,
durable ModelCoverage persistence or garment-upload model coverage analysis.

## 6.0.5 Operator — Premium Settings Navigation

### Primary Actor

Authorized kiosk operator.

### Main Flow

1. Operator unlocks settings through the hidden hotspot and six-digit PIN.
2. Kiosk opens **Operator Settings**.
3. On wide layouts, operator uses the settings navigation rail to choose
   Camera, Capture, Display, Audio, Diagnostics or System.
4. On narrow/portrait layouts, operator uses the adapted category tabs and
   scrolls as needed.
5. Camera shows human-readable camera name, connection state and resolution.
6. Technical hardware IDs are available only under Diagnostics/hardware details.
7. Camera preview remains bounded so settings and preview are both visible.

### Boundary

This journey does not include SaaS dashboard wallpaper management, fleet sync,
device provisioning, RBAC changes or backend configuration APIs.

## 7.0 Design System Consumer Journey

Future SaaS module builders use the shared SelfX design system for primary,
secondary, selected, ghost and danger actions. The primary action color is
`#FF7119` with white text; secondary/inactive controls use white/light surfaces,
dark text and neutral borders; destructive actions remain red. SaaS web uses
premium clean Shadcn-first patterns, while Windows/mobile/kiosk use solid
premium cards/buttons rather than glassmorphism. Flutter applications match the
same SelfX design semantics through Flutter-native components rather than
React/shadcn components.

Customer-mode kiosk journeys should look commercial. Implementation labels such
as wallpaper mode, default wallpaper source or platform readiness belong in
operator Display/Diagnostics views, not the normal customer home. CaptureScope
selection uses the standardized selected/inactive solid-button treatment and
preserves TOP, BOTTOM and FULL BODY semantics.

## 6.1 New Kiosk Pairing

### Primary Actors

- Store/Organization Admin
- Kiosk device

### Preconditions

- Kiosk app installed.
- Device can reach SelfX.
- Admin has kiosk-management permission.

### Main Flow

1. Kiosk starts in UNPAIRED state.
2. Kiosk requests a temporary pairing code/QR.
3. Admin opens SelfX kiosk management.
4. Admin selects **Pair Kiosk**.
5. Admin enters/scans the pairing code.
6. Admin selects organization/store context.
7. Admin assigns a kiosk name/metadata.
8. Backend validates the pairing request.
9. Backend creates/activates the device identity.
10. Kiosk securely receives its device credentials/session.
11. Kiosk fetches configuration.
12. Kiosk begins heartbeat.
13. Audit event is recorded.

### End State

Kiosk is securely associated with one organization and store.

---

## 6.2 Kiosk Heartbeat and Health

### Primary Actor

Kiosk Device

### Main Flow

1. Kiosk periodically sends a heartbeat.
2. SelfX validates device identity.
3. Safe operational metadata is recorded.
4. Dashboard updates online/offline/health status.
5. Missing heartbeats eventually mark the device offline/degraded.

### Data Must Not Include

- customer images;
- provider secrets;
- authentication secrets.

---

## 6.3 Kiosk Unpair / Disable

### Primary Actor

Authorized Admin

### Main Flow

1. Admin selects a kiosk.
2. Admin chooses disable or unpair.
3. SelfX validates permission.
4. Device authorization is revoked.
5. Kiosk detects revocation during authenticated communication.
6. Kiosk clears protected pairing/session state.
7. Kiosk returns to appropriate disabled/unpaired state.
8. Audit event is recorded.

---

## 6.4 Kiosk Remote Configuration

### Primary Actor

SelfX Superadmin

### Main Flow

1. Superadmin opens **Kiosks** in the SaaS application.
2. Superadmin selects an individual paired kiosk and opens **Configuration**.
3. Superadmin updates customer-home presentation, capture settings, enabled
   garment intent categories or session idle timeout.
4. SelfX validates the configuration and saves a new per-device configuration
   version.
5. The physical kiosk sees `latestConfigurationVersion` during
   `session/me`/heartbeat discovery.
6. If the version is newer than the active local configuration, the kiosk calls
   `/api/v1/kiosk/configuration` with its device access token.
7. The kiosk validates/downloads presentation assets and activates the new
   configuration only after local preparation succeeds.
8. The kiosk caches the safe configuration locally and continues customer
   operation.

### Alternate / Failure Flows

- If the kiosk is offline, it continues with the last valid cached
  configuration.
- If no cached configuration exists, the kiosk uses bundled SelfX defaults.
- If a presentation asset fails validation/download, the kiosk keeps the last
  valid active configuration.
- Remote camera preference remains out of scope until a stable certified device
  identifier exists.

---

# 7. Shopify Journeys

## 7.1 Shopify Merchant Installation

### Primary Actor

Shopify Merchant

### Main Flow

1. Merchant installs the SelfX Shopify app.
2. Shopify authorization flow runs.
3. SelfX verifies installation/authentication.
4. Merchant connects or creates the appropriate SelfX organization.
5. Integration record is created.
6. Required product data begins initial synchronization.
7. Merchant configures VTO-eligible products.
8. Merchant enables the SelfX storefront extension/block.
9. SelfX Try-On becomes available on configured products.

### Security Rules

- Shopify credentials remain server-side.
- Merchant secrets are never exposed in storefront code.

---

## 7.2 Shopify Product Synchronization

### Primary Actors

- Shopify
- SelfX integration worker

### Main Flow

1. Initial catalog data is imported.
2. SelfX creates/updates external product mappings.
3. Shopify sends product webhooks for changes.
4. SelfX verifies webhook authenticity.
5. Sync job is queued.
6. SelfX updates normalized product data.
7. Periodic reconciliation detects missed events/drift.

### Rule

Shopify remains authoritative for commerce data.

---

## 7.3 Shopify Customer Try-On

### Primary Actor

Customer on Merchant Shopify Store

### Main Flow

1. Customer opens an eligible Shopify product page.
2. Normal Shopify product details and purchase controls remain available.
3. Customer selects **Try It On**.
4. SelfX Try-On experience opens.
5. Customer uploads/captures or reuses an allowed person image.
6. SelfX creates and generates the Try-On.
7. Customer views the result.
8. Customer closes/continues from the Try-On experience.
9. If purchasing, customer uses Shopify's normal cart/checkout flow.

### Boundary

SelfX does not replace Shopify checkout.

---

# 8. WooCommerce Journeys

## 8.1 WooCommerce Merchant Connection

### Primary Actor

WooCommerce Merchant

### Main Flow

1. Merchant installs the SelfX WooCommerce plugin.
2. Merchant connects/authenticates the plugin with SelfX.
3. Integration is associated with the correct SelfX organization.
4. Product synchronization begins.
5. Merchant configures VTO-enabled products.
6. Try-On option is added to eligible product pages.

---

## 8.2 WooCommerce Product Synchronization

### Main Flow

1. Initial product catalog is synchronized.
2. SelfX stores normalized product mappings.
3. WooCommerce product webhooks trigger incremental sync.
4. SelfX validates webhook signature.
5. Integration worker updates affected products.
6. Periodic reconciliation repairs missed updates.

### Rule

WooCommerce remains authoritative for commerce data.

---

## 8.3 WooCommerce Customer Try-On

### Main Flow

1. Customer opens an eligible WooCommerce product.
2. Customer selects **Try It On**.
3. SelfX performs the Try-On workflow.
4. Customer views the result.
5. Customer continues through normal WooCommerce cart/checkout if purchasing.

---

# 9. Public API Journeys

## 9.1 Organization Creates Public API Key

### Primary Actor

Authorized Organization Admin

### Preconditions

- Public API entitlement is enabled.

### Main Flow

1. Admin opens developer/API settings.
2. Admin creates an API key.
3. Admin chooses name/environment/scopes.
4. SelfX creates a secret.
5. Secret is shown once.
6. SelfX stores only protected/hashed key material as designed.
7. Admin stores the secret securely.
8. Audit event is recorded.

### Alternate Flow

- Organization lacks entitlement → creation denied with appropriate upgrade/contact flow.

---

## 9.2 Public API Try-On

### Primary Actor

External Organization Application

### Main Flow

1. Client authenticates with an approved API key.
2. Client requests upload authorization where needed.
3. Person/garment assets are uploaded.
4. Client calls the versioned Try-On endpoint.
5. SelfX verifies:
   - API key;
   - scopes;
   - organization;
   - quota;
   - input.
6. SelfX creates the Try-On.
7. SelfX returns an asynchronous queued response.
8. Worker generates the Try-On.
9. Client either polls the status endpoint or receives an approved webhook.
10. Client retrieves/uses the completed result according to access rules.

### Failure Flows

- Invalid/revoked key → unauthorized.
- Missing scope → forbidden.
- Quota exceeded → quota response.
- Provider busy → request stays queued.
- Provider failure → retry/fallback policy applies.

---

## 9.3 Public API Webhook Delivery

### Primary Actors

- SelfX
- External client endpoint

### Main Flow

1. A subscribed event occurs.
2. SelfX creates a stable event ID.
3. SelfX signs the webhook.
4. Delivery is attempted.
5. Client verifies signature.
6. Client processes the event idempotently.
7. SelfX records delivery result.
8. Failed delivery is retried according to policy.

### Rule

Webhook delivery is treated as at-least-once.

---

# 10. SelfX Support and Platform Journeys

## 10.1 Support View

### Primary Actor

SelfX Support Admin

### Main Flow

1. Support user opens an organization support context.
2. SelfX checks platform support permission.
3. Support sees permitted organization/store operational information.
4. Sensitive secrets/passwords are never exposed.
5. Any sensitive support actions are audited.

---

## 10.2 Controlled Impersonation

### Primary Actor

Authorized SelfX Admin

### Preconditions

- User has impersonation permission.
- A support/business reason exists.

### Main Flow

1. Admin selects organization/store context.
2. Admin requests impersonation.
3. SelfX records real actor, effective context, reason, and expiry.
4. Short-lived impersonation session begins.
5. UI visibly indicates impersonation.
6. Admin performs allowed actions under the effective context.
7. Audit events preserve the real actor.
8. Admin exits or session expires.
9. Impersonation session is revoked/closed.

### Security Rules

Impersonation must never reveal:

- passwords;
- API keys;
- provider credentials;
- integration secrets.

---

## 10.3 Organization Application Review and Activation

### Primary Actor

Authorized SelfX Platform Administrator

### Preconditions

- Platform user has the required platform permission for the action.
- Organization application exists.

### Main Flow

1. Platform administrator opens pending organization applications.
2. SelfX checks platform permission such as `ORGANIZATION_APPLICATION_REVIEW`.
3. Administrator reviews applicant and business information.
4. Administrator reviews document/verification/commercial status where available.
5. Administrator starts review, requests information, approves, or rejects according to explicit platform permissions.
6. If approved but activation prerequisites remain, application may be `APPROVED` while organization remains `PENDING_ACTIVATION`.
7. When requirements are satisfied or manually confirmed, administrator performs the explicit activation action with `ORGANIZATION_ACTIVATE`.
8. SelfX changes organization status to `ACTIVE`.
9. SelfX activates the approved initial owner membership according to the membership activation rules.
10. Audit events preserve the actual SelfX platform actor and action.

### Boundary

Organization approval and activation are platform-domain actions. Merchant organization roles must not approve, reject, activate or suspend organizations.

---

# 11. Subscription and Usage Journeys

## 11.1 Trial Start

### Primary Actor

Organization

### Main Flow

1. Organization becomes eligible for trial.
2. SelfX creates trial subscription state.
3. Trial includes:
   - start time;
   - end time;
   - generation allowance.
4. Organization uses SelfX features according to trial entitlements.
5. Usage events are recorded.
6. Trial remains valid only while both time and usage conditions permit.

---

## 11.2 Try-On Usage Consumption

### Main Flow

1. Try-On request reaches entitlement/quota check.
2. SelfX verifies feature entitlement.
3. SelfX atomically reserves/checks quota.
4. Generation proceeds.
5. Provider attempts are recorded separately from billable usage.
6. On successful customer Try-On completion, SelfX records the approved billable usage event.
7. Usage aggregates update asynchronously if required.

### Rule

Provider retries do not automatically count as extra customer Try-Ons.

---

## 11.3 Payment Failure / Grace / Suspension

### Primary Actor

Organization

### Main Flow

1. Billing provider/manual process reports payment issue.
2. SelfX updates canonical subscription state.
3. Grace period begins if configured.
4. Organization is notified according to policy.
5. During/after grace, billable functionality may be restricted.
6. Business data remains preserved.
7. If payment is restored, access returns according to subscription state.
8. Billing/subscription changes are audited.

---

# 12. Failure and Recovery Journeys

## 12.1 Provider Capacity Exhausted

### Main Flow

1. Try-On is accepted by SelfX.
2. Eligible provider has no available capacity.
3. Try-On remains queued.
4. Customer sees queued/waiting state.
5. When capacity opens:
   - request is dispatched to the provider; or
   - approved provider spillover is used.
6. Try-On continues normally.

### Rule

Provider capacity exhaustion must not silently drop the request.

---

## 12.2 Primary AI Provider Temporarily Fails

### Main Flow

1. Provider attempt fails with a retryable error.
2. SelfX normalizes the error.
3. Retry policy is evaluated.
4. SelfX may:
   - retry the same provider after backoff;
   - route to an approved fallback provider;
   - keep the request queued;
   - fail after bounded retry policy is exhausted.
5. Customer receives provider-neutral status/error behavior.

---

## 12.3 Kiosk Loses Internet Before Try-On Submission

### Main Flow

1. Kiosk detects connectivity failure.
2. Cached product browsing may remain available.
3. Try-On generation is disabled/unavailable.
4. Customer is informed that generation requires connectivity.
5. Sensitive images are not accumulated indefinitely for later background submission.

---

## 12.4 Kiosk Loses Internet After Try-On Submission

### Main Flow

1. Try-On has already been created in SelfX.
2. Kiosk loses connectivity.
3. Kiosk retains only the minimum safe Try-On reference needed for recovery.
4. On reconnect, kiosk queries the existing Try-On.
5. Existing result/state is recovered.
6. No duplicate Try-On should be created.

---

## 12.5 Queue / Worker Interruption

### Main Flow

1. PostgreSQL retains durable Try-On/provider-attempt state.
2. Worker/Redis interruption prevents normal execution.
3. Monitoring detects queue/worker issue.
4. Reconciliation identifies durable records with missing/stalled jobs.
5. Jobs are safely recreated/retried.
6. Idempotency prevents duplicate business effects.

---

## 12.6 Integration Sync Failure

### Main Flow

1. Shopify/WooCommerce sync fails temporarily.
2. Integration health becomes degraded.
3. Last known synchronized product data is retained.
4. Retry/reconciliation is scheduled.
5. Authorized merchant can see integration health/error.
6. Successful reconciliation restores healthy state.

---

# 13. Customer Image Retention Journey

### System Actor

SelfX retention worker

### Main Flow

1. Customer image/result reaches retention expiry.
2. Cleanup worker identifies expired asset.
3. Private object is deleted from object storage.
4. Asset metadata is updated according to the database design.
5. Generated/original image becomes inaccessible.
6. Permitted non-image Try-On history remains.
7. Storage lifecycle rules act as an additional safety net.

### Rule

Product/garment catalog images are excluded from the customer 7-day cleanup rule.

---

# 14. End-to-End Channel Summary

## Kiosk

Customer → Consent → Select/Capture Garment → Capture Person → Queue → AI → Result → QR → Merchant Product Destination

## Mobile

Customer → Product Details → Try It On → AI Result → Saved History → Merchant Purchase Destination

## Shopify

Shopify Product → SelfX Try-On → Result → Shopify Cart/Checkout

## WooCommerce

WooCommerce Product → SelfX Try-On → Result → WooCommerce Cart/Checkout

## Public API

External Client → SelfX API → Queue → Provider → Result → Poll/Webhook

---

# 15. Journey Guardrails

All implementations of these journeys must preserve the following:

- no cross-organization data access;
- no cross-store access outside granted scope;
- no AI provider secrets in clients;
- no direct provider calls from client applications;
- no permanent kiosk customer sessions;
- no customer image retention beyond approved policy;
- no customer checkout/payment on kiosk in the initial product;
- no duplicated core Try-On logic across channels;
- no raw provider status/error dependency in customer-facing clients;
- no unbounded waiting request while AI inference runs;
- no request loss when provider capacity is full;
- no duplicate billing/usage from retries;
- no automatic unsafe account merging;
- no unsafe impersonation.

---

# 16. Status

**User Journeys & System Flows v1.0 — APPROVED BASELINE**

This document defines the major end-to-end journeys required before detailed UI/UX screen specification and database schema design.
