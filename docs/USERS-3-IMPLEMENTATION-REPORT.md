# USERS-3 — Store Admin login management in Edit Store

Superadmin can now manage Store Admin accounts directly in the Store's existing
Edit Store popup. No second popup opens.

## How to use it

1. Open the Store and choose **Edit Store**.
2. Under **Store Admin account**, select the linked admin account.
3. Change **Admin login email** and choose **Save login email**. If that account
   belongs to other Stores, acknowledge the account-wide change first.
4. To add an admin, choose **Assign existing account**, search by name/login
   email, select the account, type the Store's exact name and choose
   **Assign Store Admin**. Current admins retain their access.

**Contact Email** remains the Store's contact address. **Save Store** saves the
Store profile; the account actions have their own clearly labelled save buttons.
An account can be shared across Stores, so its login email changes everywhere
that account signs in. Existing sessions and reset links become invalid; the
password stays the same and future password recovery uses the new email.

## Behavior and safeguards

- Account controls are available only to Superadmin. The backend rechecks that
  authority inside the transaction; UI visibility is not the authorization boundary.
- Email changes require the selected user to have a current Admin membership in
  the specified Store and require a fresh account digest. They preserve the
  existing name (including null), status, password and all access assignments.
- Duplicate emails, stale edits, unlinked/Staff targets, deleted users/links and
  protected Superadmins are rejected. Errors keep the popup and draft visible.
- Selecting an existing account adds Store Admin access. It does not replace
  another user's login or remove existing admins. The target's email, password,
  platform roles and other Store memberships are preserved.
- For an ownerless active Store, assignment performs the existing controlled
  first-admin repair. Additional admins receive ordinary Admin membership, with
  no ownership transfer. Confirmation, tenant locking, serializable transactions
  and the existing permission ceiling apply.
- Search and lists use backend pagination. The popup supports multiple admins,
  an ownerless Store, protected rows, loading/error states and shared accounts.
- Audit events record the actual administrator and source Store. Passwords,
  reset links and session credentials are never included.

## Implementation

New routes reuse the shared Users service:

- `PATCH /api/v1/admin/users/:userId/store-admin-email`
- `POST /api/v1/admin/users/:userId/store-admin`

The first takes `storeId`, `version`, and `email`; assignment takes `storeId`,
`version`, and `confirmStoreName`. The old first-owner route remains compatible.
Current Admin discovery uses the central Admin policy, including legacy Owner
memberships, rather than inferring a login account from Store contact email.

No schema migration or new environment variable is needed. Deploy the API and
web together. This work does not change any production account automatically.

## Verification

Account service/controller tests cover 30 cases, including the new routes,
preserved profile/credentials/contact/other Store links, session/reset revocation,
duplicate/stale/unlinked/Staff targets, authorization, additional-admin assignment,
ownerless repair and unchanged permission ceilings.

The related UI suites cover 25 cases: account selection, shared-account
acknowledgement, duplicate-email feedback, protected accounts, existing-account
assignment/confirmation/search, single-popup integration and ordinary Store-admin
visibility, alongside existing Users and Store-directory regressions.

API and web typechecks and changed-file lint passed. Existing deletion safeguards
are also verified with the PostgreSQL deletion regression suite. Database tests
use disposable localhost PostgreSQL; no production database, SMTP or provider
operation is used. A deployed browser walkthrough remains a rollout check.
