# CUSTOMER-MOBILE-6 — Country selection and account presentation

Approved 2026-10-27. This follow-up implements the country selector, profile bottom sheet, About navigation and installed-version display. The latest UI direction removes the Licenses section completely. Firebase configuration/activation remains deferred. No APK, production deployment or backend migration is part of this change.

## Phone input

- Signup, email/phone code login and Me → Phone number share `CustomerPhoneField`. Country selection opens a searchable bottom sheet with country names, ISO codes and calling codes. Available country-name translations come from bundled country metadata, with English fallback; interface labels use all 20 existing app catalogs.
- The initial country comes from the operating system's locale region, independently of the selected SelfX interface language. This is an editable regional hint, not a claim to know the user's physical location. No GPS/SIM permission, IP lookup or location service is used. When the device has no recognizable region, customers choose a country rather than receiving a guessed location.
- Manual selections are saved on the device under `selfx.customer.country.v1` and reused across screens and app restarts. They take precedence over the device default. Late preference reads cannot undo a new selection. Saving failures keep the current choice usable and display an error.
- Numbers use a phone keyboard. The combined login field retains an email keyboard and offers Use phone number / Use email, without adding another login account flow. Existing full international numbers prefill the corresponding country and national number. Pasted international numbers and valid numbers missing `+` normalize safely without duplicating calling codes. Local trunk prefixes, spaces/parentheses and localized digits are normalized using bundled phone metadata.
- API requests still send the existing canonical `+countrycode…` value. Formatting does not prove ownership; the unchanged backend/Firebase verification remains authoritative. Optional signup phones remain optional and unverified until linked through the existing flow.

## Account UI

- Profile editing uses a compact, keyboard-aware modal bottom sheet with Edit profile, the existing name limit/validation, an orange Save changes action and a secondary Cancel action. The character counter is hidden. Save progress disables duplicate submissions, failures preserve the typed name, and success refreshes the existing owned account. The sheet checks the original customer before saving.
- Shared bottom-sheet/dialog surfaces use the existing warm SelfX colors, rounded corners and normal Flutter controls. The dashboard/kiosk UI is not reused. Existing Home header positions remain unchanged.
- Me → About SelfX is a real screen. It shows the approved logo, existing description and the version/build reported by the installed application through `package_info_plus`. It never substitutes a hardcoded app version when metadata cannot load; an unavailable/retry state is shown.
- The customer app has no Licenses section or license-page navigation, including under About SelfX. This UI-only removal leaves Flutter's bundled notice files and dependency license text intact.
- Support email metadata uses the same cross-platform installed-version reader. Existing Android update compatibility/signature checks remain unchanged.

## Scope and release

The source version is **0.6.0+6**. Rebuild/reinstall when ready to distribute the UI; no APK is built by this implementation. Firebase public settings, private credentials, enable flags, SMS and push delivery remain unchanged. Country preferences are local only; customer IDs, verified phone records, credits, history, Store data and backend persistence/contracts are unchanged.

New dependencies provide bundled country metadata (`country_picker`), number parsing (`phone_numbers_parser`) and installed metadata (`package_info_plus`). They do not add GPS access or runtime country/phone lookup requests. New static interface labels were translated using the previously approved endpoint; no customer data or credentials were sent. Native-speaker/device review remains a release step.

## Verification

Tests cover device/default/remembered country selection, preference-read races, international/national/pasted/localized formatting, picker search, numeric keyboard, profile validation/cancel/save/failure, real installed-version metadata and absence of license UI. The existing 20-language narrow-screen suite includes the profile sheet with keyboard insets, phone linking and signup. Native Android compilation and manifest verification run without APK assembly. Actual account/profile/About/country screen captures are reviewed before completion; iOS/device acceptance remains separate.

Completed validation: **99 Flutter tests passed**, Flutter analysis reported no issues, and Android `compileDebugKotlin` plus `processDebugMainManifest` passed. The opt-in screenshot review test also passed; profile editing, phone linking, country search and About/version captures were inspected at 390×844. The language suites checked 320/390 widths and keyboard insets, including Arabic/Urdu direction. No APK was assembled. Installed-device and native-speaker acceptance remain release checks.

After the requested license-UI removal, the four existing account UI tests and the opt-in screenshot review passed again. The refreshed About capture was inspected, and no license-page navigation remains in `mobile/lib`. Bundled dependency notices were not modified. No APK was built.
