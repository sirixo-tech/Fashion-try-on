# Human login session policy

Approved 2026-11-28. Applies to staff/admin web and customer mobile authentication. Device sessions, commerce integration credentials, and anonymous customer Try-On sessions are unchanged.

## Behavior

The first 24 hours permit inactivity. From 24 hours onward, 15 minutes without reported user interaction expires the session. Activity near the threshold permits continued work, without restarting the 24-hour clock. At 30 hours, authentication is required regardless of activity. Expiry boundaries are inclusive. A shorter existing refresh credential lifetime still applies.

Backend API access and refresh both check the database session. Refresh never advances user activity or original authentication time. Activity endpoints validate the existing session before accepting activity; an expired session cannot be revived. Web activity is coordinated across tabs, with server validation rather than trusting deadlines sent by another tab. Background API traffic, polling, token refresh, focus and resume alone are not activity. Interaction reports are throttled to at most once per 30 seconds (less for short configured idle periods), so the server's latest acknowledged activity is authoritative.

Web and mobile schedule expiry checks and revalidate on resume. At expiry they clear authentication and return to login, including when offline. A suspended app cannot navigate until resumed. Timers provide UX; server checks remain the security boundary. Session metadata includes server time to account for device clock offsets. Client interaction reports are assistance signals, not proof of physical presence.

## Backend environment

```env
AUTH_SESSION_REAUTH_AFTER_SECONDS=86400
AUTH_SESSION_IDLE_TIMEOUT_SECONDS=900
AUTH_SESSION_HARD_MAX_SECONDS=108000
```

Defaults match DigitalTag CMS: 24 hours / 15 minutes / 30 hours. Values must be positive whole seconds, at most 2147483; hard maximum must be at least the reauthentication threshold. Invalid values fail backend configuration. Restart/redeploy the API after editing env. The clients receive timing metadata from the API; no frontend env or mobile rebuild is needed for subsequent timing changes. Lowered limits apply on the next server validation; increasing the hard maximum does not extend a credential already issued with a shorter expiry.

Keep `JWT_ACCESS_TOKEN_TTL_SECONDS` (normally 900), `REFRESH_SESSION_TTL_SECONDS` (normally 2592000), JWT secrets, refresh pepper and cookie configuration. No existing env variable must be removed. New staff refresh credentials and customer sessions are capped at the configured hard maximum. Existing shorter refresh configuration can cause earlier login requirements.

## Persistence and rollout

Migration `20261128000000_human_session_activity` adds nullable `last_user_activity_at` to `user_sessions` and `customer_sessions`. Staff session start is `created_at`; customer start is `authenticated_at`, which survives refresh rotation. Customer rotation also carries user activity forward. Refresh's `last_used_at` remains separate.

Existing rows have NULL activity and require a fresh login once. This intentionally replaces the previous staff behavior that allowed access JWTs to outlive session revocation. No passwords, roles, tenant scope, customer photos or device/integration credentials change.

1. Add the three env values to the production API service and retain existing auth variables.
2. Apply the database migration using `npm run db:migrate:deploy` before starting the updated backend. Generate the Prisma client during the build as usual.
3. Deploy the API and web changes together; release the updated mobile app for activity reporting and automatic navigation. Older mobile clients cannot report activity and will require login at the threshold even if used actively.
4. Verify fresh login, refresh, user activity, idle expiry, hard expiry, multiple tabs and app resume in staging using shortened env values. Restore production values before release.

The additive database migration, API, web and mobile release are separate deployment steps. Local tests do not deploy the migration or change production env.

## Local verification

- Backend auth/customer regression selection: 86 passed, 5 database-dependent tests skipped.
- Web session and activity tests: 14 passed, including expiry, resume, clock offset, cross-tab validation and refresh locking. Web Locks serialize cookie rotation across tabs on supported browsers, without persisting access tokens.
- Mobile controller selection: 6 passed; Flutter analysis reports no issues.
- Full mobile suite: 204 passed, 23 failed. The unchanged baseline reproduces the same 23 failures with 203 passed; the new session test adds one passing test. Existing failures include UI/copy expectations, country defaults and a profile-flow timeout.
- The broader web API selection has one existing source-contract failure in the unrelated app-release upload screen, which was not edited.
- Backend/web type checks, focused lint, Prisma schema validation and diff whitespace checks pass. A dummy local URL was used for schema validation; no database connection or production migration was performed. Live database and deployed browser/device acceptance remain rollout checks.
