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
4. Customer captures their own photo.
5. Customer confirms or retakes the photo.
6. Kiosk starts the garment-capture flow.
7. Customer or store operator positions the garment using capture guidance.
8. Garment photo is captured.
9. Customer confirms or retakes the garment photo.
10. Person and garment images are uploaded through authorized SelfX upload flows.
11. SelfX creates the Try-On.
12. Request is validated and queued.
13. Provider Router selects the provider.
14. Worker processes the generation.
15. Result is stored privately.
16. Customer views the completed Try-On.
17. Customer may retry with another garment/photo.
18. Customer may continue through QR handoff if an associated product/destination exists.
19. Customer finishes.
20. Kiosk clears the session.

### Alternate / Failure Flows

- Garment image is unsupported/low quality → recapture requested.
- Provider rejects the garment/photo combination → customer receives a recoverable explanation.
- Product is not mapped to an ecommerce destination → QR may provide only available product information or be unavailable.
- Connectivity/provider failure → normal queue/retry/failure handling applies.

### End State

Same retention and session-cleanup rules as the catalog Try-On journey.

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

# 4. Organization and Store Journeys

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

Authorized Admin

### Main Flow

1. Admin changes kiosk/store configuration.
2. New configuration version is saved.
3. Kiosk receives change on next configuration sync/heartbeat or explicit refresh.
4. Kiosk validates and applies configuration.
5. Safe configuration is cached locally.

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
