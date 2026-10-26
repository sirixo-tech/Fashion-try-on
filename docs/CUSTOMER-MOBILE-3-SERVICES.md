# CUSTOMER-MOBILE-3 — Support, policies, notifications and updates

Approved follow-up: reuse SelfX's existing contact and website, make customer service screens work, prepare Firebase now and configure delivery later. No APK, production migration, publication, notification or email was performed by this change.

## What works

- **Me → Contact us:** opens the user's email composer with app version and a blank issue description. It never sends automatically. The support address can also be copied.
- **Terms / Privacy:** actual HTTPS pages, accessible before sign-in. Current default support is `sirixollc@gmail.com`; website is `https://selfxweb-production.up.railway.app`. `/terms` is new source; `/privacy` includes original-photo seven-day and mobile-result 30-day retention. Policy version is `2026-10-26`. Review these product policy texts before production publication; local source does not publish a site.
- **Me → Notifications:** a private, paginated look-ready inbox, read status and owned-result viewing. Events expire with their result and are removed on photo/account erasure. An individually deleted or Store-purged result may leave an inbox entry until expiry; opening it reports unavailable.
- **Phone alerts:** prepared but disabled without both server and native Firebase configuration. Missing Firebase does not prevent sign-in, Try-On or inbox use. Security email delivery remains independent of the optional phone preference.
- **Me → App updates:** Android reads the installed package, version, signing certificate, ABI and SDK locally. SelfX returns only a newer published compatible customer APK. The app refuses a different package/signing certificate, opens a fresh HTTPS download in the browser and leaves installation approval to Android. This is direct APK distribution, not Play/App Store publishing or silent installation.
- **Platform Apps & Downloads:** an Application selector separates Kiosk and Customer mobile releases. Upload/inspect/review/publish workflows and permissions are shared; recommendation uniqueness now includes package and architecture. Merchant downloads remain kiosk-only.

## Deploy / enable

1. Back up and review/apply `20261026020000_customer_services` through the existing migration deployment process. Deploy API and web, including `/terms`, `/privacy` and `/support`.
2. Optionally set API `SELFX_CUSTOMER_PUBLIC_WEB_URL` to the reviewed HTTPS website origin and `SELFX_SUPPORT_EMAIL` to the existing support contact. These values are public; secrets stay server-side. Align web `NEXT_PUBLIC_SUPPORT_EMAIL` if overriding the contact. The API otherwise uses its HTTPS `SELFX_WEB_BASE_URL`, then the established production origin.
3. Before uploading mobile releases, configure `SELFX_CUSTOMER_APK_SIGNER_SHA256` using the existing mobile release certificate SHA-256 (not the kiosk certificate). `SELFX_CUSTOMER_APK_PACKAGE_NAME` defaults to `com.selfx.selfx_customer`. Existing server `SELFX_APK_AAPT_PATH`, `SELFX_APK_SIGNER_JAR_PATH`, Java and object storage must be configured. No private signing key is uploaded to SelfX. The existing validator rejects debug APKs and split installation packages; Flutter's standalone per-ABI release APKs are supported.
4. Rebuild a signed customer APK when ready, using the same existing signing key. Source version is `0.3.0+3`; increment the build number for subsequent updates. Upload under Customer mobile app, review and publish. Only compatible **published** versions are offered; a recommendation badge is optional. Retired releases cannot be downloaded via the public customer endpoint. Downloaded files outside SelfX cannot be recalled.

An older installed APK cannot gain these screens without a rebuild/reinstall. This change intentionally does not build APKs. Windows/macOS desktop and PWA show a clear unsupported direct-APK update message; iOS store distribution remains unconfigured.

## Firebase later — explicitly inactive now

Use one real Firebase project and register the actual Android package and iOS bundle. Follow the current [Flutter FCM setup](https://firebase.google.com/docs/cloud-messaging/flutter/get-started). This implementation uses the resolved SDK's Installation ID registration API (`onRegistered`, `register`, `unregister`) and HTTP v1 `message.fid` target, rather than the deprecated registration-token API. See [HTTP v1 message fields](https://firebase.google.com/docs/reference/fcm/rest/v1/projects.messages).

1. Put real **public app settings** under a `firebase` object in `mobile/assets/config/production.json`, following `mobile/assets/config/firebase.example.json`. The example is not loaded or bundled as configuration. Leave absent until ready. Never include a service-account private key in Flutter or web files.
2. On the API only, set `SELFX_CUSTOMER_FCM_PROJECT_ID` and `SELFX_CUSTOMER_FCM_SERVICE_ACCOUNT_JSON` for a service account authorized to send FCM for that project. Enable the Firebase Cloud Messaging API. Existing `SELFX_MAIL_ENCRYPTION_KEY` / version must be configured and backed up; the shared encryption service protects device registrations at rest. Follow [server authentication](https://firebase.google.com/docs/cloud-messaging/send/v1-api).
3. Android notification permission is requested only after a customer enables Phone alerts. Automatic Firebase initialization and analytics collection are disabled. A dedicated `selfx_updates` notification channel is prepared. Minimum Android API remains 24.
4. iOS requires macOS/Xcode verification, APNs credentials in Firebase, Push Notifications capability and valid Apple provisioning. Merge `PushNotifications.entitlements.example` into Runner's existing entitlements **after** enabling the capability; retain Sign in with Apple. Set `APS_ENVIRONMENT` appropriately for development/production signing. Firebase's current resolved dependencies require **iOS 15+**, reflected in the project deployment target. See [APNs setup](https://firebase.google.com/docs/cloud-messaging/ios/get-started). No Apple account/provisioning changes were performed here.
5. Rebuild and test on real devices: explicit consent, permission denial, foreground notification, background/terminated app tap, account switch, sign-out and revoked-session behavior. Web push/service workers are not implemented; the PWA still has its authenticated inbox.

## Security and reliability

Only an authenticated customer can register their device or read their inbox. Client-supplied customer IDs are rejected. Device registration is linked to an owned active session, transferred during refresh, removed at sign-out/opt-out/account deletion, and rechecked before sending. Opaque registration identifiers are hashed for deduplication and encrypted for delivery. Neither credentials nor image URLs appear in notifications. Payloads contain generic text and owned event/run references; opening a result requires customer authorization again.

A look-ready inbox event and unique per-device delivery jobs are created atomically with result persistence. A 60-second API worker uses claimed leases, bounded retries and expiry/session/preference checks. Delivery is at-least-once; generic notification tags reduce repeated display. No historical pushes are sent to newly registered devices. Missing/invalid provider credentials leave the inbox usable and delivery inactive/retryable. Production credentials are not validated by merely detecting configuration.

Update files use the existing private storage and short-lived signed download URLs. The server verifies package/certificate/metadata using APK inspection tools; Android verifies installation signatures. The client compares published metadata to its own package/certificate, but does not independently download and hash the APK bytes. Keep the same signing key for upgrade compatibility: [Android app signing](https://developer.android.com/studio/publish/app-signing).

## Validation

Tests use dedicated disposable localhost PostgreSQL databases, synthetic accounts/images, fake push/email/storage and mocked native channels. They never send real notifications or email, upload personal photos or publish releases. Android Kotlin/manifest compilation checks are separate from APK packaging. iOS/APNs and real Firebase delivery require later device acceptance after configuration.

Verified locally: 40 customer Flutter tests, 59 backend tests and 7 web tests passed. Flutter analysis reported no issues; API/web TypeScript and affected-file ESLint checks passed. Android `:app:compileDebugKotlin` and `:app:processDebugMainManifest` passed without assembling an APK. Existing APK timestamps were unchanged. The migration was applied only to disposable local test databases; their test container was stopped afterward.
