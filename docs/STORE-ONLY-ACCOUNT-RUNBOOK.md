# Convert Avinash's login to Store-only access

Prepared 2026-10-17. This tool has not been run against production.

Target: `avinashnaidu9989@gmail.com`. Store: `avinash-stores`.
Remaining protected Superadmin: `super-admin@selfx.local`.

Validation: all 11 integration tests passed against a new disposable localhost
PostgreSQL database with all 55 existing migrations applied. Coverage includes
other-admin preservation, owner/RBAC preservation, stale-plan rejection, missing
authority, private-backup failure, transactional rollback and idempotent retries.
API type checking, changed-file lint and production build passed. The compiled
CLI displayed help and rejected incomplete apply arguments before environment
loading. No production connection or mutation was used for these checks.

This manually invoked database maintenance command is separate from the normal
Roles screen. Protected Superadmin safeguards in the UI/API remain intact.
The operator must already have authorized database/container access. The remaining
admin email is checked against current authority and used for audit attribution;
supplying it is not authentication or proof of a browser login.

The target must already have an ACTIVE Store Owner membership with ALL_STORES
scope, an active Store Admin RBAC assignment, and effective `stores.view` within
the permission ceiling. The tool never creates/promotes a membership or downgrades
the owner. If checks fail, review Store Users/Roles and grants first.

## 1. Prepare

Sign in as `super-admin@selfx.local` in a separate private browser window. Verify
the password works and platform administration opens. The command independently
checks the user and its protected Superadmin assignment are ACTIVE. Never share
passwords, refresh tokens or DATABASE_URL.

Deploy this revision to the Railway **API service** using its normal build. No
schema migration or frontend change is required. Take a fresh verified production
database backup before applying, as with the catalog transfer.

Open the correct production API container using Railway's **Copy SSH Command**,
as in the catalog-transfer runbook. From the deployed repository root:

```sh
npm run account:store-only --workspace @selfx/api -- --help
```

Do not run demo/platform bootstrap or catalog seed scripts for this operation.
Demo bootstrap can grant platform roles again. This command does not change any
custom deployment/startup jobs; review them separately if you added them.

## 2. Preview only

```sh
npm run account:store-only --workspace @selfx/api -- --dry-run --target-email avinashnaidu9989@gmail.com --remaining-admin-email super-admin@selfx.local --store-slug avinash-stores --out /tmp/avinash-account-plan.json
```

The preview enforces PostgreSQL READ ONLY. It displays target user UUID, Store
UUID/name, remaining Superadmin, preserved membership, effective Store permission
codes and every active platform role to revoke. It never initializes a permission
registry or writes database records.

Review the identities. Save **planHash**, **target.id** and **store.id** from the
output. The private plan contains selected role/membership records without
passwords, token hashes or connection credentials. Keep artifacts out of source
control and copy them off the container before redeploying.

If no platform roles remain, it reports that no conversion is needed. If the
membership or permissions are wrong, it stops instead of guessing an assignment.

## 3. Apply the reviewed preview

Use a brief quiet period for role/membership/login changes. The final transaction
briefly locks authorization/session tables; reads continue, competing writes can
wait, and lock acquisition times out after five seconds. Do not edit the plan.

Replace placeholders with the exact preview values:

```sh
npm run account:store-only --workspace @selfx/api -- --apply --plan /tmp/avinash-account-plan.json --confirm-plan PLAN_HASH --user-id TARGET_USER_UUID --store-id STORE_UUID --backup /tmp/avinash-account-before.json
```

After checking state/environment and saving the original role manifest, it
atomically:

- revokes all active static/custom **platform** roles for the target only;
- revokes its refresh sessions and ends impersonation sessions it started;
- audits `MAINTENANCE_STORE_ONLY_ACCOUNT` with the selected remaining Superadmin,
  target user ID, source, reviewed hash and original role manifest.

Store ownership, other memberships, Store RBAC/grants, password, catalog, stock,
orders, billing/subscription and the other Superadmin remain unchanged.

Backup failures prevent mutations; transactional failures roll back all changes.
State changes after preview require a fresh preview. Repeating a successful plan
returns ALREADY_APPLIED without revoking new sessions. If platform roles were
assigned again, it stops for review. The before-manifest supports reviewed recovery;
there is no automatic rollback that could overwrite later authorization edits.

## 4. Sign in and verify

Sign out of the target account and close its old tabs. Open `/login` without an
old `?next=` platform destination and sign in as `avinashnaidu9989@gmail.com`.
The shared dashboard should resolve Store context. Open Avinash Store Products
and verify the migrated garments/jewellery and images. Product visibility still
depends on existing Store permissions and plan features; the tool expands neither.

Verify platform Store lists, platform role management and platform catalog
mutations are denied to this user. Verify `super-admin@selfx.local` still opens
platform administration. Copy both private artifacts off the container.

Refresh-session revocation prevents renewal but does not erase issued access JWTs.
Those short-lived tokens can remain usable until expiry; protected requests read
current platform assignments, so the removed platform authority is denied on
subsequent authorization checks. Browser navigation can stay stale until logout
or refresh. In-flight requests already authorized can complete; use the quiet
period above. Deploying this command alone never mutates production accounts.
