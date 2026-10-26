# SelfX customer app — first milestone

Standalone Flutter Android/iOS app with an independent visual system using the official SelfX logo and colors, separate from the kiosk app and npm workspaces.

Implemented: four offline introduction slides with Skip; email signup/verification and sign-in; Google and iOS Apple sign-in; password recovery; securely stored rotating customer sessions; Home/Saved/Me; profile name and notification preference; current/all-device sign-out; and confirmed, reauthenticated account deletion. Customer credentials never create a merchant or grant dashboard access.

Photo upload, personal trial Try-On, Store QR sponsorship, Plans/credits, Saved results, support, policies, notification inbox, Android update checks and 20 offline languages are implemented. Paid personal purchases, referrals/coupons, app-store publishing and Firebase activation remain separate follow-ups.

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

Package versions are locked in `pubspec.lock`; the app's Licenses entry shows package notices. The full official wordmark remains in app headers. Launcher/PWA icons use the exact user-supplied X, while legacy launch screens keep the wordmark; see [branding assets](design/README.md). Preparing these source images does not build an APK or change an existing package.

Session startup and profile requests use skeleton layouts while the API is pending. They end on success/error, do not add artificial delays and respect reduced-motion settings. Saved and Plans now load their real customer APIs with retryable errors. Sign-in/form submission retain action indicators.

## Support, policies, notifications and updates

Me includes working support contact, policy links, a private look-ready inbox and Android direct-APK update checks. Platform Apps & Downloads now separates Kiosk and Customer mobile releases. Phone alerts are intentionally inactive until Firebase is configured on both API and native apps; inbox use does not depend on Firebase. The resolved Firebase dependencies require Android 24+ and iOS 15+.

The accepted policy version is now `2026-10-26`; Terms/Privacy/Support default to the existing public SelfX website. See [CUSTOMER-MOBILE-3](../docs/CUSTOMER-MOBILE-3-SERVICES.md) for deployment, customer certificate configuration, Firebase/APNs preparation and verification. No APK was built or published for this implementation.

## Languages

The app supports 20 offline languages with English default, immediate switching, saved account/device preferences and Arabic/Urdu RTL. Language is available before login and under Me. API deployment is required for the expanded language allowlist. See [CUSTOMER-MOBILE-4](../docs/CUSTOMER-MOBILE-4-LANGUAGES.md) for coverage, translation maintenance and release steps. Source version is 0.4.0+4; no APK was built.
