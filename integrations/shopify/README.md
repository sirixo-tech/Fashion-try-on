# SelfX Shopify Read-Only Connector

This package reads Shopify catalog data, normalizes it into the shared SelfX
catalog contract and sends it to `POST /api/v1/integrations/catalog/sync`.
Shopify remains the source of truth. The connector contains GraphQL queries only
and does not edit Shopify products, variants, inventory, prices, orders,
customers, checkout or configuration.

## Current Scope

- reads every Shopify product and variant with cursor pagination;
- requests product-read access, theme-read access for block detection and
  app-proxy configuration access only;
- maps Shopify product state, media, URL, price and variant data to SelfX;
- submits bounded batches so stores with large catalogs do not require one huge
  request;
- finalizes a full snapshot only after all Shopify pages reach SelfX, so an
  interrupted import cannot incorrectly archive unseen products;
- preserves SelfX-owned VTO eligibility and garment configuration;
- verifies Shopify webhook HMACs against the exact raw request body;
- incrementally imports product creates/updates and archives deleted products;
- deduplicates webhook retries by Shopify webhook ID;
- disconnects the integration, revokes credentials and archives its local
  catalog references when the Shopify app is uninstalled;
- provides a backend protocol for securely linking an authenticated Shopify
  shop to one active SelfX Store;
- includes a Theme App Extension block as the initial storefront surface;
- prints a safe sync report without access tokens.

## Run A Full Catalog Sync

1. Create a Shopify integration for the SelfX Store and generate a SelfX
   integration token with the `catalog:sync` scope.
2. Provide a server-side Shopify Admin API token that can read products.
3. Set the variables shown in `.env.example` in the process environment.
4. From the repository root, run `npm run shopify:sync:catalog`.

The CLI reads environment variables from the running process; it does not load
or persist a local `.env` file. Tokens must stay on the server and must never be
placed in storefront JavaScript.

## App Storage

The managed Shopify app stores Shopify sessions and SelfX Store approvals in
PostgreSQL through Prisma. Set `DATABASE_URL` to a durable database URL. In
production, use the Shopify integration schema in the shared database:

```text
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=shopify_app
```

## Managed App Store Linking

The preferred app flow does not ask a merchant to create or paste a SelfX API
key. After Shopify authenticates the shop, the Shopify app server:

1. calls `POST /api/v1/integrations/shopify/link-sessions` with the canonical
   shop domain and Shopify Shop GID;
2. sends the merchant to the returned SelfX approval URL;
3. waits for the merchant to sign in and approve an active SelfX Store;
4. calls `POST /api/v1/integrations/shopify/link-sessions/{token}/redeem`;
5. encrypts the returned `catalog:sync` integration token in the Shopify app's
   server-side storage.

The create and redeem calls require the server-only
`SELFX_SHOPIFY_APP_SERVICE_TOKEN`. Link sessions expire after ten minutes, are
stored as hashes in SelfX and can be redeemed only once. A Shopify account can
be linked to only one SelfX Store.

The embedded Shopify app now creates the session, opens the SelfX approval page,
checks approval automatically, stores the redeemed credential encrypted in its
server-side database and starts the first full catalog sync. It also reports the
latest import totals and supports a manual read-only resync.

Configure these values on the Shopify app server:

- `SELFX_API_BASE_URL`
- `SELFX_WEB_BASE_URL`
- `SELFX_STOREFRONT_TRYON_URL`
- `SELFX_SHOPIFY_APP_SERVICE_TOKEN` (the same value configured on SelfX API)
- `SELFX_SHOPIFY_CREDENTIAL_ENCRYPTION_KEY` (a separate Base64-encoded 32-byte key)
- `SELFX_SHOPIFY_CREDENTIAL_ENCRYPTION_KEY_VERSION`
- `SHOPIFY_API_VERSION`
- `SCOPES=read_products,read_themes,write_app_proxy`

Order reads are intentionally not requested until SelfX implements Shopify
Try-On sales attribution analytics.

The storefront theme app block launches through the Shopify App Proxy at
`/apps/selfx-tryon/launch`. The proxy route verifies Shopify's signed request,
checks the stored SelfX connection and redirects connected stores to
`SELFX_STOREFRONT_TRYON_URL` with Shopify product context. The embedded app
checks the published theme's `templates/product.json` file for the
`selfx_try_it_on` app block so merchants can see whether the storefront block is
installed.

## Direct Dashboard OAuth

The SelfX dashboard now starts Shopify's authorization-code flow with only the
`read_products` scope. The callback validates Shopify's HMAC, consumes a
single-use ten-minute state, requests expiring offline credentials and stores
the access/refresh token payload encrypted with AES-256-GCM. The first catalog
sync runs automatically. Later manual syncs refresh the rotating offline token
before it expires.

Configure `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`,
`SELFX_INTEGRATION_ENCRYPTION_KEY`, `SELFX_INTEGRATION_ENCRYPTION_KEY_VERSION`,
`SELFX_API_BASE_URL` and `SELFX_WEB_BASE_URL` on the API server. Register this
exact callback in Shopify:

`{SELFX_API_BASE_URL}/api/v1/admin/integrations/shopify/oauth/callback`

## Product Webhooks

Use `shopify.app.toml.example` as the deployment template and replace its
example domains and client ID. It subscribes to `products/create`,
`products/update`, `products/delete` and `app/uninstalled`, delivered to:

`{SELFX_API_BASE_URL}/api/v1/integrations/shopify/webhooks`

Shopify privacy webhooks use the Shopify app route `/webhooks/privacy` as the
public ingress. The app authenticates Shopify's request, preserves the exact
request bytes, and forwards only the signed Shopify webhook headers to the
central endpoint above. The central API verifies the Shopify HMAC again and is
the authority for durable deduplication and privacy processing. Compliance
subscriptions are activated only after all privacy handlers are deployed.
`customers/data_request` and `customers/redact` retain no customer payload.
`shop/redact` first purges Shopify-owned data in the central API and then
deletes the Shopify app's local sessions and SelfX connection row. Failures
return a retryable status. The SelfX Store, memberships, plan, kiosks and
aggregate usage remain independent of the deleted Shopify connection.

Create/update notifications cause SelfX to read the complete current product
through Shopify's GraphQL Admin API before normalization. This avoids treating
Shopify webhook payload limits as a complete variant snapshot. Webhook-triggered
reads have a strict timeout so SelfX can return an error within Shopify's
delivery window and let Shopify retry. The endpoint never writes to Shopify.

## Anonymous visitor limits

Shopify's app proxy strips cookies and follows server redirects. The launch
route therefore returns a no-store browser-navigation page (with a fallback
link) that opens SelfX directly. SelfX establishes an anonymous HttpOnly cookie
on its own web origin through `/try-on/commerce/visitor`, then binds that
capability once. Shopify launch visitor tokens are ignored. Returning to another
product in the same Store retains the limit; another Store has independent
usage. No login is required. Clearing cookies, private browsing and other
devices can reset anonymous identity.

Quota admission rechecks limits and request idempotency under a Store-scoped
PostgreSQL lock. Credit debit and run insertion commit together; duplicate
requests execute once. Button clicks/session creation do not consume a slot.

Deploy the API, SelfX web and Shopify app server together, applying migration
`20261025000000_storefront_first_party_visitor` before the new API. The web
server needs its existing `SELFX_API_UPSTREAM_URL` or explicit public API URL
to reach the API. Keep web/API production runtime modes consistent. Previously
issued Shopify sessions with runs require a fresh launch for further generation.
Verify repeat launches, independent Stores and limits through a real Shopify
proxy before rollout. No app scopes or theme extension configuration changed.

## Catalog recovery and connection controls

Server schedulers check bounded batches every minute and reconcile approximately every six hours, without an open merchant browser. Failed full scans resume their acknowledged cursor/snapshot and back off. Database leases protect competing workers; incomplete scans never finalize. OAuth connections recover in the SelfX API, embedded-app connections through offline Shopify sessions. Set `SHOPIFY_RECONCILIATION_ENABLED=false` to stop the corresponding scheduler.

The theme button begins hidden and checks the signed app proxy for product, mapping, Store, plan and available-credit eligibility. Temporary failures keep it hidden. Generation still validates current limits and credits. The embedded app supports confirmed disconnect and reconnect to the same approved SelfX Store. Native paid approvals must be cancelled before disconnect. There is no Change Store control. The standalone CLI token remains an operator/development path.

## Existing SelfX plans and Shopify approval

The embedded Plans panel offers active Shopify-compatible plans from the central SelfX catalog. It creates native Shopify 30-day subscriptions; usage plans also require a merchant-selected spending cap and show the successful-generation rate. Free Starter onboarding remains automatic. WooCommerce retains the existing SelfX payment flow.

Paid plan changes use `APPLY_ON_NEXT_BILLING_CYCLE`: the current plan and allowance continue until renewal, and a scheduled banner shows the next plan/date. Currency changes while an agreement is active are rejected because Shopify cannot defer them. Approved prices and entitlements are snapshotted; editing a central plan does not silently change an existing approval. Native API verification controls activation, renewals, cancellation, frozen states and deferred acceptance. Neither callback parameters nor webhook bodies grant entitlement.

For usage pricing, SelfX reserves the shared cap before admitting generation across included Store channels. Only a successful durable result creates a Shopify charge. Failed attempts release reservations; unique generation records and native idempotency keys make retries safe. No pre-approval history is charged to Shopify. Existing manual SelfX plan activation cannot replace a live Shopify subscription. Archiving/permanently deleting a Store also requires cancellation first. Uninstall/redaction stop paid access; privacy redaction erases Shopify identifiers while retaining Store-scoped financial amounts.

Configure **both** API and Shopify server with `SHOPIFY_BILLING_ENABLED=true` and matching `SHOPIFY_BILLING_TEST_MODE=true` for native test-store acceptance. The defaults keep billing disabled until deployment acceptance. After test approval, cancellation, renewal and usage checks, a separately authorized production rollout can use matching `SHOPIFY_BILLING_TEST_MODE=false`. Register the `app_subscriptions/update` subscription at `/webhooks/app_subscriptions_update` from the checked-in TOML. This integration uses Manual Pricing because the approved design includes merchant spending caps and existing plan currencies; [Shopify App Pricing currently lacks usage caps and sets plan prices in USD](https://shopify.dev/docs/apps/launch/billing/shopify-app-pricing#limitations). Verify the app's distribution/pricing configuration before launch and do not enable a conflicting pricing system.

## Deployment of these changes

Apply backend migrations `20261025000000_storefront_first_party_visitor`, `20261025010000_commerce_reconciliation` and `20261025020000_shopify_billing`, plus the app's `20261025010000_catalog_reconciliation` migration in its separate database/schema. Build API/web/app and deploy the theme extension together. `npm run build` and startup setup generate an isolated Shopify Prisma client at `node_modules/@selfx/shopify-prisma-client`, leaving the API's generated client intact. If deployment prunes generated modules, startup setup must regenerate it before loading the server bundle.

Native test charges, a real signed app-proxy browser flow, expired offline-token recovery and live renewal/webhook acceptance remain rollout checks. Local GraphQL/config validation and mocked provider tests do not certify a deployed Shopify installation. See `docs/COMMERCE-FOLLOWUPS-IMPLEMENTATION-REPORT.md` for implementation evidence.
