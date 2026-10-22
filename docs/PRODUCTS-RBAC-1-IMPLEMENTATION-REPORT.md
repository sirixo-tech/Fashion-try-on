# PRODUCTS-RBAC-1 — Product controls follow effective permissions

Implemented locally on 21 October 2026.

## Behavior

Store Admin and Store Staff already include `products.manage` in the approved
initial role maps. Database-backed tests now explicitly verify both defaults and
revocation across existing and newly created Stores. Saved global role maps are
preserved; onboarding and permission reads do not restore a removed grant.

Without effective product management permission, the catalog hides Add, Edit,
Delete, Sync to Kiosks and imported-product eligibility actions. Garment/jewellery
type and product status appear as text/badges rather than disabled controls.
Authorized viewers retain the catalog and **View Stock & Pricing**, which opens
stock quantities, options, effective prices and tax information as a read-only
table. Editing inputs, option actions, reason fields and Save are absent.

Managers retain existing product and stock editors. Controls may still be
temporarily disabled during saves, conflicts or other ongoing actions. A refreshed
permission denial dismisses editing dialogs. A server 403 on a mutation hides
stale editing actions; stock dialogs switch to view-only presentation when their
management permission changes.

The existing catalog read permission is `stores.view`; this change does not
introduce a separate `products.view` permission or infer authority from role names.
Backend `products.manage` guards already protect product creation, edits,
deletion, image uploads, imported eligibility, catalog sync and stock writes.
These guards remain in place and are covered by regression tests.

## Verification

- 61 focused backend tests passed, including 19 database-backed Store RBAC tests
  and the product/stock resource authorization checks.
- All 359 web tests passed across 49 files. New cases cover hidden garment and
  jewellery actions, permission refresh/regrant, denied writes and read-only stock.
- API TypeScript checking and changed-file ESLint passed.
- Production web build passed, including frontend type checking. Four existing
  image-element warnings remain in unchanged share/Shopify pages.
- Formatting and `git diff --check` passed.

Backend role tests used disposable local PostgreSQL and restored the shared role
maps after each test. No production database or live AI/payment service was used.

## Deployment and existing role configuration

This slice changes web behavior and tests; it needs no migration or new APK.
Redeploy web alongside the pending API/privacy/Store billing changes when shipping
the current workspace together.

An existing saved role map that lacks `products.manage` remains view-only after
deployment. Authorized Platform administrators can deliberately restore that grant
in User Management > Roles. This implementation does not silently overwrite an
earlier revocation or reset global role permissions.

Changes have not been committed or deployed to Railway by this task.
