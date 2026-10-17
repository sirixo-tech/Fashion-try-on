# PAYG-1 — Postpaid plan and successful-generation metering

Date: 2026-10-16

## What this milestone does

SelfX now supports a **Pay as you go (postpaid)** plan alongside existing credit
plans. A Store does not buy credits first. The platform sets the price of one
credit, and each successfully saved generation counts as one credit.

For example, at INR 2.00 per credit, 125 successful generations produce an
estimated generation charge of INR 250.00. Failed generations, timeouts and
repeated completion callbacks do not add charges. This milestone displays the
estimate and preserves its evidence. It does **not** issue or send an invoice.

## Confirmed business rules

- One successful generation equals one credit, for garments and jewellery.
- No prepaid balance or generation credit limit applies to a postpaid plan.
- Monthly cycles use UTC and an activation anniversary. Short months clamp the
  day without permanently shifting later anniversaries: January 31 → February
  28/29 → March 31.
- Existing Stores retain their current billing-cycle anniversary when first
  switching; trial/subscription creation supplies the fallback for legacy rows.
- Verifiable, previously uncharged successes in the current cycle are included
  at the price selected when switching. Older cycles are excluded.
- Matching prepaid credit deductions, including trial-credit deductions, prevent
  a second charge. Existing postpaid records are also never imported again.
- A cycle's currency and per-credit rate stay fixed. Editing a rate changes later
  cycles, including cycles first opened after a period without activity.
- Existing plans and Store assignments remain in place until deliberately changed.

## How to use it

1. Deploy the migration and backend, then the web application.
2. Open **Platform → Plans → New plan**.
3. Choose **Pay as you go (postpaid)**, enter the price per credit and select the
   channels/features/kiosk/location permissions the Store should receive.
4. Create a Store with that plan, or use an existing Store's **Change plan**
   action. The assignment screen explains historical usage inclusion.
5. Open the Store dashboard or **Usage & Billing**. It shows billable credits,
   included historical credits, the rate, UTC cycle dates and an estimated charge.

Postpaid plans have no monthly generation fee, included-credit allowance,
trial-credit allocation or advance credit-pack price. Optional kiosk rent and
other entitlements remain separate configuration; they are not included in the
generation estimate. Billing mode is fixed once a plan is created: create and
explicitly assign another plan to change modes.

## Backend and data changes

- `PricingPlan` adds `billingMode` and `creditUnitPriceCents`.
- `PricingPlanRate` retains effective-dated currency and unit-price versions.
- `StoreSubscription.billingAnchorAt` preserves monthly anniversaries.
- `StoreBillingCycle` snapshots the Store, subscription, plan, rate and boundaries.
- Production runs capture the trusted channel and admitted billing cycle.
- `BillableGeneration` stores a unique source-run ID, Store, completion time,
  coverage, cycle and historical marker. Each row represents one success.
- Financial rows contain no images or provider credentials and do not depend on
  temporary run/look/image foreign keys. Media cleanup cannot delete these rows.
- Composite tenant foreign keys and SQL checks protect cycle ownership, positive
  rates and coverage consistency. Subscription locks serialize cycle operations,
  successful metering and explicit assignment.
- Pricing creation, edits and Store plan assignment through platform routes record
  the acting administrator and safe commercial details in audit logs. Audit logs
  are separate from the financial usage ledger.

Kiosk, Public API and Shopify backend flows share the same success-metering helper.
Session-based flows commit result persistence and usage in one database
transaction. Legacy sessionless kiosks validate and commit the result and usage
together. Postpaid Shopify generation bypasses the advance credit deduction and
records usage only after success. Existing credit-limited behavior is preserved.
Internal Try-On Lab and platform-owned kiosk testing do not create Store charges.
Future channels must use the same admission/finalization contracts.

A run admitted under postpaid retains its cycle even if the Store changes plan
before completion. An uncharged run already in progress when the Store switches
can be assigned to the current postpaid cycle when its usable result is saved.
Active-subscription/channel checks and existing operational abuse limits remain
separate from the absence of a generation credit limit.

Existing protected pricing/Store routes are reused; no unauthenticated billing
endpoint or merchant payment-gateway fallback is introduced. Summary responses
add an optional `postpaid` object. Estimated totals use integer arithmetic and
are serialized as decimal strings of minor units to avoid floating-point loss.

## Historical usage limits

Import uses retained completed runs with result evidence, durable kiosk
generation events, and the new financial success rows. It processes evidence in
batches and deduplicates by source-run ID. It checks both direct run-linked
deductions and legacy Shopify session/request deduction keys.

Some older Public API/Shopify runs may already have been deleted with expired
results. If no trustworthy success evidence survives, SelfX does not reconstruct
a charge from aggregate analytics or guess a count. An unused credit allocation
alone cannot prove that a particular generation consumed a paid/trial credit;
the matching deduction is the coverage evidence. Previously invoiced postpaid
usage will already have its unique financial row; this repository currently has
no external/manual invoice import or reconciliation feature.

## Migration and deployment

Migration: `20261016000100_postpaid_usage_foundation`.

Use the normal release process and run `npm run db:migrate:deploy` against the
intended deployment database before the new backend serves requests. Generate
the Prisma client during the build as usual. The migration leaves existing plans
as `CREDIT_LIMITED`; it does not activate postpaid plans or convert Stores.

Only disposable local PostgreSQL databases were migrated during implementation.
Production data, real provider accounts and real payments were not used.

## Verification

- 97 affected backend tests passed, including 11 real PostgreSQL billing tests.
- 21 focused frontend tests passed, including postpaid plan saving, Store
  onboarding and billing-summary display.
- Backend and web TypeScript checks passed.
- Changed-code ESLint passed with zero warnings.
- Backend production build and the dependency-ordered web production build passed.
  Next.js reported existing image-optimization warnings in unrelated image pages.
- All 55 migrations applied to a fresh disposable local database; Prisma schema
  validation passed. Comparing database-to-schema drift against the pre-PAYG local
  baseline produced identical differences: PAYG introduced no additional drift.
  Existing index-name/default/foreign-key differences were not silently changed.
- `git diff --check` passed. No real AI/provider calls or financial transactions
  were used. Browser/hardware visual validation was not performed in this session.

The PostgreSQL tests exercise actual constraints and transactions: no advance
credit requirement, result-success metering, duplicate/concurrent callbacks,
failure rollback, image/run cleanup survival, current-cycle history import,
prepaid exclusion, historical evidence deduplication, rate changes, UTC calendar
boundaries, tenant isolation, plan-change behavior and actor attribution.

## Recommended next milestone: cycle-end invoices

The next step is to turn these durable cycle records into invoices:

1. Close each due cycle once, with a durable invoice number and a frozen usage
   breakdown. Allow already-admitted in-flight runs to finish or resolve before
   finalizing that cycle; a retry must return the same invoice.
2. Add Store invoice history and invoice download, showing the usage quantity,
   agreed rate and any separately approved charges or taxes.
3. Deliver invoices through an approved notification channel with a delivery
   history and retry handling.
4. Add manual paid/unpaid tracking first if appropriate. Automated collection can
   follow through a separate SelfX SaaS billing integration.

Before that milestone, confirm the invoice due period, SelfX billing/tax details,
whether kiosk rent appears on the same invoice, how Stores receive invoices,
whether zero-usage cycles receive an invoice, and the handling of overdue bills.
These decisions do not block using and reviewing this metering foundation.
