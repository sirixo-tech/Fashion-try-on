# SHOPPING-2 — Cart, orders, stock reservations and tax

Date: 2026-10-15

## What this milestone adds

The backend now supports a customer basket containing multiple native SelfX
products and customer-selected quantities. Checkout creates a Store order and
holds its stock for five minutes. Store staff have an **Orders & Tax** page for
tax configuration, order history, order details and unpaid-order cancellation.

The APK buying screens are intentionally deferred, as requested. Its Buy button
is still disabled. These APIs establish the foundation for that later connection;
no actual customer payment can be made or marked successful in this milestone.

## Simple example

A Store has Black/M shirts with four units on hand. A customer puts two into a
cart. Nothing is reserved yet, so all four remain available to other customers.

At checkout, SelfX checks the latest stock, price and tax. If two units are still
available, it creates an order and reserves them for five minutes. Another kiosk
then sees two available units. If the order is cancelled or expires, all four
become available again. Try-On is available regardless of the stock quantity.

An existing order keeps its original product name, selected options, unit price
and tax amounts even if staff edit the catalog later.

## Store dashboard

Open **Store → Orders & Tax**.

- **No tax:** the entered product price is the customer total.
- **Tax included:** the entered product price is the customer total; SelfX
  separates the tax and net amount for display.
- **Tax added:** SelfX adds tax on top of the entered product price.

The Store chooses a default rate. In **Products → Stock & Pricing**, staff may
set a product-specific percentage: blank inherits the Store default, and zero
makes that product exempt. No tax switches off all product overrides.

Examples for a product with 18% tax:

| Setting | Entered extended price | Net amount | Tax | Customer total |
| --- | ---: | ---: | ---: | ---: |
| No tax | 100.00 | 100.00 | 0.00 | 100.00 |
| Included | 118.00 | 100.00 | 18.00 | 118.00 |
| Added | 100.00 | 100.00 | 18.00 | 118.00 |

The rate is configurable; no jurisdiction's rate is imposed. This is a simple
single-percentage-per-product calculation. Compound taxes, invoice numbering,
statutory invoice fields, discounts and shipping are not part of this stage.

Order history supports reference search, status filtering, bounded pagination and
refresh. View Order shows original lines/totals and a hold countdown based on
backend time. Staff with update permission may cancel an unpaid order, supplying
a reason. Staff with view permission can inspect without changing settings or orders.

Stock & Pricing also shows **on hand**, **reserved** and **available** totals.
Staff cannot remove a reserved option or reduce its on-hand quantity below its
current reservation. Products referenced by orders cannot be physically deleted;
deactivate them to keep history intact.

## Backend contracts

All kiosk operations require an active device assigned to the same active Store
and an active matching customer Try-On session. Staff operations use existing
centralized Store/platform permissions and impersonation restrictions.

| API | Purpose |
| --- | --- |
| GET/PUT `/api/v1/kiosk/try-on/sessions/:sessionId/shopping/cart` | Read a quote or replace variants/quantities with optimistic version checking |
| POST `.../shopping/checkout` | Create/replay an unpaid order and five-minute hold |
| GET `.../shopping/orders/:orderId` | Read this device/session's order |
| POST `.../shopping/orders/:orderId/cancel` | Cancel the customer's unpaid order |
| GET/PUT `/api/v1/admin/stores/:storeId/shopping/tax` | Read/update Store mode/default rate |
| GET `/api/v1/admin/stores/:storeId/shopping/orders` | Paginated order history |
| GET `.../shopping/orders/:orderId` | Original order details |
| POST `.../shopping/orders/:orderId/cancel` | Authorized staff cancellation with a reason |

Cart mutations contain variant IDs and whole quantities, never trusted client
prices or Store ownership. A GET/PUT quote returns `quoteFingerprint` and `version`.
Checkout sends those values plus a stable `idempotencyKey`. If price/tax changes,
the client must show the new quote before retrying. Identical retry keys return
the original order; changing the request under that key produces a conflict.
Replay bookkeeping expires after 24 hours, while order history remains.

Up to 100 distinct variants are accepted per cart. Quantities are bounded by
available stock and the existing one-million-per-option technical ceiling.
Mixed currencies and order totals above 2,000,000,000 cents are rejected.
Tax percentages support two decimal places. Calculations use integer cents and
BigInt arithmetic, rounding half-up per extended line before summing line totals.

## Consistency and recovery

- Product row locks serialize checkout against competing kiosks and staff stock edits.
- A shared Store lock prevents tax-setting writes racing through checkout totals.
- Session locks and a partial unique index prevent multiple active orders for one cart.
- Reservations are derived from unexpired pending order lines. No separate mutable
  reserved counter can drift from the orders that created it.
- The deadline releases availability immediately, even if the expiry task is late.
- A bounded background sweep runs every 15 seconds and audits expiry exactly once.
  `SHOPPING_EXPIRY_ENABLED=false` disables only the sweep, not deadline enforcement.
- Cancellation and expiry are conditional, audited state changes, safe under retries.
- Session completion/expiry removes access to its cart. Cleanup removes those carts;
  the independent order/hold can last only until its original five-minute deadline.
- Checkout and cart writes have bounded per-process device rate limits. Distributed
  edge/shared enforcement should accompany a later horizontally scaled rollout.
- No customer photos or generated images are copied into shopping records.

The initial statuses are **Awaiting payment**, **Cancelled** and **Expired**.
Expired means automatically closed unpaid. There is no paid/collected/refunded
state or staff Mark Paid operation yet. Payment integration must explicitly add
pending-confirmation/reconciliation states before taking real money.

## Verification and deployment

Targeted verification covers simultaneous last-unit checkout, multiple cart items,
quantities, same-key retry, cross-Store/device/session access, included/added/no-tax
calculations, product overrides, stale tax/cart/quote versions, reservation expiry,
reserved-stock edits, cancellation, preserved snapshots and SQL constraints.

The feature is validated using an isolated temporary localhost PostgreSQL database,
not the configured project database. All 51 repository migrations applied there.
Backend/dashboard tests and typechecks are recorded in the completion message.
New source is formatted and linted; existing image warnings remain unrelated.

| Verification | Result |
| --- | --- |
| Targeted backend stock, shopping, Store and RBAC suite | 68 tests passed |
| Dashboard, tax input, stock panel and Store dashboard suite | 23 tests passed |
| Backend/frontend typechecks | Passed |
| Backend/frontend production builds | Passed, including the Orders & Tax route |
| New source and changed backend lint | Passed with zero warnings |
| Prisma schema validation | Passed |
| Isolated migration application | All 51 migrations passed |
| Real HTTP application smoke check | Passed |

The HTTP check used example-only runtime configuration and disposable local staff/
device identities. It verified actual Store RBAC, rejection of human tokens on
device routes, unknown-field rejection, a 5% added-tax quote, checkout/replay,
order history and cancellation. Internal OpenAPI contains the shopping response
contracts, while the public developer API documentation excludes these routes.

Live browser visual review has not been completed. Automated interactions cover
the UI; desktop/narrow-screen visual inspection remains a review item. The
pre-existing schema-versus-migration index/default differences described in the
SHOPPING-1 report are not repaired by this feature. No schema reset is required
or recommended to activate the additive shopping migration.

No application deployment, target-database migration or APK build is performed.
For an approved target environment, apply migrations before starting the updated
API, generate Prisma types, then build/deploy the backend and web application:

```text
npm run db:migrate:deploy
npm run db:generate
npm run build --workspace @selfx/api
npm run build --workspace @selfx/web
```

The previous SHOPPING-1 changes are still part of the working tree. This milestone
extends them; it does not replace or discard them.

## Next step and decisions

Next is **merchant payment integration**, followed by the APK product/cart/payment
screens. Start with one supported provider, with money paid directly to each Store.

Before implementing that stage, ask:

1. Which provider should be supported first?
2. How will each Store connect its own merchant account: provider onboarding or
   server-side merchant credentials, according to the selected provider's supported flow?
3. What should happen if payment succeeds after the stock hold expired? Recommended:
   attempt safe stock recovery; otherwise flag it for staff resolution/refund and
   never tell a paid customer that their money/order disappeared.

The next implementation should add a provider-neutral payment adapter, protected
Store account configuration, order-linked QR creation, verified webhook/status
processing, duplicate-event handling and payment reconciliation. An initiated
payment awaiting confirmation must not be automatically classified as failed.

Only after sandbox success/failure/delay tests should the APK Buy button connect
to product options, quantities, cart review, payment QR and status screens.
Receipt printing and staff collection follow with their own hardware/workflow
questions. Printer failure must leave a recoverable paid order in Store history.
Shopping analytics is a separate milestone and should count verified payments
as sales, not cart additions, reservations or Buy clicks.
