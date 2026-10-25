# Business / Mobile dashboard switching

Implemented the approved compact toggle in the existing Dashboard sidebar row. No extra Mobile navigation item is added.

## Navigation

- Business is the default at `/app/dashboard`; its Store scope, charts, metrics and export behavior remain intact.
- Toggle ON opens `/app/dashboard/mobile`; OFF returns to Business.
- Clicking the displayed dashboard name/icon always opens Business and resets the toggle, even while the label says Mobile.
- The shared label uses a fixed-height vertical sliding track with a 260ms transition; reduced-motion users get an immediate change. The switch thumb also respects reduced motion.
- Link and switch are separate interactive siblings, with the accessible switch name **Mobile dashboard**. The toggle is available in expanded/collapsed navigation and the mobile drawer.
- Only platform usage viewers see the toggle. Store impersonation hides it and prevents the Mobile page mounting; direct unauthorized access shows a permission state. Reloading a Mobile URL intentionally restores that route; a normal Dashboard click always resets to Business. No preference is stored locally.

## Mobile metrics

`GET /api/v1/admin/mobile-dashboard/summary?range=today|7d|30d|90d` requires a staff JWT and server-resolved platform `USAGE_VIEW`. Merchant `analytics.view`, customer JWTs and client-provided Store/customer IDs do not grant access. The controller validates the range and rejects unsupported filters. Responses use `Cache-Control: no-store` and expose aggregates only.

The page has its own range, refresh and CSV export, separate from Business. It shows:

- Current registered customers, excluding deleted accounts.
- New accounts created inside the selected period, including pending accounts and excluding deleted ones.
- Recently active **current active accounts whose latest sign-in/refresh timestamp falls within that interval**. This is a latest-activity snapshot, not historical daily-active users or a complete event history.
- Current verified, pending and suspended account status counts.
- UTC daily signup growth with empty dates filled, and current active-account sign-in methods. Accounts with multiple methods can appear in multiple bars.

The API reads existing customer tables in a repeatable-read transaction. No migration, new event/financial tables or customer-image storage is added. Successful customer refresh now updates the existing `lastActiveAt`, as sign-in already did.

Customer auth disabled on the backend returns `available=false`, null totals and no chart data **before querying customer tables**, so older/unactivated deployments do not need fake counts. An enabled empty database returns genuine zero values. API failures clear data and show retry; switching dates/identity or changing permission/impersonation context discards stale aggregates and ignores late responses.

Mobile Try-On generation, personal plans/revenue and Store-QR sponsorship are not yet connected. Their sections explicitly say **Not connected**; they do not invent balances, revenue or zero usage. Future Store-sponsored activity will belong to the Mobile activity view while its financial charge remains attributed to the Store, avoiding duplicate revenue totals. Existing Business calculations are not changed by this implementation.

## Verification and limits

Focused React tests cover independent switch/link behavior, default and current labels, collapsed navigation, platform/merchant/impersonation access, range races, permission invalidation, unavailable/empty/error states, export separation and existing Business regression behavior. Backend HTTP and disposable PostgreSQL checks cover staff/platform access, rejected filters, disabled deployments, date/status aggregates, privacy and empty datasets. API/shared UI/web types, scoped lint and the production web build are checked.

Verification on 25 October 2026: 59 focused web tests and 28 customer/API tests passed. Backend, web and shared UI type checks, scoped ESLint, formatting and diff whitespace checks passed. The production web build passed with existing unrelated image/cache warnings. No database migration was needed; the disposable PostgreSQL server was stopped after tests. The existing customer APK's modification time and size were unchanged.

The local browser preview tool reported **Local browser use is disabled in Work settings**. No real-browser visual/animation acceptance was performed; that remains a manual staging check, including narrow widths, drawer/collapsed mode and reduced-motion appearance. Browser restrictions were not bypassed. Local review servers were stopped. Database testing uses only the disposable localhost `customer_auth_test` database and simulated email/provider responses.

This work is not deployed. Customer tables and configuration from CUSTOMER-MOBILE-1 must be activated on staging for live counts. No APKs, real customer emails, payments or production migrations are produced by this dashboard work.
