# Phase 3: local product recommendations

`KioskProductRecommendationService` supplies up to seven ordinary catalog
products, with no UI, network calls, inference dependency or new persistence.
It is a merchandising selector, not a trained recommender or gender classifier.

## Integration

`SelfxKioskApp.production` creates one service for the kiosk's customer-session
owner. Its injected source reads `KioskCatalogRepository.snapshot?.products`;
it never calls `_ensureSnapshot`, catalog sync, remote paging or image download.
Startup and existing repository refresh logic remain responsible for cache data.
Cached product objects are returned unchanged, including local image paths.

`KioskTryOnSessionController.recommendations` exposes the optional service.
`beginCustomerSession` begins recommendation state only when a new customer
session starts. `endCustomerSession`, `finish` and controller disposal clear it.
Finish clears it before waiting for backend completion, including failure cases.
No Try-On API requests, navigation or existing catalog filters were changed.

For recommendation consumers, after the existing customer session begins:

```dart
final recommendations = tryOnController.recommendations;
// Set only from an explicitly chosen catalog preference; omit for mixed.
recommendations?.setAudiencePreference(KioskCatalogAudience.men);
final products = recommendations?.getRecommendations() ?? const [];
// WOMEN or ALL work the same way; null restores the mixed default.
```

The service can also be used independently with `beginSession` / `endSession`.
It is not a global singleton; owners have independent selections/preferences.
Phase 4's preview carousel reads results; explicit full-catalog audience tab
changes update the preference for subsequent recommendation reads.
No preference is derived from MobileNet labels, accepted person photos or other
appearance predictions. Existing catalog access remains unrestricted.

## Selection policy

- No preference or ALL: round-robin across available audience groups, avoiding
  a single-audience result merely because the catalog sorts that audience first.
- MEN/WOMEN: that explicit audience plus UNISEX and ALL product metadata,
  matching existing local catalog semantics. The opposite audience is excluded
  only from this small recommendation list. The enum's UNISEX preference also
  works for future reuse, selecting UNISEX/ALL metadata.
- Normalize audience whitespace/case; deduplicate by product ID, preserve
  product vertical, and skip blank IDs and products without the existing model's
  usable-image flag. No filesystem existence checks are added.
- Return an immutable list of at most seven (or a smaller requested limit).
  Fewer products simply produce fewer recommendations. No matching products,
  missing cache or source read failure returns an empty list without remote work.
  A missing/empty cache is retried on the next result read so startup sync can
  populate it later. Explicit preferences do not fall back to the opposite audience.
- Freeze a successful selection for the customer session. Repeated reads and
  repeated begin calls do not reshuffle. Changing an explicit preference
  invalidates that selection and selects from the current cache.
- Each new session advances the starting product offset in each audience group
  and rotates which group starts the round-robin. A random initial offset avoids
  always starting at the first product after app restart; tests can inject one.
- End clears products, preference and vertical. Only a non-customer rotation
  counter survives between sessions in process memory. Rotation is not persisted.
  When the eligible catalog has seven or fewer items, every item may necessarily
  recur; order rotates where there is a choice. With larger groups, different
  products enter the selection over successive sessions.

Current production repository snapshots are garments. The service supports a
vertical argument but does not introduce jewellery caching: an uncached
jewellery session returns empty. Existing jewellery browsing remains remote and
unchanged. Full-image offline display still depends on existing image caching;
this service neither repairs missing image files nor promises remote URLs work
offline. Initial selection scans the cached catalog once, then subsequent reads
reuse the bounded selection. Catalog ordering within groups is preserved except
for the rotating offset; there is no popularity/ranking metadata to use today.

## Files and verification

- `lib/src/catalog/kiosk_product_recommendation_service.dart`: reusable engine.
- `lib/src/app/selfx_kiosk_app.dart`: cache-source composition/injection.
- `lib/src/tryon/kiosk_try_on_session_controller.dart`: session lifecycle hooks.
- `test/kiosk_product_recommendation_test.dart`: ten focused checks for mixed
  selection, explicit audiences, shared products, caps/deduplication, rotation,
  independent owners, empty/failing cache, vertical isolation and session cleanup.
- `docs/product-recommendations.md`: integration contract and limitations.

Ten focused tests passed; Flutter static analysis and `git diff --check` passed.
No APK build, model/dependency change, backend change, new screen or carousel UI
is part of Phase 3.

## Phase 4: accepted-photo carousel

`ProductRecommendationCarousel` is shared by camera Review and the phone
Ready preview. It renders up to seven compact horizontal cards followed by a
permanent Show All tile; an always-visible Show All shortcut also works when
the end tile is offscreen. Empty/failing cache and uncached jewellery show the
same catalog entry points. The service's synchronous cached result is read on
mount/session/preference change; pick changes rebuild indicators without
regenerating the selection. Empty results can retry when the repository notifies
that data has become available. There is no classifier/inference dependency.

Placement: below the green ready status on camera Review, before its existing
garment-photo action; below branding in the phone Ready action panel. Landscape
keeps photo/actions side by side, with actions scrollable where needed. Short
portrait previews scroll so cards and existing touch actions remain reachable.

Previously, these previews accepted the person photo only when a button then
navigated away. With the production recommendation service present, a usable
camera Review photo is now accepted locally after validation in a post-frame
callback. A READY phone person photo uses the existing download/validation/
consume path once in place. No extra screen or user step is added. Backend
person attachment and Try-On generation still run through the existing actions;
Show All itself needs neither an attachment nor generation request. Garment
uploads never trigger this preparation. Legacy compositions without the optional
recommendation service keep their existing acceptance/presentation behavior.

Show All creates the existing `BrowseProductsScreen` in its default ALL audience
with the same capture, upload and try-on controllers. Men/Women tabs, accepted
photo, session and My Picks remain available. It does not call the jewellery
review's older choose-another-item action that clears the person photo.

Multiple-pick cards and the catalog share
`KioskTryOnSessionController.toggleCatalogProductPick`, including the existing
pick limit and errors. Carousel My Picks uses the existing catalog bottom sheet.
Continue selects the first existing pick and invokes the preview's existing
continuation path. Single garment selection uses `selectGarment` and retains
explicit Continue. Cached jewellery selection, if supplied in the future, opens
the existing catalog preselected and uses its existing requirements/Continue
flow. A different jewellery capture region can still require a new phone photo
under that existing flow. No new confirmation dialog was added.

Thumbnails only read `product.image.localPath` with a bounded 256px decode.
The repository currently stores product images, not separate thumbnail assets;
the widget downsamples those local files rather than fetching remote full-size
images. Missing/failed cached images show a neutral garment placeholder. There
is no carousel `Image.network` fallback. Product names and prices still display.

`sessionRevision` changes at recommendation-session start/end. Widget callbacks
and deferred photo acceptance check that revision. Phone downloads additionally
check the original upload session and an optional acceptance guard before local
commit, after analysis and before publishing consumption results. Ended sessions
cannot update a new customer's carousel or commit a late person photo. Reset and
Finish keep the existing image/result retention and cleanup owners.

Phase 4 files (relative to `mobile/kiosk`):

- `lib/src/ui/product_recommendation_carousel.dart` (new shared widget).
- `lib/src/ui/capture_review_screen.dart`, `capture_review_presentation.dart`.
- `lib/src/ui/mobile_upload_screen.dart`, `browse_products_screen.dart`.
- `lib/src/catalog/kiosk_product_recommendation_service.dart` (session revision).
- `lib/src/tryon/kiosk_try_on_session_controller.dart` (shared pick conversion).
- `lib/src/session/capture_session_controller.dart` and
  `lib/src/upload/kiosk_customer_upload_controller.dart` (late-upload guard).
- `test/product_recommendation_carousel_test.dart`.
- `docs/product-recommendations.md` and repository `docs/04-UI-UX-FLOW.md`.

Focused verification: 24 carousel/review/catalog tests and the existing selected
jewellery phone-upload-to-generation test passed. Targeted static analysis and
diff checks passed. No APK build, heavy suite, paid API or model change was run.
Physical kiosk visual/touch validation remains outstanding. Jewellery products
remain absent from the production local cache; its carousel therefore shows
Show All until a separately approved jewellery-cache feature is available.
