# CATALOG-STORE-1 — Products in the Store workspace

Follow-up: KIOSK-STORE-1 now also removes platform support/impersonation bypass
for products and kiosks. Such operations require actual active Store membership
and permission. See [the follow-up report](KIOSK-STORE-1-IMPLEMENTATION-REPORT.md).

Products now uses each Store's existing catalog and stock services. The former
platform testing catalog and its runtime administration are retired.

## What changed

- Store users see **Products -> Garments / Jewellery** based on Store viewing
  permission. The menu remains available when there are no products, allowing
  authorized Admin/Staff to add the first one. Editing requires products.manage.
- The current authenticated Store determines which products appear. Existing
  migrated products are read from their destination Store. Products belong to
  the Store; user accounts gain access through memberships and roles.
- Both sidebar destinations and explicit Store product pages share one component
  and the same backend. Search, pagination, stock, product editing, uploads and
  imported-product controls remain available. Merchant back navigation opens
  Dashboard. Impersonation changes refresh the target Store context.
- The page no longer calls the platform-only settings endpoint. The authorized
  Store product response supplies the safe default currency.
- Platform mode no longer shows Products. The old platform catalog controller,
  service, DTOs and frontend API client are removed. Its product CRUD, image-upload
  and sync routes no longer exist. Authorized support through an explicit Store
  detail or controlled impersonation remains available.
- PLATFORM_PRODUCTS_VIEW and PLATFORM_PRODUCTS_MANAGE are retired from the active
  registry, effective authority, role/permission responses and assignment checks.
  Historic database rows do not grant working catalog authority.
- Kiosk catalog lists, categories, revisions, snapshots and direct product-based
  Try-On/capture-requirement lookups use only the assigned Store. Empty Stores,
  missing jewellery, disabled products and unassigned kiosks never receive legacy
  platform products. Store sync targets only kiosks assigned to that Store.

## Data and rollout

No new migration or environment variable is needed. No product, stock, order,
billing or account data is deleted or reassigned. Existing platform-owned rows
are retained but cannot appear as fallback products. The explicit catalog transfer
CLI remains available for any remaining migration and now checks platform
access-control and Store-update authority rather than retired product permission.

Deploy the API and web together. Sign in as Store Admin and open Products to
verify the migrated items and stock. Verify platform mode has no Products menu.
Refresh assigned kiosk catalogs online (or allow their normal five-minute
refresh) to replace old fallback snapshots. Previously cached offline kiosk data
cannot be changed by a server deployment until the device connects and refreshes;
the API immediately rejects unavailable or cross-Store product ids.

No APK update is required for the Store-only API response. No production data
mutation or deployment is performed while implementing this change.

## Verification

Verification uses disposable localhost PostgreSQL and mocked web API responses,
with no production database, image download, email or payment-provider operation.
Coverage includes actual platform/Store/empty-Store fixtures, both product
verticals, direct Try-On and jewellery lookups, category/snapshot/revision
isolation, historic permission rows, assignment rejection, migrated product
display, empty catalogs, read-only controls, sidebar routes, impersonation refresh,
stock operations and the retained transfer tool.

All 64 targeted backend tests and 35 web tests pass. API/web typechecks,
changed-file lint and the production web build pass. The build retains existing
image-optimization warnings in unrelated public share and Shopify Try-On pages.
The backend suites use real local PostgreSQL for catalog,
RBAC, stock and transfer behavior; UI tests exercise the shared catalog with
Store-scoped responses. A deployed browser/kiosk walkthrough remains a rollout
check.
