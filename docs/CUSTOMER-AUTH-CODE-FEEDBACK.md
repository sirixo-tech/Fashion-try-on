# Customer signup and password-reset code feedback

Approved by the user on November 15, 2026. This supersedes generic account-existence responses only for customer signup, verification resend and forgot password. The user explicitly accepts revealing whether a customer email is registered. Password sign-in, email-code login, SMS/Firebase, Google/Apple, public account deletion and merchant/staff accounts keep their existing boundaries and behavior.

## Behavior

- Signup for an active customer returns `CUSTOMER_ACCOUNT_EXISTS` (409), without changing credentials or sending a verification email. The mobile app stays on signup and offers Sign in and Forgot password with the email preserved.
- Forgot password for an unknown customer returns `CUSTOMER_ACCOUNT_NOT_FOUND` (404). The app stays on the request screen and offers Create account. Staff/merchant users with the same email do not become customer accounts through this endpoint.
- A pending account must complete account creation/email verification before reset; suspended/deleted accounts remain unavailable. A verification resend requires the current registration proof. Unsupported states never enqueue mail or bypass verification.
- Signup and verification resends share a five-request-per-email/15-minute `VERIFY_EMAIL` budget. Forgot password has its own five-request `RESET_PASSWORD` budget. Initial signup and pending-account password login also obey the verification budget and 60-second cooldown.
- Existing IP and code-guess limits are retained. Sending-budget exhaustion returns explicit `CUSTOMER_CODE_RATE_LIMITED` (429, retry hint 900 seconds); cooldown returns `CUSTOMER_CODE_COOLDOWN` (429, retry hint 60 seconds). Hints conservatively use the full window, rather than disclosing an exact bucket expiry. Neither path returns a code-request success message.
- Resend limits, cooldown, signup account/proof mutations and encrypted outbox insertion commit together. A rejected resend or failed queue write does not spend the accepted-send budget or replace an earlier proof/password. Customer row locking is consistent across signup/resend/login to avoid lock-order deadlocks.
- Mail still uses the existing encrypted outbox, purpose-bound six-digit tokens, 10-minute expiry, security-version checks, single-use claims and original SMTP transport/retry process. No code is displayed to an unauthenticated caller. No new account, token or retention bypass is introduced.
- New account/status/rate/success copy is included in all 20 mobile language catalogs so errors do not fall back to a generic translated failure. Follow-up buttons preserve the relevant email, including number-first signup's verification email. The UI displays the server's retry hint after a rejected resend and clears the previous success notice.

## Delivery investigation

Confirmed source causes of misleading behavior were silent shared-address throttling and inappropriate account eligibility being surfaced as generic success. Pending-account password login could also update a proof without queueing a replacement email when throttled. These paths are corrected.

The local Railway CLI is unauthenticated (`Unauthorized. Please login with railway login`), so production job statuses, failures and inbox delivery could not be inspected. Do not describe the reported production email failure as conclusively diagnosed or SMTP delivery as fixed. No production login, configuration change or test email was attempted. SMTP/provider traffic in tests is simulated.

Local verification covers actual PostgreSQL transactions and the real outbox worker with a simulated SMTP sender: five sends then rejection, independent verification/reset budgets, cooldown rollback, correct active/missing/pending/suspended handling, stale proofs, competing signup/resend, failed queue rollback, reset mail delivery failure/retry, expiry and single-use verification/reset, and existing identity/session protections. Mobile tests cover feedback/navigation, preserving the email and code, retry timers, small-screen layout and localization fallback.

## Verification results — November 15, 2026

- **78 backend tests passed** across customer-auth integration/HTTP, customer photo HTTP boundaries, SMTP and email templates, using the isolated localhost `customer_auth_test` database and simulated SMTP/provider traffic. The test database server was stopped afterward.
- Backend TypeScript, changed-source ESLint, formatting and whitespace checks passed. Flutter analysis of the changed screen/tests passed with no issues.
- The three new feedback/navigation/resend tests passed, including a 320-pixel screen, preserved email/code and a disabled rate-limited resend action. The existing signup-success test now accepts the existing mandatory Terms checkbox and passes its password validation, proof-bound email verification and return-to-sign-in assertions.
- The final five-file mobile run had **65 passing tests and 14 pre-existing failures**, including passing 20-language catalog completeness/specific-message checks and language-screen checks. It is not an all-green mobile suite.
- To verify regression status, the same mobile suite was run with the untouched HEAD auth screen and original HEAD app tests, restoring both working files in `finally`. That baseline had **61 passing tests and 15 failures**. All 14 remaining final failures are in the baseline failure set; no new failing test was introduced. Failures concern existing consent/auth/Home/onboarding expectations. The signup-success fixture correction accounts for one repaired baseline failure. These unrelated assertions/product paths were not rewritten to make the suite green.
- Detailed local comparison logs are `tmp/customer-auth-feedback-mobile-results.jsonl` and `tmp/customer-auth-baseline-mobile-results.jsonl`; these are ignored development artifacts. No production delivery or APK build is claimed.

## Release

No database migration or environment variable change is required. Deploy the updated SelfX API and rebuild/release the customer Flutter app to deliver the new buttons/copy/retry behavior. Previously built APKs are unchanged. No APK, deployment or production mail test is part of this source change.

After deployment, check one authorized signup and reset request against actual outbox delivery statuses and the receiving mailbox. Resolve any confirmed SMTP/provider failure from its actual failure code. Do not log recipient addresses, codes, credentials or encrypted payloads into general logs.
