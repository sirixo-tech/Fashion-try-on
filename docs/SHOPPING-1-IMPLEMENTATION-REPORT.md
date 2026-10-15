# SHOPPING-1 implementation report

Date: 2026-10-15

## What is ready

Store staff can configure stock and pricing for products created directly in
SelfX. Open **Store → Products → Stock & Pricing** on an existing product.
All kiosks assigned to that Store use the same backend stock records. There is
no separate quantity per kiosk or legacy location.

| Product setup | How stock works |
| --- | --- |
| No size or colour | One Standard option with one quantity |
| Sizes only | One quantity per size |
| Colours only | One quantity per colour |
| Sizes and colours | One quantity per size/colour combination |

For example, a shirt can have Black/M = 5, Black/L = 0 and Blue/M = 8.
Black/L remains available for Try-On. Its stock is zero; the later buying page
will use this information to prevent purchase.

Stores choose either:

- **Constant pricing:** every option uses the product price.
- **Variant pricing:** individual options can override the product price;
  a blank override uses the product price.

The base price and currency remain in **Edit Product**. Set them before entering
variant prices. All variants use that product currency. Switching to constant
pricing and saving clears the saved overrides, so old prices cannot secretly
apply while constant pricing is enforced.

Products are not automatically given stock. Until staff configure them, the API
reports **unconfigured**, which differs from a configured quantity of zero.
Existing Try-On behaviour continues in both cases.

## How staff use it

1. Create or edit a native SelfX product and set its base price.
2. Open Stock & Pricing and choose the option structure.
3. Add the sizes/colours actually offered and enter current quantities.
4. Choose constant or variant pricing and enter any overrides.
5. Enter a reason such as Initial stock setup, Delivery received or Recount.
6. Save. The panel confirms the new total stock.

The quantities entered are the new absolute counts, not quantities to add.
For example, changing 5 to 8 sets stock to 8; it does not add 8.
If another staff member saved first, the panel preserves the attempted edits,
blocks another save and asks staff to discard/reload and reconcile.

Read-only staff can inspect the panel but cannot save. Imported products explain
that their stock/pricing remains with the external shop. Platform default catalog
products are not converted into merchandise owned by a Store.

## What changed technically

- Added `product_stock_settings` and `product_variants`, an additive migration,
  tenant-matching foreign keys, unique option keys and quantity/price checks.
- Added staff GET/PUT APIs at
  `/api/v1/admin/stores/:storeId/products/:productId/stock`.
- Added a live device-authenticated GET at
  `/api/v1/kiosk/catalog/products/:productId/stock` for future buying UI.
- Reused centralized Store/platform view/update permissions and impersonation
  restrictions. The actual acting staff/admin ID is retained in audit records.
- Saves lock the product, compare the stock version and commit changes together
  with a before/after audit record. A failed audit write rolls the stock back.
- Removed options are archived. Restoring the same normalized option reuses its
  original ID. Case and whitespace differences cannot create duplicate options.
- Bounded each active configuration at 100 options. Quantities are whole numbers
  from 0 to 1,000,000. Prices use the existing integer-cent money convention.
- Stock reads bypass browser caching and are separate from the cached Try-On
  catalog. Zero stock never becomes a VTO eligibility filter.
- Added the dashboard panel using public `@selfx/ui` components and updated all
  six approved project documents with this milestone's scope and rules.

The existing product delete operation still works: stock rows are deleted with
the product, while audit records remain. Before the next milestone adds order
references, product/variant deletion must protect historical purchases and order
snapshots. There are no purchased orders to preserve in this milestone.

## Verification

| Check | Result |
| --- | --- |
| New backend validation/authorization tests | 18 passed |
| Real PostgreSQL stock integration tests | 10 passed |
| New frontend interaction/input tests | 9 passed |
| Selected existing Store/RBAC/catalog/onboarding/OpenAPI regressions | 31 passed |
| Prisma schema validation and client generation | Passed |
| All 50 repository migrations on an isolated temporary PostgreSQL database | Passed |
| Backend and frontend typechecks | Passed |
| Backend and frontend production builds | Passed |
| New TypeScript/React files lint | Passed |
| Existing edited product page lint | No errors; two existing image warnings, verified against the unchanged baseline |
| Schema drift comparison | New stock structures match; existing index-name/default differences also appear against the unchanged baseline |

Integration tests exercise simultaneous initial saves, stale retries, cross-Store
access, suspended Stores, imported products, missing currency, price inheritance,
constant pricing, stable option identities, transaction rollback and SQL constraints.
They also call the real catalog service to verify a zero-stock product remains
available for Try-On. Application startup checks verified that both new routes
are registered and reject unauthenticated requests.

The schema-wide comparison is not entirely clean: older migrations and the
baseline Prisma schema differ in several index/foreign-key names and `updated_at`
defaults. A second comparison against the unchanged schema confirmed those
differences predate SHOPPING-1. They were not silently repaired in this milestone.
Use a separate reviewed migration-maintenance task before relying on a clean
schema-drift check; do not reset an existing database to resolve that warning.

Browser visual review could not be completed because no Chrome or in-app browser
connection was available. The panel's interaction tests passed; a visual review
on the deployed dashboard is still recommended. This is not a claim of physical
kiosk, payment or printer testing.

## Activation and boundaries

The migration was tested only on the isolated temporary database. It has not
been applied to the project's configured development or production database,
and the application has not been deployed.

For the intended target environment, the deployment sequence is:

```text
npm run db:migrate:deploy
npm run db:generate
npm run build --workspace @selfx/api
npm run build --workspace @selfx/web
```

Then restart/deploy the API and web services through the normal environment
workflow. No APK rebuild is required for this dashboard/backend milestone.

Orders, reservations, payments, payment-provider setup, receipt printing,
collection, refunds and shopping analytics are not implemented here. The APK
Buy action remains disabled until the later customer buying flow is implemented.

## The next step, in simple terms

Next is **SHOPPING-2: orders and temporary stock reservations**.

Stock records answer “How many do we have?” An order answers “What exactly is
this customer buying, at what price?” A reservation temporarily holds that stock
while the customer proceeds toward payment.

Example: Black/M has one unit. Customer A starts buying it, so SelfX reserves
that unit. Customer B, using another kiosk in the same Store, sees no available
unit to purchase. Both customers can still try it on. If A cancels or the hold
expires, the unit becomes available again. When verified payment is added in a
later milestone, payment completion will commit the sale exactly once.

Implement the next backend stage in this order:

1. Add Store-owned orders, order items and reservation records.
2. Snapshot product name, selected options, quantity, price and currency into
   the order. Later catalog edits must not rewrite a customer's existing order.
3. Reserve stock atomically using current server-side quantities and prices.
   Never trust a price or Store ID submitted by the kiosk.
4. Add cancellation and reservation expiry. Repeated requests or simultaneous
   kiosks must not reserve/sell the same last unit twice.
5. Add a permission-controlled Store order list/detail view, with clear status
   and an order reference. Later payments/printing attach to this record.
6. Test concurrent reservations, duplicate requests, expiry, cancellation and
   Store isolation before connecting a real payment provider.

This order foundation can be tested without taking real money. Payment status
and collection status should later be separate from order/reservation status.
A paid order must remain recoverable if the kiosk restarts or printing fails.

## Recommendations and decisions for the next milestone

- Start with one product/variant per order and quantity one; a basket can follow.
- Start with a centrally controlled five-minute reservation window, then align
  it with the chosen payment flow. Late successful payment after expiry needs
  an explicit recovery policy before payments go live.
- Show on-hand, reserved and available quantities separately once reservations
  exist. Staff must not reduce stock below quantities already committed/held.
- Protect order history against product deletion and save immutable item/price
  snapshots before adding payment integration.
- Until there is an approved POS integration, staff must update SelfX quantities
  when the same physical stock is sold outside the kiosk. Otherwise kiosk
  availability can become inaccurate.
- Keep operational/audit records separate from shopping analytics. Decide which
  order events to measure when the analytics milestone is authorized; never
  count an unpaid order or a Buy click as a confirmed sale.

Before implementing SHOPPING-2, ask the owner:

1. Should the first buying flow support quantity one, selectable quantity, or a basket?
2. Is a five-minute stock hold acceptable, and should staff be able to change it?
3. Do entered prices represent the complete customer total, or are taxes/charges
   added separately? Exact totals must be decided before order pricing is coded.
4. Can both the customer and authorized staff cancel unpaid orders?

Payment-provider choice, refund execution details and printer hardware can be
asked when those later milestones begin. They do not block the completed stock
foundation. No unanswered product decisions remain for SHOPPING-1.
