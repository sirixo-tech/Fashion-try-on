# PAYMENTS-1G — Store production QR verification

Date: 19 October 2026

## Result and remaining prerequisite

The code now supports a Store Admin generating a fixed INR 1.00 production
verification QR using that Store's saved merchant credentials. The popup opens
immediately, shows a usable provider QR when returned, and tracks payment status
and callback receipt. Production records clearly identify a real-money payment.

**Live generation is not ready to activate yet:** the account's PhonePe-issued
production Dynamic QR endpoint and v3 integration contract have not been supplied.
No production endpoint was guessed. Configure the confirmed endpoint only after
PhonePe confirms that the account supports this request/signing/response contract.
If the assigned integration differs, the adapter must be updated before use.

The implementation reuses the existing v3 Dynamic QR payload, X-VERIFY signing,
X-PROVIDER-ID, callback headers and status API format. It does not establish that
these credentials support that contract. Tests use a non-operational PhonePe-host
fixture with simulated responses, not a verified real production URL.

## What changed

- Store verification accepts saved PRODUCTION credentials independently of UAT.
  A live verification does not require the UAT declaration dropdown.
- Production uses its own API execution switch and mandatory server-only base URL.
  UAT retains its existing endpoint, switch and declared-access requirement.
- The QR request uses the Store's Merchant ID, optional Provider ID, Store reference,
  Salt Index and Salt Key from encrypted database configuration. Generate does not
  accept those values or a destination account from the browser.
- Production base URL is pinned in the encrypted verification snapshot with the
  credential version. Replacing credentials does not alter old transactions.
- Transport accepts only HTTPS PhonePe subdomains and the configured QR/status
  routes. It rejects redirects, malformed URLs, credentials in URLs, custom ports,
  query/fragment values and sandbox/UAT production bases. Response size and timeout
  bounds remain. No arbitrary third-party destination is accepted.
- The popup labels production as real money, with a dedicated Generate INR 1 live
  verification QR action and environment labels in history. Historical UAT records
  retain UAT labels even after the current account changes to production.
- `testOnly` is false for production verification; true for UAT. The API contract
  now includes the PRODUCTION environment and `productionEndpointConfigured`.
- Scope/RBAC, impersonation restrictions, idempotency, five-minute QR lifetime,
  expired-QR renewal, late confirmation checks, signatures, strict merchant/amount/
  transaction matching and safe diagnostics are retained. Audits use the actual
  verification environment. Platform testing remains UAT-only.

The QR is rendered from the provider response. It is not synthesized from the
Salt Key, nor does saving credentials alone prove where a provider settles funds.
After paying, verify settlement in the merchant's own PhonePe account as well.

## Persistence and deployment

Migration `20261019020000_store_live_payment_verification` expands the existing
verification environment constraint: PRODUCTION requires a non-null Store id.
It preserves the fixed INR 1 amount, transaction/idempotency uniqueness, history,
events and scope constraints. No columns or plaintext credential storage are added.

1. Apply pending migrations through the normal API deployment process:
   `npm run db:migrate:deploy`.
2. Deploy updated API, then web.
3. In Railway's **API service** variables, configure these after PhonePe confirms
   this account's v3 Dynamic QR contract:

   ```text
   SELFX_PHONEPE_PRODUCTION_BASE_URL=<PhonePe-confirmed base before /v3/qr/init>
   SELFX_PHONEPE_PRODUCTION_ENABLED=true
   ```

   The placeholder is explanatory, not a usable value. The production base is
   distinct from the UAT endpoint and must not be copied from the test fixture.
   Keep execution false and the base blank until the correct connection is known.

4. Keep the existing payment encryption key/version, HTTPS callback origin and
   reconciliation configuration. Credentials stay in Store Payment Settings.
5. Sign in as the actual Store Admin, open Payment Settings and use **Generate INR
   1 live verification QR**. Paying transfers real money. Reopen an active record;
   after five minutes a fresh verification is allowed. Use Open test for history.

API time/readiness controls the UI; the backend still enforces every gate.
Changing the configured production base can pause old checks because transport
permits only the current configured base while each old snapshot retains its
original endpoint. Do not reroute an old transaction to a different integration.

## Validation

All provider requests were simulated. No real merchant credentials were used,
no real QR payment was created, and no production database or deployment changed.

| Check | Result |
| --- | --- |
| Payment/provider/configuration/controller unit tests | 64 passed |
| Store/platform verification and order-payment integration | 55 passed |
| Payment UI/settings/page regressions | 47 passed |
| API initialization and OpenAPI contract | 3 passed |
| API and web TypeScript | Passed |
| Changed-file ESLint | Passed |
| API and web production builds | Passed |
| Migration on isolated localhost PostgreSQL | Applied successfully |

Coverage includes Store-specific merchant signing, production endpoint validation,
independent execution switches, missing endpoint rejection, cross-Store/platform
denial, credential replacement, original-account callbacks and status, expiry,
real-money labels, historical UAT labels and unchanged customer checkout flags.
Total: 169 passing tests. The web build retains existing image-optimization
warnings on unrelated share/Try-On pages.

## Limits and next step

This milestone enables controlled Store account verification, not live product
checkout. Shopping order payment initiation remains UAT-only, `paymentAvailable`
remains false and APK Buy is not enabled. No receipt or refund workflow is added.

The next external step is to obtain PhonePe's assigned production Dynamic QR API
documentation or a working redacted request example for this Merchant/Provider ID.
Confirm required Store/Terminal references, endpoints, callback contract and API
entitlement. Then compare the adapter and configure the API before real testing.
