# KIOSK-STORE-1 — Store-owned kiosks and products

## Result

Products and kiosks are operated through Store accounts and Store permissions.
Platform Superadmin, Admin and Staff roles no longer grant access to these
resources. This completes the Store boundary started in CATALOG-STORE-1.

## What changed

- Removed platform Kiosks navigation, fleet administration routes, configuration
  controller and fleet catalog sync. Platform Store listings/dashboard no longer
  present product or kiosk operational controls/counters. Direct merchant routes
  remain blocked in platform mode.
- Retired historic platform product and KIOSKS_* permission codes from the active
  registry, authorization, assignment choices and role/permission responses.
  Existing database permission rows cannot restore this authority.
- Added a strict Store resource authorization path. Products, stock, uploads,
  catalog sync and kiosks require an actual active membership, active Store and
  role permission within the Store permission ceiling. Platform bypass and
  impersonation alone do not satisfy this check. A dual-access account must have
  actual Store membership; platform navigation still excludes merchant resources.
- Kept unrelated platform account, plan, user, billing and integration
  administration. Starting a Shopify install that imports products or requesting
  a manual Shopify catalog sync additionally requires Store products.manage and
  the Shopify plan feature.
- Store users open Kiosks to view their own devices. Store Admin can pair a new
  physical device with its six-digit code and name, unpair it, pair it again or
  remove its record. Staff retain their granted daily configuration and
  activate/deactivate operations, without gaining pairing/removal authority.
- Reused the full existing configuration screen with Store-scoped requests.
  Removed assignment selection. Renaming separately requires kiosks.update.
  Unauthorized and foreign-Store devices cannot be loaded or modified.
- Added Store-scoped lifecycle endpoints under
  /api/v1/admin/stores/:storeId/kiosks/:deviceId. Device ownership is checked
  inside lifecycle transactions. Removed id-only assignment between Stores.
- Pairing serializes access to an installation and refuses a second link while
  an existing non-deleted record owns it. Revoked records keep their Store
  ownership; use Pair again on that record. Failed pairing leaves the physical
  code unclaimed. Removing the record permits a later fresh pairing.
- Retained device authentication, heartbeat, provisioning, session revocation,
  runtime configuration and the Android/Windows device protocol.
- Preserved the shared Store Products screens from CATALOG-STORE-1. Empty
  catalogs and empty kiosk lists still have permitted navigation. Products use
  Store viewing permission; editing uses products.manage. Kiosk navigation also
  follows the existing plan feature rules.

## Data and deployment

No schema migration or new environment variable is required. No production
database operation, account change, device move or deployment was performed.
No existing products, stock, orders, subscriptions or devices are deleted by
deployment. Historic platform rows remain stored without platform management UI.

Deploy the API and web together. The removed /admin/kiosks and /admin/catalog
routes are intentionally unavailable; the updated web uses Store-scoped routes.
No APK update is needed for this dashboard/API change.

Recommended rollout check:

1. Sign in as a Store Admin with an active Store plan and permission grants.
2. Confirm Products shows that Store's migrated items and Kiosks shows only its
   devices. An empty list should still allow the authorized first addition.
3. Enter a physical kiosk's six-digit pairing code in the Store account. Confirm
   provisioning, heartbeat, configuration and Store catalog refresh on hardware.
4. Exercise Staff configuration access and Admin unpair/Pair again. Confirm a
   different Store cannot load or claim that device.
5. Sign in with a platform-only account. Confirm Products/Kiosks menus and Store
   resource controls are absent, including after starting impersonation.

If any production kiosks still use historical platform assignment, first
identify their intended Store and plan a separate explicit migration. This
change does not guess their owner or move them. Refresh existing kiosk catalogs
online to replace previously cached platform fallback data; offline caches
cannot be updated until devices reconnect.

## Verification

152 focused backend tests and 52 web tests passed. Backend coverage includes
real disposable localhost PostgreSQL checks for Store catalog/stock isolation,
historic platform permissions, strict Store RBAC, foreign-Store lifecycle denial,
duplicate installation claims, session revocation and re-pairing, plus Users and
Store/user deletion regressions. Controller tests check authorization before
resource service calls and platform denial of Shopify catalog operations.

Web coverage includes Store pairing, lifecycle controls, configuration/name
permissions, product displays, empty navigation, platform route denial and
Store-detail resource hiding. These are component tests with mocked responses;
a deployed browser and physical-device walkthrough remains a rollout check.

API/web typechecks, changed-file lint and API/web production builds are also
checked. Existing Next.js image optimization warnings in unrelated public share
and Shopify Try-On pages do not prevent the build. No email, payment-provider
request or customer-image upload was used for validation.
