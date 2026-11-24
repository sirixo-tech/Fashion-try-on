# CONTENT-REPORTS-2 — Mobile reporting flow

Approved 2026-11-24. Connect Flutter mobile reporting to the existing
CONTENT-REPORTS-1 customer endpoint and platform review queue.

## Customer experience

- The completed Quick Try-On result keeps the orange New Try-On action and
  adds an outlined dark Report action with a flag on its right, matching the
  approved reference. Small viewports and larger text may stack the actions.
- Saved-look details and the alternate fitting-room result provide the same
  Report action. Thumbnails lead to saved-look details. The existing image
  component does not open a separate fullscreen viewer; no viewer is added.
- Report opens a scrolling in-app bottom sheet. A reason must be chosen from
  the six backend reasons. Comment is optional, trimmed and limited to 2,000
  Unicode code points before submission. No images or public URLs are attached.
- Submission uses the current customer session and its existing refresh/retry
  behavior, independent of credits or subscription plans.
- While sending, inputs, Cancel, back navigation and repeat submission are
  disabled. On failure the reason/comment remain available for retry. Report
  text is neither logged nor persisted locally.
- The success state appears only after a receipt with a nonempty ID and
  `submitted: true`. A backend duplicate response shows an already-reported
  acknowledgement. Missing/invalid receipts never display success. Expired
  results, rate limits and sign-in failures have actionable localized messages.
- The entire flow remains inside the app. All new copy is bundled in the 20
  existing language catalogs. Image display, downloads, generation, billing,
  retention and provider safeguards continue through their existing paths.

## Implementation

`mobile/lib/src/experience/customer_content_reports.dart` defines stable reason
codes and calls `POST /api/v1/customer/content-reports` through the authenticated
customer API. `customer_content_report.dart` holds the reusable action row,
Report button and form. Only a generated result asset ID, reason and optional
comment are sent. Server authorization remains authoritative.

Version is advanced from 0.13.0+16 to 0.13.1+17 for the policy-remediation build.
No new dependencies or platform permissions are required.

## Verification and rollout

Run Flutter formatting, analysis and the reporting, experience, language and
customer-session regression tests. Test pending submission, failure/retry,
duplicate reports, malformed receipts, changing accounts, saved results and
small/large-text layouts. Confirm reporting copy exists in every language.

Build a signed Android App Bundle with the existing private signing
configuration. The backend reporting migration/API and admin web deployment
must be available before installing this build for end-to-end acceptance.
Synthetic tests do not prove production delivery to the admin queue.

For Play review, provide test access with available generation credits and
instructions: generate a Try-On, tap Report next to New Try-On, select a reason
and submit; alternatively open My Looks, open the generated look and tap Report.
Verify the report in SelfX Content Reports. Attach screenshots of the result
action and form. Store publication/resubmission and any backend deployment must
be tracked separately from the local mobile implementation/build.

### Local verification completed 2026-11-24

- `flutter analyze --no-pub`: no issues.
- Reporting, language and session suites: 46 tests passed, including 13
  reporting tests covering Arabic RTL and large-text/small-screen use.
- Broader experience suite: 19 passed, four existing failures in one-time-plan
  selection, custom-credit price expectations, suggestion category filtering
  and lazy-list access in the sharing test. Their application behavior was not
  changed for this feature. The completed-result action test now checks the
  current New Try-On/Report controls.
- `flutter build appbundle --release --no-pub`: succeeded. The Android
  manifest identifies `com.selfx.selfx_customer`, version 0.13.1, code 17.
- `mobile/build/app/outputs/bundle/release/app-release.aab`: 76,025,259 bytes.
  JAR signature verification succeeded using the existing release signing
  configuration. The bundle contains reporting translations for all 20 languages.
- No deployment, live report-to-admin acceptance or Play Console upload was
  performed. These remain release steps, not simulated-test outcomes.
