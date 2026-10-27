# CUSTOMER-MOBILE-7 — Profile and header

Approved 2026-10-27. This supersedes the separate account controls and Plans header button. Source version: **0.7.0+7**. Firebase activation, APK assembly, purchases and publishing are outside this change.

## Navigation

- The shell header keeps the logo and scanner. Replace Plans with a compact dropdown showing EN, HIN, TEL, TAM, KAN or the other selected language code. The dropdown contains all 20 native language names, updates immediately, and uses the existing device/account persistence and error handling. The full language settings screen remains under Me.
- Keep the personal credits count for positive balances. At zero, show a plus icon and Add credits. Unknown/loading balances remain a dash. The credits control always opens the existing Plans & credits screen; it does not change entitlement admission, purchase availability or Store sponsorship.
- Me has one profile card with the customer's name, photo/initial and Profile label. It opens the profile page containing name editing, profile-photo controls, read-only email and verification state, phone linking/verification, Account security/password reset, notifications, sign-out, sign-out on all devices and account deletion. Existing owned-account APIs remain authoritative.
- Me retains subscriptions, language, notifications/inbox, updates, photo deletion, support, Privacy, Terms and About. Remove See the introduction and the separate name/phone/security/logout controls from Me. Keep onboarding for new installations. No Licenses section is restored.
- Account identifiers, names, email and phone remain user content rather than translated labels. Short language identifiers and phone/email values remain LTR inside Arabic/Urdu layouts. Long labels and photo consent scroll on narrow screens.

## Profile photo

- A new optional, private profile photo is separate from person images used for Try-On. Never automatically reuse it as a provider input. It does not spend personal or Store credits.
- Before gallery selection or camera access, show the upload/storage consent and criteria. Cancel performs no selection or upload. Require consent version `2026-10-27` and one of the 20 presentation languages on the upload endpoint.
- Accept one JPEG, PNG or WebP up to 5 MB, with both dimensions at least 256 and neither above 8192. The API validates signature/MIME/dimensions and fully decodes the image using Sharp. Correct EXIF orientation, center-crop to a 512×512 JPEG and omit metadata. No original is persisted on the server.
- Use the existing SelfX object storage; do not use Firebase Storage or public URLs. GET metadata and image content, POST upload and DELETE removal all require SelfX customer authentication. Content reads filter by authenticated owner, photo id, readiness, expiry, deletion and active account. Return no-store/nosniff JPEG responses.
- CustomerProfilePhoto records the owned storage key, durable consent version/statement/presentation language, readiness, creation, seven-day expiry, deletion and storage-deletion state. No face recognition or biometric template is introduced. Metadata/consent remains after image deletion; bytes expire within seven days and fall back to the customer's initial.
- Serialize state changes on the customer row and recheck security version/status. Replacement expires old photos; remove/delete-all/account deletion makes photos unreadable. A bounded periodic cleanup deletes expired, replaced, removed, abandoned or deleted-account objects and retries failed deletions. A late upload cannot resurrect a removed photo; its cleanup marker is reset after the write finishes.
- Flutter keeps avatar bytes in memory only, revalidates metadata when Me opens/resumes, avoids downloading unchanged bytes, evicts replaced/expired bytes, and clears photo state after deletion/sign-out/account changes. Delayed responses cannot populate another customer's profile. Native picker temporary copies use the existing cleanup abstraction.

## Deployment

Apply migration `20261027030000_customer_profile_photo` with the normal database rollout and deploy the API before distributing this app version. It adds only the `customer_profile_photos` table and ownership/cleanup indexes. Existing accounts, credentials, balances and Store data are preserved. Existing private object-storage configuration is reused. The downloaded Firebase settings/private credentials remain untouched.

Rebuild/reinstall a signed APK when ready; none is built by this task. The existing Plans screen remains the destination for Add credits; paid personal checkout remains its separately planned work.

New app-owned labels and consent are bundled in all 20 catalogs, using the previously approved static-text translation endpoint. No customer data, photos or credentials are sent for translation. Native-speaker review and real-device camera acceptance remain release checks.

## Verification

Run the Flutter regression/20-language small-screen suites, focused zero-credit/language/profile/consent/account-isolation tests and opt-in rendered review. Verify private photo ownership, image validation/normalization, replacement/removal, expiry/cleanup, stale sessions, deleted accounts, and removal during upload against simulated storage and a disposable local PostgreSQL database. Check API HTTP consent validation, identity forwarding and private content responses; retain the existing Try-On and credit regressions.

Completed: **102 Flutter tests passed**, including all 20 languages at 320/390 widths, zero personal credits and scrollable photo consent. **38 backend tests passed** against simulated storage and a disposable localhost database, including the new migration, private photos, HTTP consent/identity boundaries, Delete my photos, existing Try-On/credits and auth HTTP behavior. Flutter analysis reported no issues; API TypeScript, focused ESLint and whitespace checks passed. Rendered Home, zero-credit header, Me, consolidated profile, consent sheet and language menu were inspected. The test renderer loads Latin fonts; native-script font fallback still needs device review. No APK, production migration, deployment or Firebase configuration was performed. iOS permission text was updated and its plist parsed; real-device/iOS compilation and native-speaker acceptance remain release checks.
