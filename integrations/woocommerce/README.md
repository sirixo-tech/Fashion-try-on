# SelfX WooCommerce Integration Boundary

Reserved directory for the future WooCommerce/WordPress plugin.

INTEGRATIONS-1 adds the shared SelfX backend/dashboard integration registry and
plugin credential foundation. A WooCommerce plugin can authenticate to SelfX
with `x-selfx-integration-token` or `Authorization: Bearer` and call
`GET /api/v1/integrations/me` to confirm the connected Store context.

The shared SelfX API now accepts one-way normalized catalog snapshots at
`POST /api/v1/integrations/catalog/sync` with the `catalog:sync` scope.
WooCommerce remains the source of truth. This API updates only SelfX's Try-On
reference data, preserves SelfX-owned VTO settings and cannot write products,
inventory, prices, orders, customers, checkout or configuration back to
WooCommerce.

This directory still does not initialize WordPress plugin tooling, send catalog
snapshots, handle WooCommerce webhooks or add storefront Try-On UI.
