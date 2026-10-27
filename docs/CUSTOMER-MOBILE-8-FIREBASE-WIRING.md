# CUSTOMER-MOBILE-8 — Native Firebase configuration

Approved 2026-10-27. Source version **0.7.1+8**. This implements the Firebase coding part only: consume the already downloaded Android app configuration, preserve server authorization and consent, and verify native compilation without building an APK. Firebase Console, billing, signing fingerprints, production Railway credentials and deployment remain external configuration/testing steps.

## Cause and change

Android already applies the Google Services Gradle plugin and contains a registered `android/app/google-services.json` for `com.selfx.selfx_customer`. The previous Dart readiness check only read an optional `firebase.android` object in `assets/config/production.json`; that object was absent. Consequently native Firebase settings could be present while both SMS and notification code still treated the app as unconfigured.

`CustomerFirebaseConfiguration` now reads optional explicit Dart settings first. When that platform's settings are absent, it resolves the default native Firebase application's options through the installed Firebase Core SDK. Android reads the resources generated from `google-services.json`; an iOS build can use its separately registered `GoogleService-Info.plist` when supplied. Do not duplicate Android values into the Dart JSON. The backend URL remains unchanged.

- Load configuration once per configuration object, sharing a pending future across callers. There are no new startup network/API calls.
- Missing native settings remain unavailable without crashing existing email/password, Google or Apple login.
- Reject malformed/placeholder explicit settings instead of silently switching projects. Web and unsupported desktop platforms remain outside SMS/push activation.
- Push initializes the default app with the resolved options and checks project/app/sender identity. Phone authentication retains its separate transient named Firebase app, verifies its options, and still checks the project returned by the SelfX backend before requesting SMS.
- Firebase Messaging auto-init and Analytics collection remain disabled in the native manifests. Notification registration/permission remains behind the existing explicit Phone alerts flow; discovering configuration does not register a device or send a message.
- A previously disabled phone capability is refreshed from SelfX before requesting a code, so an old startup response cannot keep blocking a service enabled later on Railway. Server-disabled/misconfigured services still fail closed. Notification refresh already rechecks the server and client; its unavailable copy now distinguishes server readiness from missing app settings without exposing technical details to customers.
- No service-account JSON, private key or backend secret is read into or bundled with Flutter. No account merging, phone-only signup, token-verification relaxation or backend configuration bypass is added.

## Remaining rollout

1. Keep the downloaded Android file registered for the actual package. Ensure Firebase Phone Authentication, SMS billing/allowed regions and signing fingerprints are configured in Firebase Console.
2. The API still requires `SELFX_CUSTOMER_PHONE_ENABLED=true`, `SELFX_CUSTOMER_FIREBASE_PROJECT_ID` and `SELFX_CUSTOMER_FIREBASE_SERVICE_ACCOUNT_JSON` for SMS proof verification. Push requires the separate `SELFX_CUSTOMER_FCM_PROJECT_ID` and `SELFX_CUSTOMER_FCM_SERVICE_ACCOUNT_JSON` plus the existing mail-encryption configuration. These stay on the backend, never in the APK or GitHub. The same Firebase project may serve both, but configuring one set of variables does not activate the other.
3. Rebuild/reinstall the signed app when ready. Installed APKs cannot receive new bundled native settings through a Railway redeploy alone. Test fictional Firebase numbers first, then real SMS, denial/quota/reCAPTCHA handling, verified phone linking, notification permission, foreground/background/terminated-app delivery, sign-out and account changes on real devices.
4. iOS remains unconfigured in this checkout: provide its own Firebase registration/plist or explicit iOS options, APNs credentials and native capabilities using Apple tooling. Do not reuse Android app IDs for iOS. PWA push remains outside this slice.

Reference: [Firebase Flutter setup](https://firebase.google.com/docs/flutter/setup), [phone authentication](https://firebase.google.com/docs/auth/flutter/phone-auth), [Flutter messaging setup](https://firebase.google.com/docs/cloud-messaging/flutter/get-started). The native fallback follows the resolved Firebase Core SDK's default-app/resource resolution.

## Verification

Tests cover downloaded package/native-build wiring, native fallback, concurrent loading, explicit override precedence, invalid/placeholder settings, project identity mismatch, absent native configuration, platform isolation, stale phone capabilities, server/client notification readiness and refresh. Tests use mocked Firebase/SelfX services; no SMS, push messages or account changes are sent to a real project. Android `processDebugGoogleServices`, Kotlin compilation and manifest processing verify the downloaded file without APK assembly. Real device delivery remains a rollout check.

Completed validation: **112 Flutter tests passed**, including **22 focused Firebase/code/services tests**. Flutter analysis found no issues; whitespace checks passed. Android Google Services processing, Kotlin compilation and manifest checks passed with no APK assembly. Generated native app/project/sender/public-key settings were compared with the downloaded file and all matched. The existing rendered mobile-flow review passed. No production configuration, secret files, Firebase Console settings or backend credentials were modified.

A read-only check of the configured production API on 2026-10-27 returned customer authentication enabled, phone login enabled and push delivery available. These readiness flags confirm the server-side configuration gates are satisfied; they do not replace a real SMS/notification delivery test. Rebuild/reinstall the corrected source before device acceptance.
