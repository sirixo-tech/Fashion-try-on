# CUSTOMER-MOBILE-1 implementation

First customer mobile milestone approved on 25 October 2026: account foundation and navigation with independent Flutter presentation. The latest branding approval reuses the official SelfX logo and colors; web/kiosk layouts remain separate. Generation, personal purchases and Store QR sponsorship remain later work.

## Official branding and loading follow-up

Latest icon instruction: use the exact attached `Selfx Logo.png` X, stored unchanged at `frontend/web/public/brand/selfx-mark.png`, for customer/kiosk launchers and the existing PWA/favicon/Apple touch icons. The shared asset-only generator is `tools/branding/prepare-app-icons.cjs`; the customer command remains a wrapper. The X is no longer extracted from the wordmark. Full wordmark headers are unchanged. **No APK or application packages are built for this follow-up**; earlier APKs remain unchanged until a later authorized rebuild.

The customer app bundles the existing approved full wordmark unchanged for onboarding, sign-in/signup, navigation, retry/configuration and legacy launch screens. The separately supplied orange/yellow X is used for launcher/system splash icons. Native Android density variants, iOS sizes, Windows ICO and existing web PWA/favicon icons are prepared by the shared generator; `mobile/customer-app/tool/prepare_brand_assets.cjs` remains a compatible entry point. See the app's `design/README.md`. Temporary typed-wordmark and generic launcher artwork are removed.

The supplied-icon follow-up verified identical source hashes, 29 native icon images, four square PWA icons including maskable safe areas, Apple touch/favicon images, and ten embedded ICO frames. Native iOS icon PNGs have no alpha channel. The existing customer APK's size and modification time remain unchanged; no Flutter build or other application packaging command ran. Web metadata lint and diff whitespace checks passed.

Sign-in capability requests and secure session restoration use content-shaped skeleton screens. Profile refreshes use an account skeleton instead of stale interactive profile controls while pending. Placeholders have one accessible loading label, no interactive/announced fake content, and no pulse with reduced motion. Requests end the skeleton on success/error without artificial waiting. Static onboarding, Saved's empty state and unavailable Plans/QR remain honest static states; form submission indicators are preserved.

Follow-up verification: all 20 mobile tests passed, Flutter analysis reported no issues, the logo asset hash matched the existing approved source, and the Android debug APK rebuilt successfully. Reviews include the official logo on actual app widgets and the Home loading skeleton. The build retains the existing nonfunctional preview API origin; live configuration is unchanged. Native iOS launch/icon assets were prepared but were not compiled or device-tested on Windows.

## Delivered

- Android/iOS app in `mobile/customer-app`, outside npm workspaces and independent from kiosk widgets.
- Four offline introduction slides, Skip and persisted completion; email and configured Google/iOS Apple account flows; verified registration; password recovery; validation, visibility and safe inline errors.
- Home/Saved/Me, scanner → Plans → unavailable credit header, future-feature states, profile name, persisted notification preference, security/reset, sign-out, policy/support destinations, intro replay and confirmed deletion.
- Customer-only NestJS module and Prisma migration `20261025030000_customer_mobile_accounts`: global customers, provider identities, rotating sessions and single-use action tokens. No staff, membership or Store creation.
- Distinct customer JWT secret/audience/type, live-session checks, durable limits, Argon2 passwords, hashed codes/refresh/proof state, encrypted outbox, signup-proof binding, reset revocation and reauthenticated anonymization/deletion.
- Native refresh token in secure storage; access tokens/proofs in memory. Logout/revocation removes protected routes and discards late requests. Network failure preserves credentials for retry.

## API

All routes are under `/api/v1/customer`:

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/auth/capabilities` | Availability, provider support and terms version |
| POST | `/auth/signup` | Pending email account and encrypted verification request |
| POST | `/auth/verify-email`, `/auth/resend-verification` | Eight-digit code plus bound registration proof |
| POST | `/auth/login`, `/auth/oauth` | Customer-only session |
| POST | `/auth/apple-challenge` | Single-use Apple nonce |
| POST | `/auth/forgot-password`, `/auth/reset-password` | Generic request, recovery and device revocation |
| POST | `/auth/refresh` | Rotate opaque refresh credential |
| POST | `/auth/logout`, `/auth/logout-all` | Current/all-device revocation |
| GET, PATCH, DELETE | `/me` | Own profile, preferences and reauthenticated deletion |

Responses use `Cache-Control: no-store`. Native tokens use JSON and do not replace staff cookies. No endpoint accepts a client-selected customer or tenant identity. Matching email does not automatically link provider identities.

## Staging activation

1. Review/apply the migration through the normal deployment workflow and generate Prisma client.
2. Set `SELFX_CUSTOMER_JWT_SECRET` to a distinct random secret of at least 32 characters, separate from `JWT_ACCESS_SECRET`, on the server only.
3. Configure the existing platform SMTP account and `SELFX_MAIL_ENCRYPTION_KEY`. Codes use the encrypted durable outbox; mail/provider secrets never enter Flutter.
4. Set comma-separated `SELFX_CUSTOMER_GOOGLE_CLIENT_IDS` and `SELFX_CUSTOMER_APPLE_CLIENT_IDS` to exact token audiences. Configure native package fingerprints, Google callback IDs and Apple provisioning using the app README.
5. Set `SELFX_CUSTOMER_AUTH_ENABLED=true`, configure the staging API origin and reviewed legal/support URLs, and rebuild for devices.
6. Verify real email delivery and provider callbacks on devices. Development tests simulate delivery; this work sends no real email and changes no production schema/configuration.

The flag defaults to false so existing deployments can boot before customer configuration exists. New account routes fail closed while disabled. iOS compilation/signing needs macOS. Store publication, release signing and device acceptance remain release work.

## Privacy and scope

Future customer-mobile saved results have the user-approved 30-day expiry. Original person images, physical garment captures and sensitive derived inputs remain at most seven days; existing kiosk/commerce/API generated results remain seven days. No media is stored here, so asset expiries and cleanup remain unchanged. Generation must introduce scoped customer ownership, durable consent, private delivery, earlier deletion, expiry display and object cleanup together. Store-sponsored mobile saved results require explicit customer ownership/consent before entering that purpose.

Terms version/time records account-policy acceptance, not photo-processing consent. Image consent is required before photo collection. The notification preference does not implement push delivery or operating-system permission.

## Verification

The integration suite accepts only the dedicated disposable localhost database **customer_auth_test**, with all migrations applied:

```powershell
$env:CUSTOMER_AUTH_TEST_DATABASE_URL='postgresql://postgres@127.0.0.1:55441/customer_auth_test'
Set-Location backend/api
node ../../node_modules/vitest/vitest.mjs run src/customers --maxWorkers=1 --no-file-parallelism --hookTimeout=60000
```

Tests simulate SMTP and provider responses. They cover proof binding, expiry/replay/rates, no merchant creation, rotation/family replay, reset revocation, JWT audience/type, suspension, profile isolation, deletion, OAuth signup/linking and Apple challenges. Signature tests generate local RSA keys and mock official-provider transport. HTTP tests exercise NestJS/Fastify routes, DTOs and no-store headers. Existing staff auth/mail suites provide regression coverage.

Mobile checks use analysis, widget/controller tests, review captures with synthetic data and an Android debug build. See the app README for commands and native configuration. No customer photographs are used as fixtures.

Verified on 25 October 2026: all 74 selected backend tests passed (customer integration/HTTP/signature tests plus existing staff auth/Google callback/mail recovery regressions); all 15 mobile tests passed; final Dart analysis, backend TypeScript, ESLint, Prettier, Prisma validation and diff whitespace checks passed. The migration deployed successfully only to the disposable local test database, whose server was stopped afterward. The final Android debug APK built successfully against the nonfunctional preview origin `https://api.selfx.invalid`; it must be rebuilt against configured staging for live sign-in. The current Apple plugin emits a non-blocking legacy Kotlin Gradle Plugin warning; review its compatibility before a future Flutter upgrade. iOS build and real-device OAuth/email acceptance remain unverified.

## Next milestone

Consent → person/outfit uploads → shared SelfX orchestration → private customer-owned results → Saved with real 30-day expiry/deletion. Then add separate personal plans and verified Store QR sponsorship, with a server-selected payer, eligible catalog, limits and no personal fallback. Referrals/coupons, translations, pushes, wardrobe/planning and recommendations remain deferred.
