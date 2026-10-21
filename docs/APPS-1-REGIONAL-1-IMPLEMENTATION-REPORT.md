# Apps & Downloads and regional preferences

Implemented locally on 21 October 2026. Production has not been changed.

## Available behavior

- Platform sidebar **Apps & Downloads**: upload a signed kiosk APK and notes as a
  draft, inspect version/code/ABI/size/minimum SDK/checksum, publish, recommend per
  architecture, retire, download and page through release history. Replacement
  means a new version upload; previously published bytes stay immutable.
- **Kiosks → Download Kiosk APK**: active, permitted Store users with kiosk plan
  access see only published releases. Links expire after 60 seconds. Retiring a
  release blocks new links; existing links expire naturally.
- **Account & Regional Settings**: automatic device or explicit timezone, date
  order and 12/24-hour time preferences, preview and save to the current user.
  Shared display components update dashboards, analytics, billing, Store/user/
  staff lists, device last-seen, integrations, payment timestamps and release dates.
  Report day buckets retain their original date; UTC database values, billing
  boundaries and kiosk schedules are unchanged. The public kiosk clock stays local.
- Every user can edit their own regional settings. Release view/manage are
  separate Platform-only permissions. Protected Superadmin receives both;
  existing editable role maps are not silently granted these new permissions.

## What you need to do

1. Use a stable production release signing key for the kiosk APK. The current
   `mobile/kiosk/android/app/build.gradle.kts` release configuration still signs
   with the Android debug key. This implementation deliberately does not create,
   replace or expose signing keys. Decide/migrate your production signing identity
   before distributing commercial builds; installing a differently signed APK
   over an existing kiosk build requires a deliberate migration.
2. Install Java plus Android SDK Build Tools on **every API host/image**. Configure
   `SELFX_APK_AAPT_PATH` (aapt executable), `SELFX_APK_SIGNER_JAR_PATH`
   (build-tools/lib/apksigner.jar), `SELFX_APK_JAVA_PATH` (default java),
   `SELFX_APK_SIGNER_SHA256` (trusted release signing-certificate SHA-256), and
   `SELFX_APK_PACKAGE_NAME` (default com.selfx.kiosk). Paths must refer to files
   inside the deployed host, not your Windows workstation. Missing tools or
   certificate keep uploads unavailable; there is no verification bypass.
   Android documents signature inspection with
   [apksigner verify --print-certs](https://developer.android.com/tools/apksigner).
3. Reuse configured private `OBJECT_STORAGE_*` credentials/bucket. Allow API
   writes and signed download reads. Do not make the release bucket public.
   The upload is browser → web API proxy → SelfX API; confirm proxy/body/time
   limits support your APK size up to 200 MiB. This slice does not use direct
   browser-to-bucket uploads. Each API instance admits at most two concurrent
   uploads and one per user; Inspector processes have bounded time/output.
4. Generate Prisma client, apply `20261021000000_app_releases_regional_preferences`
   with the normal migration deployment command, and deploy API/web together.
   Standard repository commands: `npm run prisma:generate --workspace=@selfx/database`
   and `npm run prisma:migrate:deploy --workspace=@selfx/database`.
5. Sign in as Superadmin. Grant **View App Releases** / **Manage App Releases** to
   the intended Platform roles through User Management > Roles, as appropriate.
   Upload an APK draft, review, publish, then set recommended for its architecture.
   Nothing is published or installed automatically.
6. Verify a Store with kiosk viewing permission and an eligible plan can download;
   verify a Store without access cannot. Test a manual installation on certified
   hardware. Verify two users can save distinct regional settings and see those
   choices again after a fresh login on another device.

## Verification

- All 351 web tests passed (48 test files).
- 31 focused backend tests passed, including real disposable PostgreSQL and an
  actual local kiosk APK inspected with Android Build Tools (test certificate
  pinned only in the test process).
- API compilation, UI package types, web production build, schema validation and
  migration deployment passed. Existing unrelated image-optimization lint
  warnings remain.
- Desktop (1440px) and mobile (390px) browser checks passed for release cards,
  publish confirmation/cancel, read-only viewers, Store controls, regional
  preview and Save; no browser runtime errors or horizontal overflow.

Local disposable PostgreSQL migration and lifecycle tests cover checksum retry,
draft/published/retired visibility, stale edits, recommendation replacement,
version collisions/object cleanup, audit records and preference persistence.
Additional tests cover APK package/ABI/signature validation, real Fastify multipart,
Platform/Store permission boundaries, live formatting, account switching, date
rollover, daylight-saving transitions and date-only bucket preservation.
Production credentials, uploads, deployment and device installation remain
operator activation checks. No remote-update mechanism is implemented.
