# Shopify review recovery — 2026-11-26

Implemented source fixes for review issues 2 (billing after reinstall) and 3 (unavailable customer Try-On). Local migrations have been applied. Live Shopify review acceptance remains unverified.

## Resulting behavior

- Uninstall revokes authorization and Shopify billing, archives catalog products, and retains the non-secret approved Store binding. Reconnect still requires fresh Shopify authentication and explicit SelfX approval. Delayed uninstall events cannot revoke a newer connection.
- Reinstallation recovers the same Store even if app-local connection state is missing. No extra Starter trial is issued. Inactive Stores and privacy-redacted ownership are not recovered by the data migration.
- Concurrent approval polling claims completion once. Interrupted completion offers reconnection rather than overwriting a successful connection.
- Plans waits for verified Store connection before private credit/billing queries. It shows approval/reconnect actions separately from retryable billing errors.
- If a previous subscription is no longer readable, retirement requires successful current-installation verification. Network errors or evidence that the subscription remains active block retirement. A retired agreement cannot cancel its replacement.
- Unpaid usage from terminal native agreements remains stored as REVIEW_REQUIRED; it is not charged against a replacement agreement.
- Catalog freshness is reset on uninstall so unchanged products can import again. Existing product classification and entitlement rules remain enforced.
- The theme button rechecks availability on return to the page and section loading. The signed proxy launch checks availability again before creating a customer session.

## Local database

The configured database is PostgreSQL at `localhost:5433/selfx`.

- Backed up the whole database before migration to `tmp/db-backups/selfx-before-shopify-recovery-1795690137215.dump` (ignored local artifact; contains local data).
- Applied all 33 pending central migrations, from `20261024000000_woocommerce_plugin_link_sessions` through `20261126020000_shopify_reinstall_recovery`. Central `public` schema now reports all 104 migrations applied.
- Configured the ignored `integrations/shopify/.env` DATABASE_URL to use the same local database with the separate `shopify_app` schema. It previously had no database URL or app tables.
- Applied all seven Shopify app migrations. Both migration status checks report up to date.
- No database reset, production migration, real payment, or Shopify deployment was performed.

## New files

- `backend/database/prisma/migrations/20261126020000_shopify_reinstall_recovery/migration.sql`
- `backend/api/src/integrations/shopify-reinstall-recovery.integration.spec.ts`
- `integrations/shopify/app/routes/webhooks.app.uninstalled.spec.ts`
- `integrations/shopify/app/routes/apps.selfx-tryon.launch.spec.ts`
- This report.

## Edited modules

- Backend catalog sync, Shopify webhooks, linking, billing service/controller, and related tests.
- Shopify embedded Plans loader/UI, billing reconciliation, connection completion, private plan data loading, uninstall route, signed storefront launch, theme block, route discovery, and related tests.
- Six approved requirements documents with the recovery behavior and verification boundary.
- Ignored local Shopify environment file for its database connection; do not upload local environment files or database backups.

## Validation

- 305 backend/Shopify regression tests across 45 suites passed, including real PostgreSQL recovery and billing tests. Used the isolated `127.0.0.1:55472/woocommerce_catalog_test` database, four workers and a 20-second test timeout. The existing Store purge test exceeded the default five-second timeout during a fully parallel run; it passed with the longer timeout.
- 11 WooCommerce catalog integration regressions passed from the API workspace with the installed PHP executable. One Shopify route discovery test passed from the Shopify workspace, confirming test files are not exposed as routes. Total: 317 passing tests across 47 suites.
- API and Shopify TypeScript checks passed. Shopify production build and both Prisma client generations succeeded.
- ESLint passed for changed backend modules/tests and Shopify source modules. `git diff --check` passed.
- Shopify AI Toolkit validated the new current-installation GraphQL query against Admin API 2026-07.
- Both actual local database migration status checks passed after deployment. `pg_restore --list` successfully read the pre-migration backup.

## Deployment and review proof

Deploy the API with the new central migration, deploy the matched Shopify server, and release the updated theme extension. Other environments need their own migration run. WooCommerce and mobile artifacts were not changed by this recovery work.

Check matching server-side Shopify service credentials, encryption configuration and `SHOPIFY_BILLING_ENABLED` in the deployed API and app. Keep test-mode settings consistent with the review/test Store. This work did not enable public billing or alter production environment values.

Before marking the review items resolved, use the review Store to reinstall, approve the same SelfX Store, import an eligible product, accept and decline Shopify plan changes, verify charge history, and complete a consented customer Try-On. Record that working flow for proof of resolution. Source tests do not establish live billing configuration or provider availability.

## Follow-up: billing approval redirect displayed as Unauthorized

The deployed Choose plan request returned HTTP 401 after Shopify had created and attached a pending native subscription. The supplied request tokens had not expired at the response time. A read-only central billing query confirmed the pending attached agreement; no payment or database mutation was performed during diagnosis.

The installed Shopify SDK deliberately throws a 401 response with `X-Shopify-API-Request-Failure-Reauthorize-Url` for top-level approval navigation from an embedded data POST. React Router exposes error response headers to the route handling the error. The Plans index route had its own custom error boundary but no header function, so it dropped the redirect URL and displayed the generic Unauthorized/migration error. This was a response-handling defect, not evidence of missing migrations.

Edited `integrations/shopify/app/routes/app._index.tsx` to forward SDK headers with `boundary.headers` and delegate route error responses to `boundary.error`. Ordinary application errors retain the SelfX fallback. Edited `app/app-index.spec.ts` with eight regression checks, including a real React Router `.data` POST that reproduces header loss without the fix and verifies header delivery with it. No new runtime file, schema change, migration, payment-provider change or environment change is required.

Validation: all 131 Shopify app/connector tests across 24 suites passed, including the HTTP reproduction and authentication/billing regressions. Shopify production build, project typecheck, changed-source/test ESLint and whitespace checks passed.

Redeploy the Shopify app server service (`Fashion-try-on`) with this follow-up, reopen the embedded app and choose the plan again. Existing pending approval recovery remains in place. Then verify the actual Shopify approval screen, acceptance/decline, scheduled plan state and charge history. This follow-up has not been deployed by the agent.

## Follow-up: existing live approval after enabling test mode

Read-only deployment checks confirmed `SHOPIFY_BILLING_ENABLED=true` and `SHOPIFY_BILLING_TEST_MODE=true` on both services. A targeted read-only Shopify Admin API query confirmed that the earlier Basic agreement remained native PENDING with `test=false`. No native cancellation, approval or billing mutation was run during diagnosis.

The mode guard also rejected terminal updates for the older request, so even a later verified decline could not clear the blocking agreement after the settings changed. The API now accepts verified CANCELLED, DECLINED and EXPIRED reconciliation across modes, while preserving the mode check for ACTIVE, ACCEPTED, PENDING and FROZEN. Closing an old request does not activate paid access or grant credits.

The billing warning now offers Review pending approval. The authenticated server action reopens the saved Shopify URL after validating its HTTPS scheme, host, credentials and port. It prepares no new agreement and submits no charge. The pending approval must be declined in Shopify and verified before a fresh selection can proceed. The saved URL remains server-side until that explicit navigation. The internal service-token-protected agreement listing includes it for this recovery.

Edited the billing service and PostgreSQL tests, Shopify billing server helpers/tests, embedded route/tests, technical requirements and this report. No new runtime files or migration were introduced. Validation passed: 19 real PostgreSQL billing tests, 139 Shopify app/connector tests, project typechecks, Shopify production build and changed-source lint/whitespace checks. One initial database regression run timed out during a host execution interruption; the full 19-test suite passed on rerun without a test-timeout increase.

Deploy `@selfx/api` first and then `Fashion-try-on`. Keep both existing test flags unchanged. In the embedded app choose Review pending approval, cancel/decline the earlier live approval in Shopify, then Retry billing verification. Once the pending request clears, select Basic again and verify that Shopify identifies the new approval as a test charge. No theme extension deployment or database migration is needed for this follow-up. Live completion of that merchant-driven recovery remains to be tested after deployment.
