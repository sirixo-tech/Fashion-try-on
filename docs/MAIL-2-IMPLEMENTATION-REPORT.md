# MAIL-2 — Automatic mail and editable templates

Mail Settings now separates SMTP configuration, automatic/reusable templates,
custom sending and delivery history. SMTP is locked until Superadmin confirms
Edit configuration; Save/Cancel locks it again. Server writes require
`editConfirmed: true`; saved passwords remain encrypted and are never returned.
The legacy Test Email interface and HTTP route are removed. Password recovery
continues through the existing shared encrypted outbox.

## Automatic messages

Default templates cover Store creation, application approval/rejection,
activation/reactivation, suspension, archival, permanent deletion, verified
production purchase receipts and paid orders requiring staff review. There is
also a reusable custom-message draft. Superadmin may edit subject/body, inspect
available variables and sample preview, Save, or restore the default into the
draft before saving. Overrides are versioned; unsupported variables, malformed
headers and stale writes are rejected. Template edits affect future events only.

Events enqueue inside the same transaction as the domain change. Signup
(email/Google), platform Store creation/onboarding, Store status updates, legacy
application review/activation and permanent deletion all use the shared service.
Payment notices are queued only after server verification of production payment;
QR creation, pending/failed checks and UAT do not produce paid receipts. Staff
review messages never claim stock is allocated or ready for collection.

Recipients are the affected Store's eligible Admin/owner login addresses and
configured contact email, normalized and deduplicated. No other Store's members
are included. Anonymous kiosk checkout currently has no customer email field,
so this change sends Store notifications; it does not introduce customer-email
collection or invent a recipient address.

## Delivery and access

The existing encrypted PostgreSQL outbox now has a unique event/recipient digest,
template code and masked recipient metadata. A deletion notice's encrypted
snapshot survives removal of the Store and linked accounts. Disabled/unavailable
mail is recorded as skipped; there is no automatic historical backfill. SMTP
runs outside business transactions, with up to four bounded attempts, 24-hour
expiry for new notification/custom jobs and the existing lease/cleanup handling.
Terminal payloads are erased; delivery metadata remains for seven days.

Custom Email uses enabled saved SMTP settings, a configuration version, request
UUID and rate limit (three new sends per minute). Unchanged network retries reuse
the UUID. Mail Settings APIs remain Superadmin-only and deny active Store
impersonation. History exposes the latest 50 masked status records without
plaintext recipients, bodies, tokens or credentials.

SMTP acknowledgement followed by a process/database failure can still cause a
retry after the message left the server. A stable SMTP Message-ID helps identify
these retries; generic SMTP cannot promise exactly-once external delivery.
“Accepted by SMTP” is distinct from guaranteed inbox delivery.

## Deployment

Generate Prisma and apply `20261022010000_automatic_mail_templates`, then deploy
API/web together. Existing `SELFX_MAIL_ENCRYPTION_KEY` and optional previous-key
configuration must remain available. No new SMTP credential or live send is
needed for this migration. Enable outgoing mail only with the intended saved
configuration. This implementation does not send real messages as a test.

## Verification and local rollout

- All 68 migrations applied successfully on fresh disposable PostgreSQL.
- 85 focused backend tests passed across mail, password recovery, Store management,
  signup and order payment execution. One additional real-database receipt test
  passed afterward, verifying paid totals, event deduplication and Store isolation.
- 12 web tests passed for SMTP locking/confirmation/cancel, custom queueing,
  template preview/versioned saves/default restoration, failed-draft retry,
  token refresh and the existing password recovery interface.
- API TypeScript and changed-file ESLint passed. Prisma generation/validation
  passed. Next.js production compilation, type validation and static generation
  passed; four existing image-element warnings remain on unrelated pages.
- All SMTP delivery in these checks was simulated. No real email was sent.

After the local application database was started, a backup was saved at
`tmp/db-backups/selfx-before-mail-automation-2026-10-22T05-46-17-185Z.dump`.
The additive migration was applied to `selfx` on `localhost:5433`; Prisma reports
all 68 migrations up to date. Saved SMTP settings were not changed or enabled.
Refresh Mail Settings and restart the API if it is not running in watch mode.
Production remains unchanged and requires the coordinated deployment above.
