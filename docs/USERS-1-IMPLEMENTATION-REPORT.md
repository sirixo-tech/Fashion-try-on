# USERS-1 — Users and account editing

The Access Control navigation item and `/app/users` heading now say **Users**.
The page shows the actual login email, name, account status, creation date,
separate Platform access and every linked Store's membership/role/status.
Archived Store links remain visible. Search and status/access/role/Store filters
run on the backend with 25/50/100-row pagination and deterministic ordering.

## Single edit modal

Protected SelfX Superadmins can edit ordinary accounts in one modal:

- Full name and login email.
- Optional new password, blank by default; blank preserves the existing hash.
- Active, Suspended or Disabled account status.
- Dynamic Platform role assignments, separate from Store access.
- Multiple Store membership links and each selected Store's operational roles.
- Active, Suspended or Revoked status for ordinary memberships. Revocation
  preserves the membership and audit history.

The modal keeps its action footer visible while its fields scroll. Errors keep
the form open; submitted passwords are cleared even when saving fails. Store
and role selectors are paginated. Existing memberships omitted from the request
are untouched. Inactive Stores and owner memberships are read-only here.

Changing the login email changes sign-in and password recovery, not the Store's
contact email. Email changes clear email-verification state. Email/password or
account-status changes increment the credentials version, revoke refresh
sessions, invalidate old reset links and end impersonations performed by that
user. Existing access JWTs therefore fail the backend version check.

## Explicit first-owner repair

As approved, the same modal has **Assign first Store Owner**:

1. Select an active Store.
2. Type its exact name to confirm.
3. Execute the separate action, with no unsaved ordinary account edits.

The backend requires an active, non-protected account and a Store with no active
owner account. It establishes ACTIVE `ORGANIZATION_OWNER` membership with explicit
`ALL_STORES` scope and the Store's built-in Store Admin role. It preserves other
memberships, removes obsolete selected-location scopes on that repaired link,
and does not touch products, billing, contact email or credentials.

It never broadens the Store's permission ceiling. The Store must already grant
`stores.view`. Existing active owners cause rejection: this is not ownership
transfer. Exact confirmation, an account snapshot digest, shared tenant locking
and a serializable transaction protect concurrent attempts. A repeated or stale
attempt fails safely without creating duplicate memberships.

## Authorization and safeguards

- Read access follows the existing platform Users read permission boundary.
  Ordinary Store accounts cannot use the global directory API.
- Account mutations and first-owner assignment require active protected
  Superadmin authority at the HTTP boundary and inside the transaction.
- Protected Superadmin target accounts remain locked. Normal edits never
  change bootstrap Platform role assignments.
- Disabling/suspending the last active owner account is rejected, including
  concurrent attempts against two owner accounts.
- Existing Store/tenant membership owner checks now count only active user
  accounts as replacement owners. Store membership suspension shares the tenant
  mutation lock and validates owner safety inside the update transaction.
- Store role IDs must belong to the requested Store and be active.
- New ordinary links explicitly grant tenant-wide Store scope; existing scopes
  remain unchanged. All operational permissions still pass through Store RBAC
  and the existing Store permission ceiling.
- Duplicate login emails and stale edit snapshots return readable conflicts.
  Combined account/access updates commit atomically or roll back.
- Audit events attribute changes to the actual administrator and contain no
  passwords, hashes, reset links or session credentials.

## APIs and persistence

- `GET /api/v1/admin/users`
- `GET /api/v1/admin/users/stores`
- `GET /api/v1/admin/users/:userId`
- `PATCH /api/v1/admin/users/:userId`
- `POST /api/v1/admin/users/:userId/first-store-owner`

Existing account, membership, RBAC, token/session and audit tables are reused.
No migration or new environment variable is required for USERS-1. Deploy API
and web together. Existing onboarding remains the way to create new accounts;
this page manages accounts already in SelfX. Protected Superadmin retirement and
ownership transfer remain controlled maintenance operations.

## Using it for Avinash stores after deployment

1. Sign in as the retained `super-admin@selfx.local` Superadmin.
2. Open Access Control → Users and search `avinashnaiduabhi9989@gmail.com`.
3. Edit that account and use **Assign first Store Owner** for **Avinash stores**,
   confirming the exact Store name. Its archived Store link is preserved.
4. If needed, reopen Edit to change the login email or set a new password.
5. Sign in using that account and verify its Store and migrated products.

Implementation does not perform these actions in production or alter the
unwanted protected Superadmin account automatically.

## Verification

Security tests use a dedicated localhost PostgreSQL database named
`selfx_users_test`, with all existing migrations applied. No production database
is used. Tests cover safe projections, pagination/filtering, atomic rollback,
email conflicts, stale edits, authorization, protected accounts, cross-Store role
rejection, multiple memberships, token/session invalidation, final-owner safety,
first-owner confirmation and concurrent ownership attempts. UI tests exercise
the shared modal/checkbox, blank-password behavior, save failures, Store linking,
explicit ownership confirmation, filters and protected-account presentation.

Validation passed:

- 54 PostgreSQL/authorization tests across Users, Store RBAC and tenant
  membership management, plus 17 authentication regression tests.
- 27 UI/navigation tests; the seven Users tests also passed after final error
  presentation changes.
- API and web production builds, final web typecheck, and lint for all changed
  TypeScript files with zero warnings.
- `git diff --check`.

The web build retains eight existing Next.js image-performance warnings in
unrelated catalog, shared-look and Shopify pages. Browser layout and real
production account linking were not exercised by the automated tests.
