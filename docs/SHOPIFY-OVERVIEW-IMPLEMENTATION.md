# Shopify overview and Store detail alignment

Implemented 2026-10-25 at the user's request.

## Result

- Shopify now matches WooCommerce's overview/detail layout: summary cards, Store/domain search, connection filters, server pagination, desktop table and mobile Store cards.
- View details opens the Store's Shopify connection with its readable domain, imported parent-product count, successful Shopify Try-Ons during the last 30 days and completed full-sync receipt.
- Store details retain Connect/Reconnect Shopify, the domain/OAuth dialog, Sync Catalog, callback recovery notices and confirmed disconnect. The setup card links to the validated Shopify admin domain.
- Plan/allowance information remains separate from channel-specific generation counts. Credit diagnostics are collapsed. Optional Store/credit reads cannot block authorized integration viewing.
- Shopify and WooCommerce share authenticated scope/navigation and overview orchestration. Their setup and management actions remain separate. The old duplicate integration layout was removed.

## Contracts

The additive `GET /api/v1/admin/integrations/shopify/overview` uses the same read-only monitoring service and validated query contract as WooCommerce. Unscoped access requires Platform integration authority. Store-specific requests require the existing server-side Store integration permission. No STORES_VIEW permission is needed to view the basic overview.

Integration and successful-generation queries are filtered to SHOPIFY. Successful counts come from durable BillableGeneration records, independently of credits consumed or billing mode. Product counts exclude variant mappings, archived mappings and inactive products. Only existing COMPLETED Shopify sync metadata can provide a completed-sync date; failed attempts remain unknown. Normalized myshopify.com domains are returned instead of opaque Shop GIDs. Arbitrary metadata, tokens and credentials are not exposed.

OAuth and sync UI actions require integration management and the existing Store product-management authority, matching their APIs. Disconnect retains confirmation and existing server billing protection. Merchants cannot change Store scope through URL parameters. Permission changes/navigation invalidate old detail state and late results. Shopify billing, ownership, OAuth scopes, sync execution, embedded app, storefront and checkout behavior were not changed.

## Verification

- API unit tests: **41 passed** across the shared monitoring logic, domain handling, authorization and existing integration behavior.
- Disposable PostgreSQL catalog/monitoring tests: **11 passed**, including Shopify/WooCommerce separation, variant exclusion, Store isolation, receipt status and durable usage windows. The test cluster was stopped afterward.
- Frontend tests: **30 passed**, covering Shopify and WooCommerce overview/details, viewer controls, Store scoping, permission changes, filters/pagination, OAuth callbacks, sync refresh, disconnect confirmation, protected billing errors, late results and WooCommerce secrets.
- API/web TypeScript checks, changed-source ESLint and `git diff --check` passed.
- A production web build passed in the isolated review mirror under `tmp/woocommerce-web-review`, avoiding the shared development cache. Existing unrelated image/cache warnings remain.
- Actual built-page Chrome checks used synthetic intercepted authentication/API responses. Shopify search/filter/detail navigation, same-Store OAuth payload/redirect, sync refresh, billing-error display, callback notice and read-only viewer behavior passed. WooCommerce browser regression checks passed. Desktop/mobile/light/dark screenshots were reviewed. Both overview and detail measured 390px document width at a 390px viewport, with no browser errors or unexpected network requests.

Shopify review screenshots and `result.json` are under `tmp/shopify-review/`; WooCommerce regression artifacts remain under `tmp/woocommerce-review/`. Preview data and actions are synthetic, and no production Shopify or payment request was made.

## Rollout

Deploy the API and web app together for the new Shopify monitoring endpoint and layout. No migration, plugin package update, Shopify app configuration change or new OAuth scope is required. Production deployment was not performed.
