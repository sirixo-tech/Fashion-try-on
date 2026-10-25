# SelfX customer app — first milestone

Standalone Flutter Android/iOS app with an independent visual system using the official SelfX logo and colors, separate from the kiosk app and npm workspaces.

Implemented: four offline introduction slides with Skip; email signup/verification and sign-in; Google and iOS Apple sign-in; password recovery; securely stored rotating customer sessions; Home/Saved/Me; profile name and notification preference; current/all-device sign-out; and confirmed, reauthenticated account deletion. Customer credentials never create a merchant or grant dashboard access.

QR, Plans, credit balance, generation, uploads and Saved results are visibly unavailable. No images are collected. Referrals/coupons, push delivery and additional translations are deferred.

## Run

Use Flutter 3.44 / Dart 3.12 or newer compatible versions. From this directory:

```powershell
flutter pub get
flutter run --dart-define=SELFX_API_BASE_URL=https://YOUR-SELFX-API-HOST
```

The API base must be an HTTPS origin without path, query, fragment or credentials. Local development may explicitly set `--dart-define=SELFX_ALLOW_LOCAL_API=true` and use `http://10.0.2.2:3001` (Android emulator), `http://127.0.0.1:3001` or `http://localhost:3001`. Native development transport policies must also permit that local endpoint; do not enable cleartext globally for release. No production API address is shipped.

Optional public native configuration (never secrets):

```powershell
flutter run --dart-define=SELFX_API_BASE_URL=https://YOUR-SELFX-API-HOST --dart-define=SELFX_GOOGLE_SERVER_CLIENT_ID=YOUR-WEB-OAUTH-CLIENT-ID --dart-define=SELFX_GOOGLE_IOS_CLIENT_ID=YOUR-IOS-OAUTH-CLIENT-ID --dart-define=SELFX_TERMS_URL=https://YOUR-HOST/customer-terms --dart-define=SELFX_PRIVACY_URL=https://YOUR-HOST/customer-privacy --dart-define=SELFX_SUPPORT_URL=https://YOUR-HOST/support
```

Google buttons require native configuration and backend availability. The server client ID is a Google Web OAuth client ID, not a secret. Register Android package `com.selfx.selfx_customer` and debug/release signing SHA fingerprints with Google. Register iOS bundle `com.selfx.selfxCustomer`. Set Xcode Runner build settings `SELFX_GOOGLE_IOS_CLIENT_ID` and `SELFX_GOOGLE_REVERSED_CLIENT_ID` for Info.plist callbacks; pass the iOS Dart client ID too. The backend allowlist must include actual issued token audiences.

Apple uses native iOS sign-in only. Enable Sign in with Apple in the Developer account, App ID, provisioning profile and Xcode capabilities; Runner includes the entitlement. Allowlist the bundle audience on the backend. The API binds a single-use nonce and verifies the signed token. iOS builds/signing require macOS/Xcode and were not performed on Windows.

Configure reviewed, published HTTPS Terms, Privacy and Support destinations before release. Preview fallback copy is explanatory, not final legal publication. The accepted policy version comes from the backend, currently `2026-10-25`.

## Backend activation

See [the implementation record](../../docs/CUSTOMER-MOBILE-1-IMPLEMENTATION.md). Review/apply the migration on staging, configure encrypted platform SMTP, set a distinct customer JWT secret and enable the feature. Building this app does not change production configuration or schema.

## Verification and build

```powershell
flutter analyze
flutter test
flutter build apk --debug --dart-define=SELFX_API_BASE_URL=https://YOUR-STAGING-API-HOST
```

Debug APK: `build/app/outputs/flutter-apk/app-debug.apk`. A preview compiled against `https://api.selfx.invalid` cannot sign in; rebuild against configured staging for live acceptance. Release signing requires a real keystore; do not publish a debug package.

Optional readable widget captures on Windows: `flutter test --dart-define=CUSTOMER_REVIEW=true`. This loads local Flutter Roboto/Material fonts and Windows Georgia for review only; Windows fonts are not bundled. Captures go to ignored repository `tmp/customer-mobile-review/`. Production uses native Roboto/serif resolution.

## Retention and next slice

Future mobile saved generated results expire after 30 days. Original person photos, customer garment captures and derived inputs keep the seven-day maximum. Other channels keep seven-day generated results. This foundation does not store media or change the cleanup worker. Next implement ownership, consent, uploads, generation, actual expiry/deletion and Saved together. Store-sponsored saved results require explicit customer ownership/consent; Store QR must never silently spend personal credits.

Package versions are locked in `pubspec.lock`; the app's Licenses entry shows package notices. The full official wordmark remains in app headers. Launcher/PWA icons use the exact user-supplied X, while legacy launch screens keep the wordmark; see [branding assets](design/README.md). Preparing these source images does not build an APK or change an existing package.

Session startup and profile requests use skeleton layouts while the API is pending. They end on success/error, do not add artificial delays and respect reduced-motion settings. Saved and Plans do not show invented loading states while their services remain unavailable. Sign-in/form submission retain action indicators.
