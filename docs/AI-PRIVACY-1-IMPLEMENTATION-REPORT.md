# AI-PRIVACY-1 — AI provider presentation cleanup

Implemented 21 October 2026. Changes are local and ready for deployment.

## Result

Usage & Billing no longer shows Provider Usage. Developer / API no longer shows
provider/model breakdowns. Sessions, generated looks, failures, downloads and
Store/kiosk/product/channel totals retain their existing scope and calculations.
Both platform and Store-facing usage APIs omit provider rollups entirely; the
data is not merely hidden with frontend styling.

Garment and Jewellery Lab responses no longer expose AI provider names, model
identifiers or provider cost fields. Backend records retain execution attribution
and prediction identifiers for operations. Stored failures returned through Lab,
kiosk, Public API, webhook and Shopify response construction use safe SelfX
messages. The HTTP exception filter also sanitizes direct Try-On configuration
errors, preserving response status and stable SelfX error codes. Useful image
validation instructions are retained.

Temporary Lab and legacy kiosk remote result images are fetched by SelfX and
returned as inline images, so browsers do not receive vendor CDN URLs. Remote
conversion permits HTTPS without URL credentials, limits redirects, transfer time
(15 seconds) and bytes (existing 50 MiB result ceiling), validates image bytes and
returns a safe failure if conversion fails. New legacy kiosk results store the
validated inline representation in their existing field. Production result asset
delivery and existing authorization, tenant isolation and retention are preserved.

Jewellery catalog wording now describes SelfX Try-On and ornament types.
Payment gateway names and Google sign-in are separate user-facing integrations;
their labels and error behavior remain intact. The PRD, technical requirements,
journeys, UI flow and implementation plan record this approved policy, superseding
earlier client-visible AI provider metadata.

## Verification

- 140 focused backend tests passed across 23 files: usage, Developer / API, Lab,
  kiosk generation, Shopify generation and the new privacy HTTP/image checks.
- All 351 web tests passed across 48 files.
- Shared package compilation and API TypeScript compilation passed.
- Production Next.js build, including frontend type checking, passed.
- ESLint on changed TypeScript/TSX files passed with zero warnings.
- `git diff --check` passed.

The production build still reports four existing `next/no-img-element` warnings
in the unchanged shared-look and Shopify pages. Tests use simulated provider
responses; no paid/live AI generation or production data changes were performed.

## Deployment

Deploy the API and web together using the normal shared-package build. No database
migration, credential changes, Google Cloud changes or new kiosk APK is required.
The removed `providerUsage` and Lab provider/model/cost fields are intentional API
contract removals; any external consumer relying on those fields must stop doing
so. After deployment, refresh Usage & Billing and Developer / API and confirm the
tables are absent. Verify a Lab result and a failure show SelfX-only presentation.

This change has not been deployed to Railway or committed by this task.
