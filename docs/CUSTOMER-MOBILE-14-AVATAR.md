# CUSTOMER-MOBILE-14 — Interests and saved avatar photos

Approved 28 October 2026. Source version: **0.12.0+14**.

## Customer experience

After successful login/signup and required account verification, customers who
have not completed setup choose one or more interests: Women, Men, Jewellery.
Next is Create your avatar, with side-by-side selfie/full-body photo cards,
camera/gallery selection, saved checks and guidance. The supplied PoC guides
the card layout, typography, progress indicator and orange Continue action.
Photographs are bundled offline; example cards are explicitly labelled.

Continue completes setup after both photos have been saved. Skip for now
completes setup without requiring photos. An interrupted setup resumes from
saved interests. Me → My avatar allows changing interests, replacing either
photo or removing either photo independently. Completion is stored on the
account, not just this device. Existing customers complete this once too.

These are private reference photographs, not generated/biometric avatars.
Interests are preferences, not gender identification or authorization, and do
not restrict other products. This slice does not add a new jewellery provider
or claim that unsupported jewellery Try-On is now available.

## Retention exception approved by the user

Saved avatar SELFIE and FULL_BODY originals have no automatic expiry. They
remain until replaced, removed, Delete my photos, or account deletion. Explicit
consent is displayed before opening camera/gallery and recorded per upload as
`2026-10-28-avatar-v1`, including the exact statement and presentation language.
The current consent statement is presented in English; UI labels/explanations
are bundled in all 20 app languages. Native-speaker review remains a release
acceptance step.

Profile pictures keep their independent existing purpose and consent. Ordinary
Try-On uploads/derived inputs still expire within seven days; mobile results
keep the existing 30-day expiry. Every new consented Try-On copies the saved
FULL_BODY image server-side into its own temporary seven-day person asset. A
one-off Change photo replaces only that session input, never the saved avatar.
No avatar is selected if none is saved. A failed default load offers ordinary
photo upload with a clear error. Generation, payer selection, quotas and Store
ownership continue through existing central services.

## API and storage

- GET/PATCH `/api/v1/customer/me/avatar`: preferences, completion, metadata.
- POST/DELETE `/api/v1/customer/me/avatar/SELFIE|FULL_BODY`: individual photos.
- GET `/api/v1/customer/me/avatar/:kind/:id/content`: authenticated owner bytes.
- POST `/api/v1/customer/try-on/sessions/:id/avatar`: consented owned session
  receives a temporary copy of the current full-body reference.

Migration `20261028010000_customer_avatar` adds the interests array and setup
timestamp to Customer and a checked `kind` on CustomerProfilePhoto. Existing
rows default to PROFILE. Existing upload normalization, customer security
version locks, retryable cleanup and deletion behavior are reused. Full-body
photos preserve their aspect ratio instead of profile's square crop. Input
decoding, MIME/signature, dimensions and size checks remain mandatory. Uploads
are limited to 16 MB and normalized to metadata-free JPEG, at most 2048×2560.

Persistent avatar keys use `customer-mobile/avatar/`, separate from temporary
Try-On inputs/results. No public avatar URLs or merchant original-photo access
are introduced. Reads have no-store/nosniff headers. Object deletions retry;
replacement/removal withdraws application access immediately. Account deletion
also clears interests and setup completion.

## Rollout

Apply the migration, deploy API/web and rebuild the customer application with
the existing signing configuration. Confirm private bucket lifecycle rules do
not expire the avatar prefix. No storage policy, production migration,
deployment or APK build is performed by this implementation task. Real-device
camera/gallery, interrupted upload and cross-device acceptance remain release
checks. Automated verification and rendered previews are recorded below after
completion.

## Verification

- Disposable PostgreSQL migration applied successfully; Prisma schema valid.
- 38 backend tests passed across private account photos, customer experience and
  HTTP boundaries (37 regression cases plus the new setup/copy integration).
- 63 Flutter tests passed across avatar, Try-On, auth/onboarding and language
  regression suites, including Arabic/Tamil/Telugu narrow-screen setup.
- Actual Flutter renders reviewed at 390×844:
  `tmp/customer-mobile-review/category-setup.png` and `avatar-setup.png`.
- API typecheck, affected-file ESLint, Flutter analysis and diff whitespace
  checks completed. Provider execution/storage are simulated in integration
  tests; real device and production lifecycle acceptance remain rollout work.
