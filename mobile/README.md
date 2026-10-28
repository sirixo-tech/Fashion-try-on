# SelfX customer app — first milestone

Current source **0.13.0+15** includes ten SelfX demo garments and ten selectable full-body models per supported Women/Men category in Home and the personal Try-On flow. Demo looks use personal credits and temporary images, and do not appear in Store QR catalogs. See [Customer mobile 15](../docs/CUSTOMER-MOBILE-15-DEMO-CATALOG.md). Coordinate API assets and app rebuild for rollout; no APK built.

Source **0.12.0+14** adds post-login interests and private saved avatar photos, with a temporary full-body copy selected by default in clothing Try-On. Manage photos in Me → My avatar. See [Customer mobile 14](../docs/CUSTOMER-MOBILE-14-AVATAR.md). Migration, deployment and an app rebuild are rollout steps; no APK built.

Source **0.11.1+13** revises the welcome image to a deep teal boutique with garment/reference and outfit-preview imagery. Image backdrops can vary with the content; the app screen backgrounds remain unchanged. See [Customer mobile 13](../docs/CUSTOMER-MOBILE-13-TRYON-COVER.md). Rebuild the app to show the new cover. No APK built.

Source **0.11.0+12** replaces the welcome cover with a two-model editorial image and supports automatic backend linking of eligible verified Google email matches to the existing customer account. See [Customer mobile 12](../docs/CUSTOMER-MOBILE-12-GOOGLE-AUTO-LINK-COVER.md) for authority checks, preserved credentials/credits and rollout. The API must be deployed for automatic linking; the cover requires an app rebuild. No APK built.

Source **0.10.0+11** adds email/mobile password login, number-first signup with email verification, inline policy links, native Android Google configuration, Profile → Link Google, ten-second phone retry admission and safe SMS failure diagnostics. See [Customer mobile 11](../docs/CUSTOMER-MOBILE-11-AUTH-METHODS.md) for the lookup-index migration, account-linking rules and real-device Firebase acceptance. No APK built.

Source 0.9.0+10 updates first launch to an editorial welcome, three illustrated information screens and matching login/signup. It reuses bundled fashion images, existing authentication and all 20 languages. Returning sessions keep their current behavior. See [Customer mobile 10](../docs/CUSTOMER-MOBILE-10-WELCOME-AUTH.md). No APK built.

Standalone Flutter Android/iOS app with an independent visual system using the official SelfX logo and colors, separate from the kiosk app and npm workspaces.

Implemented: an editorial welcome and three offline information screens with Skip; email signup/verification and sign-in; Google and iOS Apple sign-in; password recovery; securely stored rotating customer sessions; Home/Saved/Me; profile name and notification preference; sign-out; and confirmed, reauthenticated account deletion. Customer credentials never create a merchant or grant dashboard access.

Photo upload, personal trial Try-On, Store QR sponsorship, Plans/credits, Saved results, support, policies, notification inbox, Android update checks and 20 offline languages are implemented. Email code login, six-digit verification/reset codes and prepared Firebase phone login/linking are included. Country selection is searchable with remembered device preferences. The header contains scanner, language dropdown and credits/Add credits. Me has one consolidated profile card with private photo change/removal and account settings; About contains installed-version metadata without a Licenses section. Paid personal purchases, referrals/coupons, app-store publishing and Firebase activation remain separate follow-ups.

## Run

Use Flutter 3.44 / Dart 3.12 or newer compatible versions. From this directory:

```powershell
flutter pub get
flutter run
```

The production API origin is bundled in `assets/config/production.json` (`selfxCustomerApiBaseUrl`), matching the kiosk's configured SelfX backend. Normal runs/builds do not require a URL argument. An optional `--dart-define=SELFX_API_BASE_URL=https://YOUR-STAGING-API-HOST` overrides that asset for development/staging. The URL is public configuration, not a secret; credentials and provider keys must never be bundled.

The API base must be an HTTPS origin without path, query, fragment or credentials. Local development may explicitly set `--dart-define=SELFX_ALLOW_LOCAL_API=true` and override the URL with `http://10.0.2.2:3001` (Android emulator), `http://127.0.0.1:3001` or `http://localhost:3001`. Native development transport policies must also permit that local endpoint; do not enable cleartext globally for release. Missing or invalid configuration retains the safe configuration-error screen.

Optional public native configuration (never secrets):

```powershell
flutter run --dart-define=SELFX_API_BASE_URL=https://YOUR-SELFX-API-HOST --dart-define=SELFX_GOOGLE_SERVER_CLIENT_ID=YOUR-WEB-OAUTH-CLIENT-ID --dart-define=SELFX_GOOGLE_IOS_CLIENT_ID=YOUR-IOS-OAUTH-CLIENT-ID --dart-define=SELFX_TERMS_URL=https://YOUR-HOST/customer-terms --dart-define=SELFX_PRIVACY_URL=https://YOUR-HOST/customer-privacy --dart-define=SELFX_SUPPORT_URL=https://YOUR-HOST/support
```

Google buttons require native configuration and backend availability. The server client ID is a Google Web OAuth client ID, not a secret. Register Android package `com.selfx.selfx_customer` and debug/release signing SHA fingerprints with Google. Register iOS bundle `com.selfx.selfxCustomer`. Set Xcode Runner build settings `SELFX_GOOGLE_IOS_CLIENT_ID` and `SELFX_GOOGLE_REVERSED_CLIENT_ID` for Info.plist callbacks; pass the iOS Dart client ID too. The backend allowlist must include actual issued token audiences.

Apple uses native iOS sign-in only. Enable Sign in with Apple in the Developer account, App ID, provisioning profile and Xcode capabilities; Runner includes the entitlement. Allowlist the bundle audience on the backend. The API binds a single-use nonce and verifies the signed token. iOS builds/signing require macOS/Xcode and were not performed on Windows.

Configure reviewed, published HTTPS Terms, Privacy and Support destinations before release. Preview fallback copy is explanatory, not final legal publication. The accepted policy version comes from the backend, currently `2026-10-26`.

## Backend activation

See [the implementation record](../docs/CUSTOMER-MOBILE-1-IMPLEMENTATION.md). Review/apply the migration on staging, configure encrypted platform SMTP, set a distinct customer JWT secret and enable the feature. Building this app does not change production configuration or schema.

## Verification and build

```powershell
flutter analyze
flutter test
flutter build apk --release --split-per-abi
```

Release APKs: `build/app/outputs/flutter-apk/app-<abi>-release.apk`. Release signing requires a real keystore. For an installable development package, use `flutter build apk --debug`; its output is `build/app/outputs/flutter-apk/app-debug.apk`. Existing APKs retain their previous configuration until rebuilt. Bundling the production origin does not enable customer auth or configure SMTP/OAuth on the backend; those activation requirements still apply.

Optional readable widget captures on Windows: `flutter test --dart-define=CUSTOMER_REVIEW=true`. This loads local Flutter Roboto/Material fonts and Windows Georgia for review only; Windows fonts are not bundled. Captures go to ignored repository `tmp/customer-mobile-review/`. Production uses native Roboto/serif resolution.

Release signing is loaded from the ignored `android/key.properties`; see
`android/key.properties.example` and [the signing setup](../docs/ANDROID-RELEASE-SIGNING.md)
for private key backup, release fingerprints and the first debug-to-release
installation. Missing signing configuration fails before release packaging.

## Working Try-On and retention

Customer Try-On is now connected: durable consent, camera/gallery upload, free trial, generation progress, Saved, result download and deletion. Personal trials use the configured Starter trial credits once per customer account. Store QR sponsorship uses eligible Store products and charges only that Store. Generated mobile results expire within 30 days; original photos and outfit captures within 7 days. Paid personal purchases remain unconfigured. See [CUSTOMER-MOBILE-2](../docs/CUSTOMER-MOBILE-2-IMPLEMENTATION.md) for migration, storage lifecycle and deployment requirements. No APK was built for this change.

Package versions are locked in `pubspec.lock`; dependency notice files remain bundled, with no Licenses section in the app UI. The full official wordmark remains in app headers. Launcher/PWA icons use the exact user-supplied X, while legacy launch screens keep the wordmark; see [branding assets](design/README.md). Preparing these source images does not build an APK or change an existing package.

Session startup and profile requests use skeleton layouts while the API is pending. They end on success/error, do not add artificial delays and respect reduced-motion settings. Saved and Plans now load their real customer APIs with retryable errors. Sign-in/form submission retain action indicators.

## Support, policies, notifications and updates

Me includes working support contact, policy links, a private look-ready inbox and Android direct-APK update checks. Platform Apps & Downloads now separates Kiosk and Customer mobile releases. Phone alerts are intentionally inactive until Firebase is configured on both API and native apps; inbox use does not depend on Firebase. The resolved Firebase dependencies require Android 24+ and iOS 15+.

The accepted policy version is now `2026-10-26`; Terms/Privacy/Support default to the existing public SelfX website. See [CUSTOMER-MOBILE-3](../docs/CUSTOMER-MOBILE-3-SERVICES.md) for deployment, customer certificate configuration, Firebase/APNs preparation and verification. No APK was built or published for this implementation.

## Languages

The app supports 20 offline languages with English default, immediate switching, saved account/device preferences and Arabic/Urdu RTL. Language is available before login and under Me. API deployment is required for the expanded language allowlist. See [CUSTOMER-MOBILE-4](../docs/CUSTOMER-MOBILE-4-LANGUAGES.md) for translation maintenance. Source version is 0.8.0+9; no APK was built. See [CUSTOMER-MOBILE-6](../docs/CUSTOMER-MOBILE-6-ACCOUNT-UI.md) for country selection, profile editing and installed-version/About details. See [CUSTOMER-MOBILE-5](../docs/CUSTOMER-MOBILE-5-OTP.md) for email/phone codes, the two required migrations, Firebase configuration, account linking and rollout steps. Real SMS remains unavailable until the project, signing fingerprints, billing and server/client settings are configured.

See [CUSTOMER-MOBILE-7](../docs/CUSTOMER-MOBILE-7-PROFILE-HEADER.md) for the consolidated profile/header and private profile photos. Apply `20261027030000_customer_profile_photo` and deploy the API before distributing version 0.7.0+7. New profile pictures persist until replaced/removed, use existing private storage, and never become Try-On inputs automatically. Legacy uploads keep their recorded retention until replaced. No APK built.

Firebase wiring now reads the Android resources generated from `android/app/google-services.json` when optional Dart Firebase settings are absent; no duplicate public values are needed. Native Google Services processing is already enabled. Explicit overrides must match the intended project/app; missing settings still fail closed. See [CUSTOMER-MOBILE-8](../docs/CUSTOMER-MOBILE-8-FIREBASE-WIRING.md) for API variables, device checks and source version 0.7.1+8. No APK or external configuration changes were made.

[Customer mobile 9](../docs/CUSTOMER-MOBILE-9-PROFILE-SIMPLIFICATION.md) moves Log out/Delete account to outer settings, removes the all-device logout entry and adds an avatar + with a compact Gallery/Camera/Remove chooser. Apply `20261027040000_persistent_profile_photos` before deploying the persistent-profile API and distributing source 0.8.0+9. Try-On retention is unchanged. No APK built.
