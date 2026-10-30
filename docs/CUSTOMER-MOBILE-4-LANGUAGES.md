# CUSTOMER-MOBILE-4 — Customer app languages

The user approved Hindi, Tamil, Telugu, Spanish, Arabic, Kannada and additional major languages. The customer app now supports **20 languages**, including English: `en`, `hi`, `ta`, `te`, `es`, `ar`, `kn`, `bn`, `mr`, `ml`, `gu`, `ur`, `fr`, `pt`, `de`, `zh`, `ja`, `ko`, `ru`, `id`. Chinese uses Simplified Chinese copy and Portuguese uses a general Portuguese catalog; regional variants are not separate options.

## Behavior

- English is the first-install default even when the device language differs. Language is available in Me and through the language icon before login/onboarding, with native names and English search names so users can recover from an unfamiliar selection.
- Switching updates the current routes immediately without an app restart, clearing credentials, recreating a Try-On or discarding form state. The language is stored locally and, after sign-in, on the customer's existing server-owned profile. Existing account preferences take priority at login; new email/OAuth signup carries the selected language. Unsupported historic preferences fall back to English. Failure to save shows an error and restores the previous selection.
- Arabic and Urdu use Flutter's RTL direction, directional alignment/margins, mirrored navigation and bidi-isolated dynamic values. Camera images, logos, customer/store/product names, email addresses, verification codes, QR payloads and release notes are not translated. Code/email/password fields retain LTR entry. Arabic/Indic typed verification digits are normalized to ASCII for the existing API.
- App-owned onboarding, account/authentication, form validation, Try-On, consent, Saved, Plans, support, notifications, updates, tooltips and skeleton accessibility labels use bundled catalogs. Dates/numbers use the selected locale. Material/Cupertino controls use Flutter's official localization delegates. Long labels wrap instead of clipping on narrow screens.
- Known API messages are translated by the app; unknown errors have a readable localized fallback. Merchant content, provider/product descriptions, externally authored release notes and the published website/legal pages retain their source language. Native OS permissions, camera/photo pickers, Google/Apple account windows and mail applications remain controlled by those external apps/OS. Security emails remain in their existing language/templates.
- Mobile Plan descriptions may be entered per language in the Platform Mobile Plan editor. The API returns these translations and the app shows the selected language's description when present. An unfilled language shows the plan's original description. Plan and product names remain unchanged. Existing plans need their translated descriptions entered by an administrator.
- Look-ready inbox and prepared Firebase push copy use the account language. Push remains inactive until Firebase is configured; this change does not activate delivery.
- Photo consent keeps the existing canonical policy version and privacy limits. Its durable statement also records the presentation language, translation version and translated wording shown. A future policy version without bundled translations is presented and recorded in English until updated; it is never silently represented as a current translated policy.

## Resources and maintenance

`mobile/assets/l10n/*.json` contains the catalogs; `CustomerCopy` is a small Flutter localization delegate and UI wrapper. It loads only the selected offline catalog and caches it. English copy keys and named `{p0}` placeholders are stable resource identifiers. Apply the wrapper only to app-owned text, not arbitrary user/merchant strings.

Newer Home, Try-On, Saved and payment labels must be added to all 20 catalogs when introduced. The `description_translations` JSON field on `mobile_plans` stores optional admin-authored plan descriptions; deploy its migration and updated API before using the Mobile Plan editor's translated descriptions.

The initial translation set was machine-assisted through Google's public translation endpoint after the user explicitly approved sending **only static interface, validation and consent text**. No customer data, photos, runtime values or credentials were sent. The app ships the resulting text and never contacts a translation endpoint. Main navigation wording was refined locally. Native-speaker review, especially of consent and privacy wording, is still advisable before broad public release; automated coverage is not a claim of certified translation accuracy.

When changing copy, update every catalog and run the completeness/placeholder tests. For notification or consent changes, regenerate the static API copy from the reviewed catalogs:

```powershell
node mobile/tool/generate_backend_copy.mjs
```

The generator runs offline, validates required messages and writes `backend/api/src/customers/customer-notification-copy.ts`. Keep the backend language registry and app language list synchronized. Bundled app copy needs no translation service credentials or runtime translation SDK. The existing `Customer.language` column stores the setting; translated Mobile Plan descriptions additionally require the `mobile_plans` migration described above.

## Deployment and verification

Deploy the API before distributing the customer app so the expanded language allowlist and localized notification/consent copy are available. The source app version is **0.4.0+4**. Rebuild/reinstall the signed app when ready; no APK is built or published by this implementation. Existing APKs retain their old interface. iOS/App Store/Firebase setup and actual device acceptance remain separate from these changes.

Tests cover all catalog keys/placeholders, localized keyboard input, default/persisted/server preferences, rollback, RTL, all 20 narrow sign-in/Home/account/Plans/onboarding layouts and unchanged customer/merchant text. Backend tests cover language allowlists, signup/profile isolation, refresh and durable consent with simulated provider/email/push services only. See [Flutter internationalization](https://docs.flutter.dev/ui/internationalization) for the underlying native control/direction delegates.

Verified locally: the full 86-test Flutter regression suite passed, followed by 42 passing focused tests after the additional Saved-title case (87 distinct customer app tests verified). Flutter analysis reported no issues. API TypeScript, affected-file ESLint and diff checks passed. Backend language/auth/notification and consent/retention suites passed against disposable localhost PostgreSQL with simulated delivery. iOS localization metadata was parsed and all 20 root-level language entries verified. No APK, real notification or production data change was created.
