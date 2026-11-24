# CONTENT-REPORTS-1 — Backend and platform review foundation

Approved 2026-11-23. This phase implements the SelfX application side of
AI-generated-image reporting. The Flutter reporting UI is deferred. This backend
alone does not complete the Google Play remediation.

## Behavior and access

Signed-in customers can submit reports about their own completed, available
generated results, including personal trial, purchased-credit and Store-sponsored
mobile results. Reporting has no subscription entitlement or credit cost. Other
customers' images, original person/garment uploads, failed runs and unavailable
results cannot be newly reported. The server derives ownership and run reference.

Reasons: SEXUAL_CONTENT, CHILD_SAFETY, VIOLENCE, HATE_HARASSMENT,
PRIVACY_NON_CONSENSUAL and OTHER. An optional trimmed comment is at most 2,000
characters. One report per customer/result; identical retries return the existing
receipt, while changed payloads return CONTENT_REPORT_ALREADY_SUBMITTED (409).
The existing HMAC rate buckets apply 20 submission attempts/customer and 300/IP
per 15 minutes. Submissions serialize with customer deletion/security changes.

`CONTENT_REPORTS_VIEW` and `CONTENT_REPORTS_MANAGE` are platform-only registry
permissions. Manage implies View. Only protected Superadmin has them by default;
other platform staff require explicit assignment through existing role management.
Store roles, plans and impersonation never confer this access.

## API

- `POST /api/v1/customer/content-reports`: customer bearer authentication;
  `{ resultAssetId, reason, comment? }`; returns `{ id, submitted: true }`.
- `GET /api/v1/admin/content-reports`: View; allowlisted `status`, `reason`,
  `page` (default 1) and `pageSize` (default 25, maximum 100). Newest first,
  ordered by creation time then UUID. Returns `{ data, total, page, pageSize }`.
- `GET /api/v1/admin/content-reports/:id`: View; report detail, review version,
  image availability and expiry. Does not return image URLs or storage keys.
- `GET /api/v1/admin/content-reports/:id/image`: View; authenticated binary
  generated-result preview, `private, no-store`, with fresh ownership, purpose,
  run association, readiness, deletion and expiry checks. Never reads originals.
- `PATCH /api/v1/admin/content-reports/:id`: Manage;
  `{ status, reviewNotes?, version }`. Notes are at most 4,000 characters;
  omitted notes are preserved, empty notes are cleared. Allowed statuses are
  NEW, IN_REVIEW, RESOLVED and DISMISSED. Statuses may be reopened/corrected.
  Optimistic version checking prevents lost reviews; stale versions return
  CONTENT_REPORT_REVIEW_CONFLICT (409). An identical immediately preceding
  write by the same reviewer is a safe replay.

Review changes and detail/image access are audited with the actual platform
actor. Audit metadata excludes customer comments, notes and image contents.
No report action changes billing, credits, images or AI provider configuration.

## Platform UX

`/app/platform/content-reports`, linked as Content Reports in the sidebar, uses
public `@selfx/ui` components. The list has status/reason filters, refresh and
pagination. View report opens a dialog with the generated result (or Image no
longer available), comment, run reference, status, notes and reviewer details.
View-only users cannot save. Conflicts/errors preserve input and provide reload.
Private preview bytes use authenticated fetch with existing session refresh;
local blob URLs are revoked on close, replacement and expiry.

## Persistence and privacy

Migration `20261123000000_content_reports` adds the content_reports table and
reason/status enums. IDs use application-generated UUIDv7. Customer FK cascades;
explicit soft account deletion also deletes the customer's reports and notes.
Run/result IDs are snapshot references without FKs to expiring or Store-purgeable
resources. Reports cannot hold up Store purges or media cleanup. Staff reviewer
UUID is an attribution snapshot; audit records use the established actor relation.

Reporting creates no image copy and never extends expiry. Metadata/notes remain
for review while the customer account exists, even after the image expires or a
Store is purged; account deletion removes them. Existing image expiry/deletion
and private storage remain authoritative. Lists omit comments, notes and customer
contact details. Do not put personal information into internal review notes.

Image removal/moderation enforcement, email alerts, customer replies, Flutter
buttons/forms and automatic policy changes are outside this phase. Reviewers
use findings to inform subsequent filtering/moderation improvements.

## Deployment and verification

Deploy the database migration before the updated API. The permission registry
is synchronized by the existing platform authorization service. Deploy the web
after the API. No new secrets or environment settings are needed.

Checks cover authenticated submission, malformed requests, rate limits,
platform View/Manage separation, default role grants, private preview headers,
ownership, replay/concurrency, expiry/deletion, Store purge, account deletion,
UI pagination, view-only controls, save failures and binary session refresh.
PostgreSQL integration tests use only guarded disposable localhost databases
(`customer_mobile_test` and `customer_auth_test`) with simulated
provider/storage/mail clients.

Verification on 2026-11-23: the new migration applied successfully in an isolated
localhost PostgreSQL instance, and Prisma schema validation passed. All eight
report HTTP/authorization tests and both new report integration tests passed,
along with the extended Store-purge and account-deletion assertions. The broader
backend run passed 71 of 72 tests; the unchanged Store QR test still passes a
new code-based QR payload to the legacy token-only parser. Web reporting,
navigation, binary-refresh and privacy tests passed; the existing protected-client
source assertion also fails on unchanged APK URL construction in
`app-releases-page.tsx`. These unrelated behaviors were left unchanged.

The local checkout also contains an empty, untracked historic migration folder
(`20261029050000_custom_credit_plan_features`). Migration replay used a temporary
snapshot of the actual SQL files, excluding that empty directory. No application
or production database was migrated. Store QR test fixtures used a synthetic
32-byte Base64 integration encryption key, never production credentials.
