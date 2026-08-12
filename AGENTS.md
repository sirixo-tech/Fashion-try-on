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

Mantine is the primary SelfX web UI and component framework.

The approved web UI hierarchy is:

SelfX application UI
→ `@selfx/ui`
→ Mantine
→ centralized SelfX Mantine theme/components/wrappers

`packages/ui` is the shared SelfX web design-system boundary. Reusable React
web UI belongs there.

shadcn/ui may remain installed as a secondary component source only when
Mantine does not provide a suitable component or when retaining an existing
shadcn primitive is explicitly justified. Do not treat Mantine and shadcn as
equal default choices, and do not randomly mix them on individual pages.

Tailwind CSS remains secondary styling infrastructure for simple layout
utilities, existing compatibility and occasional application-specific spacing.
Do not recreate Mantine components with Tailwind or create a parallel Tailwind
component system.

Common web UI such as navigation, app shell, controls, forms, cards, user
menus, badges, alerts, loaders, modals, drawers, tabs, tooltips and admin
layouts should be Mantine-first. Custom Try-On, camera and image-processing
experiences remain SelfX-specific components built on the approved UI
architecture.

Future organization white-labeling must map through the centralized SelfX
Mantine theme/token layer rather than scattered hard-coded styles.

SelfX web pages must use the shared Phase 4 page/layout primitives from
`@selfx/ui` instead of inventing one-off page scaffolds. The approved hierarchy
is Mantine → SelfX theme → SelfX layout primitives → approved page templates →
business pages. Standard page primitives include `PageContainer`, `PageHeader`,
`PageSection`, `SectionHeader`, `StatGrid`, `StatCard`, `SectionCard`,
`SummaryCard`, `ActionCard`, `TableContainer`, `FilterBar`,
`FormPageContainer`, `FormSection` and `FormActions`.

Approved page width modes are `wide` for dashboards, list pages and admin
workspaces, `medium` for detail/settings pages, and `form` for create/edit
forms. Page padding, section gaps, card padding, card radius, borders and
shadows should come from the centralized SelfX Mantine theme and these shared
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
