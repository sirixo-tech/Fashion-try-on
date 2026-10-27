# CUSTOMER-MOBILE-5 — Email and Firebase phone codes

Approved 2026-10-27: add email/phone code sign-in, verified phone linking, optional signup phone/country-code fields, six-digit email verification/reset codes and translated OTP states. Keep Google/Apple/password login, the eight-character password minimum, current premium presentation and header positions.

## Customer behavior

- Sign in → **Sign in with a code** opens one **Email or mobile number** input. Phone numbers include their international country code, e.g. `+91`. Email sends a six-digit code through the existing SelfX mail outbox. Phone verification uses Firebase Authentication, then exchanges the verified Firebase ID token for the normal SelfX customer session.
- Both Forgot password and the separate Me → Account security screen accept six-digit reset codes and passwords of 8–128 characters, with resend countdowns.
- Signup still requires name, email, password and terms acceptance. Country code/phone are optional. A supplied phone is stored only as pending contact information; it does not reserve ownership or allow phone login. Verify email, sign in, then open **Me → Phone number** to verify/link it. Phone-only automatic account creation is intentionally excluded: an unknown verified phone directs the user to email signup or their existing account method.
- Existing customers keep the same customer ID, credits, Saved history and Store visit context. No automatic account merging by matching email or phone. A number already linked to another customer cannot be claimed. Suspended/deleted customers cannot sign in through a new method.
- Phone linking/replacement requires a SelfX sign-in within ten minutes and Firebase phone authentication within five minutes. Session refresh preserves the original authentication timestamp. Older pre-migration sessions must sign in again before linking, but remain usable for existing authorized activities.
- The phone screen explains Google's processing of the number and requires consent before calling Firebase. Verified linking records `phoneConsentAt`. Account deletion clears SelfX's verified/pending phone and consent fields together with its linked identity. Automatic deletion of the separate Firebase Auth identity is excluded: automatic approval review rejected that irreversible external account operation because it was not explicitly authorized. Any Firebase identity-removal workflow needs separate authorization.
- All new interface/error/consent text is bundled for the existing 20 languages. Arabic/Urdu layout remains RTL; contact/code fields remain LTR. Initial additional translations used only static text through the previously approved translation endpoint, with no customer data or credentials. Native-speaker review remains advisable.

## Verification boundary

- New email codes contain six cryptographically random numeric digits, including possible leading zeroes. They expire ten minutes after the request and can be used once. Purpose-specific HMAC hashes protect codes at rest; encrypted mail jobs retain the existing delivery/lease guards.
- Email login requires an active account and a matching random request proof. Its digest is included in the code hash, so a code cannot be submitted through a different login request. Code consumption and session creation are atomic. Unknown, pending and suspended email requests return the same safe response and generate no login email.
- Durable rate limits apply by IP and identifier, with five code-verification attempts per email/purpose per fifteen minutes. Email resend uses a persistent sixty-second cooldown and existing bounded request budgets. The app displays a sixty-second timer and limits code submissions. Requesting another code does not reset server attempt budgets.
- Firebase validates SMS codes. The Admin SDK checks signature, issuer/project audience, expiry, disabled user and revocation. SelfX additionally requires `firebase.sign_in_provider=phone`, recent `auth_time`, a canonical verified phone claim and the bound identity. Client-supplied customer IDs or verified phone claims are not accepted.
- A SelfX preflight rate-limits normal app SMS requests. It is not an independent hard cap on direct Firebase requests: configure Firebase's supported SMS regions, quotas and abuse protections before launch. Production refuses an Auth emulator override.
- Firebase auth runs in a separate transient client auth instance. Its token is exchanged for SelfX tokens and its client session is signed out; Firebase is not used as the SelfX account/credit/history database. Notification initialization and phone initialization remain independent and share only the public project settings.

## API and persistence

- `POST /api/v1/customer/auth/email-code/request`: email and optional existing `loginProof`; returns generic mail status, proof and resend delay.
- `POST /api/v1/customer/auth/email-code/login`: email, six-digit code, proof and optional device name.
- `POST /api/v1/customer/auth/phone/request`: canonical international phone number; rate-limited preflight, returning the configured public project ID.
- `POST /api/v1/customer/auth/phone/login`: Firebase ID token; returns the existing SelfX session bundle for a linked customer.
- `POST /api/v1/customer/me/phone`: authenticated SelfX bearer plus Firebase ID token and `acceptPhoneVerification=true`; derives ownership server-side.
- Signup optionally accepts canonical `phoneNumber`; `/me` returns verified and pending contacts. Capabilities expose `providers.emailCode`, `providers.phone` and `codeLength=6`. No private Firebase credentials are returned.
- Migrations `20261027010000_customer_phone_login` and `20261027011000_customer_phone_consent` extend the existing customer/identity/session/action-token models. No merchant tenant or parallel account system is created. Customer dashboard method labels include Phone for linked identities.
- Migration invalidates outstanding email verification/reset tokens. Previously prepared messages are skipped by existing outbox token-state checks; request a fresh six-digit code. Upgrade the mobile app alongside the API because older APKs expect eight-digit input.

## Configuration and rollout

The integration is prepared; no Firebase project, billing, production variables or deployment is changed by this work. Phone login fails closed without both server and client configuration. Existing email/password/Google/Apple flows remain available.

1. Apply the two migrations and deploy the API before distributing the updated customer app.
2. Create/reuse the intended Firebase project, enable Phone Authentication, enable the required Blaze billing and allow only intended SMS destination regions. Start with Firebase fictional test numbers.
3. Register the customer Android package `com.selfx.selfx_customer`. Add SHA-1/SHA-256 fingerprints for the signing keys actually used by installed builds; include Play App Signing fingerprints when publishing through Google Play. Configure Android app verification/reCAPTCHA according to Firebase's platform instructions.
4. Add public Firebase options under `firebase.android` / `firebase.ios` in `mobile/assets/config/production.json`, using `firebase.example.json` as the shape reference. Do not replace the existing backend URL. The SDK loads project options only when an opted-in feature is used.
5. Configure `SELFX_CUSTOMER_FIREBASE_PROJECT_ID` and `SELFX_CUSTOMER_FIREBASE_SERVICE_ACCOUNT_JSON` on the API only, then explicitly set `SELFX_CUSTOMER_PHONE_ENABLED=true`. Give the backend credentials the access required for ID-token revocation/user-status checks. These are separate from the optional FCM variables, even when using the same Firebase project.
6. For iOS, configure the registered bundle, APNs capability/key, remote-notification background mode and required reCAPTCHA URL scheme/native settings. iOS/device verification remains pending a configured project and Apple tooling.
7. Test new/existing accounts, duplicate phones, email code expiry, sign-out, password reset, background/resume, invalid codes, SMS quota/reCAPTCHA failures and disabled accounts on real devices. Rebuild/reinstall signed source version **0.5.0+5** when ready. No APK is built by this task.

References: [Flutter phone authentication](https://firebase.google.com/docs/auth/flutter/phone-auth), [Admin token verification](https://firebase.google.com/docs/auth/admin/verify-id-tokens), [session/revocation checks](https://firebase.google.com/docs/auth/admin/manage-sessions), [SMS limits](https://firebase.google.com/docs/auth/limits).

## Validation

Verified locally: the full 90-test customer Flutter suite passed, followed by five passing focused signup/Account-security/code cases (92 distinct Flutter tests verified). All 20 language layouts include the phone-link and signup screens. Final changed-file Flutter analysis reported no issues. The 38-test backend group passed, followed by 24 passing focused authentication/phone-proof tests including the added expiry case (39 distinct backend tests verified). API/web TypeScript and affected ESLint passed. Android `:app:compileDebugKotlin` and `:app:processDebugMainManifest` passed without assembling an APK; dependency deprecation warnings remain. Actual signup/code/contact/phone-link screen PNGs were rendered and reviewed under `tmp/customer-mobile-review`.

Tests use only disposable localhost databases and simulated email/Firebase services. Production migrations, real SMS delivery, Firebase console setup, iOS native compilation and device acceptance remain rollout steps. No credentials or Firebase project were configured, no notifications/SMS sent and no APK built.
