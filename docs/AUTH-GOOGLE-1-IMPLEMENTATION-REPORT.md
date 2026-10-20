# Google sign-in and Platform-only Developer/API

Date: 20 October 2026

## What changed

- Developer/API navigation, pages, keys, usage and webhook management require
  Platform `DEVELOPER_API_VIEW` / `DEVELOPER_API_MANAGE` authority. Store developer
  permissions are retired from active permission lists and effective role maps.
- Previously issued keys authenticate only if their creator still exists, is
  active and retains Platform `DEVELOPER_API_MANAGE` authority. Missing/deleted,
  suspended or Store-only creators cannot use keys. Keys/history are retained;
  this does not delete or automatically revoke records.
- Kiosks, Shopify and WooCommerce keep their separate authentication paths,
  membership checks and plan restrictions.
- Optional Google buttons appear on Login and Create account when enabled by the
  API. Login uses an existing Google identity; an unknown identity is directed to
  Create account. Signup reuses normal Store/owner/Starter trial onboarding.
- Existing matching emails are not merged automatically. A short-lived,
  browser-bound pending link requires the matching SelfX account's password and
  authenticated session. A password change invalidates an older pending link.
- Google-only accounts have no password. Existing password accounts keep their
  credentials. Password recovery remains for password accounts; this slice does
  not add password setup/unlink controls for Google-only users.
- Google sign-in issues ordinary SelfX access/refresh sessions and never grants
  roles or reactivates a suspended account/Store. Google login and both password
  login/signup validate the final destination against current access.

## What you need to do

### 1. Create the Google OAuth client

1. Open [Google Cloud Console](https://console.cloud.google.com/) and select or
   create the SelfX project. Open **Google Auth Platform**.
2. Configure **Branding** with the SelfX name, support/contact email and public
   home/privacy URLs. Choose **External** audience if merchants use accounts
   outside your own Google Workspace.
3. Request only basic identity scopes: `openid`, `email`, `profile`. No Gmail,
   Drive, billing or other Google API permissions are needed.
4. Under **Clients**, create an OAuth client of type **Web application**.
5. Register this exact **Authorized redirect URI** for the current web domain:

   ```text
   https://selfxweb-production.up.railway.app/api/v1/auth/google/callback
   ```

   If you switch to a custom web domain, register that domain's exact callback
   and update the API settings below. Production uses the **web** domain through
   the existing API proxy. Do not substitute the private/upstream API URL.
6. Copy the client ID and client secret into the API service's private variables.
   Do not paste the secret into the frontend, repository, report or chat.
7. Review Audience/publishing and any branding verification Google requires
   before public rollout. Basic identity-only scopes have different testing
   restrictions from sensitive scopes; follow the current Console status rather
   than assuming an unverified app is ready for everyone.

Google references: [OIDC setup and registered redirects](https://developers.google.com/identity/openid-connect/openid-connect),
[app audience/state rules](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview),
[brand verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification).

### 2. Configure the SelfX API service

Set these **backend/API** environment variables in Railway:

```dotenv
SELFX_GOOGLE_AUTH_ENABLED=false
GOOGLE_AUTH_CLIENT_ID=YOUR_GOOGLE_WEB_CLIENT_ID
GOOGLE_AUTH_CLIENT_SECRET=YOUR_GOOGLE_WEB_CLIENT_SECRET
SELFX_PUBLIC_WEB_BASE_URL=https://selfxweb-production.up.railway.app
GOOGLE_AUTH_REDIRECT_URI=https://selfxweb-production.up.railway.app/api/v1/auth/google/callback
```

Keep Google disabled during initial deployment. These Google auth variables are
separate from the Google Virtual Try-On provider credentials. No new frontend
`NEXT_PUBLIC_*` variable is needed. Keep production `COOKIE_SECURE=true`, the
public web origin in the CORS allowlist, and the existing same-origin API proxy.
Use host-only cookies (`COOKIE_DOMAIN` unset) unless your deployment deliberately
uses a compatible shared custom domain. Never set cookies to the upstream API
hostname when browser traffic uses the web hostname.

For local development the callback can instead be
`http://localhost:3001/api/v1/auth/google/callback`, with the public web base set
to `http://localhost:3002` and that exact localhost callback separately registered.

### 3. Apply the migration and deploy

From a deployment checkout with the intended database connection:

```sh
npm run prisma:generate --workspace=@selfx/database
npm run prisma:migrate:deploy --workspace=@selfx/database
```

Apply `20261020000000_google_staff_sign_in` before the new API handles requests.
Build/deploy the updated API and web using the existing pipeline. Replace **all**
old API instances before turning Google on: nullable-password Google users must
never be served by the old password-login implementation. Existing data and
password hashes are retained; no account credentials are seeded or changed.

After the migration and deployments succeed, change
`SELFX_GOOGLE_AUTH_ENABLED=true` on the API service and restart/redeploy it.
Google configuration is read at API startup. The web button reads availability
from the API, so no secret or Google enable flag needs a frontend rebuild.

### 4. Verify the deployed experience

1. Confirm `GET /api/v1/auth/google/config` returns `{"enabled":true}` and both
   Login/Create account display Continue with Google.
2. Use a Google account matching an existing password user. Confirm the link
   explanation appears, sign in with that SelfX account's password, then sign
   out and sign in using Google. Check that its Store memberships and Platform
   authority remain unchanged and no extra Store was created.
3. Create a new account using Google from Create account. Confirm exactly one
   Store, owner membership and normal Starter trial. Reload the page to verify
   session restoration, then sign out/back in. No Platform role should appear.
4. Cancel Google login once; verify it returns safely and can be retried. Check
   a Shopify linking continuation and an inaccessible `next=/app/developer` from
   a Store account: the latter should return to the dashboard.
5. Confirm Store accounts cannot see/open Developer/API or use their old Public
   API keys. Confirm authorized Platform viewers can read and managers can
   manage. Check kiosk device login and Shopify/WooCommerce connections still
   work under the same existing permissions and plan gates.

The real Google round trip requires your OAuth client and registered domain;
local simulated-provider tests cannot replace that deployed smoke test.

## Implementation details

The backend provides `/api/v1/auth/google/config`, `/start`, `/callback` and
`/link`. It validates Google tokens server-side, uses PKCE/state/nonce protection,
stores hashed browser/state bindings, and consumes state atomically. OAuth
requests and pending links expire after ten minutes. Expired rows are deleted
in bounded batches on new OAuth starts. Google tokens are never persisted.
The callback sets the existing HttpOnly SelfX refresh cookie, then redirects to
`/auth/google/complete` without credentials in the URL. The completion page
restores the session and applies the common permission-aware redirect.

## Validation and delivery status

Implementation and migration are local. Production deployment, real Google
credentials/configuration and the deployed Google smoke test are operator steps.
Completed validation:

- Prisma schema validation and deployment of the new migration to the disposable
  localhost PostgreSQL database passed.
- Google OIDC/configuration checks (14), callback/cookie/controller checks (5)
  and real-database Google flow checks (5) passed. Google responses were simulated;
  cryptographic token verification is delegated to `google-auth-library`.
- Existing password/session, password-recovery (including Google-only accounts),
  global Store role, Platform RBAC, Developer key/console and separate Shopify/
  integration authentication regressions passed. Retired stored Store API grants
  were explicitly tested against runtime access and permission lists.
- Web Google-button, login/link recovery, navigation, return-destination and
  session tests passed. Google and password signup share permission-aware return
  handling.
- API/web TypeScript checks, changed-file ESLint, API compilation and the Next.js
  production build passed. The web build retains four existing image-optimization
  warnings in unrelated looks/Shopify Try-On pages.
- Desktop (1440×1000) and mobile (390×844) browser checks passed for Login, Signup
  and pending account linking: no horizontal overflow, usable Google controls,
  recovery to password-only login and navigation to a mocked Google authorization
  destination. No real Google account or production data was used.

No production migration/deployment, real Google authorization or Cloud Console
change was performed. Follow the operator steps above to activate the feature.
