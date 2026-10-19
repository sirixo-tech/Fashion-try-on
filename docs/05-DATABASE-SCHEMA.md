# SelfX Virtual Try-On

## Database & Schema Design

### PAYMENTS-1H — Delete active connection, retain payment snapshots

No schema migration. Store payment selection must be cleared before deleting its
referenced store_payment_connections row. Historic shopping attempts retain their
connection id provenance and independent encrypted credential snapshots; scoped
verification records/events and audits remain. Re-created connection versions
must exceed the retained Store settings revision and verification history, so a
new account never inherits an old verification for the same provider/version.
Edit encrypts the retained/replaced key without exposing it through read DTOs.

### PAYMENTS-1G — Store-only production verification snapshots

Migration 20261019020000_store_live_payment_verification permits PRODUCTION in
platform_payment_tests only when organization_id is non-null. Platform test
connections/records remain UAT-only. Existing INR 100-minor-unit checks, scopes,
FKs, histories, idempotency and transaction uniqueness remain. Pin apiBaseUrl in
the encrypted production snapshot without new columns; public summaries omit it
and all credentials. testOnly is false for production verification, which is a
real payment. Do not rewrite historical UAT environments or outcomes.

### PAYMENTS-1F — Reuse existing test lifetime and history

Migration 20261019010000_payment_test_qr_renewal replaces the indefinite unique
unresolved-test index with a non-unique scope/provider/version/expiry lookup index.
The shared account transaction lock serializes new-test checks and creation;
existing transaction-id and idempotency uniqueness remain. Use expires_at to
bound the new-test guard. Preserve expired rows, events, transaction ids, encrypted
credential snapshots, payment statuses and reconciliation metadata. Expired QR
visibility is independent of the persisted payment outcome.

### PAYMENTS-1E — Redacted test diagnostic snapshots

Migration 20261019000000_payment_test_diagnostics adds nullable JSONB
initialization_diagnostic and status_diagnostic to platform_payment_tests, the
existing shared scoped test table. Each snapshot contains only a fixed internal
code, numeric HTTP status or null, allowlisted provider code or null and timestamp.
Display messages are resolved from the backend registry. Do not store arbitrary
provider/request/error data. New reads revalidate stored snapshots before returning
them. Existing rows remain null; no invented/backfilled failure reason is added.
Existing Store/platform isolation, retention, audit and cascade behavior remain.

### ROLES-1 — Existing role maps and permission limits

No new table or schema migration is required. Keep global platform_roles and
platform_role_permissions separate from tenant store_roles,
store_role_permissions, store_membership_roles and store_permission_grants.
Organization ids remain the internal compatibility ids for merchant Stores.
Superadmin remains a protected platform_role_assignments bootstrap identity.

Populate default permissions atomically only when a canonical role is created;
preserve existing maps, including intentionally empty maps. Never reset existing
permissions as a migration/bootstrap side effect. Ordinary bootstrap platform
identities consume the persisted canonical role permissions. Use each role's
updated_at for permission-map versions and the organization's updated_at for its
Store ceiling version. Replace mappings inside row-locked transactions and advance
the timestamp monotonically. Reuse existing actor-attributed audit records. No
production data rewrite or manual insertion of Store roles is part of deployment.

### PAYMENTS-1D — Versioned Store credentials and scoped test history

Migration 20261018183000_store_payment_verification adds positive version to
store_payment_connections, incremented only on credential replacement. Selection
changes do not change the credential version. Reuse historical platform_payment_tests
and platform_payment_test_events tables for the shared probe engine, adding
scope_key and nullable organization_id. A CHECK enforces PLATFORM_TEST with no
tenant or STORE:<organization UUID> with that tenant. Existing probes default to
PLATFORM_TEST. Scope/actor/provider/idempotency uniqueness and the partial active
test index now include scope_key. Keep encrypted credential snapshots on each
probe, separate from current credentials. Store deletion removes only its scoped
probes/events; platform history remains. User deletion retains existing actor
snapshots. Include probes/events in permanent Store purge audit counts. No real
shopping/billing records are created by verification tests.

### KIOSK-STORE-1 — Existing Store-owned device records

No schema migration is required. Continue mapping merchant Store to organization_id
with kiosk assignment scope ORGANIZATION and legacy store_id null. Keep historical
platform devices/products, permission rows and audit history; remove their runtime
administration/authority rather than deleting data. Store lifecycle operations
check organization ownership inside the device mutation transaction. Pairing uses
an advisory transaction lock per installation to prevent duplicate live links.
Revoked records retain ownership until removed, and re-pairing preserves device
identity. Deployment does not automatically move or delete any device or product.

### CATALOG-STORE-1 — Retain history, use Store ownership

No schema migration is required. Operational products and categories use scope
STORE and organization_id as the merchant Store tenant. Legacy PLATFORM_DEFAULT
rows remain intact for history or an explicit transfer but cannot be served as a
kiosk fallback or managed through platform catalog endpoints. Historic platform
product permission rows and links may remain; runtime registry/assignment checks
and safe role projections retire their authority and presentation. No products,
stock, orders, subscriptions or users are deleted or reassigned by this change.


### USERS-4 — Reuse existing account and Admin records

No persistence structure or migration is added. Create the user, first-admin
membership, canonical role assignment and audit events in one serializable
transaction. The user email uniqueness constraint protects concurrent conflicts.
Use existing OWNER compatibility membership and explicit ALL_STORES scope for
the selected merchant tenant. Preserve other Store rows and permission grants.
Passwords are stored only as the existing password-service hash.


### USERS-3 — Store Admin convenience actions

No new table, column or migration is required. Reuse Users-2 account versions,
memberships, Store RBAC, sessions, reset tokens and audit data. Email-only edits
preserve nullable names, statuses, passwords and all role/membership rows. Audit
metadata identifies the source Store without recording credential values.
Admin assignment retains other Store links and permission ceilings. Additional
admins use ORGANIZATION_ADMIN compatibility membership; first-admin repair uses
ORGANIZATION_OWNER. Both receive the canonical store-admin role with explicit
ALL_STORES scope for the selected merchant tenant.


### USERS-2 — Deleted identities and Store purge

Migration `20261018000000_user_deletion` adds users.deleted_at and
organization_memberships.deleted_at. Check constraints require deleted accounts
to be DISABLED and deleted memberships REVOKED. AuditLog gains actor_snapshot.
Historical creator/actor references in impersonation sessions, applications,
platform payment tests, integration credentials and API keys become nullable
SET NULL references with safe identity snapshots. Hard account deletion stores
these snapshots before removing the login row. Soft deletion retains name/email.

`deleted_store_objects` stores a unique object key, retry attempts, next available
time and creation time. Store purge queues cleanup in the same database transaction.
Historical audit rows retain actor and deleted-Store context after FK SET NULL.

Migration `20261018010000_five_roles` consolidates memberships into canonical
store-admin/staff role assignments and retires other role definitions. Ordinary
Platform roles retain internal codes platform-staff-admin/platform-support-admin
but display Platform Admin/Platform Staff. Old enums remain compatibility data.
The new products.manage permission is backfilled only for Stores that already
held stores.update, preserving the existing ceiling for other Stores.


### USERS-1 account administration

No new persistence or migration is required. Reuse users, user_sessions,
password_reset_tokens, organization_memberships, store_membership_roles,
platform_user_roles, platform_role_assignments and audit_logs. Product Store
links target organizations, never legacy location stores. New ordinary links
have explicit ALL_STORES scope within their selected tenant; existing scopes
are preserved. First-owner assignment uses ACTIVE ORGANIZATION_OWNER plus
ALL_STORES and the Store's store-admin RBAC role. Existing membership, role and
permission ceiling constraints remain authoritative. Account edits and explicit
first-owner assignments have attributable audit events without secret values.

### MAIL-1 — Recovery persistence

Migration 20261017000000_mail_and_password_recovery adds users.credentials_version
and password_changed_at plus user_sessions.credentials_version. Existing records
start at version zero. SMTP configuration reuses platform_settings.

password_reset_tokens has UUIDv7 ID, User FK, unique SHA-256 token hash, credential
version, expiry, consumed timestamp and creation time. No plaintext link is stored.
mail_jobs contains kind/status, encrypted payload, attempts, scheduling, lease,
expiry and safe failure code. Payloads are scrubbed on completion/final failure
or expiry. Terminal metadata and expired reset records are pruned after seven days.
password_recovery_rate_buckets stores keyed identifiers/counts/expiries, not raw
emails or IPs. User-row locking serializes resets; Store tenancy is unchanged.

### PAYG-1 — Billing cycles and durable generation charges

`pricing_plans` adds a CREDIT_LIMITED/POSTPAID_PAYG mode and optional integer
minor-unit price per credit. `pricing_plan_rates` retains effective-dated currency
and unit-price versions. `store_subscriptions.billing_anchor_at` preserves UTC
anniversaries. `store_billing_cycles` snapshots tenant, subscription, plan ID,
half-open monthly boundaries, currency and unit price, unique per subscription
and start. `kiosk_try_on_runs` optionally records an admitted cycle and trusted
channel. `billable_generations` retains a unique source-run ID, tenant, nullable
historical channel, success timestamp, historical flag and UNBILLED/PREPAID/
POSTPAID coverage. Composite tenant foreign keys protect cycle relationships;
SQL checks enforce positive rates and coverage consistency. The run ID in the
financial ledger intentionally has no run/image FK, so seven-day media cleanup
cannot delete billing evidence. This milestone creates no invoice tables.

### PAYMENTS-1C — Isolated platform test records

`platform_payment_test_connections` is keyed by provider and contains a positive
optimistic version, UAT-only environment, encrypted credential payload/IV/tag/key
version, explicit DQR confirmation and update time. It has no Store relationship.
`platform_payment_tests` uses UUIDv7 IDs, creator User FK, credential version
provenance, actor/key idempotency digest, unique PT transaction ID, status, fixed
INR 100 minor-unit amount, encrypted account snapshot, optional QR/provider
reference/failure code, expiry/confirmation/check timestamps and durable leases/
schedule/count. Restrict deletion of creator/test dependencies. One partial unique
index permits one PREPARING/PENDING/UNKNOWN test per provider/config version.
`platform_payment_test_events` stores UUIDv7 ID, test FK, unique test/content digest,
reported semantic status and receipt time; no raw payload or payer identity.
Only PhonePe/UAT is allowed by SQL constraints. SUCCEEDED requires confirmed_at.
These tables are independent of Store credentials, orders, holds and stock.

### PAYMENTS-1B — Attempts, events and paid allocation

Store connections add dqr_access_confirmed, default false. Shopping orders add
paid_at, stock_allocated_at and payment_review_reason. Status checks add
PAYMENT_PENDING/PAID/PAID_REVIEW and require paid_at exactly for paid statuses.
Stock allocation requires paid_at. The one-pending-order-per-cart index covers
AWAITING_PAYMENT and PAYMENT_PENDING, independent of hold deadline.

`shopping_payment_attempts` has UUIDv7 ID, composite tenant/order FK, provider,
environment, unique provider transaction ID, per-order idempotency key digest,
status, amount/currency, encrypted account snapshot (ciphertext/IV/tag/key version),
connection provenance, optional QR/reference/failure, expiry/paid timestamps,
durable next-check/lease/check-count fields and created/updated timestamps.
This stage constrains provider to PhonePe and environment to UAT. Connection ID
is provenance rather than a cascading FK; snapshots survive config replacement.
A partial unique index allows one PREPARING/PENDING/UNKNOWN attempt per order;
terminal attempts remain as history. SUCCEEDED requires paid_at. Credentials and
QR are excluded from staff summaries. QR is retained for device replay until
expiry and is never copied to audit/analytics.

`shopping_payment_events` stores UUIDv7 ID, tenant/attempt composite FK, content
digest, reported semantic status and receipt time. Unique (attempt_id,digest)
deduplicates signed notifications. Raw callbacks, payer identity and bank details
are not persisted. Restrictive attempt/order relationships prevent accidental
loss of payment history. Product/variant and tax snapshots remain unchanged.

### PAYMENTS-1A — Gateway configuration persistence

`payment_gateway_policies` has provider PK, enabled flag, positive optimistic
version and updated timestamp. Missing policy means unavailable. The code-owned
registry distinguishes configurable PhonePe from planned connectors.

`store_payment_connections` has UUIDv7 ID, organization tenant FK, provider,
UNCONFIRMED/UAT/PRODUCTION environment, encrypted payload, GCM IV/tag, key version
and timestamp. Unique (organization_id, provider) permits one account per provider
per Store. All credentials and merchant identifiers are inside the encrypted
payload; API reads select safe provider/environment/time fields only.

`store_payment_settings` has organization tenant PK/FK, nullable selected provider,
positive version and timestamp. Its composite FK (organization_id,
selected_provider) references that Store's connection; another tenant's account
can never satisfy selection. Updates lock the existing tenant row, including
first creation. All three tables are additive. No payment attempts/events or
paid order states are introduced by this stage.

### SHOPPING-2 — Cart, order and tax persistence

Adds `store_tax_settings` (Store tenant PK/FK, mode, basis-point default rate,
version, updated timestamp). Product stock settings add nullable
`tax_rate_basis_points`; null inherits, zero overrides with exemption.

`shopping_carts` contains UUIDv7 ID, Store tenant, device ID, unique active-customer
session association, version and timestamps. A composite FK to TryOnSession
enforces matching tenant/device/session. `shopping_cart_items` has cart/variant
compound PK, tenant and positive quantity; composite FKs enforce same-Store
cart and variant references. Carts do not reserve stock and are cleaned after
their session completes/expires. All collections are bounded at API boundaries.

`shopping_orders` contains UUIDv7 ID, unique readable reference, tenant FK,
source cart/device provenance, status AWAITING_PAYMENT/CANCELLED/EXPIRED,
currency, Store tax mode, subtotal/tax/total cents, created/expiry/cancellation
timestamps. Composite unique tenant/id supports item isolation; tenant/time/id
and status/expiry/id indexes support history and expiry. A partial unique index
permits only one AWAITING_PAYMENT order per cart; expired pending records are
transitioned before a new checkout. Source cart/device IDs intentionally remain
provenance rather than cascading FKs, preserving orders after session/fleet cleanup.

`shopping_order_items` has tenant/order/product/variant IDs and immutable-at-API
product name, size/colour, quantity, unit price, applied rate and line totals.
Composite FKs ensure same-tenant order and matching product/variant. No item
update endpoint exists. Variant references restrict physical product/variant
deletion; deactivation/archive preserves existing orders. Order lines also serve
as reservations while their parent order is pending and unexpired; no duplicated
mutable reserved counter is needed. Stock reads derive held/available quantities.

`shopping_checkout_requests` uses device/key-digest PK, request fingerprint,
order FK and 24-hour expiry. It bounds replay bookkeeping without expiring order
history. SQL checks enforce modes, positive versions/quantities, tax bounds,
non-negative money, subtotal + tax = total and expiry after creation. All business
IDs use UUIDv7. No images, customer identity, credentials or raw payment data are
stored in commerce records. Payment/collection/refund persistence is deferred.

### SHOPPING-1 — implemented stock structures (2026-10-15)

This section refines the earlier planned `product_variants` outline for native
Store stock. `product_stock_settings` has `product_id` (PK), `organization_id`,
`option_mode` (SINGLE/SIZE/COLOR/SIZE_COLOR), `pricing_mode` (CONSTANT/VARIANT),
positive `version` and `updated_at`. Absence means unconfigured stock.

`product_variants` has UUIDv7 `id`, `organization_id`, `product_id`, normalized
`option_key`, nullable `size`/`color`, `stock_quantity`, optional integer-cent
`price_override_amount_cents`, `active` and creation/update timestamps. The default
option has null size and colour. Currency and base price remain on `products`.

- Composite FK settings `(organization_id, product_id)` → products
  `(organization_id, id)` prevents cross-Store association and excludes null tenants.
- Composite FK variants `(organization_id, product_id)` → settings enforces the same scope.
- Unique `(product_id, option_key)` covers normalized case/spacing-equivalent options.
- Index `(organization_id, product_id, active)` supports Store-scoped bounded reads.
- DB checks bound stock to 0–1,000,000 and override price to 0–100,000,000 cents;
  mode/version checks and nonblank optional labels are enforced in SQL.
- Removed variants are archived; their IDs are reused if the same option returns.
  Existing product deletion cascades stock rows; before/after audit records remain.
  A later order milestone must protect historical purchased identities/snapshots
  before attaching order references. No order/reservation tables exist in SHOPPING-1.
- No existing catalog is backfilled with invented stock; imports remain external.

This approved stock extension supersedes only the older exclusion of this narrow
native Store stock use case, not the broader full-POS/warehouse exclusions.

**Version:** 1.1  
**Status:** ACTIVE BASELINE  
**Document Type:** Living Document  
**Last Updated:** 2026-09-19
**Document:** `05-DATABASE-SCHEMA.md`

---

## Store Onboarding Policy Update - 2026-09-17

Current Store onboarding supersedes older pending-owner activation rules for
platform-created Stores and self-service signup used by Shopify. It writes an
ACTIVE `organizations` tenant, ACTIVE user and ACTIVE ORGANIZATION_OWNER
membership with all-Store scope; shared RBAC assigns the default owner role.
Subscription/credit ledger records use existing structures and the same
transaction as platform owner creation. No schema migration is required.
Passwords remain Argon2id hashes on users; emails and Store slugs remain unique.
Audit metadata contains identifiers and status, never passwords or hashes.
Legacy organization applications/pending states are retained; suspended Stores
cannot be revived by onboarding or installation.

## 1. Purpose

This document defines the approved logical PostgreSQL data model for SelfX Virtual Try-On.

It is the design input for the future Prisma schema and migrations.

It defines:

- core entities;
- important fields;
- relationships;
- tenant ownership;
- uniqueness rules;
- indexes;
- retention fields;
- auditability;
- migration requirements.

It does **not** replace the future `schema.prisma` file.

---

## 2. Document Evolution

This is a **living document**.

The schema described here represents the currently approved logical data model and may evolve as implementation, testing, product requirements, integrations, provider capabilities, security requirements, or operational needs change.

A change to this document is allowed and expected when justified.

Material schema changes must:

1. be intentional and reviewed;
2. remain consistent with the PRD, technical requirements, user journeys, UI/UX flows, and implementation plan;
3. update this document before or together with implementation;
4. update `schema.prisma` where applicable;
5. create a new tracked Prisma migration for deployed database changes;
6. include required backfills, compatibility handling, indexes, API updates, and tests;
7. avoid silently rewriting already-applied production migrations;
8. preserve existing deployed data unless an explicitly approved migration says otherwise.

The current table list, relationships, enums, indexes, and field suggestions are therefore a **baseline**, not a permanent restriction.

New entities or fields may be introduced when a real requirement appears. Existing structures may be revised through safe migrations.

### Schema Evolution Flow

```text
New or Changed Requirement
        ↓
Review Product / Technical Impact
        ↓
Update 05-DATABASE-SCHEMA.md
        ↓
Update schema.prisma
        ↓
Create New Prisma Migration
        ↓
Validate / Backfill / Test
        ↓
Deploy
        ↓
Keep Migration History Intact
```

### Migration History Rule

The logical schema may change over time, but already-applied production migration files should normally remain immutable.

For example:

```text
001_initial
002_organizations
003_tryons
```

If the model changes later, create:

```text
004_customer_favorites
```

rather than modifying an already-applied migration to pretend the previous production state never existed.

---

## 3. Database Principles

SelfX uses:

- PostgreSQL;
- Prisma ORM;
- Prisma Migrate;
- shared database;
- shared schema;
- organization-scoped tenant rows.

The schema must support:

- one user in multiple organizations;
- one staff user in multiple stores;
- separate SelfX platform role assignments outside organization memberships;
- one organization with one or many stores;
- global customer accounts;
- tenant-isolated merchant data;
- anonymous and authenticated Try-Ons;
- separate Try-On and AI-provider attempt records;
- usage and audit history;
- tracked migrations.

PostgreSQL is the durable source of truth.

Redis/BullMQ is execution infrastructure only.

---

## 3.1 STORE-1 Store Tenant Compatibility

**Status:** UPDATED

STORE-1 does not introduce a new physical tenant table or rewrite deployed
migrations. The existing `organizations` table is used as the internal tenant
row for product Stores in this slice.

Canonical product model:

```text
SelfX Platform
→ Store
→ Kiosks
```

Current persistence mapping:

- Product Store id = `organizations.id`.
- Product Store status `ACTIVE` = `OrganizationStatus.ACTIVE`.
- Product Store status `INACTIVE` = any non-active operationally unavailable
  tenant state used by the Store API, currently `OrganizationStatus.SUSPENDED`
  for explicit Store deactivation.
- Product Store profile fields that do not yet have first-class columns are
  stored under `organizations.settings.storeProfile`.
- Store Try-On business capabilities are stored under
  `organizations.settings.virtualTryOn.enabledTryOnCapabilities` as
  `GARMENT_TRY_ON`, `JEWELLERY_TRY_ON` or both. Stores default to both
  capabilities when the setting is absent; explicit saved settings may disable
  either mode according to business needs.
- Captured garment preview remains a Store setting under
  `organizations.settings.virtualTryOn.capturedGarmentPreviewEnabled`, but it
  can only become effective when `GARMENT_TRY_ON` is enabled and the platform
  permission/global controls allow it.
- Store-owned kiosks are stored as `kiosk_devices.assignment_scope =
  ORGANIZATION`, `kiosk_devices.organization_id = product Store id` and
  `kiosk_devices.store_id = null`.
- `kiosk_device_configurations` remains device-owned and is not duplicated per
  Store.

The existing child `stores` table remains a legacy/location-scoped structure
from the earlier Organization -> Store design. STORE-1 Store CRUD, Store
Dashboard and Store Kiosk assignment must not depend on that table. A later
approved migration may rename tables/enums or introduce explicit location
entities, but that is outside STORE-1.

No Prisma migration is required for STORE-1 because the feature is implemented
through existing tenant, kiosk and configuration tables with Store-facing API
and UI contracts.

---

## 3.2 RBAC-1 Store Authorization Schema

**Status:** UPDATED

RBAC-1 adds a tracked Prisma migration named
`20260817000000_rbac_1_store_authorization`.

New persistence:

- `permissions`: global backend-owned registry of stable permission codes.
- `store_roles`: Store-scoped roles with `organization_id` pointing at the
  product Store/internal organization row.
- `store_role_permissions`: many-to-many role permission assignments.
- `store_membership_roles`: many-to-many Store membership role assignments.

Compatibility:

- `organization_memberships` remains the canonical Store membership table.
- `store_membership_roles.organization_id` is stored explicitly so composite
  foreign keys can require membership and role to belong to the same Store.
- `permissions.code` is unique.
- Store role names and system role codes are unique within a Store.
- Role-permission and membership-role edges are unique.
- Store role deletion must not silently cascade-delete memberships; assigned
  roles are rejected by service policy before deletion.
- Default system Store roles are created for every existing Store/internal
  organization row.
- Existing membership role enums are backfilled to matching system Store roles
  for continuity.
- `PlatformRole` adds `SELFX_STAFF_ADMIN`; platform roles remain outside Store
  memberships and must not be represented as Store roles.
- Permission registry synchronization is additive. Historical permission rows
  are not removed solely because a later application version omits a code.

## 3.3 RBAC-2 Global Authorization Schema

**Status:** UPDATED

RBAC-2 adds a tracked Prisma migration named
`20260818000000_rbac_2_global_authorization`.

New persistence:

- `PermissionApplicability`: `PLATFORM_ONLY`, `STORE`, `BOTH`.
- `permissions.applicability`: classifies each stable permission definition.
- `platform_roles`: configurable global SelfX Platform roles.
- `platform_role_permissions`: many-to-many Platform role permission edges.
- `platform_user_roles`: user assignment to configurable Platform roles.
- `store_permission_grants`: SelfX-granted Store permission ceiling.

Compatibility and constraints:

- The existing `platform_role_assignments` table remains the protected
  bootstrap role source for `SELFX_SUPER_ADMIN`, `SELFX_STAFF_ADMIN` and
  `SELFX_SUPPORT_ADMIN`.
- Configurable Platform roles are not Store roles and must not be represented
  as organization memberships.
- `store_permission_grants.store_tenant_id` points at the STORE-1 product Store
  tenant row (`organizations.id`).
- Store grants are unique by `(store_tenant_id, permission_id)`.
- Store role effective permissions must be computed from active Store role
  permissions intersected with `store_permission_grants`.
- Existing Stores are backfilled with the current Store permission catalog to
  preserve RBAC-1 behavior until SelfX explicitly revokes grants.

---

## 4. Identifier Strategy

SelfX primary business entities must use **UUIDv7** identifiers.

### 3.1 Primary Key Standard

Unless a specific entity has a documented reason to use another identifier type:

- primary keys use UUIDv7;
- UUIDs are stored using PostgreSQL's native `uuid` type;
- IDs are generated by the SelfX application layer unless a later implementation decision explicitly approves a database-side mechanism;
- sequential integer IDs must not be exposed as the primary SelfX business identifier.

Examples of entities that use UUIDv7:

- users;
- user sessions;
- platform role assignments;
- organizations;
- organization applications;
- organization application documents;
- organization memberships;
- stores;
- customers;
- customer identities;
- products;
- product variants;
- assets;
- kiosks;
- Try-On sessions;
- Try-Ons;
- provider attempts;
- integrations;
- API keys;
- subscriptions;
- usage events;
- audit logs;
- impersonation sessions.

UUIDv7 is preferred because it provides globally unique identifiers while remaining approximately time ordered, which is more index-friendly than purely random UUIDv4 values and works well with horizontally scaled API/worker processes.

### 3.2 PostgreSQL Storage

Primary identifiers should use:

`UUID PRIMARY KEY`

They must not be stored as `VARCHAR(36)` unless a specific external identifier requires string storage.

### 3.3 Prisma Mapping

When the Prisma schema is created, UUID primary keys must map to PostgreSQL native UUID columns.

The exact UUIDv7 library/runtime implementation must be selected during Phase 1 based on the approved Node/Prisma/PostgreSQL versions, but the resulting persisted ID must be a valid UUIDv7.

Do not choose or hard-code a specific npm UUID library in this logical schema document.

Do not silently fall back to sequential integer primary keys.

### 3.4 External Identifiers

External platform/provider IDs must be stored separately from SelfX primary IDs.

Examples:

- Shopify product ID → external identifier;
- WooCommerce product ID → external identifier;
- FASHN request ID → provider request identifier;
- Google provider request ID → provider request identifier.

External identifiers must never replace the SelfX UUIDv7 primary key.

Example:

```text
tryons.id
→ SelfX UUIDv7

provider_attempts.id
→ SelfX UUIDv7

provider_attempts.provider_request_id
→ FASHN / Google supplied identifier
```

### 3.5 Security Tokens Are Not UUIDs

Security-sensitive tokens must use cryptographically secure high-entropy values rather than UUIDs.

This includes:

- API secrets;
- refresh tokens;
- QR handoff tokens;
- kiosk pairing codes/secrets;
- OTP values;
- webhook signing secrets;
- integration secrets.

Where practical, only a hash of the secret/token is persisted.

### 3.6 Common Fields

Common mutable tables should generally include:

- `id` — UUIDv7;
- `created_at`;
- `updated_at`.

Soft deletion/status fields should only be added where business history requires them.

### 3.7 Identifier Rule

**DB-ID-001:** All primary SelfX business entities use application-generated UUIDv7 identifiers stored as native PostgreSQL `uuid` values unless a later approved implementation decision explicitly selects a database-side mechanism. External provider/platform identifiers are stored separately and never replace SelfX primary IDs.

---

## 4. High-Level Entity Model

```text
User
 ├── UserSession
 ├── PlatformRoleAssignment
 └── OrganizationMembership
      └── MembershipStoreScope

Customer
 ├── CustomerIdentity
 ├── CustomerSession
 └── TryOnSession
      ├── ConsentRecord
      └── TryOn
           └── ProviderAttempt

Organization
 ├── OrganizationApplication
 │    └── OrganizationApplicationDocument
 ├── Store
 ├── Product
 ├── Kiosk
 ├── Integration
 ├── ApiKey
 ├── Subscription
 ├── UsageEvent
 ├── IdempotencyRecord
 └── AuditLog

Product
 ├── ProductVariant
 ├── ProductStoreAvailability
 └── ExternalProductMapping

Asset
 ├── Person Image
 ├── Garment Image
 └── Try-On Result
```

---

# 6. Staff/User Identity

## 5.1 `users`

Represents staff, organization administrators, and SelfX platform users.

Important fields:

- `id`
- `email`
- `password_hash`
- `display_name`
- `status`
- `email_verified_at`
- `last_login_at`
- `created_at`
- `updated_at`

Constraints:

- normalized email should be unique where applicable.

Rules:

- password hash uses Argon2id;
- plaintext or reversible passwords are forbidden.

---

## 5.2 `user_sessions`

Represents revocable refresh/login sessions.

Important fields:

- `id`
- `user_id`
- `refresh_token_hash`
- `expires_at`
- `revoked_at`
- `last_used_at`
- `device_label`
- `user_agent_metadata`
- `created_at`

Indexes:

- `user_id`
- `expires_at`
- `revoked_at`

---

## 5.3 `platform_role_assignments`

Assigns SelfX platform roles to users outside organization memberships.

Important fields:

- `id`
- `user_id`
- `role_code`
- `status`
- `assigned_by_user_id` nullable
- `assigned_at`
- `revoked_at`
- `created_at`
- `updated_at`

Platform roles:

- SELFX_SUPPORT_ADMIN
- SELFX_SUPER_ADMIN

Constraints:

- evaluate unique active assignment per `(user_id, role_code)`.

Indexes:

- `user_id`
- `role_code`
- `(role_code, status)`

Rules:

- SelfX Support Admin and SelfX Super Admin are platform roles, not organization memberships;
- do not model platform admins as members of a fake/internal merchant organization;
- platform authorization and organization/store authorization are separate concerns;
- platform role changes are security-sensitive and must be audited.

---

# 7. Organizations, Memberships, and Stores

## 6.1 `organizations`

Represents one SelfX tenant.

Important fields:

- `id`
- `name`
- `slug`
- `organization_type`
- `status`
- `default_timezone`
- `branding_config`
- `created_at`
- `updated_at`

Possible organization types:

- BRAND
- RETAIL_CHAIN
- INDEPENDENT_RETAILER
- FRANCHISE
- ECOMMERCE
- ENTERPRISE

Operational organization statuses:

- PENDING_ACTIVATION
- ACTIVE
- SUSPENDED
- ARCHIVED

An independent retailer is still one organization with one store.

Rules:

- organization registration and organization activation are separate lifecycle actions;
- newly submitted self-service organizations must not become operational immediately;
- `PENDING_ACTIVATION` organizations cannot be used for ordinary tenant operations;
- normal organization, store, staff, product, kiosk and paid Try-On functionality requires `organizations.status = ACTIVE`;
- SelfX platform review/activation endpoints are separate from normal tenant business APIs.

---

## 6.1.1 `organization_applications`

Represents the onboarding/review application for an organization.

This lifecycle is separate from `organizations.status`.

Important fields:

- `id`
- `organization_id`
- `submitted_by_user_id`
- `status`
- `submitted_at`
- `review_started_at`
- `reviewed_by_user_id` nullable
- `approved_at` nullable
- `rejected_at` nullable
- `review_notes` or safe review metadata where appropriate
- `requirements_status_json` or approved structured requirement state where appropriate
- `created_at`
- `updated_at`

Application statuses:

- DRAFT
- SUBMITTED
- UNDER_REVIEW
- NEEDS_INFORMATION
- APPROVED
- REJECTED

Indexes:

- `organization_id`
- `submitted_by_user_id`
- `(status, submitted_at)`
- `reviewed_by_user_id`

Rules:

- an approved application does not necessarily mean the organization is active;
- `application_status = APPROVED` with `organization_status = PENDING_ACTIVATION` is valid when activation prerequisites remain;
- activation requirements must be configurable/evolving and must not assume one universal checklist;
- possible activation requirement signals include required business information, required organization documents, identity/business verification, commercial terms, pricing agreement, subscription selection, payment, enterprise contract and other SelfX-defined onboarding requirements;
- raw sensitive documents must not be stored directly in this table;
- review and activation actions belong to the SelfX platform authorization domain and must be audited with the actual platform actor.

---

## 6.1.2 `organization_application_documents`

Conceptual record for document requirements and verification status associated with an onboarding application.

Important fields may include:

- `id`
- `organization_application_id`
- `organization_id`
- `document_type`
- `status`
- `asset_id` nullable
- `requested_at`
- `submitted_at` nullable
- `reviewed_by_user_id` nullable
- `reviewed_at` nullable
- `safe_metadata_json`
- `created_at`
- `updated_at`

Rules:

- this table models document requirements/status, not raw binary document storage;
- actual document files must use the approved private asset/object-storage architecture when that phase is implemented;
- document metadata must avoid unnecessary sensitive content;
- document upload implementation is not part of Phase 3 unless separately approved.

Phase 3 migration requirement:

- the current Phase 1 Prisma schema does not include organization application tables;
- the current Phase 1 `OrganizationStatus` enum does not include `PENDING_ACTIVATION`;
- the current Phase 1 `MembershipStatus` enum does not include `PENDING_ACTIVATION`;
- Phase 3 therefore requires a new tracked Prisma migration for onboarding/application state and pending initial-owner membership behavior;
- do not edit the already-applied Phase 1 migration to add these fields retroactively.

Phase 3A implementation note:

- migrations `20260811000001_phase_3a_enum_preparation` and `20260811000002_phase_3a_organization_onboarding` add the Phase 3A onboarding schema;
- generic activation requirements are represented by `organization_activation_requirements`;
- activation requirement statuses are `PENDING`, `SATISFIED` and `WAIVED`;
- `organization_memberships.store_scope_mode` records `ALL_STORES` or `SELECTED_STORES`;
- no organization document binary storage is implemented in Phase 3A.

---

## 6.2 `organization_memberships`

Connects one user to one organization.

Important fields:

- `id`
- `organization_id`
- `user_id`
- `role_code`
- `store_scope_mode`
- `status`
- `joined_at`
- `suspended_at`
- `created_at`
- `updated_at`

Store scope modes:

- `ALL_STORES`
- `SELECTED_STORES`

Membership statuses should include:

- INVITED
- PENDING_ACTIVATION
- ACTIVE
- SUSPENDED
- REVOKED

Constraint:

- unique `(organization_id, user_id)`

Indexes:

- `organization_id`
- `user_id`
- `(organization_id, status)`
- `(organization_id, store_scope_mode)`

Rules:

- `store_scope_mode` is required to avoid ambiguous authorization;
- `ALL_STORES` means the membership may access every store in the organization only when the resolved role/permissions permit all-store access;
- `SELECTED_STORES` means the membership's permitted stores are defined by `membership_store_scopes`;
- an empty selected-store scope means no store access and must never mean all stores;
- the submitting applicant/intended initial owner is represented as an `ORGANIZATION_OWNER` membership with `status = PENDING_ACTIVATION` until the organization is activated;
- activation transitions the approved initial owner membership to `ACTIVE` as part of the explicit platform activation operation;
- ordinary tenant authorization requires both active membership status and `organizations.status = ACTIVE`;
- role updates must not silently transfer ownership;
- normal membership mutations must not remove or demote the final active `ORGANIZATION_OWNER`;
- non-owner administrators cannot assign `ORGANIZATION_OWNER`;
- Phase 3C enforces role/scope compatibility in the application domain: `ORGANIZATION_OWNER` and `ORGANIZATION_ADMIN` use `ALL_STORES`, store-scoped roles use `SELECTED_STORES`, and `ORGANIZATION_STAFF` may use either approved mode.

---

## 6.3 `membership_store_scopes`

Defines store-level access for a membership.

Important fields:

- `id`
- `organization_id`
- `membership_id`
- `store_id`
- `created_at`

Constraint:

- unique `(membership_id, store_id)`
- `membership_id` and `store_id` must belong to the same `organization_id`

Rules:

- rows are used only for `SELECTED_STORES` memberships;
- `ALL_STORES` access is represented by `organization_memberships.store_scope_mode = ALL_STORES`, not by creating one row for every store;
- for `ALL_STORES`, scope rows are not required and should normally be absent;
- for `SELECTED_STORES`, the rows in this table are the complete store authorization set;
- if `SELECTED_STORES` has no rows, the membership has no store access;
- every row must remain tenant-consistent by ensuring the membership and store belong to the same `organization_id`;
- Phase 3C bounds membership store-scope mutation requests to at most 100 `storeIds` and rejects duplicate IDs, cross-organization IDs, and `ALL_STORES` combined with explicit `storeIds`.

Phase 3B implementation note:

- no new Prisma migration was required for active organization/store/membership RBAC because Phase 3A already added explicit `store_scope_mode` and the Phase 1 schema already included stores, memberships and store-scope rows;
- store archive behavior uses existing `stores.status = CLOSED`;
- scope changes are implemented transactionally by updating `organization_memberships.store_scope_mode` and replacing `membership_store_scopes` rows.

Phase 3C implementation note:

- migration `20260811000003_phase_3c_security_hardening` adds a composite uniqueness/foreign-key path so `organization_activation_requirements.organization_id` must match the referenced `organization_applications.organization_id`;
- final active owner demotion/suspension is protected with transaction-scoped PostgreSQL advisory locking plus in-transaction validation.

Phase 3 migration requirement:

- the Phase 1 Prisma schema and migration created `membership_store_scopes` but did not include an explicit `store_scope_mode`;
- Phase 3 therefore requires a new tracked Prisma migration before authorization relies on store-scope semantics;
- do not edit the already-applied Phase 1 migration to add this field retroactively.

---

## 6.4 Role Model

Initial roles are predefined.

Organization/store roles:

- ORGANIZATION_OWNER
- ORGANIZATION_ADMIN
- ORGANIZATION_STAFF
- STORE_OWNER
- STORE_MANAGER
- STORE_STAFF
- KIOSK_OPERATOR

SelfX platform roles are assigned through `platform_role_assignments`, not through `organization_memberships`:

- SELFX_SUPPORT_ADMIN
- SELFX_SUPER_ADMIN

Initial role-to-permission mapping may live in application configuration/code.

Authorization must be permission-driven: a predefined role resolves centrally to
approved permissions plus store scope. Controllers and services must not embed
scattered role-name checks.

Do not build a custom-role system before it is required.

---

## 6.5 `stores`

Represents a branch/store.

Important fields:

- `id`
- `organization_id`
- `name`
- `code`
- `status`
- `address_json`
- `contact_json`
- `timezone`
- `configuration_json`
- `created_at`
- `updated_at`

Constraint:

- optional unique `(organization_id, code)`

Indexes:

- `organization_id`
- `(organization_id, status)`

Every store belongs to exactly one organization.

---

# 8. Customer Identity

## 7.1 `customers`

Represents one global SelfX customer account.

Important fields:

- `id`
- `display_name`
- `status`
- `last_active_at`
- `created_at`
- `updated_at`

Customers are not permanently owned by a merchant organization.

---

## 7.2 `customer_identities`

Represents login methods linked to a customer.

Important fields:

- `id`
- `customer_id`
- `provider`
- `provider_subject`
- `email`
- `phone`
- `verified_at`
- `created_at`
- `updated_at`

Possible providers:

- EMAIL_OTP
- PHONE_OTP
- GOOGLE
- APPLE

Constraint:

- unique `(provider, provider_subject)` where applicable.

Rules:

- do not automatically merge accounts only because emails appear equal;
- identity linking must follow approved authentication rules.

---

## 7.3 `customer_sessions`

Represents authenticated customer sessions.

Important fields:

- `id`
- `customer_id`
- `refresh_token_hash`
- `expires_at`
- `revoked_at`
- `last_used_at`
- `device_metadata`
- `created_at`

---

# 9. Products and Garments

## 8.1 `products`

Normalized SelfX product record.

Important fields:

- `id`
- `organization_id`
- `name`
- `description`
- `price_amount_cents`
- `price_currency`
- `status`
- `source_type`
- `product_url`
- `vto_status`
- `product_vertical`
- `jewellery_type`
- `garment_category`
- `primary_asset_id`
- `created_at`
- `updated_at`

Current STORE-1 catalog foundation stores native Store catalog rows directly in
`products` with `scope = STORE` and `organization_id = Product Store id`.
Platform default catalog rows use `scope = PLATFORM_DEFAULT` and
`organization_id = NULL`; platform-owned kiosks use these rows directly, and
Store-owned kiosks fall back to them only when the Store has no active,
VTO-enabled Store catalog products. Managed prices are optional and stored as
integer cents plus ISO currency code so catalog products remain VTO-focused
instead of becoming POS inventory. New product prices inherit the platform
default currency stored in `platform_settings`.

`product_vertical` distinguishes `GARMENT` from `JEWELLERY`. Existing and
legacy catalog behavior defaults to `GARMENT`. `jewellery_type` is nullable for
garments and required for jewellery products. Supported jewellery types are
`RING`, `BRACELET`, `NECKLACE` and `EARRING`; this field is provider-routing
critical for jewellery Try-On rather than a display-only category.

Possible source types:

- SELFX
- SHOPIFY
- WOOCOMMERCE
- API

Possible VTO states:

- NOT_CONFIGURED
- READY
- DISABLED
- UNSUPPORTED

Indexes:

- `organization_id`
- `(organization_id, status)`
- `(organization_id, vto_status)`

Product catalog rows are optional for Public API and externally managed Store
catalogs. Those channels may instead attach lightweight product reference
metadata to each Try-On run. A client-supplied reference does not prove product
ownership and must not be used as an authorization boundary.

---

## 8.2 `product_variants`

Important fields:

- `id`
- `product_id`
- `name`
- `sku`
- `attributes_json`
- `status`
- `created_at`
- `updated_at`

---

## 8.3 `product_store_availability`

Allows selected-store product availability.

Important fields:

- `id`
- `product_id`
- `store_id`
- `enabled`
- `created_at`
- `updated_at`

Constraint:

- unique `(product_id, store_id)`

A product-level flag may represent organization-wide availability.

---

## 8.4 `external_product_mappings`

Maps SelfX products to external platform products/variants.

Important fields:

- `id`
- `organization_id`
- `integration_id`
- `product_id`
- `external_product_id` (up to 180 chars)
- `external_variant_id` (up to 180 chars)
- `external_sku`
- `external_handle`
- `status`
- `metadata_json`
- `external_updated_at`
- `last_seen_at`
- `created_at`
- `updated_at`

Constraint:

- unique external product/variant identity within one integration.

Indexes:

- `integration_id`
- `product_id`
- `external_product_id`
- `(integration_id, last_seen_at)`

`last_seen_at` is the full-snapshot observation marker. Every bounded batch in
one Shopify/WooCommerce full sync uses the same snapshot timestamp. Missing
active mappings are archived only when the connector explicitly finalizes that
snapshot, preventing an interrupted or partially submitted import from
archiving products that have not been read yet.

---

# 10. Assets and Media

## 9.1 `assets`

Stores metadata for files held in Cloudflare R2/object storage.

Important fields:

- `id`
- `organization_id` nullable
- `customer_id` nullable
- `asset_type`
- `object_key`
- `mime_type`
- `size_bytes`
- `checksum`
- `status`
- `expires_at`
- `deleted_at`
- `created_at`
- `updated_at`

Possible asset types:

- CUSTOMER_PERSON_IMAGE
- PRODUCT_GARMENT_IMAGE
- PHYSICAL_GARMENT_CAPTURE
- TRYON_RESULT
- THUMBNAIL
- DERIVED_PROVIDER_INPUT
- ORGANIZATION_LOGO

Indexes:

- `organization_id`
- `customer_id`
- `asset_type`
- `(status, expires_at)`

Rules:

- file bytes are stored in object storage, not PostgreSQL;
- customer-sensitive media is private;
- `expires_at` drives retention cleanup;
- every asset must have ownership or an explicit linked business resource from which authorization can be derived;
- do not allow arbitrary orphaned assets with both `organization_id` and `customer_id` unset unless the asset type explicitly justifies it.

Ownership categories:

- organization-owned assets include product garment images and organization logos;
- customer-owned/sensitive assets include customer person images;
- Try-On generated/derived assets include generated results, derived provider inputs, and physical customer-session garment captures.

Authorization rules:

- product garment images and organization logos derive access from their organization/resource ownership;
- customer person images derive access from customer/session rules and must not be exposed through merchant result access;
- generated results and derived Try-On assets derive access from the linked Try-On/session, organization/store scope, customer access, and retention state;
- Store Manager access to `result_asset_id` must never imply access to `person_asset_id`.

---

# 11. Kiosks

## 10.1 `kiosk_devices`

Important fields:

- `id`
- `display_name`
- `status` (`ACTIVE`, `INACTIVE`, `REVOKED`, `DELETED`)
- `assignment_scope` (`PLATFORM`, `ORGANIZATION`, `STORE`)
- `organization_id` nullable
- `store_id` nullable
- `platform`
- `app_version`
- `installation_id`
- `paired_at`
- `last_seen_at`
- `inactive_at`
- `revoked_at`
- `deleted_at`
- `created_at`
- `updated_at`

Indexes:

- `status`
- `assignment_scope`
- `organization_id`
- `store_id`
- `(organization_id, store_id)`
- `last_seen_at`
- `deleted_at`

Rules:

- kiosk devices belong to the SelfX platform fleet, not to a superadmin user;
- `PLATFORM` assignment uses no organization/store;
- `ORGANIZATION` assignment requires `organization_id` and no `store_id`;
- `STORE` assignment requires both IDs and the store must belong to the selected
  organization;
- device access JWT claims are not the source of organization/store truth;
  authenticated device APIs reload current device status and assignment from the
  database;
- only `ACTIVE` kiosk devices may authenticate and use device-authenticated
  kiosk APIs;
- `INACTIVE` is a reversible administrative pause for a kiosk device;
- revoking a kiosk device revokes/invalidates active refresh sessions;
- deleting a kiosk device is a soft delete using `DELETED`/`deleted_at` so audit
  and pairing history remain intact while the device is removed from normal
  fleet lists;
- revoked and deleted devices cannot refresh sessions or call
  device-authenticated kiosk APIs.

---

## 10.2 `kiosk_pairing_sessions`

Temporary production provisioning sessions.

Important fields:

- `id`
- `code_digest`
- `provisioning_secret_hash`
- `provisioning_grant_hash`
- `status` (`PENDING`, `CLAIMED`, `EXPIRED`, `CANCELLED`)
- `expires_at`
- `created_at`
- `claimed_at`
- `claimed_by_user_id`
- `kiosk_device_id`
- `grant_issued_at`
- `grant_consumed_at`
- `installation_id`
- `platform`
- `app_version`

Indexes:

- `code_digest`
- `(status, expires_at)`
- `claimed_by_user_id`
- `kiosk_device_id`
- `installation_id`

Rules:

- pairing codes are exactly six numerical digits and are treated as strings;
- backend generates authoritative codes with secure randomness;
- leading zeroes are valid;
- code lifetime is exactly 8 minutes;
- raw code is not stored; store a server-peppered HMAC digest;
- the provisioning secret is private to the kiosk and stored as a protected
  digest;
- superadmin sees/enters only the six-digit code;
- claim is one-time and transaction-safe;
- a successful claim creates/activates a `kiosk_devices` row and associates the
  session to that device;
- the one-time provisioning grant is consumed by the physical kiosk only and is
  not returned to the superadmin browser.

---

## 10.3 `kiosk_device_sessions`

Represents revocable device authorization.

Important fields:

- `id`
- `kiosk_id`
- `credential_hash` or approved device-session reference
- `expires_at`
- `revoked_at`
- `rotated_at`
- `last_used_at`
- `created_at`

Rules:

- stores only refresh credential digests, never raw refresh tokens;
- supports expiry, rotation and revocation;
- all sessions for a device are revoked when the device is revoked/unpaired;
- device refresh credentials are device-specific, not a shared fleet secret.

---

## 10.4 `kiosk_customer_upload_sessions`

Short-lived KIOSK-4C customer phone photo upload sessions owned by an active
kiosk device. KIOSK-5A uses the same session table for purpose-bound model and
garment phone uploads.

Important fields:

- `id`
- `kiosk_device_id`
- `status` (`WAITING`, `UPLOADING`, `VALIDATING`, `READY`, `REJECTED`,
  `EXPIRED`, `CONSUMED`, `CANCELLED`)
- `purpose` (`MODEL`, `GARMENT`)
- `capability_digest`
- `expires_at`
- `created_at`
- `updated_at`
- `upload_started_at`
- `ready_at`
- `consumed_at`
- `cancelled_at`
- `asset_key`
- `content_type`
- `size_bytes`
- `width`
- `height`
- `rejection_code`

Indexes:

- unique `capability_digest`
- `(kiosk_device_id, created_at)`
- `(kiosk_device_id, status)`
- `(kiosk_device_id, purpose, status)`
- `(status, expires_at)`
- `expires_at`

Rules:

- QR capability plaintext is not stored;
- `capability_digest` is produced with a dedicated server-only HMAC pepper;
- sessions expire after five minutes and cannot be reused after expiry,
  cancellation, replacement, consumption or deletion;
- `purpose` binds the capability to the kiosk action that created it. A
  `GARMENT` upload must not be consumed as a `MODEL` upload, and a `MODEL`
  upload must not be consumed as a `GARMENT` upload;
- browsers never supply object keys; SelfX generates the storage key and signed
  URL;
- object bytes are stored in private object storage, not PostgreSQL;
- backend technical validation must pass before status becomes `READY`;
- `CONSUMED` means the kiosk selected the ready photo for the current local
  session;
- stored objects remain customer-sensitive assets and must be cleaned up through
  cancellation/rejection/expiry best-effort deletion plus the approved retention
  lifecycle.

---

## 10.5 `kiosk_device_configurations`

KIOSK-6A stores the active SaaS-controlled runtime configuration for one
paired kiosk device.

Important fields:

- `id`
- `kiosk_device_id`
- `version`
- `idle_mode` (`STATIC`, `SLIDESHOW`)
- `slide_duration_seconds`
- `title`
- `subtitle`
- `cta_label`
- `countdown_seconds`
- `sound_enabled`
- `sound_profile` (`SELFX_SIGNATURE`, `SOFT`, `STUDIO`, `MINIMAL`, `MUTED`)
- `guidance_audio_enabled`
- `enabled_garment_intents` (`TOP`, `BOTTOM`, `FULL_OUTFIT`)
- `session_idle_timeout_seconds` (default 120 for new rows; saved values retained)
- `updated_by_user_id`
- `created_at`
- `updated_at`

Indexes:

- unique `kiosk_device_id`
- `(kiosk_device_id, version)`
- `updated_by_user_id`

Rules:

- one active configuration row belongs to exactly one `kiosk_devices` row;
- configuration `version` is a monotonic per-device integer and starts from the
  implicit bundled default version `1`;
- every SaaS configuration update increments the version so kiosks can discover
  changes through lightweight heartbeat/session responses;
- device-authenticated configuration reads reload current kiosk device status
  and are allowed only for active/current devices;
- enabled garment intents control only customer-facing kiosk category choices;
  they do not rewrite provider taxonomy or Product Catalog semantics;
- camera preference remains local device configuration until SelfX has a stable
  certified camera identifier contract.

## 10.6 `kiosk_device_configuration_assets`

Ordered presentation assets referenced by `kiosk_device_configurations`.

Important fields:

- `id`
- `configuration_id`
- `sort_order`
- `type` (`BUNDLED_IMAGE`, `REMOTE_IMAGE`, `UPLOADED_IMAGE`)
- `label`
- `url`
- `bundled_asset_key`
- `object_key`
- `content_type`
- `size_bytes`
- `duration_seconds`
- `created_at`

Indexes:

- unique `(configuration_id, sort_order)`
- `configuration_id`

Rules:

- assets are ordered by `sort_order`;
- bundled assets refer to a kiosk app asset key such as
  `selfx-default-kiosk-video` or `selfx-default-kiosk-wallpaper`;
- remote image/video assets must use validated HTTPS URLs and must not use `file:`,
  `javascript:`, `data:`, localhost or internal network hosts;
- uploaded image/video assets store a SelfX object-storage key and content metadata;
  runtime configuration responses expose a short-lived signed read URL rather
  than a permanent public URL;
- uploaded video assets must store validated duration metadata and may not
  exceed 60 seconds;
- Store/kiosk configuration validates bounded video and wallpaper slot counts;
- kiosks download remote assets before activating a new configuration and
  continue offline with the last valid local cache, or bundled defaults if no
  cache exists;
- kiosks cache downloaded media by stable asset identity so rotated signed read
  URLs do not redownload unchanged videos or wallpapers.

---

## 10.7 `kiosk_try_on_runs`

KIOSK-4B production Try-On run state owned by a paired kiosk device.

Important fields:

- `id`
- `kiosk_device_id`
- `client_request_id`
- `status` (`QUEUED`, `PROCESSING`, `COMPLETED`, `FAILED`)
- `assignment_scope` (`PLATFORM`, `ORGANIZATION`, `STORE`)
- `organization_id` nullable
- `store_id` nullable
- `person_asset_id`
- `garment_asset_id`
- `product_id`
- `catalog_source`
- `external_product_id` (up to 180 chars)
- `external_variant_id` (up to 180 chars)
- `external_sku`
- `external_product_name`
- `external_product_price`
- `external_currency`
- `provider`
- `provider_display_name`
- `provider_model`
- `provider_prediction_id`
- `try_on_vertical` (`GARMENT`, `JEWELLERY`)
- `jewellery_type` nullable (`RING`, `BRACELET`, `NECKLACE`, `EARRING`)
- `garment_source`
- `garment_intent`
- `garment_category`
- `garment_photo_type`
- `generation_profile`
- `garment_preprocessing_enabled`
- `garment_preprocessing_status` (`DISABLED`, `NORMALIZED`, `PASSTHROUGH`, `FALLBACK`)
- `garment_preprocessing_provider_input_image` (`ORIGINAL`, `PREPROCESSED`)
- `garment_preprocessing_mask_generated`
- `garment_preprocessing_fallback_reason`
- `result_image`
- `error_code`
- `error_message`
- `started_at`
- `submitted_at`
- `completed_at`
- `expires_at`
- `created_at`
- `updated_at`

Indexes:

- unique `(kiosk_device_id, client_request_id)`
- `(kiosk_device_id, created_at)`
- `(kiosk_device_id, status)`
- `(organization_id, created_at)`
- `(organization_id, catalog_source, created_at)`
- `(organization_id, external_product_id)`
- `(organization_id, try_on_vertical, created_at)`
- `(organization_id, jewellery_type, created_at)`
- `(store_id, created_at)`
- `(status, expires_at)`
- `expires_at`

Rules:

- production kiosk Try-On runs are owned by the creating `kiosk_devices` row;
- create uses `client_request_id` as the paid-run idempotency key scoped to the
  kiosk device. The same device plus key returns the same run;
- status/result reads must be scoped to the owning device unless a later
  approved administrative surface defines broader access;
- `assignment_scope`, `organization_id` and `store_id` are copied from the
  current device record at run creation and are not accepted from Flutter;
- the table stores safe provider metadata and provider execution state but does
  not expose provider prediction IDs to Flutter customer UI;
- garment preprocessing fields store safe operational metadata only. They must
  not contain raw image bytes, Base64 image content, masks or provider secrets;
- raw person and garment input bytes are not stored in PostgreSQL by this
  model;
- `try_on_vertical` defaults to `GARMENT` for existing and legacy runs.
  Jewellery runs must set `try_on_vertical = JEWELLERY` and a non-null
  `jewellery_type`; garment runs must keep `jewellery_type = NULL`;
- `product_id` references a SelfX-managed product when one exists. Optional
  `catalog_source` and external product fields are metadata for Store/external
  catalog traceability and must not grant authorization by themselves;
- platform-owned kiosks may use `SELFX_CATALOG`; Store-owned kiosks default to
  `STORE_CATALOG` when a Store product is referenced and may record
  `SHOPIFY`, `WOOCOMMERCE`, `CUSTOM_API` or `PUBLIC_API` metadata where the
  source is known;
- generated results are customer-sensitive and expire no later than seven days
  through `expires_at` and service cleanup;
- `TRYON_LAB_ENABLED` is unrelated to this production table. The internal
  Try-On Lab may keep its separate development run registry.

---

## 10.8 `kiosk_heartbeats`

Optional bounded heartbeat history.

Important fields:

- `id`
- `kiosk_id`
- `received_at`
- `app_version`
- `connectivity_status`
- `camera_status`
- `storage_status`
- `configuration_version`
- `metadata_json`

Heartbeat retention must be bounded or aggregated.

---

## 10.7 `kiosk_remote_commands`

Important fields:

- `id`
- `kiosk_id`
- `command_type`
- `payload_json`
- `status`
- `requested_by_user_id`
- `requested_at`
- `completed_at`
- `error_code`

Remote commands must be auditable and idempotent where necessary.

---

# 12. Try-On Domain

## 11.1 `tryon_sessions`

Represents a customer interaction/session.

Important fields:

- `id`
- `organization_id`
- `store_id` nullable
- `customer_id` nullable
- `kiosk_id` nullable
- `channel`
- `status`
- `consent_recorded_at`
- `started_at`
- `ended_at`
- `created_at`

Channels:

- KIOSK
- MOBILE
- WEB
- SHOPIFY
- WOOCOMMERCE
- PUBLIC_API

Indexes:

- `organization_id`
- `store_id`
- `customer_id`
- `kiosk_id`
- `started_at`

- `consent_recorded_at` may be retained as workflow convenience, but it is not sufficient as the long-term durable consent design;
- durable consent details belong in `consent_records`.

---

## 11.1.1 `consent_records`

Durable record of customer consent for camera, image upload, AI processing, merchant result access disclosure, and other approved consent purposes.

Important fields:

- `id`
- `organization_id` nullable where no merchant context applies
- `store_id` nullable
- `customer_id` nullable for anonymous customers
- `tryon_session_id`
- `consent_type`
- `consent_purpose`
- `notice_version`
- `accepted_at`
- `channel`
- `metadata_json`
- `created_at`

Indexes:

- `organization_id`
- `store_id`
- `customer_id`
- `tryon_session_id`
- `(consent_type, accepted_at)`

Rules:

- consent records must not store raw customer images or unnecessary sensitive content;
- consent records may remain after customer image deletion when legally and operationally permitted;
- metadata must be safe to retain and should be limited to what is needed for audit/legal/operational purposes.

---

## 11.2 `tryons`

Represents one business-level Try-On.

Important fields:

- `id`
- `tryon_session_id` nullable
- `organization_id`
- `store_id` nullable
- `customer_id` nullable
- `product_id` nullable
- `product_variant_id` nullable
- `channel`
- `generation_profile`
- `status`
- `person_asset_id`
- `garment_asset_id`
- `result_asset_id`
- `failure_code`
- `queued_at`
- `processing_started_at`
- `completed_at`
- `created_at`
- `updated_at`

Indexes:

- `(organization_id, created_at)`
- `store_id`
- `(customer_id, created_at)`
- `(status, queued_at)`
- `product_id`

Rules:

- one Try-On may have multiple provider attempts;
- SelfX canonical status is client-facing;
- physical-garment Try-On may not have a normal product record.

---

## 11.3 `provider_attempts`

Represents one AI-provider execution attempt.

Important fields:

- `id`
- `tryon_id`
- `provider`
- `model`
- `generation_profile`
- `provider_request_id`
- `status`
- `attempt_number`
- `started_at`
- `completed_at`
- `latency_ms`
- `normalized_error_code`
- `provider_error_code`
- `provider_error_metadata`
- `provider_usage_json`
- `estimated_cost`
- `created_at`
- `updated_at`

Constraint:

- unique `(tryon_id, attempt_number)`

Indexes:

- `tryon_id`
- `provider`
- `status`
- `provider_request_id`

---

# 13. QR Handoff

## 12.1 `handoff_tokens`

Important fields:

- `id`
- `token_hash`
- `tryon_session_id`
- `tryon_id` nullable
- `product_id` nullable
- `expires_at`
- `used_at`
- `revoked_at`
- `created_at`

Rules:

- short-lived;
- high entropy;
- raw customer data is never encoded directly;
- use single-use/bounded-use semantics according to final flow.

---

# 14. Integrations

## 13.1 `integrations`

Represents Shopify/WooCommerce/future connections. INTEGRATIONS-1 creates the
shared connection spine before platform-specific OAuth, product sync and
storefront UI are implemented.

Important fields:

- `id`
- `organization_id`
- `type`
- `external_account_id`
- `external_account_name`
- `status`
- `metadata_json`
- `connected_at`
- `disconnected_at`
- `created_by_user_id`
- `created_at`
- `updated_at`

Possible types:

- SHOPIFY
- WOOCOMMERCE

Indexes:

- `organization_id`
- `type`
- `(organization_id, status)`

Constraints:

- unique `(organization_id, type)`
- unique `(type, external_account_id)` when an external account ID is present

The second constraint prevents one Shopify shop from being linked to multiple
SelfX Stores. Moving a shop between Stores must use an explicit administrative
disconnect/relink operation rather than creating a second integration row.

---

## 13.2 `integration_credentials`

Stores plugin/app credentials for one Store integration. The raw token is shown
only once and SelfX stores only the hash.

Important fields:

- `id`
- `integration_id`
- `organization_id`
- `name`
- `token_prefix`
- `token_hash`
- `scopes_json`
- `status`
- `expires_at`
- `last_used_at`
- `created_by_user_id`
- `created_at`
- `revoked_at`

Indexes:

- `integration_id`
- `(organization_id, status)`
- `token_prefix`

---

## 13.3 `integration_events`

Tracks inbound external webhook events for idempotency.

Important fields:

- `id`
- `integration_id`
- `organization_id`
- `external_event_id`
- `event_type`
- `status`
- `payload_json`
- `processed_at`
- `created_at`
- `updated_at`

Constraint:

- unique `(integration_id, external_event_id)`

---

## 13.4 `integration_provider_credentials`

Stores retrievable commerce-provider credentials separately from hashed SelfX
plugin tokens. Access and rotating refresh tokens are serialized into one
AES-256-GCM encrypted payload; plaintext tokens must never be stored or returned
to the browser.

Important fields:

- `integration_id` unique
- `organization_id`
- `provider`
- `encrypted_payload`
- `initialization_vector`
- `authentication_tag`
- `key_version`
- `scopes_json`
- `access_token_expires_at`
- `refresh_token_expires_at`
- `created_at`
- `updated_at`

---

## 13.5 `integration_oauth_states`

Short-lived, single-use OAuth state records bind an authorized SelfX user,
Store, provider and canonical shop domain to one installation attempt. Only the
SHA-256 state hash is persisted.

Important fields:

- `organization_id`
- `provider`
- `shop_domain`
- `state_hash` unique
- `created_by_user_id`
- `expires_at`
- `consumed_at`
- `created_at`

---

## 13.6 `shopify_link_sessions`

Short-lived, single-use records used to connect an authenticated Shopify app
installation to an active SelfX Store. The Shopify app creates the session by a
server-to-server call. An authorized SelfX user selects and approves the Store,
then the Shopify app redeems the session once for a Store-scoped
`catalog:sync` credential. Only the SHA-256 hash of the link token is stored.

Important fields:

- `token_hash` unique
- `shop_domain`
- `external_account_id`
- `external_account_name`
- `organization_id`
- `approved_by_user_id`
- `integration_id`
- `expires_at`
- `approved_at`
- `redeemed_at`
- `created_at`
- `updated_at`

The raw link token and generated integration credential are each returned only
to the Shopify app server. Neither value belongs in storefront JavaScript.

---

## 13.7 `webhook_endpoints`

Public API webhook configuration.

Important fields:

- `id`
- `organization_id`
- `url`
- `status`
- `encrypted_secret` or secure secret reference
- `subscribed_events`
- `created_at`
- `updated_at`

---

## 13.4 `webhook_deliveries`

Tracks outbound SelfX webhook attempts.

Important fields:

- `id`
- `organization_id`
- `event_id`
- `webhook_endpoint_id`
- `event_type`
- `attempt_number`
- `status`
- `http_status`
- `next_retry_at`
- `delivered_at`
- `created_at`

Indexes:

- `organization_id`
- `status`
- `next_retry_at`

---

# 15. Public API

## 14.1 `api_keys`

Important fields:

- `id`
- `organization_id`
- `name`
- `key_prefix`
- `secret_hash`
- `environment`
- `status`
- `scopes_json`
- `expires_at`
- `last_used_at`
- `created_by_user_id`
- `created_at`
- `revoked_at`

Indexes:

- `organization_id`
- `key_prefix`
- `(organization_id, status)`

Rule:

- raw secret is shown only once;
- only hashed secret is persisted.

---

## 14.2 `idempotency_records`

Stores bounded idempotency records for retry-sensitive operations.

Important fields:

- `id`
- `actor_user_id` nullable
- `customer_id` nullable
- `api_key_id` nullable
- `kiosk_id` nullable
- `organization_id` nullable
- `operation`
- `idempotency_key`
- `request_fingerprint`
- `response_reference_json`
- `status`
- `expires_at`
- `created_at`
- `updated_at`

Constraints:

- unique idempotency key scope by authenticated actor/credential plus operation.

Indexes:

- `(operation, idempotency_key)`
- `actor_user_id`
- `customer_id`
- `api_key_id`
- `kiosk_id`
- `(status, expires_at)`

Rules:

- same key + same fingerprint returns or replays the original logical result;
- same key + different fingerprint returns a stable machine-readable idempotency conflict;
- records have bounded retention, but exact TTL may vary by operation;
- required examples include Public API Try-On creation, kiosk retry-sensitive Try-On creation, usage events, billing-provider events, and inbound/outbound webhook processing where applicable.

---

# 16. Subscription and Entitlements

## 15.1 `subscriptions`

Canonical SelfX SaaS subscription record.

Important fields:

- `id`
- `organization_id`
- `plan_version_id` nullable
- `billing_provider`
- `external_subscription_id`
- `status`
- `trial_started_at`
- `trial_ends_at`
- `current_period_start`
- `current_period_end`
- `grace_ends_at`
- `created_at`
- `updated_at`

---

## 15.2 `plan_versions`

Versioned commercial plans.

Important fields:

- `id`
- `plan_code`
- `version`
- `display_name`
- `status`
- `pricing_json`
- `entitlements_json`
- `effective_from`
- `created_at`

Constraint:

- unique `(plan_code, version)`

---

## 15.3 `organization_entitlements`

Supports customer-specific overrides.

Important fields:

- `id`
- `organization_id`
- `entitlement_code`
- `value_json`
- `source`
- `starts_at`
- `ends_at`
- `created_at`
- `updated_at`

Examples:

- PUBLIC_API_ACCESS
- WHITE_LABEL
- MAX_STORES
- MAX_KIOSKS
- MONTHLY_TRYONS

---

# 17. Usage Metering

## 16.1 `usage_events`

Append-oriented authoritative usage ledger.

Important fields:

- `id`
- `organization_id`
- `store_id` nullable
- `kiosk_id` nullable
- `tryon_id` nullable
- `channel`
- `usage_type`
- `quantity`
- `idempotency_key`
- `occurred_at`
- `metadata_json`
- `created_at`

Constraint:

- unique idempotency scope appropriate to the usage operation, such as `(organization_id, usage_type, idempotency_key)` where applicable

Indexes:

- `(organization_id, occurred_at)`
- `usage_type`
- `tryon_id`

Rule:

AI-provider attempts do not automatically equal customer billable usage.

---

## 16.2 `usage_aggregates`

Optional derived summaries for dashboard/report performance.

Possible dimensions:

- organization;
- store;
- date;
- channel;
- usage type.

Aggregates are rebuildable and are not authoritative.

---

# 18. Audit and Support

## 17.1 `audit_logs`

Append-oriented audit trail.

Important fields:

- `id`
- `organization_id` nullable
- `store_id` nullable
- `actor_user_id`
- `effective_role_or_context`
- `action`
- `resource_type`
- `resource_id`
- `request_id`
- `metadata_json`
- `created_at`

Indexes:

- `(organization_id, created_at)`
- `store_id`
- `actor_user_id`
- `(resource_type, resource_id)`

Never store secrets in audit metadata.

Audit foundation timing:

- audit infrastructure must be introduced incrementally when the first auditable actions appear;
- do not wait for the later support/impersonation UI phase before audit logs exist;
- auditable examples include authentication/security actions, organization/staff changes, role/store-scope changes, kiosk pairing/unpairing, API key lifecycle, impersonation, and sensitive administrative actions.

---

## 17.2 `impersonation_sessions`

Important fields:

- `id`
- `actor_user_id`
- `organization_id`
- `store_id` nullable
- `effective_role`
- `reason`
- `started_at`
- `expires_at`
- `ended_at`
- `status`

Indexes:

- `actor_user_id`
- `organization_id`
- `expires_at`

---

# 19. Store Manager Result Access

The PRD allows authorized Store Managers to view generated Try-On results associated with their store, but not original customer photographs.

Therefore the schema must maintain separate asset relationships for:

- person input;
- garment input;
- generated result.

Access to `result_asset_id` must not imply access to `person_asset_id`.

Authorization must also verify store scope.

---

# 20. Retention Rules

Customer-sensitive images:

- customer person image → expires no later than 7 days from successful upload/storage creation;
- physical customer-session garment capture → expires no later than 7 days from successful upload/storage creation;
- generated Try-On result → expires no later than 7 days from successful result creation/storage;
- derived sensitive provider input → inherits an equal or shorter retention period.

If a later legal/product policy requires earlier deletion, earlier deletion wins.

Permitted non-image Try-On metadata may remain.

Product/garment catalog images use business/catalog retention.

Audit, usage, billing, and security records use separate retention policies.

`assets.expires_at` should be indexed for cleanup processing.

---

# 21. Soft Delete and Status

Do not add `deleted_at` to every table automatically.

Use status/soft deletion where historical retention matters.

Likely candidates:

- organizations;
- stores;
- memberships;
- products;
- kiosks;
- integrations;
- API keys.

Append-oriented records such as usage events, provider attempts, and audit logs should normally not be overwritten during routine operations.

---

# 22. Important Constraints

At minimum, evaluate database constraints for:

- normalized staff email;
- active platform role assignment uniqueness;
- `(organization_id, user_id)` membership;
- `(membership_id, store_id)` store scope;
- organization application ownership/status indexes;
- organization application document/application relationship;
- `(organization_id, store code)` where used;
- `(product_id, store_id)` availability;
- external product identity within an integration;
- `(tryon_id, attempt_number)` provider attempts;
- inbound integration event identity;
- usage idempotency key;
- operation-scoped idempotency key;
- plan code + version;
- API key prefix;
- pairing/handoff token hashes where applicable.

Critical invariants must be enforced by the database, not only application code.

---

# 23. Indexing Strategy

Indexes must follow real query patterns.

Important examples:

- `(organization_id, created_at)`
- `(organization_id, status)`
- `(store_id, created_at)`
- `(customer_id, created_at)`
- `(status, queued_at)` for Try-Ons
- `(status, expires_at)` for assets
- `(integration_id, external_product_id)`
- `(organization_id, occurred_at)` for usage
- `(organization_id, created_at)` for audits
- `(kiosk_id, received_at)` for heartbeats

Do not automatically index every column.

---

# 24. JSON / JSONB Usage

JSONB may be used for flexible metadata such as:

- addresses;
- device metadata;
- provider metadata;
- integration metadata;
- plan configuration;
- low-frequency settings.

Frequently queried core fields must remain normal columns.

Do not hide tenant IDs, statuses, timestamps, or key query dimensions only inside JSON.

---

# 25. Foreign Keys and Delete Behavior

Foreign keys should protect important relationships.

Examples:

- Store → Organization
- Kiosk → Organization + Store
- Membership → User + Organization
- ProviderAttempt → TryOn
- ProductMapping → Integration + Product
- UsageEvent → Organization
- Subscription → Organization

Cascade deletion must be used cautiously.

Deleting one tenant resource must not accidentally erase required audit, usage, or security history.

---

# 26. Migration Rules

Every schema change requires a tracked Prisma migration.

Production migrations must be forward-managed.

Applied migrations must not be silently edited.

Risky changes should follow:

Expand → deploy compatible code → backfill → switch usage → contract later

Large data backfills should be separated from blocking schema changes when practical.

Migration validation must run in CI and staging.

---

# 27. Deferred Tables

Do not create tables yet for features outside the approved initial scope, including:

- custom merchant roles;
- native SelfX customer orders;
- customer payment transactions;
- refunds;
- shipping;
- POS;
- full inventory;
- ML training datasets;
- advanced recommendation systems.

These require future approved product decisions.

---

# 28. Prisma Implementation Guidance

When Codex later converts this design into Prisma:

1. use UUIDv7 for SelfX primary business identifiers and map them to PostgreSQL native `uuid` columns;
2. generate UUIDv7 IDs in the SelfX application layer unless a later approved implementation decision explicitly chooses a database-side mechanism;
3. preserve explicit organization/store ownership;
4. preserve separate platform role assignments outside organization memberships;
5. use clear relation names;
6. use enums only for stable values;
7. avoid excessive JSON for core relationships;
8. create approved unique constraints;
9. create indexes based on expected queries;
10. use consistent timestamps;
11. create descriptive migration names;
12. do not generate the entire future schema in one uncontrolled migration;
13. follow the implementation plan phase by phase.

---

# 29. Database Baseline Summary

- Primary database: PostgreSQL
- ORM: Prisma
- Migration system: Prisma Migrate
- Primary SelfX ID standard: UUIDv7
- PostgreSQL primary ID storage: native `uuid`
- UUIDv7 generation responsibility: SelfX application layer unless a later approved implementation decision explicitly chooses database-side generation
- External provider/platform IDs: separate fields
- Security tokens/secrets: cryptographically random values, not UUIDs
- Tenant model: shared database/shared schema with organization/store scoping
- Platform roles: separate platform role assignments, not fake/internal organization memberships
- Organization onboarding: application lifecycle separate from operational organization status
- Operational organization status includes PENDING_ACTIVATION, ACTIVE, SUSPENDED, ARCHIVED
- Pending initial owner membership uses PENDING_ACTIVATION until explicit platform activation
- Binary media: private object storage, metadata in PostgreSQL
- Customer image/result retention: 7 days
- Customer consent: durable consent records separate from workflow convenience timestamps
- Durable workflow state: PostgreSQL
- Usage/audit records: append-oriented

---

# 30. Status

**Database & Schema Design v1.1 — ACTIVE BASELINE**

This document defines the logical database structure required before Prisma implementation.

Exact Prisma types, enum names, relation names, and final index choices may be refined during implementation, but must remain consistent with the current approved product and technical architecture.

This document may be updated whenever justified requirements change. Such changes must be reflected through the appropriate Prisma schema updates, new migrations, tests, and related documentation.
