# CUSTOMER-MOBILE-9 — Simple profile controls and persistent pictures

Approved 2026-10-27. Source version **0.8.0+9**. This supersedes the account-action placement and profile-photo presentation/retention in CUSTOMER-MOBILE-7. Existing Firebase wiring stays intact. No APK assembly or production deployment is included.

## App experience

- Outer Me/settings contains **Log out** and the existing protected **Delete account** entry. Profile contains neither action. Remove Sign out on all devices from the app UI; password reset and server-side session revocation remain unchanged.
- Put a small accessible **+ button over the profile avatar**, using the existing Add/Change profile photo tooltip. Remove the full-width photo button and inline Remove button.
- The button opens one compact sheet: Profile photo, a short retention caption, Gallery, Take a photo, Remove photo when available, and Cancel. The caption is “Saved to your profile until replaced or removed.” It replaces the old technical size/dimension instructions and consent paragraphs.
- Choosing Gallery or Take a photo is the affirmative profile-photo selection action before opening the picker/camera. Cancel opens neither and sends no photo. The existing account-identity guard is rechecked after returning from the picker. Remove acts only on the signed-in customer's profile photo.
- Keep file/signature/dimension validation and normalization server-side, showing readable errors only if an upload is invalid. Existing photo privacy, metadata stripping, owner-scoped content reads and no-store responses remain in place. Profile pictures are never automatically submitted for Try-On.
- All new labels/caption are bundled in the 20 existing language catalogs. The approved static-text translation endpoint returned a rate limit; the five new strings were translated locally instead. Native-speaker review remains a release check.

## Retention and compatibility

The user explicitly approved persistent **profile pictures only**. New uploads use consent version `2026-10-27-v2` and have `expiresAt: null`. They remain until replacement, removal, Delete my photos or account deletion. They have no scheduled expiry and the client does not install an expiry timer for them.

Migration `20261027040000_persistent_profile_photos` makes the profile-photo expiry nullable without rewriting or deleting existing records. Existing uploads saved with the earlier `2026-10-27` seven-day consent retain that original limit; replacing one in the new app uses persistent storage. The API accepts the earlier upload version for compatibility and records its original statement/expiry. It rejects unknown consent versions. Do not fabricate new consent for an earlier upload or resurrect deleted/expired objects.

Profile reads and upload completion accept either null expiry or a future legacy expiry. Cleanup deletes replaced, removed, deleted-account and abandoned uploads, plus expired legacy photos, and retries failed deletions. It never selects a ready, active, undeleted photo merely because it is old when its expiry is null. Late uploads cannot undo removal. Client memory/cache is still cleared on removal/sign-out/account changes, and legacy expiry timers are retained only for legacy photos.

**Try-On inputs and generated-result retention are unchanged.** The nullable field is limited to CustomerProfilePhoto; no other image-retention field or cleanup job is relaxed. Storage lifecycle rules for the profile-object prefix must not impose the Try-On input expiry on persistent profile photos.

## Rollout and verification

Apply the new migration, deploy the API and updated privacy-page source, then rebuild/reinstall the signed mobile app. The public privacy copy distinguishes persistent profile pictures from time-limited Try-On photos. No production settings, object-storage lifecycle rules, Firebase credentials, Store data, balances or account credentials are changed by this implementation.

Verify outer action placement and account-deletion confirmation, Gallery/Camera/Remove/Cancel, no picker before selection, all 20 small-screen layouts, persistence past the old seven-day window, legacy expiry, ownership, replacement/removal, account deletion and upload/removal races. Use only simulated media/storage and the disposable local PostgreSQL database. Render and inspect the updated profile/chooser/outer actions. No APK is built.
