# CUSTOMER-MOBILE-13 — Try-On image direction

Approved 2026-10-28. Source **0.11.1+13**. Image backgrounds are chosen to suit
the content and purpose; cream is not a mandatory image backdrop. The app's
screen backgrounds and control colours are outside this visual revision.

The welcome cover now shows the existing two fashion models in a deep teal and
midnight-blue boutique, with copper light and clothing racks. A garment-reference
photo beside the same model wearing that jacket makes the Try-On connection
explicit. Right-aligned cover fitting keeps the comparison visible on narrow
portrait phones. Quiet lower space and the existing scrim keep the native headline and
Get started action readable. Official branding remains a Flutter overlay.

The bundled asset is `mobile/assets/editorial/welcome-tryon-v3.webp`. Only welcome
uses it; information-screen assets and authentication behavior keep their current
implementation. See `mobile/design/welcome-tryon-v3-prompt.md` for the exact edit
prompt and provenance. This supersedes the cream-studio welcome-image direction
in CUSTOMER-MOBILE-12, without changing its automatic Google linking work.

Validate the actual rendered welcome and existing entry/navigation/accessibility
regressions. The app must be rebuilt to show the new offline image. No backend,
API, persistence, console configuration, APK build or deployment is required as
part of implementing the source-image change.

Verified: 19 existing entry/auth/accessibility tests passed. After the portrait
framing correction, the rendered review test passed again and the final welcome
screen was visually inspected. Targeted Flutter analysis and changed-file
whitespace checks passed. The final preview is in ignored
`tmp/customer-mobile-review/welcome.png`. No APK was built.
