# CUSTOMER-MOBILE-10 — Welcome, information and authentication

Approved 2026-10-27 from the supplied fashion-app reference. Source version
**0.9.0+10**. This slice updates the customer app entry experience only.

The first-run sequence is a full-screen editorial welcome with Get started,
then three swipeable information screens, then existing sign-in/signup.
The information screens explain photo-based Try-On, participating Store QR
sessions and Saved looks. They use bundled fashion imagery in layered photo
cards, a warm cream canvas, clean typography, orange actions and progress dots.
They do not promise wardrobe, outfit planning or other unimplemented features.

Get started on the welcome opens the first information screen without marking
onboarding complete. Continue/swipe advances; Back returns to the previous
screen or welcome. Skip and the last Get started persist the existing local
completion preference before opening authentication. Preference failures remain
retryable. Returning users keep the existing completed-onboarding/session
behavior; this visual refresh does not force users through onboarding again.

Login/signup share a local entry theme with centered official branding,
sans-serif headings, white social buttons, rounded form fields and orange/white
primary buttons. Existing email/password, code, Google/Apple capability gates,
signup policy acceptance, email verification, reset, loading and error behavior
remain in the existing customer authentication flow. No guest bypass is added.

All screen copy reuses existing translations in the 20 offline catalogs.
Language selection, RTL, reduced motion, narrow screens, large text, landscape
scrolling and keyboard-aware forms remain supported. Editorial images and
decorative UI are bundled locally, excluded from accessibility semantics and
do not open a camera or request image access.

No backend, API, schema, account, retention or authenticated application changes
are required. No new packages, remote image dependency, APK assembly or deployment
are included. Validate navigation/completion/retry, all locale layouts, existing
auth regression tests, Flutter analysis and rendered welcome/info/auth previews.

Verification completed: the full mobile suite passed (116 tests). After final
signup-scroll/alignment polish, all 39 affected entry/auth/locale tests passed,
including a new signup scroll regression. Flutter analysis reports no issues;
the changed-file whitespace check passed. Rendered welcome, all three
information screens and both auth forms were inspected. Review images are in
the ignored `tmp/customer-mobile-review/` directory, including
`entry-flow-preview.png`. No APK was built.
