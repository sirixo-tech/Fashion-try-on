# ROLES-2 — Application-wide role permissions

Editing Store Admin or Store Staff in User Management > Roles now changes one
shared definition used by every existing and future Store. The page no longer
loads a Store list, selector, Store search, pagination or Store permission limit.
Role selection, permission search, grouped checkboxes, bulk controls and the
orange selected border remain.

## Authorization and persistence

- `global_store_roles` and `global_store_role_permissions` hold the two shared
  Store permission maps. Runtime authorization resolves them from the user's
  active membership and tenant-owned role assignments on each protected request.
- Store-specific permission maps and grant ceilings no longer affect access.
  Their historic rows remain for compatibility/history. Legacy replacement
  endpoints reject writes; new Store onboarding never restores permission maps.
- Only protected Superadmin or explicit Platform `STORE_ROLES_MANAGE` authority
  can edit shared Store maps. Merchant role viewers receive read-only definitions
  without global assigned-user counts. Platform-role editing remains separate.
- The global update route is
  `PUT /api/v1/admin/roles/store-roles/:systemCode/permissions`. It validates role
  codes and permission applicability, enforces Staff limits and essential Admin
  access, requires the current version, locks the shared row, rechecks authority,
  rejects impersonation and audits the actual actor and before/after codes.
- Membership IDs, cross-Store role-assignment checks, account/Store/role status,
  plan entitlements, final-Admin protection and protected Superadmin remain intact.
- Account onboarding, transactional staff deletion, captured garment preview
  capability resolution and the account-maintenance CLI use shared policy too.
  Changes do not rewrite credentials, memberships or customer data.

## Migration and rollout

Apply `20261019030000_global_store_role_permissions` and deploy API/web together.
Prevent old API instances from continuing to authorize or edit legacy local maps
during cutover. There is no new environment variable.

When old Stores have different settings, the migration initializes each shared
role with the intersection of the old effective permissions (role map and former
Store grant), including intentionally empty maps. It does not union access or
choose one Store. Existing assignments and local rows remain intact. With no
existing tenant roles of a type, the approved initial baseline is seeded.

Review and deliberately save the initial shared maps after deployment: common
permissions can be narrower than some previous Store-specific maps. An explicit
save then grants/revokes the selected role consistently across all Stores.

## Verification

Verification used disposable localhost PostgreSQL databases and mocked payment
providers. No production database, credentials, gateway or account was modified.

- All 63 migrations applied successfully to clean databases.
- An existing-data migration test covers differing role/grant maps, empty maps,
  preservation of tenant rows and exclusion of Platform permissions.
- Shared-role tests cover existing/future Stores, grant/revocation, empty-map
  persistence, stale/concurrent saves, actor-attributed audits, merchant/delegated
  authority, impersonation, tenant isolation and final-Admin protection.
- Account creation, maintenance, payment settings, entitlement and Store-resource
  regression suites were run, alongside deletion and internal OpenAPI checks.
- Frontend tests cover selection, global saves, permission search, bulk limits,
  protected/read-only roles, failures and existing navigation/Users behavior.
- API and Shopify integration TypeScript builds, web production build, Prisma
  validation, changed-source lint and formatting checks were run.
- Fixture-driven browser checks and screenshot review cover desktop, 390px and
  320px layouts, selected border, permission search and absence of Store controls.

The web build retains existing image-optimization warnings on unrelated pages.
Schema comparison retains existing unrelated baseline drift; the new global role
tables match the Prisma models. Production deployment/browser acceptance is not
part of this local implementation.
