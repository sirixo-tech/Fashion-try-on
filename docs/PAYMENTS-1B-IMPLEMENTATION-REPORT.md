# PAYMENTS-1B — PhonePe order payments and recovery

Date: 2026-10-15

## Result

The backend can now create an order-linked PhonePe Dynamic QR payment attempt,
receive authenticated payment notifications, independently check payment status,
and record a confirmed payment with safe stock allocation. The Store dashboard
shows payment history and gives authorized staff status-check and stock-recovery
actions.

**This is a UAT/test implementation. Live payment collection and the APK Buy
button remain disabled.** No actual PhonePe requests or payments were made during
implementation. Your Salt Key, Salt Index, Merchant ID and Provider ID have not
been assumed to be UAT credentials or proof of Dynamic QR access.

This builds on SHOPPING-1 stock/pricing, SHOPPING-2 cart/orders/taxes, and
PAYMENTS-1A gateway configuration. PhonePe is the implemented payment adapter;
Razorpay, Stripe, Paytm and PayPal remain planned connectors.

## How it works in simple terms

1. Checkout creates an order with its original products, variants, quantities,
   prices and taxes. Stock is reserved for five minutes.
2. The backend saves a payment attempt before asking PhonePe for a QR. The amount
   comes from the saved order, never from an amount supplied by the kiosk.
3. Repeating the same request returns the same attempt. It does not create a
   second QR request or another charge attempt.
4. A signed PhonePe notification asks SelfX to verify the payment. SelfX checks
   PhonePe's status API before declaring the order paid.
5. Confirmed success marks the order paid and deducts its stock once. Confirmed
   failure allows another attempt while the order is still eligible.
6. A timeout or unclear response means confirmation is pending. It does not mean
   the customer failed to pay. Background checks resume after an API restart.

The five-minute stock hold and payment confirmation are separate. After five
minutes, the hold releases stock, but an already-started payment remains under
verification. The order cannot be cancelled or charged again while that result
is unresolved.

### Example: payment succeeds normally

A customer orders two shirts while five are available. After verified payment,
the order becomes Paid, stock becomes three, and the paid cart is cleared. A
duplicate callback or repeated status check cannot deduct another two shirts.

### Example: payment succeeds after the hold expires

If stock is still available, SelfX allocates it and records the paid order. If
another order has taken that stock, SelfX records **Paid — staff action needed**
without making stock negative or discarding the payment.

Staff can replenish or correct the actual stock and use **Retry stock allocation**.
If fulfillment is impossible, staff must resolve it with the customer. Refund
execution and refund recording are not implemented in this stage.

If two attempts are eventually confirmed successful for the same order, the
extra payment is flagged for staff resolution. Stock is allocated only once.
Recovering stock does not clear a separate duplicate-payment warning.

## Dashboard changes

In **Store → Orders & Tax**, staff can filter pending confirmation, paid, and paid
orders requiring action. Order details show payment attempts, UAT/test labels,
safe provider references, paid time, and recovery guidance.

Authorized editors can check payment status and retry allocation for paid orders
missing stock. A status check asks the provider; there is no manual Mark paid
button. Read-only users can inspect history. Pending and paid orders cannot use
the unpaid cancellation action.

In **Store → Payments**, PhonePe configuration now includes an explicit UAT
Dynamic QR access confirmation. It resets whenever credentials are replaced.
This declaration does not establish provider verification or enable production.
Credential values are not read back into the form.

The existing default Store Admin role has `integrations.view`, but does not have
`integrations.manage`. An authorized administrator must explicitly grant setup
access to the designated account manager. Order actions use the existing scoped
Store update permission. This work does not automatically broaden staff roles.

## Protection and recovery

- Store, kiosk, customer session and order ownership are checked server-side.
  Store data uses the existing `organizations` tenant compatibility model.
- Credentials stay encrypted in the backend. Each attempt keeps an encrypted
  account snapshot so replacing Store credentials cannot redirect an existing
  transaction. Dashboard responses never contain credentials or ciphertext.
- Notification signatures, merchant, transaction and amount must match. Events
  are deduplicated. Raw callback payloads and payer details are not stored.
- A late signed success conflicting with a failed status keeps verification
  scheduled and blocks another charge. A callback arriving during a timed-out
  check cannot lose its scheduled verification.
- Stock allocation is atomic across all order items and respects other valid
  holds. Stock versions advance after a sale, rejecting stale staff stock edits.
- Successful payment survives kiosk revocation, ended sessions and expired holds.
  Repeated success cannot deduct stock twice or clear a newer pending order's cart.
- Provider calls have fixed UAT destinations, an eight-second timeout, no
  redirects and a bounded response size. Reconciliation uses durable schedules,
  database leases, bounded batches and retry backoff.

An uncertain QR initialization is not automatically resent. Unknown or missing
provider status is not treated as proof of failure. Some cases may require
provider investigation rather than another customer payment attempt. Request
limits are currently per API process; shared edge limits are a later deployment
hardening task.

## Configuration and database changes

The additive migration is
`backend/database/prisma/migrations/20261015030000_order_payment_execution/migration.sql`.
It adds durable attempts/events, UAT-access confirmation, paid/allocation fields,
and constraints against overlapping unresolved attempts and invalid paid states.
Project documents 01–06 have been updated to describe the approved behavior.

API-only configuration is documented in `.env.example`:

| Setting | Purpose |
| --- | --- |
| `SELFX_PAYMENT_ENCRYPTION_KEY` | Dedicated Base64-encoded 32-byte encryption key |
| `SELFX_PAYMENT_ENCRYPTION_KEY_VERSION` | Version used for new encrypted snapshots |
| `SELFX_PAYMENT_PREVIOUS_ENCRYPTION_KEYS` | Optional JSON version-to-key map for older snapshots |
| `SELFX_PHONEPE_UAT_ENABLED` | Defaults to false; explicit switch for UAT provider calls |
| `SELFX_PAYMENT_CALLBACK_BASE_URL` | Reachable HTTPS API origin for PhonePe callbacks |
| `PAYMENT_RECONCILIATION_ENABLED` | Enables the background checker; defaults to true |

Retain historical encryption keys while existing attempt snapshots need them.
The previous-key map supports planned rotation; it is not an automatic
re-encryption process. Keep all keys on the server.

Provider execution also requires an enabled platform gateway, Store selection,
UAT configuration and explicit DQR access confirmation. Production or unconfirmed
connections are rejected even if the global UAT switch is enabled.

The migration was tested only on isolated local databases. The configured
application database and `.env` were not changed. No deployment or APK build was
performed. Unrelated existing mobile camera changes were preserved.

## Verification

- **122 backend tests passed** across payment, shopping and stock suites, including
  19 real-PostgreSQL payment-execution tests with simulated PhonePe responses.
- **38 selected frontend tests passed** covering payment setup, shopping and stock
  behavior, including order-status checking, stock recovery and read-only access.
- All **53 migrations** applied to a fresh disposable PostgreSQL database; the new
  migration also applied to the existing disposable regression database.
- API and web production builds passed. The web build retains existing unrelated
  image lint warnings. Targeted lint and `git diff --check` passed.
- A running NestJS/Fastify HTTP smoke check covered real staff/device
  authentication, input rejection, QR request replay, signed callback acceptance,
  independent payment confirmation, stock deduction and cancellation protection.
  Internal OpenAPI contracts were checked and excluded from the Public API.

The integration suites share gateway-policy fixtures and were run sequentially
against the disposable database. An initial parallel run collided on policy
version updates; the sequential run passed all 122 tests.

These checks validate SelfX behavior with simulated provider responses. They do
not establish PhonePe account acceptance, real callback delivery or actual device
checkout usability. Browser visual review and printer testing were not performed.

## What we should do next

**First, confirm the PhonePe account environment and Dynamic QR entitlement.**
Ask whoever supplied the credentials, or the account's PhonePe contact, whether
they are UAT or production credentials and whether the merchant is enabled for
the offline Dynamic QR integration. Do not guess from the credential format and
do not share the Salt Key in chat.

Once confirmed UAT access is available:

1. Prepare staging with a reachable HTTPS callback origin, dedicated encryption
   key and a dedicated test Store. UAT payments exercise stock allocation, so use
   test products and stock rather than a trading Store's inventory.
2. Apply the reviewed migrations to staging, configure the confirmed test account,
   select PhonePe, confirm UAT DQR access, then enable the API's UAT switch.
3. Use PhonePe's supported test tooling to check success, failure, delayed status,
   duplicate notifications, callback delivery, network interruption, API restart
   and a payment arriving after the stock hold expires.
4. After provider acceptance passes, implement the APK's product/variant page,
   quantity/cart, checkout review, QR screen and processing/result screens using
   these shared backend endpoints. Confirm production onboarding and activation
   requirements before allowing real money collection.

Printing and product collection should follow the payment/UI acceptance stage.
Receipt printing must use the saved paid order; printer failure must leave the
order accessible in the dashboard. Collection tracking should later prevent a
receipt being used to collect the same order twice.

Shopping analytics should be built from durable orders and attempts, with UAT
excluded from real sales. Useful initial measures are confirmed sales, units sold,
payment success/failure, unresolved payments, expired unpaid orders and staff
action cases. Collection and refund measures should follow their corresponding
workflows rather than be inferred from payment success.

## Queries for the next stage

No further business decision is needed to complete this implementation. Before
actual PhonePe testing, we need confirmation of **UAT versus production** and
**Dynamic QR access**, plus a staging callback address. We will ask for device,
printing, collection and analytics details when those stages begin.

## Protocol references

The adapter follows PhonePe's official offline Dynamic QR documentation:
[DQR initialization](https://developer.phonepe.com/offline-integration/dynamic-qr-solution/dqr-init-api),
[payment status](https://developer.phonepe.com/offline-integration/response-capturing-api/check-payment-status-api),
and [server callbacks](https://developer.phonepe.com/offline-integration/response-capturing-api/server-to-server-callback).
