# Public customer account deletion

## Scope and audit

`/delete-account` is a public Next.js page in the existing `frontend/web` application. It is outside the authenticated `/app` layout. It uses public `@selfx/ui` components and the existing support contact (`NEXT_PUBLIC_SUPPORT_EMAIL`, default `hello@selfx.in`). No Flutter code or existing API contract changes.

Customer accounts are independent `customers`, `customer_identities` and `customer_sessions` records. Staff/merchant/platform users use `users` and memberships. The public flow accepts no user, customer, Store or organization identifier and only queries customer records. A merchant login sharing the same email is unaffected.

Existing mobile deletion uses password or verified Google/Apple reauthentication and `DELETE /api/v1/customer/me`. It immediately revokes sessions, deletes customer identities/action tokens/device registrations/notifications/saved garments, nulls customer email/phone fields, replaces the display name and marks the customer `DELETED`. This is account closure/anonymization, not hard deletion of the customer row. Pending mobile payments block it. The controller requests existing media cleanup after account closure; failed cleanup is retried by existing cleanup services. These behaviors are reused by the web flow.

Original temporary customer images and derived inputs expire within seven days; mobile generated results expire within 30 days. Saved profile/avatar images persist until replacement/removal/account deletion. Consent, Try-On/run/usage, credit/payment, security and audit records can remain; there is no verified blanket retention period for all retained records or backups. The page discloses that gap rather than inventing a deadline. Product/privacy owners must define and approve retained-record periods and any provider-side erasure obligations before claiming complete Google Play compliance. SelfX deletion does not delete separate Google/Apple/Firebase accounts. Downloaded copies are outside SelfX control.

## Changed files

- Created `frontend/web/app/delete-account/page.tsx`, `frontend/web/components/customer-deletion-form.tsx` and `frontend/web/components/customer-deletion-form.test.tsx`.
- Updated `frontend/web/components/public-legal-links.tsx` and `frontend/web/next.config.ts` for discovery and privacy headers.
- Updated `backend/api/src/customers/customer-auth.controller.ts`, `customer-auth.service.ts`, `customer.dto.ts`, `customer-auth.http.spec.ts` and `customer-auth.integration.spec.ts`.
- Updated `backend/api/src/mail/selfx-email-template.ts` and created `selfx-email-template.spec.ts` for deletion-specific mail and regression checks.
- Updated `backend/database/prisma/schema.prisma` and created `backend/database/prisma/migrations/20261113000000_customer_account_deletion_code/migration.sql`.
- Created this implementation/deployment report and added a cross-reference in each of the six core project documents, `docs/01-PRD.md` through `docs/06-IMPLEMENTATION-PLAN.md`.

## Request and verification

| Endpoint | Access | Behavior |
| --- | --- | --- |
| `POST /api/v1/customer/account-deletion/request` | Public | Email, optional resend `deletionProof`, honeypot `website`. Always returns a generic eligibility message and a browser proof. No synchronous account lookup or deletion. |
| `POST /api/v1/customer/account-deletion/confirm` | Public, deletion-code verified | Email, six-digit code, browser proof, literal `confirmation: DELETE`. Consumes a purpose-bound, security-version-bound, single-use code and closes the customer in one transaction. Returns a message only. |
| `DELETE /api/v1/customer/me` | Existing authenticated customer session and reauthentication | Existing Flutter flow; unchanged response and authentication requirements. |

Reuses encrypted mail outbox, durable HMAC-keyed rate buckets, customer action tokens, account locking and the original deletion transaction. The only database change is adding `DELETE_ACCOUNT` to `CustomerActionPurpose` in migration `20261113000000_customer_account_deletion_code`. A separate purpose prevents sign-in/recovery codes authorizing deletion. No new tables.

The mail worker checks for an eligible active customer, generates the code and stores only its HMAC digest. The digest binds email, code and the browser proof. Codes expire 10 minutes from request creation, including queue time. Deletion codes cannot create sessions; sign-in codes cannot delete accounts. Duplicate/replayed/expired/wrong-proof codes fail safely. Changes in customer security version invalidate codes. A pending payment rolls back the transaction, including code consumption. Successful public deletion records `CUSTOMER_ACCOUNT_DELETED` with customer resource ID and fixed channel/verification metadata, without contact details, codes or raw IPs.

Request limits: 10 per IP per 15 minutes, at most three requests per email per 15 minutes, and a 60-second per-email cooldown. The existing code limits also apply: 20 attempts per IP and five attempts per email/purpose per 15 minutes. Honeypot submissions consume the IP limit but enqueue no mail. All requests have DTO length/format validation and reject extra fields. Responses are `no-store`. Browser requests omit cookies, avoid merchant session hooks, and keep code/proof only in component memory, never URL or browser storage.

Phone-only accounts, inaccessible email, suspended/pending accounts and payment issues use the existing support email request pathway. Support must verify ownership before any action; contact details alone do not authorize deletion. The page does not claim automated phone verification or a new staff customer-deletion UI. Support must follow a controlled verified-owner process; an operational support runbook and response/retention times require product confirmation.

## Deployment

1. Deploy the database enum migration before enabling the new API code. Normal command from the repository root: `npm run db:migrate:deploy`. Run `npm run db:generate` for local clients; the API build also generates Prisma.
2. Build/deploy the API with the existing customer auth and mail settings: `SELFX_CUSTOMER_AUTH_ENABLED=true`, distinct `SELFX_CUSTOMER_JWT_SECRET`, `SELFX_MAIL_ENCRYPTION_KEY` and enabled platform SMTP configuration. The existing mail worker must be running. No new secret/environment variable is required.
3. Build/deploy SelfX web using the existing server-side `SELFX_API_UPSTREAM_URL=https://selfxapi-production.up.railway.app`. As documented in README, remove production public API URL overrides to use the same-origin proxy. Existing `NEXT_PUBLIC_SUPPORT_EMAIL` may override the displayed support email.
4. Existing deployment scripts: `npm run build --workspace=@selfx/api`, `npm run build --workspace=@selfx/web`, then their existing `start` commands. Use the regular deployment pipeline; this change does not publish or modify Railway configuration.
5. On the deployed site, open `/delete-account` without cookies/in incognito, verify HTTP 200 and no login redirect, inspect desktop and mobile layouts, then use a disposable customer to verify real SMTP delivery, explicit confirmation, account closure and private-object cleanup. Verify any configured reverse proxy/WAF preserves the trusted client IP and does not require staff authentication for these public paths.

Repository deployment configuration identifies the intended URL as:

`https://selfxweb-production.up.railway.app/delete-account`

Enter that exact URL in Play Console's **Delete account URL** field only after the deployment and live checks pass. A custom frontend domain may be used if it serves the same route. The authenticated API URL is not the Play Console webpage URL.

## Verification notes

Verified locally on November 13, 2026:

- 71 backend tests passed across customer auth integration/HTTP, customer photo HTTP boundaries, SMTP and email templates. SMTP/provider traffic was simulated; the database was isolated on localhost port 55461 and stopped after testing.
- Nine web tests passed across the deletion page/form and existing password recovery.
- One existing Flutter regression passed: `flutter test --no-pub test/customer_app_test.dart --plain-name 'does not delete an account without explicit confirmation'`.
- Backend/web TypeScript, changed-source ESLint with zero warnings, Prisma generation/schema validation, formatting and `git diff --check` passed.
- The production Next.js build passed and prerendered `/delete-account`. It reported existing image-optimization warnings in unrelated files and webpack cache snapshot warnings.
- Both local development and production servers returned HTTP 200 for an unauthenticated `/delete-account` request, with no login redirect; the production response included `Cache-Control: no-store` and `Referrer-Policy: no-referrer`.

Local unauthenticated HTTP GET verified status 200, visible page heading/form, no redirect, `Referrer-Policy: no-referrer` and `Cache-Control: no-store`. UI tests cover public rendering, generic feedback, cookie omission, explicit confirmation, duplicate submission/resend protection, safe errors and proof clearing. Backend HTTP/integration tests use simulated SMTP and an isolated disposable localhost `customer_auth_test` database; they cover proof/purpose isolation, expiry/replay, merchant separation, pending payments, DTO rejection, audit metadata, session revocation and existing password/OAuth/mobile behavior.

The checkout contains a pre-existing untracked empty directory `backend/database/prisma/migrations/20261029050000_custom_credit_plan_features`. Prisma migration deployment fails locally with P3015 when it sees that directory. Test setup copied the existing SQL migrations into an ignored temporary schema directory, excluding that empty directory, and applied them to an isolated test database. No historic migration was changed. Empty directories are not part of Git deployments; confirm the deployment artifact does not contain it.

Browser visual review was stopped by the computer-use URL safeguard and is not verified. This implementation does not establish that the page is live or that Google Play has approved it. Real delivery, deployed request completion, physical object cleanup, mobile/desktop visual acceptance and retained-data policy approval remain release checks.

On November 13, 2026, a read-only HTTPS check of the intended Railway URL returned **404**. It is not deployed yet. Do not submit that URL to Play Console until it returns the new page and the deployed verification workflow has passed.
