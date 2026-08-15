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

SelfX Virtual Try-On
Technical Requirements & System Design
Version: 1.0  
Status: APPROVED BASELINE  
Document: `02-TECHNICAL-REQUIREMENTS.md`

---

1. Purpose
   This document defines the approved technical architecture for the SelfX Virtual Try-On platform.
   `01-PRD.md` defines what the product must do.
   This document defines how the platform should be built technically.
   `03-USER-JOURNEYS.md` will define end-to-end actor flows.
   `04-UI-UX-FLOW.md` will define screens, navigation, states, and interaction behavior.
   `05-DATABASE-SCHEMA.md` will define tables, fields, relationships, keys, indexes, and detailed retention structures.
   `06-IMPLEMENTATION-PLAN.md` will define implementation order, phases, tests, and release gates.
   This document intentionally avoids duplicating detailed database schemas, UI specifications, and implementation task lists.

---

2. Core Architecture
   SelfX must use one central backend for all client channels.
   Architecture:
   Client → SelfX API → SelfX business services → queue/worker → AI provider layer
   Clients include:
   Web application
   SelfX kiosk
   Flutter mobile application
   Shopify integration
   WooCommerce integration
   Public API clients
   Future partner integrations
   Clients must never call FASHN, Google Virtual Try-On, or any future AI provider directly using provider credentials.
   Core business logic must remain centralized in SelfX rather than being duplicated separately for kiosk, mobile, Shopify, WooCommerce, or Public API.

---

3. Architecture Style
   The backend must begin as a modular monolith with independently scalable background workers.
   Initial backend domains may include:
   Authentication
   Users and customer identities
   Organizations
   Memberships and roles
   Stores
   Products and garments
   Kiosks
   Try-On
   AI providers
   Usage and subscriptions
   Integrations
   Analytics
   Audit and platform administration
   Microservices must not be introduced without a demonstrated scaling, ownership, or reliability need.
   The design must preserve clean module boundaries so a domain can be extracted later if justified.

---

4. Approved Technology Stack
   Web
   Next.js
   React
   TypeScript
   App Router
   shadcn/ui as the primary web component system
   Tailwind CSS
   Mantine or another UI toolkit only by explicit user request
   Additional libraries may be added when necessary for charts, tables, image editing, camera handling, animation, accessibility, or another justified requirement.
   Do not introduce multiple competing design systems without a clear reason.
   Backend
   NestJS
   TypeScript
   Fastify
   Database
   PostgreSQL
   ORM and migrations
   Prisma ORM
   Prisma Migrate
   Background jobs
   BullMQ
   Queue/cache infrastructure
   Managed Redis
   Object storage
   S3-compatible storage abstraction
   Cloudflare R2 initially
   Runtime and repository tooling
   Node.js 24 LTS
   npm
   npm workspaces
   Turborepo
   Kiosk and mobile
   Flutter
   Separate kiosk and customer mobile applications

---

5. Repository Strategy
   SelfX should use one product monorepo initially.
   Recommended high-level structure:
   `frontend/web` — Next.js web application
   `backend/api` — NestJS API
   `backend/worker` — background worker
   `packages/ui` — shared SelfX web design system
   `packages/api-client` — generated or shared API client tooling
   `packages/shared` — safe cross-application constants/types
   `packages/config` — shared engineering configuration
   `mobile/kiosk` — Flutter kiosk app
   `mobile/customer-app` — Flutter customer app
   `integrations/shopify` — Shopify integration
   `integrations/woocommerce` — WooCommerce plugin
   `docs` — project documentation
   Flutter and WooCommerce use their own native package ecosystems even though they remain in the same product repository.
   npm workspace production builds must respect the Turborepo dependency graph.
   The canonical production web build command is `npm run build:web`, which runs
   `turbo run build --filter=@selfx/web...` from the repository root so
   internal dependencies such as `@selfx/shared` compile to `dist` before
   `@selfx/web` runs `next build`. `@selfx/ui` remains in the workspace graph
   without requiring a source-export packaging rewrite.

---

6. Deployable Services
   SelfX should initially have three primary independently deployable services:
   Web
   The Next.js application serves:
   SelfX Super Admin
   SelfX Support
   Organization dashboard
   Store dashboard
   Customer account
   QR continuation and related web flows
   API
   The NestJS API serves:
   authentication
   authorization
   organizations
   stores
   memberships
   products
   kiosks
   customer workflows
   Try-On creation/status
   usage
   integrations
   platform administration
   Worker
   The worker handles asynchronous work such as:
   AI Try-On processing
   provider retries
   provider reconciliation
   image cleanup
   retention jobs
   webhook delivery
   integration synchronization
   maintenance and usage aggregation
   API and worker services must scale independently.

---

7. UI/UX Architecture
   SelfX must maintain a uniform product experience.
   The default web design system is:
   shadcn/ui + centralized SelfX semantic tokens/components in `@selfx/ui`
   Tailwind CSS remains secondary styling infrastructure for simple layout utilities, existing compatibility and occasional app-specific spacing.
   Mantine is not the default for new SelfX web work and may be used only by explicit user request.
   A shared `@selfx/ui` package should hold reusable web UI primitives and SelfX components.
   Frontend web applications must import shared components and public consumer
   types from the public `@selfx/ui` package API. They must not depend on
   private `@selfx/ui/selfx/*` source-tree paths.
   The design system should standardize:
   typography
   spacing
   color tokens
   radius
   form behavior
   button hierarchy
   loading states
   empty states
   error states
   permission states
   table behavior
   status semantics
   Flutter cannot reuse React components directly, but kiosk/mobile must follow the same design language and interaction semantics.
   Merchant-embedded Shopify/WooCommerce experiences may adapt to merchant branding while preserving the core SelfX Try-On UX.
   White-label support should map through centralized SelfX semantic tokens rather than scattered hard-coded styling.
   Common web UI such as navigation, sidebars, headers, user information, controls, forms, cards, statistics, badges, alerts, loaders, menus, drawers, modals, tabs, tooltips and responsive admin layouts should be Shadcn-first. Custom Try-On/image/camera experiences remain SelfX-specific components built on the approved design-system boundary.

   Phase 4 page and layout standards:
   SelfX web pages must compose a uniform layout hierarchy:
   shadcn/ui → SelfX semantic tokens → SelfX layout primitives → approved page templates → business pages.
   Reusable layout primitives live in `@selfx/ui` and include:
   `PageContainer`, `PageHeader`, `PageSection`, `SectionHeader`, `StatGrid`, `FilterBar`, `FormPageContainer`, `FormSection` and `FormActions`.
   Approved page width modes:
   `wide` for dashboard, list and broad admin workspace pages;
   `medium` for detail and settings pages;
   `form` for create/edit forms.
   Approximate spacing conventions:
   desktop page padding 24–32px, major section gap 24px, card/grid gap 16–20px, card padding 20–24px;
   tablet page padding 20–24px and major section gap 20px;
   mobile page padding, major section gap and card padding around 16px.
   Card standards include `StatCard`, `SectionCard`, `SummaryCard`, `ActionCard` and `TableContainer`.
   Default cards use centralized surface, radius, border, typography and low/no shadow; hover treatment is reserved for interactive cards.
   Future list pages should use `FilterBar` and `TableContainer` with bounded pagination/footer regions.
   Future pages must avoid arbitrary per-page spacing systems, nested cards for page structure and generic fixed-height cards.

---

8. Database and Multi-Tenancy
   PostgreSQL is the authoritative business database.
   SelfX must use:
   Shared PostgreSQL database + shared schema + organization-scoped rows
   Do not create a separate database/schema for each normal organization.
   Tenant-owned records must carry appropriate organization ownership, and store-scoped records must also carry store relationships where necessary.
   Authorization must be enforced server-side.
   The frontend must never be treated as the security boundary for organization or store isolation.
   Potential PostgreSQL Row-Level Security may later be evaluated as defense-in-depth, but application authorization remains mandatory.

---

9. Database Migration Tracking
   All database schema changes must be tracked through Prisma migrations.
   The repository must preserve:
   `schema.prisma`
   complete migration history
   migration order
   migration status through deployment logs/checks
   Development may use the approved development migration workflow.
   Staging and production must use controlled deployment migrations such as `prisma migrate deploy`.
   Applied production migrations must not be silently rewritten.
   Normal production schema changes must not be made manually.
   If an emergency manual repair is ever required, it must be reconciled back into migration history.
   Potentially destructive changes should use staged migration patterns such as:
   Expand → deploy compatible code → backfill/migrate → switch usage → remove obsolete structure later
   Migration validation must be part of CI/CD.

---

10. API Architecture
    SelfX uses REST + JSON as the primary API style.
    APIs must be versioned from the beginning, starting with a structure such as:
    `/api/v1/...`
    First-party application APIs and Public API capabilities must remain logically separated even when they share the same business services.
    Use resource-oriented endpoints such as:
    `GET /products`
    `POST /try-ons`
    `GET /try-ons/{id}`
    `PATCH /stores/{id}`
    Avoid action-style naming such as `/getAllProducts`.
    Public identifiers should be globally unique and non-sequential. Exact identifier format will be finalized in the database schema.
    SelfX primary business identifiers use UUIDv7 stored as PostgreSQL native `uuid` values.
    UUIDv7 IDs are generated by the SelfX application layer unless a later approved implementation decision explicitly selects a database-side mechanism.
    External provider/platform identifiers remain separate from SelfX primary IDs.
    Security-sensitive tokens are high-entropy secrets, not UUIDs.

    API process health uses two stable unversioned operational endpoints.
    `/health` is liveness: it indicates that the SelfX API process/application
    is alive and must remain lightweight and independent of PostgreSQL or
    provider checks. `/ready` is readiness: it indicates that the API can
    currently serve core SelfX operations. The current readiness dependency is
    PostgreSQL connectivity, verified with a minimal database probe. PostgreSQL
    readiness failure returns HTTP 503 with a sanitized response and must not
    expose connection strings, credentials, raw Prisma errors or stack traces.
    FASHN and other external providers are intentionally excluded from core API
    readiness because authentication, organizations, stores and administration
    can still operate during provider degradation. Provider health belongs to
    separate diagnostics/provider-health semantics. Future dependencies should
    affect `/ready` only when their failure makes the overall API unable to
    serve core traffic.

    Deployed API web services on Railway must listen on Railway's injected
    `PORT` environment variable and bind to `0.0.0.0`. `API_PORT` remains a
    SelfX local-development override/fallback, followed by the local default
    `3001`. Ignoring Railway `PORT` can cause Railway deployment healthchecks
    on `/health` to fail even when the NestJS application starts internally.

---

11. API Contracts and Documentation
    Every external API boundary must use explicit request and response DTOs.
    Prisma models are not API contracts and must not be returned blindly.
    All external input must be validated.
    SelfX must generate and maintain an OpenAPI specification and Swagger documentation.
    OpenAPI should document:
    endpoint purpose
    authentication method
    required permission/scope
    request structure
    response structure
    important status codes
    stable machine-readable error codes
    OpenAPI should also be used as the contract source for generated clients where useful, including TypeScript and future Dart clients.
    API changes must follow backward-compatibility discipline.
    Breaking changes require either a new version or a deliberate migration strategy.

---

12. API Scalability Standards
    All potentially unbounded collection endpoints must use bounded pagination.
    Default SelfX pagination policy:
    default page size: 25
    standard maximum page size: 100
    clients may never request unlimited results
    each endpoint must enforce a server-side maximum
    cursor pagination is preferred for high-volume or frequently changing datasets
    page/offset pagination may be used for small stable admin datasets when justified
    endpoint-specific lower or higher bounded maximums are allowed only when explicitly documented
    sorting must be deterministic
    cursor pagination must include a unique tie-breaker such as `id`
    Filtering, searching, and sorting must be explicitly allowlisted rather than translated into unrestricted database queries.
    Preferred default cursor response shape:
    `{ "data": [], "pagination": { "nextCursor": null, "hasMore": false } }`
    This envelope is the default convention and does not override intentionally documented endpoint-specific contracts.
    API errors should use a consistent envelope with stable error codes and request IDs.
    Current API implementation uses shared UUID path-parameter validation for resource IDs. Malformed UUID path params return a stable 400-style API error before reaching Prisma.
    Current API implementation maps known Prisma errors through a centralized safe exception filter. Public responses must not expose raw Prisma internals, SQL, connection strings, or stack traces.
    Every request should receive a correlation/request ID.
    Retry-sensitive mutations such as Try-On creation, usage events, webhook handling, and billing events must support idempotent processing.
    Idempotency baseline:
    clients send `Idempotency-Key` where required
    the key is scoped to the authenticated actor/credential plus operation
    the server stores a request fingerprint
    same key + same fingerprint returns or replays the original logical result
    same key + different fingerprint returns a stable machine-readable idempotency conflict
    idempotency records have bounded retention
    exact retention TTL may vary by operation and must not be assumed universal
    idempotency is required where retries could duplicate expensive or billable work
    Important examples include Public API Try-On creation, kiosk retry-sensitive Try-On creation, usage events, billing-provider events, and inbound/outbound webhook processing where applicable.
    Long-running AI generation must never keep a normal HTTP request open while waiting for inference.

---

13. Authentication Domains
    SelfX has separate authentication domains:
    Customers
    Staff and organization administrators
    SelfX support/platform administrators
    Kiosk devices
    Public API clients
    External platform integrations
    These identities must not all use the same credential mechanism.

---

14. Staff and Admin Authentication
    Staff/admin authentication should initially support email + password.
    Passwords must be hashed using Argon2id.
    The architecture must support MFA, especially for privileged SelfX and organization administrators.
    User sessions should use:
    short-lived JWT access credentials
    rotating and revocable server-side refresh sessions
    The system must support:
    logout
    logout all sessions
    session revocation
    staff suspension
    password-change invalidation
    security response
    Current staff/admin logout behavior revokes refresh sessions. Existing short-lived JWT access credentials may remain usable until their configured expiry unless a later approved design adds immediate access-token revocation.
    For web applications, secure HttpOnly cookies should be preferred over long-lived authentication credentials stored in localStorage.
    Native applications must use platform-secure storage.

    Production browser requests from `@selfx/web` should use same-origin
    `/api/v1/*` URLs. The Next.js web server rewrites those requests to the
    SelfX API through a server-only `SELFX_API_UPSTREAM_URL`; this variable must
    not use a `NEXT_PUBLIC_` prefix or be exposed to browser JavaScript. Browser
    code should use relative API paths in production when no explicit
    development API URL is configured. Local development may still use
    `NEXT_PUBLIC_API_URL=http://localhost:3001` or the legacy
    `NEXT_PUBLIC_SELFX_API_BASE_URL` to call a local API directly.
    Client-side Next.js code must read `NEXT_PUBLIC_*` variables through direct,
    statically analyzable `process.env.NEXT_PUBLIC_API_URL` and
    `process.env.NEXT_PUBLIC_SELFX_API_BASE_URL` property references. Browser
    API-base resolution must not depend on passing an indirect `process.env`
    object through helpers, because that can prevent correct Next.js client
    environment replacement. Production must never silently fall back to
    `http://localhost:3001`; absent production public API variables mean
    same-origin relative `/api/v1/*` requests.

    The same-origin web proxy preserves `/api/v1/auth/*` browser-facing paths
    so the existing refresh cookie path remains valid. Refresh tokens remain
    HttpOnly, Secure in production, and unavailable to JavaScript; access
    tokens remain in React memory. `SessionProvider` must continue attempting
    refresh on mount so F5 reload, direct URL open and new tabs can restore a
    valid session. Same-origin proxying restores first-party cookie semantics
    for the web app; it must not weaken backend CORS, wildcard origins, remove
    origin/CSRF checks or store tokens in localStorage/sessionStorage.

    This web proxy is not a general API Gateway. Tenant authorization,
    platform authorization and business logic remain in the SelfX API. Kiosk,
    mobile, Shopify, WooCommerce and future Public API clients remain able to
    call SelfX API directly through their approved client paths.

    Production initialization of the first SelfX platform super administrator
    must use a dedicated manual operator command, not a public HTTP endpoint,
    hidden UI route, direct SQL insert, demo account or automatic startup seed.
    Local development users are not production users, and development bootstrap
    scripts must continue refusing `NODE_ENV=production`.

    The production bootstrap command must run only with `NODE_ENV=production`,
    `SELFX_PRODUCTION_BOOTSTRAP_ENABLED=true` and
    `SELFX_PRODUCTION_BOOTSTRAP_CONFIRM=CREATE_FIRST_SUPER_ADMIN`. It uses
    dedicated input variables for email, password and optional display name,
    normalizes email through the standard auth normalization path, hashes the
    password through the existing Argon2id `PasswordService`, and must never log
    or persist plaintext passwords.

    The command is valid only for an empty production user database. It must
    create the first `User` and active `SELFX_SUPER_ADMIN`
    `PlatformRoleAssignment` atomically under a PostgreSQL transaction-scoped
    advisory lock. A retry is safe only when exactly one active matching user
    already has an active `SELFX_SUPER_ADMIN` assignment; otherwise existing
    users cause refusal without password reset, user mutation or role promotion.
    Operators must remove the temporary production bootstrap variables after
    successful initialization and then use the normal production login flow.

---

15. Customer Authentication
    Basic Try-On may be anonymous.
    Registered customer authentication must support:
    email OTP
    phone OTP
    Google
    Apple
    External providers authenticate identity to SelfX; SelfX then creates/uses its own customer identity and session.
    Customer identity must be separate from login identities.
    One customer may securely link multiple login methods.
    SelfX customer accounts are global across participating retailers, while merchant access remains tenant-isolated.

---

16. Authorization and RBAC
    Authentication answers who the user is.
    Authorization determines what the user may do in the selected organization/store context.
    A user may belong to multiple organizations.
    A user may have access to multiple stores.
    Organization/store authorization should use:
    Predefined role + permissions + organization/store scope
    The backend must validate the active organization context and store scope on every applicable operation.
    Do not trust organization IDs, store IDs, roles, or permissions provided by clients.
    Organization/store roles include:
    ORGANIZATION_OWNER
    ORGANIZATION_ADMIN
    ORGANIZATION_STAFF
    STORE_OWNER
    STORE_MANAGER
    STORE_STAFF
    KIOSK_OPERATOR
    SelfX platform roles are separate from organization memberships.
    Platform roles include:
    SELFX_SUPPORT_ADMIN
    SELFX_SUPER_ADMIN
    Do not model SelfX Support Admins or SelfX Super Admins as memberships in a fake/internal merchant organization.
    Platform authorization and organization/store authorization are separate concerns.
    SelfX platform privileges should use explicit platform permissions rather than scattered unconditional Super Admin bypasses.
    Phase 3 starts with predefined roles, but authorization must still be permission-driven. Role names resolve centrally to permissions plus store scope; controllers and services must not scatter checks such as `role === "ADMIN"`.
    Custom merchant-defined roles are out of scope for the initial RBAC implementation.
    Permissions may evolve incrementally when later product, kiosk, analytics, integration, billing and support domains are implemented. Phase 3 should not attempt to define every future application permission.

    Initial Phase 3 permission baseline:

    ORGANIZATION_OWNER:
    read organization
    update organization
    create, update and archive stores
    view memberships
    invite staff
    update staff
    assign organization and store roles
    change store scopes
    suspend and reactivate staff
    perform organization ownership-level actions
    manage all stores in the organization

    ORGANIZATION_ADMIN:
    read organization
    update normal organization settings
    create, update and archive stores
    view memberships
    invite staff
    update normal staff memberships
    assign non-owner roles
    change store scopes
    suspend and reactivate non-owner staff
    manage all stores in the organization
    must not grant ORGANIZATION_OWNER
    must not remove or demote the final active ORGANIZATION_OWNER
    must not perform ownership-transfer actions unless explicitly approved later

    ORGANIZATION_STAFF:
    read permitted organization information
    read stores permitted by approved scope rules
    no organization mutation
    no store creation or deletion
    no staff or membership administration

    STORE_OWNER:
    read organization information required for operation
    read and manage assigned stores
    read staff relevant to assigned stores
    no organization-wide administration
    no creation or management of unrelated stores
    no ownership-level organization actions

    STORE_MANAGER:
    read organization information required for operation
    read and manage assigned stores
    read staff relevant to assigned stores
    no organization-wide administration
    no creation or management of unrelated stores
    no organization membership administration

    STORE_STAFF:
    read assigned-store information needed for operation
    no organization administration
    no store administration
    no membership administration

    KIOSK_OPERATOR:
    only minimal staff-facing access required to operate or manage assigned kiosk/store workflows
    assigned-store scope only
    no organization administration
    no staff administration

    Owner invariants:
    An organization must never lose its final active ORGANIZATION_OWNER through normal membership mutation.
    Non-owner administrators cannot grant ORGANIZATION_OWNER.
    Ownership transfer must use an explicit controlled operation when implemented.
    Ordinary role-update endpoints must not silently perform ownership transfer.

    Organization context and JWT boundary:
    Do not place trusted organization or store authorization state in staff JWTs.
    The staff access JWT remains primarily user/session identity.
    Organization-scoped APIs should use explicit resource-oriented routes such as:
    `/api/v1/organizations/:organizationId/...`
    `/api/v1/organizations/:organizationId/stores/:storeId/...`
    The server must independently validate:
    authenticated user
    active organization membership
    organization identity
    required permission
    store belongs to the organization where applicable
    store is within the user's authorized scope where applicable
    A frontend active-organization selector is UI state only and is never a security boundary.

    Store scope:
    Store authorization must be explicit.
    A membership may have organization-wide/all-store access when its role and assignment permit it, or explicitly selected store scopes.
    Empty selected-store scope means no store access and must never be interpreted as all-store access.
    ALL_STORES and SELECTED_STORES must be represented unambiguously before Phase 3 authorization is implemented.

    Organization onboarding and activation:
    Organization registration and organization activation are separate actions.
    A user-submitted organization registration must never immediately create an operational ACTIVE tenant with unrestricted owner access.
    Registration may create a pending organization shell plus an onboarding application, but ordinary tenant operations remain unavailable until explicit activation.
    The onboarding/application lifecycle is separate from the operational organization status.
    Baseline application states:
    DRAFT
    SUBMITTED
    UNDER_REVIEW
    NEEDS_INFORMATION
    APPROVED
    REJECTED
    Baseline organization operational states:
    PENDING_ACTIVATION
    ACTIVE
    SUSPENDED
    ARCHIVED
    An APPROVED application may still be paired with organization status PENDING_ACTIVATION when commercial, payment, document, verification or contract prerequisites remain.
    Activation requirements must be configurable/evolving rather than one hard-coded universal checklist.
    Possible activation requirements include business information, organization documents, identity/business verification, commercial terms, pricing agreement, subscription selection, payment, enterprise contract and other SelfX-defined onboarding requirements.
    Phase 3 must not implement subscription/payment processing or document upload storage, but it must leave activation compatible with later automated billing, payment, document and verification signals.

    Applicant and initial owner handling:
    The submitting user may be recorded as the intended initial ORGANIZATION_OWNER.
    The intended owner membership must not provide normal tenant operation before organization activation.
    The required Phase 3 representation is an organization membership with role ORGANIZATION_OWNER and status PENDING_ACTIVATION until activation.
    Organization activation transitions the approved initial owner membership to ACTIVE as part of the explicit activation operation.
    Normal tenant guards must require both ACTIVE membership status and ACTIVE organization status.

    Tenant authorization guard for ordinary tenant operations:
    authenticated user
    active organization membership
    organization status == ACTIVE
    required permission
    store belongs to organization where applicable
    store is within the user's authorized scope where applicable
    allow
    Membership in a PENDING_ACTIVATION, SUSPENDED or ARCHIVED organization must not provide ordinary operational access.
    Explicit onboarding/status endpoints and SelfX platform review endpoints are separate from ordinary tenant business APIs.

    Platform approval domain:
    Organization review, approval, rejection, activation and suspension belong to the SelfX platform authorization domain.
    These actions must not be performed through merchant organization roles.
    Platform permissions should support concepts such as:
    ORGANIZATION_APPLICATION_REVIEW
    ORGANIZATION_APPLICATION_APPROVE
    ORGANIZATION_APPLICATION_REJECT
    ORGANIZATION_ACTIVATE
    ORGANIZATION_SUSPEND
    SELFX_SUPER_ADMIN may receive these permissions.
    Other SelfX staff/admin roles may receive only the explicit platform permissions granted to them.
    Approval and activation behavior must use centralized platform permission resolution and must not be hard-coded directly to one role inside controllers.

    Phase 3A implementation note:
    Centralized platform permission mapping lives in `backend/api/src/platform/platform-permissions.ts`, with enforcement in `backend/api/src/platform/platform-authorization.service.ts`.
    Applicant onboarding routes are `POST /api/v1/organization-applications`, `GET /api/v1/organization-applications`, `GET /api/v1/organization-applications/:applicationId`, and `POST /api/v1/organization-applications/:applicationId/submit`.
    Platform review and activation routes are under `/api/v1/platform`, including organization-application review commands and explicit organization activation/suspension commands.

    Phase 3B implementation note:
    Centralized merchant permission mapping lives in `backend/api/src/organizations/merchant-permissions.ts`, with active tenant enforcement in `backend/api/src/organizations/tenant-authorization.service.ts`.
    Normal active-tenant routes are `GET/PATCH /api/v1/organizations/:organizationId`, `GET /api/v1/organizations`, nested store routes under `/api/v1/organizations/:organizationId/stores`, and nested membership routes under `/api/v1/organizations/:organizationId/memberships`.
    These normal tenant routes remain separate from Phase 3A organization-application and platform-review routes.

---

17. Impersonation
    SelfX support impersonation must use a dedicated short-lived impersonation session.
    The system must preserve:
    real SelfX actor
    assumed organization
    assumed store when relevant
    effective role/context
    reason
    start/end time
    Impersonation must be:
    permission-controlled
    clearly visible
    revocable
    time-limited
    fully audited
    Impersonation must never expose passwords, provider credentials, or integration secrets.

---

18. Kiosk Authentication
    Kiosks authenticate as devices rather than staff users.
    A new kiosk starts unpaired.
    An authorized administrator pairs it to:
    Organization → Store → Kiosk identity
    The kiosk then receives its own device credential/session.
    Device credentials must be:
    revocable
    rotatable
    renewable
    independently expiring
    invalidated when unpaired or suspended

---

19. Public API Authentication
    The initial Public API should use scoped API keys.
    API secrets should be shown only when created and stored hashed server-side.
    API key records should support:
    organization ownership
    scopes
    environment
    status
    creation time
    last-used time
    optional expiry
    rotation/revocation
    Public API credentials must follow least privilege.
    Future enterprise authentication such as OAuth client credentials may be added if required.

---

20. AI Provider Architecture
    SelfX must expose a provider-neutral Try-On domain.
    Required logical flow:
    Try-On Service → Queue → Generation Profile → Provider Router → Provider Adapter
    Provider-specific details must remain inside provider adapters/configuration.
    Initial provider:
    FASHN
    Try-On v1.6
    initial interactive profile mapped to a balanced real-time configuration
    Future providers may include:
    FASHN Try-On Max
    Google Virtual Try-On
    additional commercial providers
    future SelfX-hosted models
    Clients must never depend directly on provider-specific parameters or status names.

    CORE VTO-1 implementation note:
    SelfX intentionally prioritized a guarded internal development Try-On Lab
    before Product Catalog implementation to prove the core person-image plus
    garment-image VTO loop. The lab uses `/app/try-on-lab` and
    `/api/v1/try-on-lab/runs`, is enabled only with `TRYON_LAB_ENABLED=true`,
    uses FASHN `tryon-v1.6` through a server-side provider adapter, and keeps
    FASHN prediction identifiers hidden behind SelfX UUIDv7 lab run IDs.

    OpenCV.js is used in CORE VTO-1 only as a browser-side image quality and
    preprocessing layer. It is lazy-loaded by the lab route, analyzes a
    downscaled copy, preserves original uploads as provider inputs, and does
    not perform generative Try-On, face recognition, biometric identification,
    body pose validation, or reliable full/upper/lower body detection.

    Uploaded-image preflight separates technical image validation from image
    quality analysis. Technical validation is authoritative and may block
    generation for non-images, unsupported image formats, invalid/corrupt or
    undecodable image data, unsafe MIME/signature mismatch, hard upload/request
    size limits, and invalid or zero dimensions. The SelfX API remains the
    authoritative validation boundary before provider submission.

    Image quality analysis is advisory for uploaded images. Blur, low
    brightness, overexposure, low contrast, unusual framing, low but technically
    valid resolution, person framing concerns and garment framing concerns are
    represented as provider-neutral warnings. The tester may re-upload or
    explicitly proceed anyway. If OpenCV analysis cannot complete after
    technical validation succeeds, SelfX records an
    `IMAGE_QUALITY_ANALYSIS_UNAVAILABLE` warning with unavailable/null metrics
    rather than treating the image as invalid or showing fake `0x0` dimensions.
    Current lab override state is ephemeral and provider-neutral; it must not
    add OpenCV-specific fields to the FASHN adapter contract.

    OpenCV's primary future production role is live camera/capture quality
    guidance. Kiosk/live capture may use OpenCV more strictly because SelfX
    controls the capture process and can guide users before taking the photo.
    That future flow may progress from camera frames to OpenCV quality analysis,
    pose/body-landmark analysis, capture readiness and capture; CORE VTO-1 does
    not implement that live functionality.

    Because production asset storage, durable Try-On records, ProviderAttempt
    records, Redis/BullMQ and retention cleanup are not implemented yet, CORE
    VTO-1 uses temporary validated multipart upload, server-side Base64 data
    URI provider transport, `return_base64=true` where supported, and a bounded
    TTL in-memory lab run registry. These temporary pieces must be replaced by
    the approved durable Try-On, queue, storage, consent, entitlement/quota and
    retention phases before production VTO.

    The Lab multipart contract accepts exactly one `personImage` file field and
    one `garmentImage` file field, plus bounded provider-neutral resolver and
    quality metadata fields. Browser-side OpenCV quality analysis and MediaPipe
    body-coverage analysis must operate on derived/read-only analysis inputs;
    they must not replace, mutate or consume the original selected files. The
    original validated files remain the provider inputs. Resolver metadata is
    encoded as strings according to the API contract: optional unavailable
    values such as analysis confidence or absent body coverage are omitted or
    sent as the supported empty-string value, and arrays such as reason/warning
    codes are JSON-serialized. Clients must not append JavaScript `null`,
    `undefined`, plain objects, arrays or accidental `[object Object]` strings.
    Multipart envelope failures use stable multipart errors, while malformed
    resolver metadata uses stable resolution-metadata errors rather than
    generic image-processing failures.

    CORE VTO-1.1 implementation note:
    The internal authenticated Lab is an administrative/development tool. It
    shows an authorized-use notice instead of a customer consent checkbox:
    internal testers may proceed without click acknowledgement, but customer
    web/mobile/kiosk flows still require consent before camera access, photo
    upload or AI processing.

    CORE VTO-1.1 organized the Lab UI into Images, Generation setup and Result.
    CORE VTO-1.2 revises the default Lab flow to Images, Generate Try-On and
    Result, with automatic garment/profile resolution and only collapsed
    internal Advanced settings for development overrides. Upload cards use
    compact contained previews, person and garment cards sit side-by-side on
    desktop and stack on mobile, and Generate Try-On remains placed in the main
    workflow rather than as a detached header action. Completed runs show
    Person, Garment and Generated Try-On comparison panels with larger previews
    in a SelfX dialog. Try Another Garment preserves the person photo while
    clearing garment, garment-quality and run state. New Try-On clears both
    images, run state and warning overrides.

    CORE VTO-1.1 defines a provider-neutral current-run telemetry contract for
    the Lab response and UI. Safe fields include SelfX run ID, channel,
    provider display metadata, model, generation profile, garment category,
    garment photo type, created/started/completed timestamps, elapsed time,
    status, stable failure code, quality warning codes, quality override
    accepted, provider credit usage if safely available, and estimated provider
    cost only when derived from configurable provider pricing.

    Telemetry must not contain raw person images, raw garment images, generated
    Base64 telemetry fields, face/biometric embeddings, API keys, provider
    Authorization headers, provider prediction IDs in normal Lab UI, raw image
    contents or internal stack traces. Audit logs are not general analytics
    event storage. CORE VTO-1.1 does not create fake aggregate analytics,
    durable analytics tables or an analytics dashboard from the temporary
    in-memory registry. Durable TryOnRun, ProviderAttempt and telemetry
    persistence remains deferred to the approved production Try-On
    orchestration/storage phases.

    Provider-neutral channel concepts for Try-On telemetry are WEB_LAB,
    WEB_CUSTOMER, KIOSK, MOBILE, SHOPIFY, WOOCOMMERCE and PUBLIC_API. Only
    WEB_LAB is used in CORE VTO-1.1.

    CORE VTO-1.2 implementation note:
    Normal Try-On clients must not expose provider-style garment/category/photo
    controls as part of the default user workflow. The internal Lab now uses a
    provider-neutral automatic garment resolution pipeline for direct uploads:
    technical upload validation remains blocking, advisory OpenCV quality
    analysis remains separate, and a browser-only GarmentInputAnalyzer may
    lazy-load MediaPipe Tasks Vision Pose Landmarker to infer whether the
    garment reference image appears product-only/no-person, upper-body
    on-model, lower-body on-model, full-body on-model or unknown. This analysis
    estimates body coverage only; it does not classify fashion items, identify
    people, perform biometrics or solve flat-lay multi-item detection.

    The MediaPipe dependency is `@mediapipe/tasks-vision` version `0.10.35`.
    The Lab analyzer imports it dynamically from the Try-On Lab route so normal
    dashboard bundles do not include MediaPipe. The Tasks Vision WASM runtime is
    downloaded only when the analyzer is used from the version-pinned URL
    `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm`; the
    Pose Landmarker Lite model is downloaded at runtime from the versioned
    MediaPipe model asset
    `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`.
    These assets are not bundled into the repository in CORE VTO-1.2. If the
    package, WASM runtime or model cannot load, the analyzer must return
    unavailable analysis and the resolver must use the safe AUTO fallback unless
    separate technical image validation blocks the upload.

    A separate provider-neutral GenerationPolicyResolver combines garment
    source, trusted metadata, direct-upload body-coverage analysis, explicit
    user disambiguation and internal Lab overrides into SelfX category, garment
    photo type and generation profile. Only `DIRECT_UPLOAD` is active in this
    slice. Future trusted source concepts are `SELFX_CATALOG`, `SHOPIFY`,
    `WOOCOMMERCE` and `PUBLIC_API`; only trusted server-side catalog or
    integration metadata may bypass direct-upload ambiguity analysis. Direct
    uploads that look upper-body on-model resolve to TOP/ON_MODEL, lower-body
    on-model resolves to BOTTOM/ON_MODEL, product-only resolves to AUTO/AUTO,
    and full-body on-model asks one focused disambiguation question. Low
    confidence and analysis-unavailable cases fall back to AUTO where safe and
    record resolution confidence/source telemetry.

    FULL_OUTFIT is represented as a provider-neutral garment intent distinct
    from ONE_PIECE. FASHN-specific handling remains inside the adapter boundary;
    CORE VTO-1.2 does not add product catalog, commerce sync, durable
    TryOnRun/ProviderAttempt persistence, kiosk/live camera capture or paid
    provider tests.

---

21. Provider Routing
    A normal Try-On uses one active provider attempt at a time.
    SelfX must not automatically send each customer image to every provider.
    Initial strategy:
    Primary provider + policy-controlled fallback/spillover
    Routing may later consider:
    generation profile
    channel
    provider capability
    health
    available capacity
    cost
    privacy policy
    organization entitlement
    regional requirements
    Fallback to another provider must only occur when policy permits it.
    Parallel provider calls are reserved for deliberate benchmarking or another explicitly approved workflow.

---

22. Provider Capacity and Queueing
    SelfX owns queueing and provider capacity management.
    Each provider may have:
    concurrency limits
    request-rate limits
    temporary throttling
    availability constraints
    When eligible provider capacity is full, the request remains queued instead of being discarded.
    If another provider is permitted and has capacity, policy may route the job there.
    SelfX must support tenant fairness and workload priority so one organization cannot consume all available capacity.
    Interactive kiosk requests may receive higher priority than lower-priority bulk/background workloads.

---

23. Try-On and Provider Attempts
    A Try-On is the business-level request.
    A provider attempt is one execution of that Try-On against a provider.
    One Try-On may therefore have multiple attempts due to retry or approved fallback.
    Provider attempts should retain operational metadata such as:
    provider
    model
    provider request ID
    generation profile
    status
    timestamps
    latency
    normalized error
    provider usage/cost
    The customer sees the canonical SelfX Try-On state, not raw provider state.
    Exact Try-On and provider-attempt tables belong in the database schema document.

---

24. AI State, Retry, and Health
    SelfX owns the canonical Try-On state machine.
    Typical states may include:
    CREATED
    VALIDATING
    QUEUED
    PROCESSING
    COMPLETED
    FAILED
    CANCELLED
    Exact state definitions will be finalized in workflow/schema design.
    Retry policy must distinguish temporary failures from unrecoverable input/content errors.
    Retryable failures use bounded retries, exponential backoff, and jitter.
    Provider callbacks/webhooks should be preferred where reliable, with polling/reconciliation as recovery.
    Provider health must be monitored separately from SelfX platform health.
    Routing should support degraded/circuit-breaker behavior when a provider is failing.
    Provider/model changes should be benchmarked for quality, latency, failure rate, and cost before becoming defaults.

---

25. Object Storage and Media
    SelfX should initially use Cloudflare R2 through an S3-compatible storage abstraction.
    Customer photographs and generated Try-On images must be private by default.
    Clients should use short-lived signed upload/read URLs where appropriate.
    Large images should upload directly to object storage instead of always passing through the API server.
    PostgreSQL stores asset metadata and ownership; object storage stores the binary files.
    Original assets and derived assets should be modeled separately.
    Provider-facing normalized images should not destructively replace the only original copy.
    Assets must have ownership or an explicit linked business resource from which authorization can be derived.
    Organization-owned assets include product garment images and organization logos.
    Customer-owned/sensitive assets include customer person images.
    Try-On generated/derived assets include generated results, derived provider inputs, and physical customer-session garment captures.
    Arbitrary orphaned assets with both organization/customer ownership unset are not allowed unless the asset type explicitly justifies it.
    Store Manager access to a generated Try-On result must never imply access to the original customer person image.
    Large image blobs and secrets must never be placed in queue payloads.

---

26. Image Retention
    Customer original photographs and generated Try-On images must follow the approved 7-day retention policy.
    Retention start points:
    customer person image expires no later than 7 days from successful upload/storage creation
    physical customer-session garment capture expires no later than 7 days from successful upload/storage creation
    generated Try-On result expires no later than 7 days from successful result creation/storage
    derived sensitive provider inputs inherit an equal or shorter retention period
    Product/garment catalog images follow the product/catalog lifecycle and are not deleted after seven days.
    If a later legal/product policy requires earlier deletion, earlier deletion wins.
    Use:
    SelfX cleanup/retention jobs
    object-storage lifecycle rules as a safety net
    After customer image deletion, permitted non-image history may remain according to the PRD and later database/retention design.
    Customer consent must be recorded durably where required.
    `tryon_sessions.consent_recorded_at` may exist for workflow convenience, but it is not sufficient as the long-term consent/audit design.
    Consent records must not store raw customer images or unnecessary sensitive content.

---

27. Redis and BullMQ
    Redis is ephemeral infrastructure, not the permanent business database.
    Approved uses include:
    BullMQ
    rate limiting
    short-lived caching
    provider capacity coordination
    distributed locks where justified
    BullMQ handles asynchronous work.
    Queue jobs should normally carry lightweight IDs such as `tryOnId` and `attemptId`.
    Logical queue concerns may be separated for:
    Try-On orchestration
    provider-specific work
    webhook delivery
    maintenance
    Workers must be idempotent.
    PostgreSQL remains authoritative for durable workflow state.
    A reconciliation mechanism must be able to repair inconsistent DB/queue states.

---

28. Kiosk Architecture
    The kiosk is a dedicated Flutter application.
    The customer mobile app is a separate Flutter application.
    They may share safe Dart packages, generated API clients, and design tokens, but should not be one large conditional application.
    The kiosk must support:
    device pairing
    device credential renewal
    heartbeats
    remote configuration
    catalog caching
    guided customer photo capture
    guided garment capture for Scenario 2
    asynchronous Try-On status
    QR handoff
   diagnostics
   remote management
   session cleanup
   app-version tracking
   Android is the primary commercial deployment platform for SelfX-rented
   kiosks. Windows remains a fully supported secondary kiosk and desktop
   camera-testing platform.
   KIOSK-1 starts kiosk hardware validation with a standalone Flutter Windows
   desktop app in `mobile/kiosk`.
   KIOSK-1 is not the full managed kiosk Try-On application and does not
   require kiosk pairing, device authentication, catalog sync, SelfX API
   upload, FASHN or another provider.
   Integrated cameras and external USB/UVC webcams are treated consistently as
   provider-neutral `CameraDevice` values behind `CameraService`.
   The app must enumerate available cameras, allow operator selection, persist
   only safe local `preferredCameraId` configuration, avoid assuming index `0`,
   rediscover cameras when a preferred device is unavailable and recover safely
   from initialization, capture and disconnect failures.
   The selected KIOSK-1 Windows camera backend is Flutter `camera` with
   `camera_windows`.
   It is chosen for official Flutter ownership and reliable Windows
   preview/still-capture support in this phase.
   Its limitation is that Windows live image streaming is not exposed, so
   KIOSK-2 live OpenCV and body-landmark capture readiness may replace the
   camera adapter behind the same application boundary.
   `camera_windows` uses Windows camera platform integration through the
   Flutter plugin implementation; SelfX-specific code must not depend directly
   on plugin APIs outside the adapter.
   `opencv_dart` is used for KIOSK-1 still-image quality analysis after
   capture.
   The original capture is preserved locally and analysis operates on a
   derived/downscaled copy.
   Quality analysis checks decode validity, dimensions, blur/sharpness,
   brightness, overexposure and contrast using a versioned threshold profile
   aligned with SelfX image-quality semantics.
   Quality states are `PASS`, `WARNING` and `BLOCKED`; advisory quality
   warnings normally allow local **Use Photo**, while technical invalidity
   blocks use.
   OpenCV analysis failure produces `IMAGE_QUALITY_ANALYSIS_UNAVAILABLE` and
   must not be treated as capture invalidity.
   Live OpenCV, live frame streaming, pose/body landmarks and automatic
   body-coverage validation are deferred to KIOSK-2.
   Temporary captures are local only, cleaned on replacement/session reset where
   practical, and must not be committed or uploaded during KIOSK-1.
   Flutter kiosk UI mirrors the SelfX design language with Flutter-native
   components rather than React/shadcn or React/Mantine components.
   KIOSK-1.5 keeps `mobile/kiosk` as one Flutter kiosk app and adds Android as
   the primary build target without removing Windows support.
   The shared kiosk UI/session flow remains independent of platform camera
   plugins through `CameraService`.
   Android initially uses Flutter `camera` with the endorsed CameraX
   implementation. Windows continues to use Flutter `camera` with
   `camera_windows`.
   A direct Android UVC stack is intentionally deferred until SelfX tests the
   certified Android box/webcam combination and proves CameraX does not expose
   the required external camera.
   Android capture requires only camera permission; microphone permission must
   not be requested for still-image capture.
   Local preferred camera IDs are platform-scoped device preferences and are
   not server configuration.
   Android commercial kiosk screens are portrait-first because SelfX currently
   deploys/rents primarily 32-inch and 42-inch vertically mounted displays.
   These physical sizes are commercial deployment characteristics, not
   hardcoded Flutter layout dimensions. Kiosk screens must adapt from actual
   logical viewport dimensions and aspect ratio. Windows remains responsive in
   portrait and landscape desktop/window operation.
   Android immersive/fullscreen presentation is an app foundation only.
   Production dedicated-device operation requires later Android lock-task,
   device-owner or managed-device configuration and must not be improvised in
   the app.
   The current still-image OpenCV brightness metric is whole-frame based and
   can pass a backlit subject when a bright background dominates the frame.
   KIOSK-2 must add subject-aware analysis such as person/torso/face exposure,
   background exposure and backlight ratio before using live readiness signals.
   Before broad SelfX rental rollout, kiosk production architecture must add
   device identity, provisioning, store/organization assignment, device auth,
   heartbeat/online state, app/version reporting, remote configuration, camera
   health, diagnostics, controlled kiosk mode and fleet management.
   SelfX should certify known-good hardware through a future SelfX Certified
   Kiosk Profile instead of promising unrestricted Android box/webcam support.
   KIOSK-1.5 does not implement fleet backend, live vision, provider execution,
   SelfX API upload, product/catalog flow or QR handoff.

   KIOSK-1.6 adds an explicit client capture workflow state model to the shared
   Flutter kiosk app: preview, preparing, countdown, capturing, analyzing,
   review, photo ready and error. This is local client workflow state, not
   durable server workflow state. It prevents double capture, countdown timer
   races, delayed capture after cancellation and ambiguous error recovery, and
   leaves a clear point for KIOSK-2 live readiness analysis to replace scripted
   guidance later without rewriting camera adapters.

   KIOSK-1.6 customer capture uses **Take Photo** to start a scripted countdown
   and removes instant customer **Capture Now**. The countdown defaults to 10
   seconds and supports only local operator preferences of 5, 10 or 15 seconds.
   Countdown, shutter and capture-success sounds are output-only, enabled by
   default, configurable off locally and must not require microphone permission.
   Audio failure must never block capture. Capture-success audio must be emitted
   only after a still image is actually captured.

   KIOSK-1.6 guidance is time-based instruction only. It must not claim live
   detection of person position, multiple people, body coverage, lighting,
   distance, pose stability or readiness. Countdown completion captures exactly
   one still image, preserves the original local temporary capture, runs the
   existing post-capture OpenCV quality analysis and opens Review. Technical
   invalidity may block **Use Photo**; quality warnings and OpenCV analysis
   unavailability remain advisory.

   **Use Photo** transitions to Photo Ready. The Photo Ready **Continue** action
   remains a temporary local placeholder until the approved product/catalog and
   Try-On submission phases. KIOSK-1.6 does not upload images, call provider
   services, implement product selection, introduce fleet/device auth or add
   live vision.

   KIOSK-1.6.1 keeps the live camera preview reserved for the customer image,
   static framing guide and future camera-specific KIOSK-2 overlays. Countdown
   and customer guidance render outside the preview in a `CaptureGuidancePanel`,
   below the preview in portrait layouts and beside it in wide layouts.

   Capture audio is isolated behind `CaptureAudioService` so Android and
   Windows share the same capture semantics while platform playback details stay
   replaceable. The local `captureAudioProfile` setting supports Soft, Classic,
   Digital and Minimal profiles backed by bundled offline assets. Production
   spoken cues require supplied or recorded local assets; network TTS and random
   third-party/copyrighted audio are not part of this slice.

   KIOSK-1.6 portrait capture presentation prioritizes SelfX header/status, a
   large/tall live camera preview, future-friendly full-body framing canvas,
   distance-readable guidance and lower-region touch actions. The same shared
   Flutter screens serve Android and Windows; do not fork separate
   Android/Windows or 32-inch/42-inch screen implementations.

   Dedicated API Gateway or edge API-management infrastructure is intentionally
   deferred. The current backend remains Clients -> SelfX NestJS API. Revisit a
   gateway when Public API commercialization, significant partner/commerce
   traffic, centralized per-client rate limiting/quotas, WAF/edge policy,
   multiple independently routed backend services or meaningful cross-channel
   API-management complexity makes it necessary. Tenant authorization must
   remain inside SelfX application services even if a gateway is introduced.

   KIOSK-2A adds local live capture intelligence to Android without changing the
   server/backend path. The camera path is:

   ```text
   Camera -> LiveCameraFrame -> FrameAnalysisScheduler
          -> PersonPoseAnalyzer
          -> PrimarySubjectResolver / LiveImageQualityAnalyzer
          -> CaptureReadinessEngine -> CaptureGuidancePanel
   ```

   `LiveCameraFrame`, `FramePixelFormat`, frame dimensions, timestamp, rotation
   and plane metadata are SelfX-owned semantics. Flutter CameraX and ML/pose
   plugin classes must stay inside adapters and must not leak into widgets or
   capture policy.

   Android KIOSK-2A uses the Flutter `camera` image-stream mechanism where the
   selected Android hardware exposes it. Windows remains KIOSK-2B for live
   frames because `camera_windows` does not expose image streams. Unsupported
   live streaming must fall back to KIOSK-1.6 scripted assisted capture without
   crashing or invalidating the camera.

   The current Android pose adapter uses Google ML Kit Pose Detection in stream
   mode. This active adapter exposes only one tracked/prominent pose and
   requires the person's face to be present. Its analyzer capability must be
   represented as single-primary / `supportsMultiplePeople = false`. The app
   must not infer that only one human exists in the scene merely because ML Kit
   returned one pose, and must not claim reliable background-bystander or
   competing-person detection on this path.

   Windows KIOSK-2B candidate approaches to evaluate separately include a
   maintained Flutter camera adapter with Windows image streaming, a SelfX native
   Windows Media Foundation adapter, or another proven frame-capable Windows
   implementation. KIOSK-2A does not select or replace the Windows backend.

   Live frame analysis is sampled and adaptive. The initial target is about
   three analyzed frames per second, centralized in scheduler configuration.
   If analysis latency exceeds the target interval, the scheduler may reduce
   cadence toward 2 FPS or 1 FPS. Camera preview smoothness has priority over CV
   analysis throughput.

   The `FrameAnalysisScheduler` enforces newest-frame-wins backpressure: only
   one analysis runs at a time, stale pending frames are replaced/dropped and no
   unbounded local frame queue is created. Do not use Redis, BullMQ or server
   queues for local camera frames.

   `PrimarySubjectResolver` is provider-neutral and converts pose/person
   observations into a local ephemeral PrimarySubject: the prominent/target
   customer selected as the model for this capture session. It uses visual
   prominence signals such as apparent body area, centrality, capture-guide
   overlap, pose visibility and confidence rather than true physical distance.
   Widgets and camera adapters must not own subject selection.

   KIOSK-2C adds a customer-facing kiosk shell before capture. The shared
   Flutter app starts on a local/offline idle presentation with static or
   slideshow semantics, then routes **Start Try-On** to CaptureScope selection
   and the existing capture pipeline. The presentation model is provider-neutral
   and local-first so a future CMS/fleet source can supply assets without
   rewriting the kiosk home. The bundled SelfX wallpaper is the default local
   asset for all kiosks until organization/kiosk-specific wallpapers are managed
   from the SaaS dashboard and synced to devices.

   Operator settings are protected by local operator access. The home contains
   no visible settings button; a hidden top-left double-tap hotspot reveals an
   operator icon for a short configured duration. The icon opens a 6-digit PIN
   challenge. UI widgets must call the `OperatorAccessVerifier` boundary and
   must not hardcode production PINs, persist plaintext PINs or log PIN input.
   A demo/local verifier may use a derived verifier value for development.

   Operator access lockout is local and bounded: five failed attempts lock
   operator access for 60 seconds. Lockout does not block the customer
   **Start Try-On** path. Successful unlock grants settings access only for the
   current settings visit; returning from settings re-locks operator access.

   Camera Settings remains local device configuration and is grouped into
   Camera, Capture, Display, Diagnostics and System sections. Settings screens
   must be vertically scrollable and responsive in Android portrait and Windows
   portrait, landscape and narrow desktop windows.

   SELFX-DESIGN-SYSTEM-2 refines operator settings into Camera, Capture,
   Display, Audio, Diagnostics and System categories. Wide layouts may use a
   premium navigation rail/sidebar; narrow and portrait layouts must adapt with
   tabs or stacked controls. The normal Camera category must show
   human-readable camera names first, connection status and resolution. Raw
   hardware IDs belong under Diagnostics or hardware details. The camera
   preview is bounded and aspect-ratio preserving so it does not dominate
   configuration.

10. Cross-Application Design Tokens

    The SelfX primary action and active/selected control color is `#FF7119`
    with white foreground. Implement this through semantic tokens in the
    web semantic tokens, shared UI package and Flutter kiosk theme. Do not scatter
    the literal across pages.

    Required semantics include primary, primary hover, primary pressed,
    on-primary foreground, secondary/inactive controls, ghost controls, danger,
    disabled, surfaces, borders, focus, text, status colors, radius, spacing
    and shadows.

    SaaS web should use a premium modern SaaS visual language and Shadcn-first
    interaction patterns. Windows/mobile/kiosk applications should use solid
    premium surfaces rather than glassmorphism: solid white/light cards, clear
    neutral borders, restrained shadows and readable hierarchy.
    Flutter implementations should use reusable solid SelfX button primitives
    rather than one-off blur/translucent controls. Customer wallpaper/slideshow
    imagery remains supported, but controls over imagery must stay readable
    through solid surfaces or simple scrims rather than blurred glass.

    Primary buttons use orange background, white text and orange border.
    Secondary/inactive and outline buttons use white/light backgrounds, dark
    text and semantic neutral borders. Danger/destructive actions stay
    semantically red. The requested orange/white combination may need an
    accessible action variant before formal WCAG AA compliance.

   The PrimarySubject lock uses ephemeral spatial/pose continuity such as
   normalized region overlap, center proximity, size similarity and short time
   continuity. It must not use face recognition, embeddings, identity
   recognition or persistent tracking identifiers. Once readiness starts the
   final 3/2/1 countdown, the selected PrimarySubject must not silently switch to
   another visible person. If the locked subject becomes absent for stable
   evidence, final countdown may pause/cancel and return to readiness guidance.

   `TargetSubjectRegion` is a normalized provider-neutral region
   `(x, y, width, height)` relative to the full live frame/still image. Regions
   are clamped to image bounds, include safe margins and preserve enough
   customer/garment context for future preparation. KIOSK-2A.1 does not perform
   destructive crops or provider-specific crop sizing.

   `CaptureReadinessEngine` consumes PrimarySubject semantics rather than
   arbitrary pose output. Readiness asks whether the selected model is ready for
   the selected CaptureScope, considering body coverage, centering/framing,
   subject lighting, sharpness, stability and analyzer availability. READY
   requires stable/debounced samples, not one lucky frame.

   CaptureScope values are TOP, BOTTOM and FULL BODY. They are customer-facing
   framing scopes, not final garment taxonomy. TOP emphasizes upper-body
   visibility, BOTTOM lower-body visibility and FULL BODY shoulders/hips/knees/
   ankles. FULL BODY may later resolve to ONE_PIECE, FULL_OUTFIT or other
   canonical garment semantics. Because current ML Kit pose detection requires
   face visibility, BOTTOM must retain enough full-person/face framing for pose
   continuity. BOTTOM emphasizes lower-body readiness; it must not crop the live
   camera to legs only.

   Explicit multi-person awareness is deferred. Future MediaPipe or person
   detector work may return multiple observations to `PrimarySubjectResolver`
   for dominant-person selection and ambiguity handling if hardware testing
   shows frequent wrong-person targeting, prominent-person switching,
   bystanders materially reducing generation quality or store requirements for
   explicit two-person ambiguity detection.

   Live image quality uses downsampled/derived frame data and subject-aware
   luminance around the PrimarySubject/TargetSubjectRegion where practical to
   improve on the KIOSK-1 whole-frame brightness limitation. Guidance remains
   customer-friendly and must not display technical CV metrics, fake distance
   values or landmark confidence.

   Readiness has a bounded window. Timeout exposes **Try Again** and **Capture
   Anyway**. Capture Anyway bypasses readiness/quality warnings only and must not
   bypass unavailable camera, still-capture failure, corrupt images, decode
   failure or other technical invalidity.

   Local diagnostics may expose safe performance data for operators/developers:
   target/effective analysis FPS, dropped frames, analysis duration, pose
   latency, image-quality latency, readiness state, PrimarySubject lock state,
   visual prominence, normalized target region, tracking age, analyzer mode and
   multi-person awareness as unsupported for ML Kit. Diagnostics must not log or
   show frame bytes/base64, raw landmarks, face data, stack traces or provider
   secrets.

   Future KIOSK-3 target-only preparation must not blindly treat every visible
   person as the Try-On model. The approved future target flow is:
   original captured still -> PrimarySubject/TargetSubjectRegion ->
   TargetSubjectExtractor -> padded target model image -> SelfX API ->
   VTO provider -> generated target region -> TargetSubjectCompositor -> final
   image. The selected customer should receive the garment change; unrelated or
   background people should remain unchanged. KIOSK-2A.1 does not implement
   FASHN/provider generation, extraction or compositing.

   API Gateway remains deferred for KIOSK-2A. This phase does not introduce
   provider calls, Try-On upload, product/catalog flow, QR handoff, fleet/device
   backend, Redis/BullMQ, R2 or billing.

   KIOSK-3A connects the existing Flutter kiosk flow to real Try-On generation
   through the SelfX backend:

   - approved request path: Flutter kiosk -> SelfX NestJS API ->
     provider-neutral Try-On service -> provider adapter;
   - Flutter kiosk must not call FASHN/provider APIs directly and must not hold
     `FASHN_API_KEY` or provider credentials;
   - until production kiosk device authentication is implemented, the
     development bridge may use the existing authenticated Try-On Lab endpoint
     only when explicitly configured with a development access token;
   - the development bridge remains disabled when `SELFX_KIOSK_API_BASE_URL` or
     `SELFX_KIOSK_DEV_ACCESS_TOKEN` is absent;
   - backend Lab access remains guarded by staff/admin authentication and
     `TRYON_LAB_ENABLED=true`;
   - KIOSK-3A uses temporary local garment images through a customer-friendly
     picker/preview mapped to provider-neutral garment input metadata. Raw path
     entry, milestone labels and garment intent/photo-type override controls
     must not appear in normal customer UI. Catalog, physical garment capture
     and commerce garment sources remain future adapters;
   - the accepted full-resolution still remains the person source. When
     `TargetSubjectRegion` metadata is available, the kiosk prepares a padded
     target image from the original still; otherwise it submits the full frame;
   - generated results are displayed directly. Target-only extraction,
     provider-result compositing and background-person preservation are future
     phases;
   - create-run is asynchronous and followed by bounded polling. Retry polling
     for an existing run must not create another paid submission;
   - customer UI must show safe status/failure language and must not expose
     provider names, provider prediction IDs, raw HTTP errors, image bytes,
     Base64 telemetry, access tokens or provider secrets;
   - no new database tables, migrations, durable TryOnRun records, Redis/BullMQ,
     R2 assets, API Gateway, billing or fleet/device backend are introduced by
     KIOSK-3A.

   KIOSK-4A adds the production device provisioning foundation:

   - unpaired kiosks call `POST /api/v1/kiosk/provisioning/sessions` to receive
     a backend-generated six-digit numeric code, `pairingSessionId`,
     private provisioning secret, `expiresAt` and `serverTime`;
   - pairing codes are digested with server-only `KIOSK_PAIRING_CODE_PEPPER`,
     are valid for exactly `KIOSK_PAIRING_TTL_SECONDS=480` seconds and are
     never authoritative when generated by Flutter;
   - kiosk polling uses `GET /api/v1/kiosk/provisioning/sessions/:sessionId`
     with the provisioning secret header and returns only `WAITING`, `PAIRED`
     or `EXPIRED` plus the one-time grant when paired;
   - superadmin pairing uses `POST /api/v1/admin/kiosks/pair`, validates
     `PLATFORM`, `ORGANIZATION` or `STORE` assignment and atomically claims the
     pending pairing session before creating a `KioskDevice`;
   - STORE assignment validates the selected store belongs to the selected
     organization;
   - one-time provisioning exchange uses
     `POST /api/v1/kiosk/session/exchange` and returns device credentials only
     to the physical kiosk;
   - device access tokens use the dedicated `typ: "kiosk_device_access"` and
     must not be confused with human `typ: "access"` tokens;
   - kiosk refresh credentials are per-device, persisted as HMAC digests and
     rotated through `POST /api/v1/kiosk/session/refresh`;
   - `GET /api/v1/kiosk/session/me` and `POST /api/v1/kiosk/heartbeat` reload
     current device status/assignment from the database so revoked or reassigned
     devices do not rely on stale JWT organization/store claims;
   - only `ACTIVE` devices may use device-authenticated kiosk APIs. `INACTIVE`
     blocks operation without deleting the device record, `REVOKED` invalidates
     refresh sessions, and `DELETED` is a soft-delete state hidden from normal
     fleet lists;
   - superadmin lifecycle APIs support activate, deactivate, revoke and delete
     operations with platform permissions and audit entries;
   - Flutter stores the device refresh credential in OS-backed secure storage.
     The short-lived access token lives in memory;
   - revocation sets the device to `REVOKED`, revokes refresh sessions and makes
     the kiosk return to pairing after auth rejection;
   - KIOSK-4A uses single-instance in-memory request limiting for anonymous
     provisioning creation. One-time grant verification is database-backed via
     `grantConsumedAt`; Redis remains deferred until the approved queue/fleet
     scale phase;
   - production kiosk Try-On is implemented in KIOSK-4B. The KIOSK-3A
     development bridge remains historical/internal-lab architecture only and
     is not used by normal paired kiosks.

   KIOSK-4B connects paired kiosk device identity to production Try-On:

   - production routes are `POST /api/v1/kiosk/try-on/runs` and
     `GET /api/v1/kiosk/try-on/runs/:runId`;
   - routes require `Authorization: Bearer <device-access-token>` with
     `typ: "kiosk_device_access"` and must reject human access tokens;
   - every request reloads the current `KioskDevice` from the database and
     requires `ACTIVE` status. `INACTIVE`, `REVOKED`, `DELETED` and unpaired
     devices are rejected;
   - `PLATFORM`, `ORGANIZATION` and `STORE` execution context is derived
     server-side from the current device record, not from Flutter fields or JWT
     organization/store claims;
   - production kiosk Try-On does not depend on `TRYON_LAB_ENABLED`; that flag
     gates only `/api/v1/try-on-lab/runs`;
   - the Lab and production kiosk endpoints use the same provider-neutral Try-On
     execution service and centralized FASHN adapter;
   - `FASHN_API_KEY` remains server-side only on `@selfx/api`;
   - create-run requires `clientRequestId`. `(kiosk_device_id,
     client_request_id)` is unique so retries return the same SelfX run and do
     not submit duplicate paid provider generations;
   - `KioskTryOnRun` stores run ownership, assignment context, safe provider
     metadata, execution status, result/error and expiry. It does not store raw
     person or garment input bytes;
   - status/result reads are scoped to the creating kiosk device;
   - Flutter generation uses the existing device session controller and refresh
     flow. It no longer requires `SELFX_KIOSK_DEV_ACCESS_TOKEN` for the normal
     paired path;
   - if device authorization is rejected during generation, Flutter clears
     device credentials and routes back to pairing. Heartbeat remains
     independent of generation traffic.

   KIOSK-4C adds secure customer mobile photo upload for paired kiosks:

   - Flutter reaches the KIOSK-4C photo source choice after garment
     selection/preview, with CaptureScope resolved internally from the existing
     provider-neutral garment semantics;
   - device-authenticated kiosks create sessions through
     `POST /api/v1/kiosk/customer-upload-sessions`;
   - bodyless device requests, including customer-upload create/status/cancel
     and consume, must not send `Content-Type: application/json`. JSON
     `Content-Type` is reserved for requests with an actual JSON body, and
     multipart uploads must let the HTTP client set its boundary;
   - kiosk status, cancellation and consumption use device-authenticated
     session routes and must reload current device state before access;
   - Flutter mobile-upload session creation uses the existing kiosk device
     session controller. `DEVICE_TOKEN_INVALID` and `DEVICE_TOKEN_EXPIRED`
     use one forced device-token refresh and retry the original request once.
     `DEVICE_UNPAIRED`, `DEVICE_REVOKED`, `DEVICE_DELETED` and
     `DEVICE_INACTIVE` return to pairing. Non-auth upload failures, including
     HTTP 400 validation, 409 conflict, 429, 5xx, timeout and connection
     failures, must not clear a healthy kiosk pairing;
   - public phone routes are capability-only under
     `/api/v1/customer-uploads/:capability/*` and never accept kiosk IDs,
     organization IDs, store IDs or object keys from the browser;
   - the QR capability is at least 256 bits of entropy, is stored only as an
     HMAC digest using server-only `KIOSK_CUSTOMER_UPLOAD_TOKEN_PEPPER` and
     expires after `KIOSK_CUSTOMER_UPLOAD_TTL_SECONDS=300`;
   - signed upload and read URLs are short-lived, generated server-side and
     bounded by the remaining session lifetime;
   - object storage configuration is server-only. Browsers and Flutter must not
     receive storage credentials;
   - backend validation checks declared MIME type, file signature, byte size and
     image dimensions for JPEG, PNG and WebP before setting `READY`;
   - cancellation, replacement, rejection, expiry and consumption must not leave
     a valid reusable customer upload capability. Stored objects are deleted
     best-effort and remain covered by the global customer-image retention
     policy;
   - the public Next.js `/upload/[capability]` route stays outside authenticated
     app layout/session requirements and uses no-referrer handling;
   - the Flutter QR screen must use backend `expiresAt/serverTime` for countdown,
     show no timer before a valid session exists, derive QR size from available
     viewport space and surface safe retry/cancel UI for create failures;
   - mobile-upload diagnostics may include endpoint path, HTTP status, safe
     canonical error code, state transition and duration only. They must not log
     authorization headers, device access/refresh tokens, capability values,
     full QR URLs, signed storage URLs or image bytes. Device-session
     diagnostics may report only safe state such as refresh credential
     availability and restoration success/failure codes;
   - KIOSK-4C does not introduce Product Catalog, QR result continuation,
     Redis/BullMQ, billing or API Gateway.

---

29. Kiosk Privacy and Offline Behavior
    Each customer kiosk session is ephemeral and isolated.
    When the customer finishes or the session expires, the next customer must not see:
    previous customer photo
    previous Try-On result
    selected garments
    QR token
    customer account information
    Customer images should not accumulate permanently on kiosk storage.
    Non-sensitive content such as catalog metadata, thumbnails, branding, and configuration may be cached.
    If internet is unavailable, the kiosk may provide graceful cached browsing, but new AI generation requires live SelfX connectivity.

---

30. Kiosk QR and Commerce Boundary
    The kiosk does not perform checkout or customer payment in the initial product.
    The kiosk supports:
    Try-On
    product selection
    product details
    product price/variants when supplied by merchant catalog
    QR handoff
    QR codes should contain an opaque, short-lived SelfX handoff token rather than customer data or raw image URLs.
    The QR may continue to product details and the organization's approved product destination.
    The merchant handles checkout/payment.

---

31. Product and Commerce Domain
    All product sources normalize into the common SelfX product/garment domain.
    "Store product", "site product" and "catalog product" refer to the same
    canonical SelfX product/garment concept whether the record is SelfX-native,
    synchronized from a future Shopify integration, synchronized from a future
    WooCommerce integration, or created through a future approved API. CORE
    VTO-1.2 only defines these source semantics for Try-On policy resolution;
    it does not implement catalog persistence or commerce synchronization.
    Possible sources include:
    SelfX dashboard
    Shopify
    WooCommerce
    Public/approved APIs
    future integrations
    For imported ecommerce products, the external commerce platform remains authoritative for commerce-related information such as:
    price
    sale price
    SKU
    variants
    availability
    inventory
    product URL
    product status
    SelfX stores the normalized representation required for VTO and mapping.
    SelfX is not initially a full POS, inventory, checkout, order, tax, or shipping system.

---

32. Shopify Integration
    SelfX should provide an installable Shopify app.
    The storefront Try-On experience should use supported Shopify extension mechanisms such as a Theme App Extension.
    Catalog integration should use:
    Initial sync + incremental webhooks + periodic reconciliation
    Products require explicit VTO eligibility/configuration before Try-On is exposed.
    SelfX adds the Try-On experience.
    Shopify retains:
    Add to Cart
    checkout
    payment
    tax
    shipping
    orders

---

33. WooCommerce Integration
    SelfX should provide a dedicated WooCommerce/WordPress plugin connected to the central SelfX backend.
    Catalog synchronization should use:
    Initial sync + signed webhook updates + periodic reconciliation
    The plugin must not independently implement AI/provider business logic.
    WooCommerce retains its normal cart, checkout, payment gateways, taxes, shipping, and order flow.

---

34. Public API
    The Public API is the first major commercial expansion after kiosk functionality.
    Initial Public API capabilities should focus on:
    upload authorization
    Try-On creation
    Try-On status/result
    product/garment references where required
    usage
    webhooks
    The Public API must be a deliberately governed subset of SelfX rather than exposing internal administration.
    The architecture must support separate sandbox/test and production credentials.
    Asynchronous result delivery should support signed webhooks with stable event IDs and retry-safe semantics.

---

35. Customer Mobile Commerce
    The SelfX mobile app may display:
    product details
    product images
    price
    variants
    Try It On
    generated result
    merchant purchase link
    When the customer wants to purchase, the initial flow sends them to the organization's existing commerce destination.
    Native SelfX customer checkout/payment is intentionally deferred.

---

36. SaaS Billing and Entitlements
    Organization-to-SelfX SaaS billing is separate from customer-to-merchant garment payment.
    SelfX owns:
    subscription state
    plan/contract terms
    entitlements
    usage limits
    trial rules
    grace/suspension rules
    Payment providers such as Stripe or Razorpay are adapters, not the sole authorization source.
    The architecture must support:
    fixed subscriptions
    subscription + included usage
    overage/usage models
    manual invoice
    custom enterprise contracts
    Application access must be entitlement-based rather than hard-coded solely against plan names.

---

37. Usage Metering
    SelfX must keep an authoritative usage ledger.
    Operational provider attempts and customer billable usage are separate concepts.
    Example:
    One Try-On may require two provider attempts due to a retry but still count as one customer billable generation.
    Usage recording must be idempotent.
    Quotas should be checked/reserved before expensive provider execution.
    Real paid AI provider execution must not be enabled before at least a minimal entitlement/quota decision point exists.
    An initial development/internal entitlement implementation is acceptable, but it must preserve the architecture for atomic reservation before paid provider execution.
    Trials must support both time and generation limits.
    Usage may be aggregated for dashboards and billing, but detailed usage events remain the authoritative audit trail.

---

38. Infrastructure Strategy
    Initial hosting should be Railway-first where practical while remaining cloud-portable.
    Initial production components:
    Next.js web service
    NestJS API service
    worker service
    managed PostgreSQL
    managed Redis
    Cloudflare R2
    Maintain isolated:
    local development
    staging
    production
    These environments must not share production databases, secrets, Redis, or sensitive data.
    API and workers must scale independently.
    Do not introduce Kubernetes or large-scale microservice infrastructure for MVP without demonstrated need.

---

39. CI/CD and Deployment
    The deployment pipeline should eventually include:
    Install → lint → typecheck → unit tests → integration tests → API contract checks → migration validation → build → deploy → Prisma migration deploy → health/readiness verification
    Railway deployment healthchecks may remain pointed at `/health` while a new
    `/ready` probe is being deployed and production-verified. Switching a
    platform deployment healthcheck from liveness to readiness is an explicit
    operational decision after readiness succeeds against the target production
    PostgreSQL instance. The Railway API service must bind to `0.0.0.0` on
    Railway `PORT`; `API_PORT` is only the local SelfX override/fallback before
    the final `3001` development default.
    Railway `@selfx/web` builds must use `npm run build:web` rather than
    directly invoking `npm run build --workspace=@selfx/web`, because a direct
    workspace build bypasses Turborepo's internal-package ordering and can fail
    to resolve compiled packages such as `@selfx/shared` on a clean checkout.
    The web Railway Start Command remains `npm run start --workspace=@selfx/web`;
    frontend deployment remains pending until the Railway clean build succeeds.
    Railway production web deployments must set server-only
    `SELFX_API_UPSTREAM_URL` to the deployed SelfX API origin and remove
    browser-public API host overrides such as `NEXT_PUBLIC_API_URL` and
    `NEXT_PUBLIC_SELFX_API_BASE_URL` so browser requests use same-origin
    `/api/v1/*` paths. Once the web proxy is active, production auth cookies
    should use `COOKIE_SECURE=true`, `COOKIE_SAME_SITE=lax` and unset
    `COOKIE_DOMAIN`, while backend `CORS_ORIGINS` remains the exact trusted web
    origin. Operators should not switch cookie SameSite back to lax until
    deployed browser Network verification proves login and refresh use the web
    origin and no request falls back to localhost or direct API-host browser
    traffic.
    Database migrations are part of the release lifecycle.
    Production schema changes must not depend on manual database editing.
    Application releases should be rollback-capable.
    Schema migrations should use backward-compatible staged approaches where practical.
    Early engineering safeguards are not deferred to final production hardening.
    Relevant early phases must include lint, typecheck, build validation, migration validation when migrations exist, secrets discipline, request/correlation IDs when API work begins, basic structured logging, rate limiting for sensitive endpoints, tenant isolation tests, basic health/readiness, and security-aware error handling.

---

40. Secrets and Environment Configuration
    Secrets must never be committed to source code or exposed to clients.
    Server-side secrets include:
    database credentials
    JWT/session secrets
    FASHN/Google credentials
    R2 credentials
    Shopify tokens/secrets
    WooCommerce credentials
    billing-provider secrets
    OTP/email service credentials
    Sensitive recoverable integration credentials must be encrypted at rest.

---

41. Security Requirements
    SelfX must require HTTPS/TLS outside local development.
    External inputs must be validated.
    Uploads must enforce appropriate:
    file size
    allowed format
    actual file type/signature
    image constraints
    Authentication/OTP/Public API/Try-On endpoints require suitable rate limiting and abuse controls.
    Logs must never intentionally contain:
    passwords
    OTPs
    bearer tokens
    refresh tokens
    API secrets
    provider secrets
    full sensitive customer image contents
    Security-sensitive operations must generate audit events.

---

42. Observability
    Production services should use structured logs rather than relying only on unstructured console output.
    Every request should have a request/correlation ID.
    Try-On processing should be traceable through identifiers such as:
    request ID
    Try-On ID
    provider attempt ID
    job ID
    organization ID
    store ID
    channel
    Operational metrics should include:
    API latency/error rate
    queue depth and wait time
    worker throughput
    Try-On completion/failure rates
    provider latency/failures
    provider capacity
    PostgreSQL health
    Redis health
    storage health
    Central error monitoring should cover major applications.
    Alerts should focus on actionable degradation rather than every isolated user error.
    Audit logs and operational/debug logs are separate concerns.
    The audit foundation must be introduced incrementally when the first auditable actions appear.
    It must be available early enough for authentication/security actions, organization/staff changes, role/store-scope changes, kiosk pairing/unpairing, API key lifecycle, impersonation, and sensitive administrative actions.
    Organization onboarding audit events should include organization registration submitted, review started, information requested, application approved, application rejected, organization activated, organization suspended, and activation requirement override/manual confirmation where applicable.
    Platform approval audit events must preserve the actual SelfX platform actor, even when the action affects a merchant organization or an intended initial owner.
    The full support/admin experience may remain a later phase.

---

43. Reliability Standards
    External dependencies must always be treated as unreliable.
    External calls require explicit timeouts.
    Retryable operations use bounded retry policies with exponential backoff and jitter.
    Permanent validation/content errors must not be retried indefinitely.
    Workers must support graceful shutdown and idempotent processing.
    PostgreSQL is the durable source of truth for important workflow state.
    PostgreSQL is also the current required core dependency for API readiness.
    A PostgreSQL outage should make `/ready` unavailable with HTTP 503 while
    keeping `/health` available if the application process is still alive.
    Provider failure must degrade the Try-On capability rather than crash unrelated SelfX features.
    Backup and restore procedures must be tested periodically.

---

44. Testing Strategy
    SelfX requires:
    unit tests
    integration tests
    end-to-end tests
    API contract tests
    migration tests
    targeted load tests
    Mandatory security testing includes tenant and store isolation.
    Provider adapters should normally use mocks/stubs in CI so tests do not consume paid AI credits.
    A small controlled real-provider smoke suite may be run intentionally.
    Kiosk testing must cover:
    pairing
    token/session renewal
    unpairing
    customer-session cleanup
    connectivity failure
    Try-On recovery
    QR handoff
    Usage and billing tests must verify duplicate callbacks/retries cannot double-count usage.

---

45. Performance and Scalability Standards
    Known scalability problems must be prevented from the beginning:
    unbounded list endpoints
    N+1 queries
    full tenant scans
    unnecessary large payloads
    blocking AI requests
    oversized queue payloads
    Load testing should separately simulate:
    API request creation
    queue throughput
    provider limits
    large catalog/tenant datasets
    large Try-On history
    usage and audit history
    The architecture should support future growth toward thousands of organizations/stores/kiosks and millions of Try-Ons per month without requiring a complete rewrite.
    Scaling must still be based on measured demand rather than speculative infrastructure.

---

46. Engineering Standards
    Use TypeScript strictness wherever practical.
    Do not use `any` to bypass important application contracts without justification.
    Use consistent:
    linting
    formatting
    type checking
    tests
    CI validation
    New dependencies are allowed when they solve a real need.
    Avoid duplicate libraries for the same concern.
    Important architecture decisions must not be silently changed by Codex or developers.

---

47. Architecture Guardrails
    Unless explicitly approved, do not:
    call AI providers directly from clients
    expose provider or integration credentials to clients
    duplicate backend business logic across client platforms
    rely on frontend-only tenant authorization
    return unbounded collections
    store customer images directly in Redis job payloads
    use Redis as permanent business storage
    expose Prisma models as public API contracts
    model users as belonging to exactly one organization
    model staff as belonging to exactly one store
    expose unrestricted customer media URLs
    turn SelfX into a full POS/inventory/checkout system
    introduce microservices without a demonstrated reason
    bypass tracked database migrations

---

48. Implementation Change Discipline
    Before implementing a feature, identify:
    affected requirement
    affected modules
    authorization/tenant impact
    API impact
    database impact
    migration requirement
    queue/provider impact where applicable
    privacy/security impact
    tests required
    Database changes require explicit tracked migrations.
    API changes require explicit DTO/OpenAPI compatibility review.
    AI changes must keep provider-specific behavior inside adapters where possible.
    UI changes must follow the SelfX design system.
    If documentation conflicts or a major requirement is unclear, stop and obtain a product/architecture decision rather than silently inventing behavior.

---

49. Intentionally Deferred Decisions
    The following are intentionally deferred until their implementation phase:
    Infrastructure
    exact long-term cloud provider after Railway
    exact managed Redis provider
    exact autoscaling thresholds
    final domain/subdomain structure
    Kiosk
    Android vs Windows production hardware
    OS-specific fleet/update management
    Real-time
    polling-only MVP vs SSE/WebSockets
    Authentication
    exact access-token TTL
    exact refresh-session TTL
    OTP expiration/attempt limits
    MFA rollout timing
    Public API
    final public API hostname
    exact rate limits
    full sandbox timing
    Billing
    Stripe vs Razorpay vs another processor
    exact pricing
    exact trial limits
    exact plan allowances
    Storage
    final bucket/object-key convention
    exact signed-URL lifetime
    AI
    exact provider concurrency values
    Google fallback activation timing
    final generation-profile configuration
    future routing weights
    These values should be configurable instead of hard-coded as assumptions.

---

50. Approved Technical Baseline
    The approved baseline is:
    Repository: single product monorepo
    Package manager: npm + npm workspaces
    Task runner: Turborepo
    Runtime: Node.js 24 LTS
    Web: Next.js + React + TypeScript + App Router
    UI: shadcn/ui primary + SelfX design system in `@selfx/ui`; Tailwind utility/layout support; Mantine only by explicit request
    Backend: NestJS + Fastify + TypeScript
    Architecture: modular monolith + independently scalable workers
    Database: PostgreSQL
    ORM: Prisma
    Migrations: tracked Prisma migration history
    Tenancy: shared DB/shared schema with organization/store scoping
    API: REST + JSON + `/api/v1` + OpenAPI/Swagger
    Pagination: default page size 25, standard max 100, bounded server-side maximums
    Idempotency: scoped keys + request fingerprints for retry-sensitive mutations
    Authentication: short-lived JWT access + revocable rotating sessions
    Passwords: Argon2id
    Customer auth: anonymous + email OTP + phone OTP + Google + Apple
    Authorization: predefined organization/store roles + scopes, with separate SelfX platform roles
    Organization onboarding: registration/application review is separate from platform-approved activation
    Public API: scoped hashed API keys
    AI: provider-neutral router/adapters
    Initial AI: FASHN v1.6
    Provider behavior: one active provider attempt per Try-On; controlled fallback/spillover
    Queue: BullMQ
    Redis: managed Redis
    Storage: S3-compatible abstraction; Cloudflare R2 initially
    Media: private, signed access, 7-day customer-image/result retention
    Kiosk: Flutter + pairing + device auth + QR handoff
    Mobile: separate Flutter customer application
    Shopify: installable app + storefront extension + catalog sync
    WooCommerce: dedicated plugin + catalog sync
    Customer checkout: merchant-owned initially
    SaaS billing: SelfX-owned subscription/entitlement/usage layer
    Hosting: Railway-first, cloud-portable
    Environments: development + staging + production
    Observability: structured logs + correlation IDs + metrics + audits
    Testing: unit + integration + E2E + contract + migration + load testing

---

51. Status
    Technical Requirements & System Design v1.0 — APPROVED BASELINE
    This document is sufficient to guide the remaining design documents.
    Application implementation should not begin until the database schema and implementation plan have been completed and approved.
