# SelfX Capitalio dashboard

The Capitalio Overview layout is adapted into `/app/dashboard`, supporting the existing Platform and Store scopes. All Overview sections remain: four summary cards, the large performance chart and four supporting counts, donut allocation/legend, ranked product table and three operational insights. Mobile product rows use cards. Existing workspace resource counts and the kiosk fleet snapshot remain below the template layout.

| Template section | SelfX data |
| --- | --- |
| Net-worth summary/trend | Generated Try-Ons; change from an equal prior period |
| Return summary/progress/bars | Downloads, download-to-look ratio and daily downloads |
| Asset summary/striped allocation | All generation attempts; completed versus other attempts |
| Risk summary/history | Completion success rate and its daily history |
| Portfolio performance | Daily generated Try-Ons and generation attempts |
| Supporting performance metrics | Sessions, downloads, failures and in-progress attempts |
| Allocation donut | Completed, failed, queued and processing outcomes |
| Holdings table | Ranked product Try-Ons, share, downloads and failures |
| Smart insights | Generation health, work in progress and engagement |

The current usage API has a coarse kiosk/Public API attribution bucket. The new dashboard therefore uses real generation outcomes for allocation, rather than claiming a precise commerce channel split. Existing provider-neutral usage and generation behavior are unchanged.

## Integration

- Shared visual components and retained artwork: `packages/ui/src/selfx/capitalio/`.
- Scoped appearance: `packages/ui/src/styles/capitalio.css`; the authenticated shell selects it only on `/app/dashboard`.
- Data loading and permission/race handling: `frontend/web/lib/use-dashboard.ts`.
- Metric mapping, adjacent comparison window and safe CSV: `frontend/web/lib/dashboard-metrics.ts`.
- Real controls: date/Store filters, Refresh, CSV export, same-scope analysis dialog, permitted product/activity navigation, existing shell collapse/mobile menu, theme and account/logout.
- Unavailable metrics remain as explicit empty/restricted states. New scope/range/access requests clear the old snapshot immediately. Resource endpoint failure does not discard separately permitted usage data. Growth and ratios do not invent values for missing denominators.
- Test/visual fixtures are separate from the runtime data path. No original customer photos, provider secrets or live merchant credentials are used by this dashboard.

## Source and licensing

Source: [Capitalio registry](https://registry.watermelon.sh/r/capitalio-dashboard.json), [Watermelon dashboards](https://ui.watermelon.sh/free/react-dashboard-templates). The registry was inspected directly rather than running an installer that could overwrite shared components. Retained icon artwork and layout are MIT licensed, with attribution and the full notice in `packages/ui/src/selfx/capitalio/LICENSE`. Brand, account data, navigation and metric semantics use SelfX. Recharts is declared only in the shared UI package; version 3 is used because the template's version 2 is deprecated.

## Validation

Six focused suites passed, with **34 tests** covering metric/comparison mapping, formula-safe CSV, permissions/entitlements before requests, complete pagination counts, discarded late scope responses, access-change invalidation, partial failures, preserved template sections, date changes, analysis details, export availability and failed-refresh clearing. Shared UI/web type checks, changed-file lint and the production Next.js build passed. The build reports existing image-optimization warnings on unrelated screens.

Browser QA verified desktop light/dark and mobile layouts, no horizontal page overflow, mobile navigation, and the built page's actual date/Store filters, downloaded CSV and analysis dialog with intercepted synthetic API responses. The production-mode browser check used an isolated `.invalid` API origin because the local development `.env.local` points at localhost, which the existing production API guard correctly rejects. No environment files were changed. Screenshots under `tmp/capitalio-review/` are local QA artifacts, not committed production data.

No backend schema or authentication change, production deployment or production data mutation is part of this work.
