# SelfX Shopify Read-Only Connector

This package reads Shopify catalog data, normalizes it into the shared SelfX
catalog contract and sends it to `POST /api/v1/integrations/catalog/sync`.
Shopify remains the source of truth. The connector contains GraphQL queries only
and does not edit Shopify products, variants, inventory, prices, orders,
customers, checkout or configuration.

## Current Scope

- reads every Shopify product and variant with cursor pagination;
- requests product-read access only;
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

## Merchant Connection

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

Scheduled reconciliation, Theme App Extension and storefront Try-On UI are not
implemented yet. The standalone CLI environment token remains an
operator/development path independent of the dashboard OAuth connection.
