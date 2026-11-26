# CUSTOMER-WARDROBE-1 — Private saved garments

Approved November 26, 2026. Extend Saved → Wardrobe with My clothes and
Favourite products. Customers import camera/gallery photos, review one item at a
time, optionally crop with the existing editor, name/categorize it and save it.
Colour and notes are optional. Search/category pagination, viewing, editing and
deletion are supported. Saving/browsing never generates or debits Try-On credits.

## Storage and authorization

The new customer_wardrobe_items table has customer ownership, private object key,
metadata, UUIDv7 request identity, metadata/image hashes, recorded account Terms
version/date, explicit saved-item retention text, readiness and cleanup markers.
No public image URL is returned. Content streams through authenticated endpoints.
Writes lock/recheck the account security version. Duplicate retries reuse the
same item and identical image; changed requests conflict. Interrupted drafts
become cleanup candidates after five minutes. Files are read one at a time in
mobile and cleaned from picker cache after review. Images are not persisted in a
new mobile cache; in-memory previews are evicted on disposal/account change.

Saved garment originals remain until item deletion, Delete my photos or account
deletion. Deletion immediately hides them and erases names/notes; storage deletion
retries independently. Customer account deletion includes this table in both
mobile and public verified-deletion flows through deleteCustomer. An in-flight
put racing deletion reopens the cleanup marker. Saved originals have no expiry;
do not apply the temporary-input storage lifecycle to customer-mobile/wardrobe/.

## Try-On

Selecting a wardrobe item prepares the existing personal Try-On session and
copies only the owner's ready private garment through CustomerExperience.upload.
It inherits input validation, session ownership/consent, seven-day input expiry,
existing avatar/model choice, generation and credit admission. No generation
occurs on selection. Store mode requires the customer to leave Store mode first;
the backend also rejects wardrobe garments for sponsored Store sessions.

## API

- GET /api/v1/customer/wardrobe?page=1&category=TOPS&search=shirt — 24 per page.
- POST /api/v1/customer/wardrobe — UUIDv7 id, name, category, optional colour/notes.
- POST /api/v1/customer/wardrobe/:id/photo — one private JPEG/PNG/WebP up to 16 MB.
- GET /api/v1/customer/wardrobe/:id/content — authenticated normalized JPEG stream.
- PATCH /api/v1/customer/wardrobe/:id — metadata only.
- DELETE /api/v1/customer/wardrobe/:id — logical deletion and retried object cleanup.
- POST /api/v1/customer/try-on/sessions/:id/wardrobe — owner-scoped itemId.

## Rollout

Apply backend/database/prisma/migrations/20261126000000_customer_wardrobe/migration.sql
through the normal migration deployment process before deploying the API. Rebuild
and release mobile after the API is available. No production database or storage
configuration is changed by source work. No APK build/publication is included.

The local Privacy/Terms pages are updated. The mobile app links to separately
hosted https://selfx.in/fashion/privacy and /fashion/terms. Before release, publish:

“Garment photos you explicitly save to Wardrobe are private to your account and
stay until you delete the item, use Delete my photos, or delete your account.
Names, categories, colours and notes organize your collection. Temporary Try-On
copies expire within seven days; mobile generated results expire within 30 days.”

Retain the existing permission-to-use-images and preview-limitations provisions.
The existing Terms/Privacy checkbox wording is unchanged; no new consent popup is
added. Verify the wardrobe prefix is excluded from expiring-input lifecycle rules.

## Changed files and delivery

New runtime files:

- backend/api/src/customers/customer-wardrobe.service.ts
- backend/api/src/customers/customer-wardrobe.controller.ts
- backend/database/prisma/migrations/20261126000000_customer_wardrobe/migration.sql
- mobile/lib/src/services/customer_wardrobe.dart
- mobile/lib/src/ui/customer_wardrobe_screen.dart

New tests: backend/api/src/customers/customer-wardrobe.integration.spec.ts and
mobile/test/customer_wardrobe_test.dart. This document is also new.

Edited: customer.module.ts, customer-auth.service.ts and
customer-experience.service.ts in backend/api/src/customers; the Prisma schema;
mobile customer_experience.dart, customer_shell.dart and
customer_experience_screens.dart; all 20 mobile localization catalogs; the existing
customer_experience_test.dart; frontend/web/app/privacy/page.tsx and terms/page.tsx;
and canonical docs/01 through docs/06.

Deploy the backend source/schema/migration together, then rebuild the mobile
application with its Dart source and localization catalogs. Deploy the web policy
changes and publish the supplied retention wording at the separately hosted
mobile policy URLs. Tests and documentation need no separate production upload.

## Local verification

- 18 backend tests passed on a disposable loopback-only PostgreSQL database,
  including real multipart HTTP, private ownership, idempotency, expiry,
  abandoned drafts, cleanup races and actual photo/account erasure.
- 7 wardrobe Flutter tests passed: paging/search, sign-out isolation, stable
  retries, model-preserving selection without generation, sequential import,
  cancellation, editing and confirmed deletion.
- All 28 existing localization tests passed; existing favourite-product Try-On
  navigation regression passed.
- Prisma validation and migration-to-schema diff passed with no differences.
- Flutter analysis completed with no issues. Backend/web typechecks, changed backend/web ESLint and git diff --check passed.

The test database server was stopped after validation. No live delivery,
production migration, device build, production storage lifecycle inspection or
publication was performed. The complete legacy mobile test suite was not run.

## Device verification after deployment

1. Sign in, open Saved > Wardrobe > My clothes, import two garment photos,
   review/crop each, enter names/categories, and save. Cancel another import;
   previously saved items must remain.
2. Search/filter the collection, edit an item's name/colour/notes, and reopen it.
   Select Try it on: confirm the garment loads, choose a model/avatar or personal
   photo, then generate explicitly. Importing or selecting must spend no credits.
3. Sign out and sign in as a different customer. Neither the first customer's
   items nor private photo previews should remain accessible.
4. Delete one item and verify it disappears. Then use Delete my photos and verify
   all wardrobe items disappear. Repeat with account deletion on a test account;
   confirm backend object cleanup completes without restoring access on failure.
5. Confirm Favourite products still opens existing demo/store bookmarks, Store
   mode rejects personal wardrobe use, and saved garment originals remain after
   the seven-day temporary-input cleanup window.