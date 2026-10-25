# Shopify visitor-limit correction

Date: 2026-10-25. Implementation and local verification complete; coordinated deployment and live Shopify acceptance remain.

## Behavior

- Signed Shopify app-proxy launches return a no-store HTML browser-navigation bridge with a safe fallback link. The browser opens SelfX directly so Shopify cannot strip the SelfX visitor cookie or follow its launch redirect internally.
- The SelfX web same-origin `POST /try-on/commerce/visitor` route forwards only its dedicated cookie to the central API. This works with the existing separate-host browser API configuration as well as the normal API proxy. Cross-origin requests, arbitrary visitor/Store body fields and invalid capability formats are rejected. Upstream redirects are refused, requests time out, and responses are not cached.
- The API issues a random host-only, HttpOnly, SameSite=Lax cookie, with Secure and a `__Host-` name in production and a maximum age of one year. Persist only a Store-specific SHA-256 digest. Shopify-provided visitor tokens are ignored. Shopify sessions must bind before consent, upload or generation, even with a disabled custom visitor limit; binding is immutable and retryable only for the same identity.
- Repeated product launches use the same visitor digest within a Store; another Store gets an independent digest and allowance. Browser initialization deduplicates concurrent mounts and uses Web Locks to serialize initialization across tabs where supported. WooCommerce retains its WordPress cookie and digest without receiving an extra SelfX visitor cookie.
- Store-scoped PostgreSQL transaction advisory locks serialize quota admission across sessions/products/API instances. Inside the lock, check request idempotency first, then visitor/monthly limits, debit credits and insert the run atomically. Execute the provider only after commit and only for a newly inserted run. A failed insertion rolls back the debit. The existing policy counts admitted generation attempts, including failures; clicks/session launches do not consume an allowance.
- Trial/plan grants now use conflict-safe bulk inserts with duplicate skipping. Catching a duplicate ordinary INSERT had left interactive PostgreSQL transactions aborted. The shared entitlement service can consume a credit inside the caller's transaction without nesting another transaction.

## Persistence and compatibility

Migration `20261025000000_storefront_first_party_visitor` adds nullable `visitor_bound_at` to the existing `shopify_storefront_try_on_sessions` table. No new customer/visitor tables or retention extensions. Existing WooCommerce visitor state remains valid. Old Shopify sessions without runs can bind normally; old sessions that already have runs require a new launch rather than rewriting usage attribution.

The migration was applied only to disposable `127.0.0.1:55441/woocommerce_catalog_test`, including its three outstanding prerequisite migrations. Application and production databases were not migrated. No real AI generation, payments, mail, production deployment or Shopify configuration changes were performed.

## Validation

| Check | Result |
| --- | --- |
| Backend storefront/consent/controller/entitlement regressions, including real WooCommerce and new visitor PostgreSQL suites | 52 passed across six suites |
| New real PostgreSQL visitor tests, included above | Four passed: concurrent last allowance across products/Store isolation, duplicate retries, monthly cap across visitors, credit rollback/retry |
| Existing real PostgreSQL pay-as-you-go/kiosk billing regression suite | 11 passed |
| Web first-party route, API client and customer UI | 14 passed across three suites |
| Shopify browser bridge/client and route registration | 11 passed across two suites |
| API, web and Shopify TypeScript | Passed |
| Changed TypeScript lint | Passed with zero warnings, using the Shopify package's own legacy ESLint configuration for that package |
| Prisma validation and client generation | Passed |
| Next production build | Passed; existing image-optimization warnings in unrelated pages/components remain |

Total: 88 passing targeted tests across 12 suites; this is not a claim that the entire repository suite ran. Provider execution and object storage are mocked; database concurrency and credit accounting use real PostgreSQL. Shopify AI Toolkit's installed documentation helper was consulted alongside the official app-proxy documentation; no Admin GraphQL operation, scopes, theme extension or app configuration changed.

## Rollout

1. Apply the additive migration through the normal database deployment process, regenerate Prisma and deploy API, SelfX web and Shopify app server together. The old API cannot enforce the new binding rule; an old web client cannot initialize against the new API.
2. Keep web/API production runtime modes consistent. Configure the web server's existing `SELFX_API_UPSTREAM_URL` or explicit public API URL so its server route can reach the API. Preserve HTTPS, `SELFX_WEB_BASE_URL` and any explicit `SELFX_STOREFRONT_TRYON_URL` configuration. No new shared secret is needed.
3. Test from a real Shopify product page: automatic navigation/fallback, first-party cookie, repeat launches and other products, last allowance rejection, independent Stores, simultaneous requests, credit exhaustion, disabled/suspended integration, expired/old launch and normal consent/photo/result/return.

Anonymous identity remains browser-based. Clearing/blocking cookies, private browsing and switching devices can reset identity. This is a per-browser limit, not a verified per-person guarantee; existing Store credits and Store-level caps remain important protections. No mandatory login or fingerprinting was added.

Sources: [Shopify app-proxy authentication and cookie behavior](https://shopify.dev/docs/apps/build/online-store/app-proxies/authenticate-app-proxies), [Shopify app-proxy redirect behavior](https://shopify.dev/docs/apps/build/online-store/app-proxies/index).
