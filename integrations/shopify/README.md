# SelfX Shopify Read-Only Connector

This package reads Shopify catalog data, normalizes it into the shared SelfX
catalog contract and sends it to `POST /api/v1/integrations/catalog/sync`.
Shopify remains the source of truth. The connector contains GraphQL queries only
and does not edit Shopify products, variants, inventory, prices, orders,
customers, checkout or configuration.

## Current Scope

- reads every Shopify product and variant with cursor pagination;
- requests product-read access and app-proxy configuration access only;
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
- `SCOPES=read_products,write_app_proxy`

The storefront theme app block launches through the Shopify App Proxy at
`/apps/selfx-tryon/launch`. The proxy route verifies Shopify's signed request,
checks the stored SelfX connection and redirects connected stores to
`SELFX_STOREFRONT_TRYON_URL` with Shopify product context.

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

Create/update notifications cause SelfX to read the complete current product
through Shopify's GraphQL Admin API before normalization. This avoids treating
Shopify webhook payload limits as a complete variant snapshot. Webhook-triggered
reads have a strict timeout so SelfX can return an error within Shopify's
delivery window and let Shopify retry. The endpoint never writes to Shopify.

## Still Planned

Scheduled reconciliation, disconnection/relink UI and the complete storefront
Try-On runtime are not implemented yet. The Theme App Extension block now uses
the Shopify App Proxy launch bridge, but the customer-facing Try-On destination
is still owned by `SELFX_STOREFRONT_TRYON_URL`. The standalone CLI environment
token remains an operator/development path independent of the managed-app
connection.
