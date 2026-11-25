# Mobile Try-On photo policy relocation

Approved November 25, 2026: remove the recurring "Your photos. Your choice."
sheet. Keep the existing Terms/Privacy checkbox wording and policy acceptance
version, and do not add a new acceptance prompt for existing customers.

## Behavior and consent records

The mobile app starts a Try-On session directly after the existing availability
and credit checks. Camera/gallery selection remains an explicit customer action.
The session request omits photo-sheet acceptance, language and version fields.
The API reads the authenticated customer's saved
Terms acceptance under the existing customer lock. Each new session retains its
own durable consent link, recording the existing Terms version and original
acceptance date, with a statement identifying this policy basis. No historic
consent rows or customer acceptance timestamps are rewritten or backfilled.

Older app versions may continue submitting their actual sheet acceptance; the
API validates and records that explicit flow as before. Account status,
ownership, Store-visit checks, Store payment/result access and retention remain
unchanged. Saved profile/avatar-photo notices and other channels are separate.

## Policy placement

The local web Privacy Policy describes selected-photo upload and processing,
seven-day temporary inputs, 30-day mobile results, earlier deletion and private
originals. Terms already cover image ownership/permission and variable fit and
detail; their Store section now describes generated-result access directly.

The mobile app links to externally hosted pages, not this checkout's `/privacy`
and `/terms` routes. Publish the following wording there before rolling out the
updated app. Preserve the existing surrounding policy and retention wording.

### https://selfx.in/fashion/privacy

Add under Customer Images:

When you choose photos for virtual try-on, SelfX uploads and processes those
photos to generate the preview you request. This photo processing is covered by
the Terms and Privacy Policy you accept for your SelfX account. Original Try-On
photos, outfit captures and temporary provider inputs expire within seven days.
Mobile generated results expire within 30 days. You can delete your photos and
results earlier in the app.

In Customer Accounts and Store Visits, describe Store access directly:

When you start a Store-sponsored Try-On, only eligible Store products can be
tried on. The Store pays and can view the generated result; your original person
photo remains private from merchant staff. Personal credits are not used as a
fallback.

### https://selfx.in/fashion/terms

Keep Accounts and authorized images (own/authorized images and permission of
people shown) and Using SelfX (visual preview, variable fit/details and no sizing
guarantee). In Store QR sponsorship, replace the sentence referring to separate
Store-session consent with:

When you start a Store-sponsored Try-On, the Store can view the generated result;
original person photos remain private from merchant staff.

## Rollout

Publish the external policy text, deploy the compatible API, then rebuild and
release the mobile app. No database migration is required. These source changes
do not publish those external pages, deploy services or build/distribute an APK.
