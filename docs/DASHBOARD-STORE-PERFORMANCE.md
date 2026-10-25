# Scope-aware dashboard performance

Implemented 2026-10-25 at the user's request.

## Behavior

- The all-Stores platform dashboard shows **Store performance**, with Store name, generated Try-Ons, success rate, downloads, failures and View Store.
- View Store switches to that authorized Store's **Product performance** and retains the date range. Choosing All Stores restores Store rankings.
- Merchant/staff dashboards continue to resolve their own authorized Store and show products. One user's access to multiple Stores does not create a user-owned product scope.
- View Store actions are available only for Stores already selectable under the user's Store access. Read-only Platform usage authority permits aggregate viewing without granting Store resource access. The unassigned Platform fleet bucket has no Store action.
- CSV exports follow the visible scope: Store rows globally, product rows within a Store. External names retain formula-safe CSV escaping.
- Desktop tables and mobile cards use existing shared Capitalio/shadcn components. Charts, operational insights, date controls, resource snapshots and shell behavior are retained.

## Data

The existing usage-summary contract already supplies Store rows and product rows. No endpoint or database migration was added. Store rankings now use grouped database counts for the complete requested period rather than the bounded 10,000-run metadata sample. Counts retain existing usage definitions and date/channel/Store filters. Success rate is completed attempts divided by all attempts and shows a dash for zero attempts. Only the top requested number of rows is returned, ordered by generated results then attempts.

The existing server-side Platform USAGE_VIEW / Store analytics checks remain in place. Scope/range/access invalidation continues to hide stale data and disable exports. Empty platform results never fall back to individual products. Platform-selected View products navigation uses the selected Store's explicit catalog route.

## Validation

- Usage API service/controller tests: **11 passed**, including full Store aggregation independently of a missing detailed run sample, scoped isolation, ranking limit and the Platform fleet bucket.
- Dashboard component/metric/hook tests: **18 passed**, including merchant rendering, platform-to-Store switching, permissions, date filters, scoped CSV, missing denominators, stale/failed loads and unavailable Store navigation.
- API/web/shared-UI TypeScript, changed-source ESLint and `git diff --check` passed.
- Production Next build passed in the existing isolated source mirror under `tmp/woocommerce-web-review`; existing unrelated image/cache warnings remain.
- Actual built-page Chrome tests with synthetic intercepted data passed for all-Stores and Store CSV downloads, desktop/mobile drill-down, retained date range, merchant scope, empty results and failed refreshes. No browser errors or unexpected network calls occurred. Both platform and Store views measured 390px document width at a 390px viewport. Light/dark screenshots were reviewed.

Review artifacts: `tmp/store-performance-review/`, including desktop/mobile screenshots, both CSVs and `result.json`. Preview data is synthetic. No production data was changed.

## Rollout

Deploy the API and web app together to include the complete Store aggregation and new dashboard rendering. No migration is required. Production deployment was not performed.
