# PAYMENTS-1I — Gateway presentation and saved-secret inputs

Date: 19 October 2026

## Result

- Gateway cards use larger locally served provider logos. Official asset sources
  are recorded in `frontend/web/public/brand/payments/README.md`.
- Removed per-card Live/Verified badges, repeated verification-success text and
  Verify payment. Configured cards retain Edit/Delete and their selection switch;
  unconfigured PhonePe retains Set up. Planned providers remain informational.
- Set up and Edit have a provider-logo header, a wide single-column Account
  details form with its own scroll area, and a fixed Cancel/Save gateway footer.
- Saved Salt Keys show eight placeholder dots and a replacement hint. The field's
  actual value stays empty until typed; untouched saves keep the existing key.
  Initial setup still requires a key and shows no saved-secret indication.
- Added public `@selfx/ui` SecretInput for consistent saved-secret presence and
  optional typed-password visibility. Salt Keys have no reveal control. Password
  eyes reveal only newly typed values, are disabled when empty, and reset after
  clearing/submission. No saved password/key is fetched to reveal it.
- SMTP and user-password edits use saved-value dots. Password recovery and Store
  creation confirmation fields now have typed-password visibility controls.
  Existing login/signup/new Store Admin password eyes are retained.

The separate payment verification/history section remains below the cards.
Existing authorization, credential versioning, unchanged-save retention,
re-verification after account changes, confirmed deletion and retained payment
history continue unchanged. Unsupported Terminal ID/UPI fallback fields were not
added. No backend, schema, environment or dependency manifest changes are needed.

## Validation

| Check | Result |
| --- | --- |
| Affected payment, secret-input, mail, recovery, user and Store-create UI tests | 84 passed |
| Web and shared UI TypeScript | Passed |
| Changed-file ESLint | Passed |
| Web production build | Passed |
| Git whitespace check | Passed |
| Desktop/mobile browser layout checks | Passed |

Browser checks rendered the real components in an isolated local fixture using
dummy account data and local logos. At 1440 × 1000 and 390 × 844, the dialog stayed
inside the viewport, account details scrolled independently and the footer
remained visible. Mobile cards had no horizontal overflow. Setup's key was empty
and required. Screenshots were visually inspected. The fixture substitutes the
Next Image wrapper with an ordinary image element, using the same assets and
dimensions. It does not exercise live authentication or provider traffic.

UI tests cover missing saved-secret values, masked placeholders that are never
submitted, optional blank-key retention, new-key requirements, typed-password
reveal/reset, preserved SMTP password omission, card action visibility and
deletion confirmation/retry. Existing payment verification regressions also pass.

The build emits existing `next/no-img-element` warnings in Looks share and Shopify
Try-On pages, outside these changes. No production data, credentials, payments or
deployment were modified.

## Deployment

Deploy the updated web application including its static logo assets. No migration,
new environment variable or API deployment is required for this UI-only update.
