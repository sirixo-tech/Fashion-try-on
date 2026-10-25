# WooCommerce overview and Store detail redesign

Implemented 2026-10-25 at the user's request.

## Result

- Platform integration administrators open a searchable, paginated overview of WooCommerce Stores, with connection-health filters, aggregate counts and View details.
- Each Store row shows its website, connection health, active imported parent products, last completed full catalog sync and successful WooCommerce Try-Ons during the last 30 days.
- Store details use a compact connection summary and three-step plugin setup card. Manual tokens are under a collapsed Advanced connection section; disconnect remains separately confirmed.
- Merchants resolve their own authorized Store. URL parameters cannot change their Store. Platform integration viewers do not need STORES_VIEW, and viewers see no mutation controls.
- Mobile shows Store cards; desktop shows a table. Both use the existing public `@selfx/ui` components and light/dark themes.

## Data and authorization

`GET /api/v1/admin/integrations/woocommerce/overview` requires Platform INTEGRATIONS_VIEW or INTEGRATIONS_MANAGE for global queries. A Store-specific query uses the existing server-side Store integration authorization. Input is validated, pagination is bounded and summary counts cover the entire matching result rather than the current page.

Successful usage comes from durable BillableGeneration records filtered to the WOOCOMMERCE channel and the last 30 days. Credit-ledger consumption, other channels and older results are excluded. This makes the count independent of prepaid versus pay-as-you-go billing. Product counts exclude variation mappings, archived mappings and inactive products. Overview responses contain no credentials or arbitrary integration metadata.

The catalog transaction now saves `lastCatalogSyncAt` only after successful WooCommerce full-scan finalization. Partial scans, incremental updates and failures do not advance it. Existing metadata is preserved. Connections without a receipt show **Not recorded yet** until their next completed full sync. Connection health checks SelfX Store/connection/token state; WordPress remains responsible for its local progress and retry details.

Permission/impersonation changes and navigation discard prior detail state. Token secrets are shown once, cleared on collapse or permission loss, and never saved in browser storage. Credential changes refresh server-derived health without closing the newly generated secret.

## Validation

- API unit tests: 69 passed across overview, controller authorization, existing integration behavior and catalog synchronization.
- Disposable PostgreSQL WooCommerce catalog/overview tests: 10 passed, including Store isolation, channel/date filters, full-sync receipts and expired credentials. The test cluster was stopped afterward.
- Frontend tests: 18 passed, including overview/detail navigation, read-only access, merchant URL scoping, filters/pagination, permission changes, stale responses and token handling. Existing Shopify OAuth regression coverage passed.
- API, web and shared UI TypeScript checks passed. Changed-source ESLint and `git diff --check` passed.
- Next production build passed in an isolated source mirror under `tmp/woocommerce-web-review` after a shared local `.next` cache conflict. Existing unrelated image warnings remain.
- Actual built-page Chrome checks used synthetic intercepted authentication/API responses. Desktop, mobile and dark-theme screenshots were reviewed. Search, health filtering, details, confirmation dialogs and one-time secrets passed with no browser errors or unexpected network requests. Overview and detail document widths both measured 390px in a 390px viewport.

Local review artifacts are under `tmp/woocommerce-review/`, including `overview-desktop.png`, `detail-desktop.png`, mobile screenshots and `result.json`.

## Rollout

Deploy the API and web application together. No database migration or plugin package change is required. The existing plugin's full-sync finalization records the new receipt after the API update. Production deployment and real Store mutations were not performed.
