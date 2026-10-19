# ROLES-1 — Unified Roles workspace

Date: 19 October 2026

## Result

User Management > Roles now covers all five approved role types in one page.

- **Platform roles:** Platform Superadmin, Platform Admin and Platform Staff.
- **Store roles:** Store Admin and Store Staff for an explicitly selected Store.

This is one workspace over the existing, separate platform and Store role
systems. It does not turn Store roles into global roles. Assigning a role to an
individual account still happens in **Users**; this page changes what that role
can do for every assigned account in its scope.

## What the page provides

- Scope tabs, searchable/paginated Store selection and two Store role entries.
- The selected Store stays labelled even while browsing another results page.
- Grouped permission checkboxes, permission search, counts and bulk selection
  within the user's delegation authority.
- Protected Superadmin and read-only role views.
- Required Store Admin permissions and unavailable Store permissions explained
  beside the controls.
- A separate **Manage Store permission limit** action for Superadmin.
- Loading, saving, errors and stale-save feedback. Failed saves preserve the draft.
- Refresh of the saved role and current navigation permissions after success.

The platform assigned-account count includes ordinary bootstrap identities as
well as dynamic assignments, without counting the same account twice.

## Who can change permissions

| Actor's actual authority | Allowed changes |
| --- | --- |
| Protected Platform Superadmin | Ordinary Platform Admin/Staff maps, selected Store Admin/Staff maps and Store permission limits |
| Platform role manager with `PLATFORM_ROLES_MANAGE` | Platform Staff only; changes must concern permissions the actor holds; Superadmin-only permissions remain protected |
| Platform Store-role manager with `STORE_ROLES_MANAGE` | Selected Store Admin/Staff maps within that Store's permission limit |
| Actual Store Admin with `roles.view` and `roles.assign` | Their Store's Staff operational map, bounded by their own permissions and the Store limit |
| Authorized role viewer | Read-only role/permission visibility |
| Store Staff | No user/role administration; no default Roles menu |

Store Staff's approved operational set is Store viewing, products/stock, kiosk
viewing/configuration/update, analytics and garment preview. It cannot include
account, payment, user or role administration. Store Admin's core Store viewing
and user/role administration entries remain required in its role map. Existing
final-Admin membership protections remain in place.

The Store permission limit is an upper bound on effective access. Keeping a
permission in a role map does not make it effective when it is outside that
limit. Only protected Superadmin can change the limit. Superadmin's own protected
bootstrap identity cannot be edited through this page.

All decisions are checked server-side. Knowing another Store's id or enabling a
frontend control does not authorize access. Permission mutations are blocked
during impersonation; workspace reads are restricted to the impersonated Store.
The older Platform role metadata/status endpoint follows the same hierarchy.

## Backend changes

New authenticated, non-cacheable workspace endpoints:

```text
GET /api/v1/admin/roles?page=1&pageSize=25&search=...
GET /api/v1/admin/roles/stores/:storeId
```

The first returns allowed platform visibility/editing capabilities and accessible
active Stores. The second returns the selected Store's roles, permission
availability and editing policy. Existing permission replacement APIs are reused.

Saving uses a row lock, a monotonically advanced timestamp and actor-attributed
audit logging. The new UI sends `expectedUpdatedAt`; a changed version returns
`ROLE_CHANGED` and requires a reload. The field remains optional for existing API
callers. Role-map and Store-limit replacements are transactional.

Two existing behaviors needed correction for permission revocation to work:

1. Routine role initialization previously re-added default permissions. Defaults
   are now inserted only when the role is first created. Existing saved maps,
   including empty maps, stay saved.
2. Ordinary legacy Platform Admin/Staff bootstrap identities previously received
   hardcoded authority. When their canonical role exists, they now use its saved
   permission map. Protected Superadmin retains its independent bootstrap access.

Products and kiosks remain Store resources. Viewing/editing Store role policies
does not grant platform accounts operational product or kiosk access.

Fixed-role viewing and permission editing are available independently of the
legacy Store location-count plan gate. Existing user/team-management API
entitlement rules are unchanged.

## Verification

Automated checks cover:

- Effective permission grant/revocation, persistence across refresh/new services,
  and legacy/dynamic platform assignments.
- Protected roles, delegated hierarchy, held-permission limits and Staff limits.
- Cross-Store denial, actual membership checks, read-only platform Store viewers,
  delegated Store managers and Store permission ceilings.
- Impersonation boundaries, stale saves, final-Admin protection and audit records.
- UI scope selection, visible selected Store across pagination, protected and
  read-only controls, failures, navigation refresh and existing Users behavior.
- Account deletion/permanent Store purge and Store payment configuration/testing
  regressions. Payment tests use mocked provider execution.
- Internal OpenAPI registration and rejection of unauthenticated workspace calls.

Validation used isolated localhost PostgreSQL databases, including a fresh
database with all 59 existing migrations applied. No production database was used.

| Check | Result |
| --- | --- |
| Targeted backend role, Users, payment and OpenAPI tests | 86 passed across targeted runs |
| Dedicated user/Store deletion regression suite | 16 passed |
| Roles, navigation, Users and authenticated-shell frontend tests | 44 passed |
| API and web TypeScript checks | Passed |
| Changed-source ESLint, zero warnings | Passed |
| API and web production builds | Passed |

The existing web build reports unrelated image-optimization warnings on older
Try-On/share pages. No live gateway, email or production account changes were
executed. Browser acceptance against production is not covered by these
automated checks.

## Deployment and next steps

1. Deploy the updated **API and web together**. There is no new schema migration
   or environment variable for this milestone; retain the repository's existing
   migration deployment procedure for any older unapplied migrations.
2. Sign in as protected Superadmin and open **User Management > Roles**. Review
   the existing Platform Admin/Staff maps, then select Avinash stores under
   **Store roles** and review its Admin, Staff and Store permission limit.
3. If an old role map is empty, configure and save it deliberately. Deployment
   preserves existing permission decisions instead of silently restoring defaults.
4. Test with a real Store Admin and Staff account. Revoke an operational Staff
   permission, confirm that access is denied for that Store, then restore it as
   appropriate. Keep individual account-role assignments in **Users**.

No manual production insertion of Store role rows is required. Existing Store
RBAC initialization creates missing canonical roles when needed. This work does
not create a Store login, change account assignments, enable live payments or
modify production data. Production rollout and manual browser/account acceptance
checks remain operator steps.

## Main implementation files

- `frontend/web/components/roles-workspace.tsx` and `frontend/web/lib/roles.ts`:
  shared workspace and API contract.
- `frontend/web/app/app/roles/page.tsx`: existing route now uses the workspace.
- `frontend/web/lib/navigation-access.ts` and
  `frontend/web/components/authenticated-shell.tsx`: permitted navigation and
  permission refresh.
- `backend/api/src/rbac/roles-workspace.controller.ts` and
  `backend/api/src/rbac/role-management-policy.ts`: workspace API and policy.
- `backend/api/src/rbac/store-rbac.service.ts`: scoped Store delegation and
  persistent default initialization.
- `backend/api/src/platform/access-control.service.ts` and
  `backend/api/src/platform/platform-authorization.service.ts`: platform hierarchy,
  saved authorization maps and Store-limit protection.
- Existing request DTOs and API clients: optional permission-map versions.
- Relevant project documents and focused backend/frontend regression tests.
