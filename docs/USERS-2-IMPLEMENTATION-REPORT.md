# USERS-2 — User deletion, Store deletion and five roles

Implemented locally on 18 October 2026. Production accounts and Stores have not
been changed or deleted by this work.

## What changed

Navigation now says **User Management**, with **Users**, **Roles** and
**Permissions**. The account directory keeps the actual login email separate
from Store contact details. Its edit popup remains a single modal.

There are five business roles:

| Role | Purpose |
| --- | --- |
| Platform Superadmin | Protected platform authority, account deletion and permanent Store deletion |
| Platform Admin | Existing broad platform operations, subject to Superadmin-only restrictions |
| Platform Staff | Existing support operations; permissions remain centrally controlled |
| Store Admin | Store administration within the Store's permission ceiling |
| Staff | Products/stock, kiosk configuration/update, analytics and garment preview; no user/role or payment-settings administration |

Store Owner/Admin now appear as Store Admin. Manager/Staff now appear as Staff.
Old role enum values remain internally so existing records, integrations and
audit references remain compatible. Custom roles are retired during migration;
new custom-role creation is rejected. Demo-login choices use the simplified roles.
Protected Superadmin editing/removal remains unavailable.

Product and stock editing now use `products.manage`. This prevents Staff needing
the broader `stores.update` permission, which also controls Store settings.

## What Delete user does

Superadmin opens Users, selects Delete and types the account's login email.
The backend checks current Superadmin authority and a fresh account version.

| Account situation | Result |
| --- | --- |
| Has any Store membership, including an archived/revoked link | Soft deletion: retain identity, disable login and mark memberships deleted |
| Has no Store memberships | Permanently remove the login account; retain historical identity snapshots |
| Protected Superadmin or the administrator's own account | Reject deletion |
| Final active Store Admin | Reject until another active Store Admin exists |

Soft-deleted accounts keep their original name and email. The Deleted users
filter shows **Name (Deleted user)** and the email. There is no restore action;
the retained login email remains reserved while that account exists. Editing,
reactivation, role assignment and first-admin repair cannot restore a deleted
account or membership. Sessions/reset tokens are removed and the credentials
version changes so old access tokens stop working.

Permanently deleted accounts leave the live user table. **Deletion history**
shows their retained name/email snapshots. Historical actor/creator references
that need to survive account deletion become nullable and receive snapshots.
Snapshots never contain passwords, tokens or provider secrets.

## What a Store Admin can remove

The Store Staff page has the same email-confirmation dialog. Store Admin may
remove Staff within that Store, subject to the current permission ceiling.
The backend checks the actor and permission again inside the transaction.
Store Admin cannot use this action to remove another Store Admin, a protected
Superadmin, themselves or a user in another Store.

For example, if a staff account belongs to Avinash stores and another Store,
removing it from Avinash stores deletes that membership only. Its other Store
access stays valid. If it has no remaining undeleted Store links and no platform
identity, the account itself is soft deleted as well.

## Archive versus permanent Store deletion

The old Delete Store action was an archive. It is now labelled **Archive Store**.
An **Archived** status filter makes archived tenants available for inspection
and permanent deletion. Archiving retains Store business records.

Superadmin also sees **Delete permanently**. Its popup requires the exact Store
name and explains that the action cannot be undone. A fresh Store timestamp is
required so stale confirmations fail safely.

Permanent deletion removes the Store's products, variants/stock, carts/orders and
payment records, subscription/PAYG billing records, integration/API resources,
Try-On resources, memberships and other owned business data. It also permanently
removes accounts exclusive to that Store, including accounts previously soft
deleted. Shared accounts with any other Store link and platform identities survive.

Physical kiosk devices remain in the platform fleet. Their sessions are revoked,
their Store configuration is cleared, and they become revoked/unassigned. They
must be deliberately reassigned/provisioned before reuse.

Existing audit events retain Store identity after their tenant FK becomes null.
A purge event records the Store, affected resource counts and associated user
snapshots. Preserved shared/platform users are labelled **Store link removed**,
so history does not falsely claim their global account was deleted.

The database deletion is atomic. An unexpected dependency or cross-Store
reference causes rollback. Only actual FK dependency cycles are broken; required
financial provenance links remain intact until their rows are deleted.

Object-storage cleanup is queued in the same transaction and retried by the API
every 30 seconds, with failed objects delayed five minutes. The queue survives
restarts. Files still referenced by another catalog, asset, configuration or upload
record are preserved. The database response does not wait for physical file deletion.

## Database and APIs

Two new migrations are required:

1. `20261018000000_user_deletion`: deleted timestamps, deletion-state checks,
   safe historical identity snapshots/nullable FKs, and the object cleanup queue.
2. `20261018010000_five_roles`: role consolidation and product permission backfill.

Legacy owner/admin links map to Store Admin; manager/staff/viewer/custom links
map to Staff, while an existing Store Admin assignment stays administrative.
Custom Platform roles map to Platform Staff. Old custom definitions are retired.
Reserved role-name collisions are handled before canonical names are restored.
Stores receive `products.manage` automatically only if they already held
`stores.update`; other Store ceilings are preserved.

New routes:

- `DELETE /api/v1/admin/users/:userId`
- `GET /api/v1/admin/users/deletion-history`
- `DELETE /api/v1/admin/stores/:storeId/users/:membershipId`
- `DELETE /api/v1/admin/stores/:storeId/permanent`

User and Store-user lists accept `deleted=active|only|all`. The controlled
first-admin repair retains the existing `first-store-owner` API path for
compatibility. No new deployment environment variable is required.

## Verification

- Targeted API suites: user editing, deletion, fixed-role authorization, Store
  administration and stock permissions. The original combined run passed 85
  tests; after adding the in-transaction permission regression, all 15 deletion
  cases passed separately (86 distinct targeted API cases overall).
- Users and Store-directory UI suites: 17 tests passed, including confirmation,
  failure feedback, protected/deleted rows, archiving and permanent-delete controls.
- API and web TypeScript checks passed; Prisma schema validation passed.
- All 58 migrations applied to an empty disposable local PostgreSQL database.
- A separate legacy-data fixture verified owner/manager/custom-role conversion,
  canonical-name collisions and the product permission grant backfill.
- Changed-file lint has no errors. Two existing Next.js image-element warnings
  remain in the product page; that page's only functional change is its permission.

All database tests used disposable localhost databases. SMTP, payment-provider
calls, production data and production object storage were not used. UI behavior
was tested with component tests; a deployed browser walkthrough remains a rollout
check. The entire repository test suite was not run.

## What to do after pushing

1. Take a production database backup and review existing custom-role assignments:
   consolidation intentionally replaces those roles with Staff.
2. Apply the two migrations using the existing production migration process
   (`npm run db:migrate:deploy`) against the API's intended database. Never use
   the test reset command in production.
3. Deploy the API and web from the same revision after migration. Existing object
   storage credentials support cleanup; there is no new secret to configure.
4. Sign in using the retained Superadmin. Check User Management -> Users/ Roles,
   account details and Store memberships before trying any deletion.
5. Use a disposable Store/staff account to verify deletion and login rejection.
   Check a shared account still works in its other Store, and verify Staff can
   edit stock but cannot manage users or payment settings.
6. For a disposable archived Store, confirm its name, permanently delete it and
   check retained audit history, revoked kiosks and completed object cleanup.

Permanent deletion deliberately removes order and billing records as approved;
the retained audit snapshots are not a replacement invoice/order archive. It does
not initiate provider refunds, cancel an external merchant account or delete an
external Shopify catalog. No new product decision is required before deploying
this milestone. The next useful check is the disposable Store walkthrough above.
