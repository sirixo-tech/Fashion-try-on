# OUTFIT-PLANNER-1 — Private scheduled outfits

Approved November 26, 2026. Add the weekly outfit planner requested from the
reference image. These are wardrobe outfits assigned to dates, not subscriptions
or credit plans. Scheduling does not generate images or spend credits.

## Customer flow

- The calendar icon beside Import photos opens Outfit planner. Import stays the
  main action; camera and calendar have compact accessible icon buttons.
- Seven calendar days start at today. Previous/next move seven days, and the
  date picker jumps to a chosen day. Dots mark days with scheduled outfits.
- Choose a day and Add outfit. Select 1–20 different ready wardrobe pieces with
  search, categories and bounded pagination; selection survives paging/filtering.
  Enter an optional occasion (80 characters) and notes (500 characters).
- Save privately to the account. Multiple outfits can be scheduled for the same
  date. Cards show garment thumbnails, occasion and notes, with Edit outfit,
  Move to another date and Delete in the overflow menu.
- Schedule outfit in a wardrobe garment's existing overflow menu opens the
  planner/editor with that garment selected. Empty wardrobes offer Import photos.
- Server confirmation is required for success. An uncertain save retries the same
  UUIDv7 and frozen payload. Confirmed invalid-piece responses allow correction.
  Conflicting edits require reopening the outfit; they never silently overwrite.

Model/avatar selection and Try-On generation remain in the existing Try-On flow.
There are no reminder notifications, device-calendar permissions, automatic AI
outfit suggestions, combined multi-garment generation or external calendar sync
in this phase. Account sync occurs through backend reads on open/refresh and
after changes, rather than real-time push.

## Persistence and privacy

`customer_outfit_schedules` stores customer ownership, a PostgreSQL DATE,
optional occasion/notes, request fingerprints, optimistic version and deletion
timestamps. `customer_outfit_schedule_pieces` stores ordered references to
existing private wardrobe garments. All business IDs are UUIDv7; no photo copies,
public media URLs or original-photo metadata snapshots are created by scheduling.

Calendar dates use YYYY-MM-DD and local calendar components in mobile, and DATE
at the API/database boundary. No UTC/local conversion is applied to the chosen
day. Calendar construction handles month/year/DST boundaries; supported date
picker bounds are 1900-01-01 through 2199-12-31.

All endpoints authenticate the customer. Mutations lock the customer row and
recheck ACTIVE/securityVersion, then validate every garment belongs to that
customer and is ready/nondeleted. Create retries reuse ID/fingerprint; update
retries reuse version/fingerprint, and stale conflicting edits return 409. Writes
use the existing customer upload mutation rate budget without changing credits.

Deleting a wardrobe garment or using Delete my photos immediately makes that
piece unavailable to the planner. No old name/photo is returned for unavailable
pieces. Hard garment deletion nulls the reference. Other outfit pieces and the
scheduled date/notes remain until the scheduled outfit or account is deleted.

Deleting a scheduled outfit removes references and erases its date, occasion,
notes and request hashes. A metadata-free ID/owner deletion marker prevents an
old create retry from resurrecting it. Shared account deletion hard-deletes the
customer's schedules and cascades piece references, covering mobile and public
verified-deletion paths. The existing wardrobe/Try-On retention is unchanged.

Planner, editor and garment picker clear/close on account change. Private images
reuse the existing authenticated wardrobe image widget and cache eviction.

## API

- GET /api/v1/customer/outfit-schedules?from=YYYY-MM-DD&to=YYYY-MM-DD&day=YYYY-MM-DD&page=1
  returns 25 scheduled outfits per page, hasMore, counts per day in the bounded
  window and hasWardrobeItems. Windows are at most 31 days; optional day must be
  within the window. Pagination/sorting are deterministic and allowlisted.
- POST /api/v1/customer/outfit-schedules — id, date, occasion?, notes?, garmentIds.
- PATCH /api/v1/customer/outfit-schedules/:id — version plus full editable fields.
- DELETE /api/v1/customer/outfit-schedules/:id — idempotent, owned deletion.

Responses have Cache-Control: no-store. Cross-account IDs return 404; invalid or
unavailable wardrobe pieces return 400 without revealing which account owns them.

## Created and edited files

New:
- backend/api/src/customers/customer-outfit-schedules.controller.ts
- backend/api/src/customers/customer-outfit-schedules.service.ts
- backend/api/src/customers/customer-outfit-schedules.integration.spec.ts
- backend/database/prisma/migrations/20261126010000_customer_outfit_schedules/migration.sql
- mobile/lib/src/services/customer_outfit_planner.dart
- mobile/lib/src/ui/customer_outfit_planner_screen.dart
- mobile/lib/src/ui/customer_wardrobe_image.dart (existing image widget extracted)
- mobile/test/customer_outfit_planner_test.dart
- docs/OUTFIT-PLANNER-1.md

Edited: Prisma schema, customer.module.ts, shared customer-auth.service.ts account
deletion, customer_wardrobe_screen.dart, all 20 localization catalogs, web Privacy
Policy and canonical docs/01 through docs/06. Previously authorized uncommitted
Looks credit-strip corrections are preserved.

## Release and verification

Deploy the new migration through the normal Prisma migration process before the
updated API; then rebuild/release mobile. Deploy the web Privacy Policy update.
The app's separately hosted selfx.in/fashion/privacy must also state that private
scheduled dates, occasions/notes and garment references remain until the outfit
or account is deleted. Scheduling creates no extra photos. Source work does not
apply production migrations, deploy services or publish an Android build.

Use the integration test only with a disposable loopback PostgreSQL database
named outfit_planner_test and OUTFIT_PLANNER_TEST_DATABASE_URL. Flutter behavior
tests are in customer_outfit_planner_test.dart; rendered local reviews can be
enabled with SELFX_RENDER_PLANNER=true and FLUTTER_ROOT.

After deployment, verify adding two outfits to one date, choosing pieces across
filters/pages, editing and moving dates across month/year boundaries, reopening
on a second device with the same account, isolation from another account, garment
deletion/unavailable placeholders, schedule deletion and account deletion. Verify
the original Looks credit strip and Wardrobe-only compact badge remain intact.

## Local verification results

- 14 backend tests passed against the isolated loopback-only outfit_planner_test
  PostgreSQL database, including real HTTP validation, multi-piece ownership,
  bounded paging/day counts, concurrent create/edit retries, unavailable pieces,
  metadata erasure and actual account/photo deletion handling.
- The SQL migration was applied to a pre-planner schema in that database and
  Prisma migrate diff reported no differences. Prisma validation and client
  generation passed.
- 55 Flutter tests passed together: 13 planner, 14 Wardrobe/credit-strip and
  28 localization tests. Date/year/leap-day handling, week bounds, stale responses,
  both entry points, save retry, edit/move/delete, sign-out, large text and RTL
  were exercised. No generation request is made by scheduling.
- Flutter analysis completed with no issues. Backend/web typechecks, changed backend/web ESLint and git diff --check passed.
- Rendered reviews: tmp/customer-mobile-review/outfit-planner-empty.png,
  outfit-planner-week.png, outfit-planner-editor.png and outfit-planner-pieces.png.

Production data/configuration and Android releases were not changed. Real-device
and two-device verification remain release checks. The previously recorded
unrelated Profile Back-button test is outside this feature; the full legacy suite
was not rerun.
The isolated local PostgreSQL test server was stopped after verification.
