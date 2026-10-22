# ROLES-3 — Shared Store role defaults and editable Staff permissions

The previous global-role migration intersected old tenant maps with retired Store
ceilings. On the local application database this produced empty shared Admin and
Staff maps. A separate hardcoded Staff allowlist prevented additional grants.

## Changes

- Migration `20261022000000_repair_store_role_defaults` restores approved initial
  grants for untouched maps: Store Admin has 19 administration/operation permissions;
  Store Staff has 7 daily-operation permissions. Both include `products.manage`.
- The correction locks role rows, checks original timestamps and audit history,
  bumps the role version and records before/after permission codes. Saved empty or
  partial maps are preserved. Reads, onboarding and startup do not refill grants.
- Staff may now receive any permission from the same Store registry as Admin.
  The API's `staffAssignableCodes` compatibility field returns that registry; the
  UI uses the Store registry directly for checkboxes and bulk selection.
- Only protected Superadmin or explicit Platform `STORE_ROLES_MANAGE` authority
  can edit global Store maps. Store `roles.update` or `roles.assign` never confers
  that Platform authority. Impersonation remains read-only for shared maps.
- Developer/API and all Platform-only codes remain invalid for Store roles.
  Tenant, membership, account/role status, plan and final-Admin protections remain.
  Store Admin core administration grants remain required. Resource-specific
  safeguards, including existing payment-management requirements, still apply.

## Validation

- Fresh disposable PostgreSQL database: all 67 migrations applied successfully.
- Migration tests verify empty/partial initialization repair, edited empty/partial
  map preservation, modified timestamp protection and replay after revocation.
- API RBAC integration tests verify new Staff administration grants, authorized
  Platform editing, merchant denial, global changes across current/future Stores,
  revocation, platform-code rejection, impersonation and optimistic concurrency.
- Web tests cover newly enabled Staff administration checkboxes and bulk selection,
  global saves, merchant read-only access, required Admin controls and product
  mutation controls after permission loss.
- Results: 4 migration tests, 20 API RBAC integration tests and 34 web tests passed.
  API TypeScript and changed-file ESLint passed. Next.js production compilation,
  type validation and static generation passed, with four existing image-element
  warnings in unrelated sharing/Shopify pages. Local migration status reports all
  67 migrations applied.

## Local rollout

A backup was saved under `tmp/db-backups/selfx-before-role-repair-*.dump` before
applying the correction to `selfx` on `localhost:5433`. The original two maps were
untouched, empty and had no saved-edit audit. The migration restored 19 Admin and
7 Staff grants and created two repair audit records. No production database was
modified. Restart the local API if it is not running in watch mode, and refresh
the web Roles page. Production requires deploying the API/web changes and this
migration together; saved production role edits are intentionally preserved.
