# BILLING-STORE-1 — Store Usage & Billing correction

Implemented locally on 21 October 2026. Deploy together with AI-PRIVACY-1.

## Changes

Store users see their own usage totals and a full-width **Your Kiosks** table
with Kiosk, Looks and Downloads columns. They no longer see Top Stores, the
redundant Store column or the Platform Client selector. AI provider/model tables
are already removed by the accompanying AI-PRIVACY-1 changes.

Authorized Platform-wide usage retains Top Stores and kiosk ownership columns.
Selecting a single Store removes those redundant comparison elements.

## Tenant isolation

The existing usage endpoint already requires Platform USAGE_VIEW for global
queries or Store analytics permission for an explicitly requested Store. Run and
event queries retain their Store predicate even when a kiosk ID is supplied.
Those checks remain in place.

Current kiosk metadata is now also fetched within the requested Store scope.
Kiosks moved to another Store no longer expose their current name/ownership via
the previous Store's historical activity. Historical usage totals remain with the
Store where the activity happened; unmatched current kiosk rows are omitted.

This fixes a shared UI layout and tightens kiosk metadata scoping. The supplied
screenshot alone did not establish exposure of another Store's activity.

## Verification

- 31 backend tests passed: usage authorization, rollups and database-backed Store
  RBAC, including cross-Store permission isolation.
- New aggregation cases verify foreign kiosk filters cannot retrieve activity
  and reassigned kiosk metadata stays out of historical Store responses.
- All 355 web tests passed, including four new billing page cases for Store,
  unresolved Store, Platform-wide and single-Store Platform presentation.
- Changed-file ESLint and API TypeScript compilation passed.
- Production web build passed, including frontend type checks. Four existing
  image-element warnings remain in unchanged share/Shopify pages.
- `git diff --check` passed.

Backend permission tests ran against disposable local PostgreSQL. No production
data or live provider services were used. No database migration is required.

## Deployment

Redeploy **API and web** with this and AI-PRIVACY-1. No new APK or provider setting
changes are needed. Then sign in as a Store user and open `/app/billing`: confirm
Your Kiosks has three columns, Top Stores/Provider Usage are absent and only the
Store's assigned kiosks appear. Confirm an authorized Platform user retains
cross-Store comparisons in the All clients view.

These changes have not been committed or deployed to Railway by this task.
