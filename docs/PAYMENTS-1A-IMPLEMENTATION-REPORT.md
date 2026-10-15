# PAYMENTS-1A — Gateway setup and PhonePe protocol foundation

Date: 2026-10-15

## What is implemented

SelfX now has platform payment-gateway availability and Store merchant-account
configuration. This is the first part of the payment milestone. It prepares
PhonePe integration; it does **not** collect payments or mark shopping orders paid.

The platform registry lists PhonePe, Razorpay, Stripe, Paytm and PayPal. PhonePe
configuration is implemented. Other connectors are clearly marked Planned and
cannot be enabled for setup. No payment gateway is made available by default.

The user has Salt Key, Salt Index, Merchant ID and Provider ID, with no confirmed
UAT/live environment or additional account access. These match PhonePe's
documented in-store Dynamic QR credential format. Possession of these details
does not establish that the merchant account is enabled for Dynamic QR.

## What the dashboards do

Platform administrators open **Platform → Payment Gateways** and make PhonePe
available to Stores. This controls configuration/selection availability. It does
not switch on real payment collection.

Authorized Store users open **Store → Payments**. They can:

- Save their own Merchant ID, optional Provider ID, Salt Index and Salt Key.
- Enter a supplied merchant-side Store reference, or leave it blank for a stable
  generated reference based on their SelfX Store ID.
- Choose Environment unconfirmed, UAT/test or Production/live without treating
  that choice as proof of account verification.
- Replace the full saved configuration, select PhonePe for future checkout, or
  clear the selection. One selection belongs to the Store and covers its kiosks.
- See saved environment, update time, selection and Verification pending status.

The form never retrieves previous credential values. The Salt Key uses a password
field and is cleared after submission. Browser storage is not used for credentials.
Replacing configuration requires entering the complete details again.

Platform disabling availability blocks new configuration/selection but retains
already saved credentials and the prior selection. The Store can clear its
selection. A disabled selection is displayed as disabled, not payment-ready.

## Permissions and protection

Platform controls use INTEGRATIONS_VIEW and INTEGRATIONS_MANAGE. Store metadata
uses integrations.view; credential/selection changes use integrations.manage,
or the platform equivalents/established centralized Store bypass.

**The current default Store Admin role has integrations.view but does not have
integrations.manage.** An authorized administrator must grant management access
through existing access controls to the designated Store administrator. This
milestone does not broaden existing roles or assign sensitive permissions to staff.
The Store permission ceiling still applies to delegated permissions.

Support impersonation can read safe Store metadata but cannot modify credentials,
gateway selection or platform gateway policy. Audit entries retain the actual actor.

Credentials, including merchant identifiers, are encrypted with AES-256-GCM using
a dedicated API-only key. Read APIs select only provider/environment/timestamp
metadata; they do not return ciphertext, Salt Keys or merchant IDs. Audit entries
record actor, provider, action and environment without credentials.

All Store data belongs to the historic organizations tenant row, consistent with
ORGANIZATION_AS_STORE. Connection uniqueness and a composite foreign key prevent
cross-Store selection. Store row locks and optimistic versions reject simultaneous
or stale configuration changes. Platform policy has its own concurrency control.
All configuration responses use private, no-store cache headers.

## Backend and database

| Endpoint | Purpose |
| --- | --- |
| GET `/api/v1/admin/payment-gateways` | Platform registry and availability |
| PUT `/api/v1/admin/payment-gateways/:provider` | Update setup availability with expectedVersion |
| GET `/api/v1/admin/stores/:storeId/payments` | Store setup metadata and selected gateway |
| PUT `.../payments/connections/phonepe` | Encrypted full configuration replacement |
| PUT `.../payments/selection` | Select a configured gateway or clear it with null |

The additive migration creates payment_gateway_policies, store_payment_connections
and store_payment_settings. Store mutations share one optimistic revision. No
existing products, stock quantities or order snapshots are changed.

The server-side adapter boundary includes provider-neutral request/status types
and PhonePe-specific preparation/parsing for:

- Dynamic QR request encoding and checksum signing.
- Transaction status request signing.
- QR merchant/transaction/amount matching, including exact integer QR amounts.
- Status normalization without treating unknown or contradictory states as success.
- Callback signature verification and merchant/transaction/amount checks.

The adapter prepares **UAT requests only** and rejects unconfirmed/production
configuration. It is intentionally not wired to HTTP execution, a webhook route
or checkout yet. There is no network/payment test button claiming verification.
No PhonePe credentials were requested in chat, loaded or tested against PhonePe.

## Verification

- All 52 migrations applied successfully to an isolated local PostgreSQL database.
- 93 targeted backend tests passed, including 46 new payment tests and shopping/
  stock regression tests. The six payment database tests were rerun after the
  final availability check was added and passed.
- 34 frontend tests passed for payment setup, page permissions, impersonation,
  navigation, shell and order history.
- API and web builds passed; the build includes both new payment settings routes.
- Targeted lint and TypeScript checks passed. Existing unrelated web image lint
  warnings remain on catalog, look-sharing and Shopify pages.
- An actual initialized API with signed staff tokens verified platform controls,
  Store RBAC, field validation, encrypted setup, selection, cross-Store denials,
  impersonation restrictions and no-store headers. It proved that adding the
  explicit management permission changes authorization server-side.
- Internal OpenAPI includes explicit configuration DTOs; the Public API excludes
  these administrative payment routes.

No target/project database migration, deployment, real merchant verification,
payment, APK build, printer test or visual browser review was performed. Existing
SHOPPING-1/SHOPPING-2 changes remain intact in the working tree.

## Local/deployment setup

Before using the new dashboards in an approved environment:

1. Apply the additive migrations and generate Prisma types.
2. Set SELFX_PAYMENT_ENCRYPTION_KEY to a securely generated Base64-encoded 32-byte
   key on the API server only. Set SELFX_PAYMENT_ENCRYPTION_KEY_VERSION (default v1).
   Keep the key secure and backed up; changing it without a migration/rotation
   process makes old configuration unreadable. Do not put it in web/APK variables.
3. Build/deploy the API and web app, make PhonePe available, and ensure the
   designated Store administrator has the required management permission.
4. Save actual credentials only through the protected Store configuration form.
   Use Environment unconfirmed until the credential environment is known.

The repository .env was not changed. The temporary verification database was
separate from the configured application database and is stopped after checks.

## Next step, explained simply

Next is **PAYMENTS-1B: connect a payment to a shopping order safely**.

For example, a customer checks out a shirt for INR 1,000. SelfX must create one
durable payment attempt linked to that order, ask the Store's PhonePe account for
the QR, and retain enough information to recover if the kiosk or API restarts.
The kiosk will eventually display the QR, but the backend decides whether payment
has succeeded.

PhonePe's callback should trigger authenticated processing and a server-side
transaction status check. SelfX must match merchant, transaction, currency and
amount, record the payment once, and allocate stock atomically. Repeated callbacks
must not deduct stock twice. A network timeout is an unresolved payment, not a
failed payment. Older failure messages must not overwrite a confirmed success.

The five-minute reservation needs payment-aware reconciliation. Stop presenting
an expired QR and do not start overlapping attempts while the previous one could
still succeed. Preserve the merchant connection/version used by each attempt,
including verification access during credential rotation or gateway switching.

The agreed late-payment rule is now recorded in the product documents:

- A verified successful payment remains paid and must be fulfilled or resolved.
- Recover/allocate stock if it is still available.
- If another order already received the stock after the hold expired, retain the
  paid order and flag staff fulfillment/refund resolution. Do not invent inventory.
- A printer problem never invalidates a paid order. Staff can recover it from
  Store order history when printing/collection is added.

Before any real provider requests, we still need to establish whether the supplied
credentials are UAT or live and whether their merchant is enabled for Dynamic QR.
PhonePe's API/simulator response or confirmation from PhonePe can establish this;
the field names alone cannot. Avoid sending live credentials to UAT or assuming
generic published test credentials verify this merchant. No additional business
decision is needed for this configuration stage.

After provider/account verification and payment/recovery tests, connect the APK's
product options, quantity, basket, QR and status screens. Then add receipt printing,
staff collection and shopping analytics. Sales analytics must use verified paid
orders rather than QR creation, reservations or clicks, and distinguish payment
success from later gateway settlement into the Store's bank account.

## Provider documentation checked

- [PhonePe Dynamic QR initialization](https://developer.phonepe.com/offline-integration/dynamic-qr-solution/dqr-init-api)
- [PhonePe transaction status](https://developer.phonepe.com/offline-integration/response-capturing-api/check-payment-status-api)
- [PhonePe server-to-server callbacks](https://developer.phonepe.com/offline-integration/response-capturing-api/server-to-server-callback)
- [PhonePe offline simulator setup](https://developer.phonepe.com/offline-integration/others/getting-started-with-your-api)
