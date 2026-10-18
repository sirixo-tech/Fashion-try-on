# USERS-4 — Create a Store Admin account from Edit Store

Superadmin can create a login for an existing active Store that has no current
linked Admin, without leaving the Edit Store popup.

## How to use it

1. Open the Store and choose **Edit Store**.
2. Under **Store Admin account**, choose **Create new account**.
3. Enter **Full name**, **New login email** and **Password** (12–256 characters).
   The Store contact email prefills the login field; you can change it independently.
4. Choose **Create Store Admin account**. The new account appears as the linked
   Admin and can sign in with the email and password you entered.

If the email already belongs to an account, choose **Find existing account** to
open the existing-account assignment panel with that email as the search. Existing
accounts keep their credentials and other Store access. Deleted accounts cannot
be restored; choose another email when necessary.

**Save Store** remains the separate Store-profile action. Account creation saves
immediately through its own labelled button. No invitation or reset email is sent
automatically; the existing Forgot password flow remains available separately.

## Implementation and safeguards

- `POST /api/v1/admin/users/store-admin` creates the user and reuses controlled
  first-admin assignment inside one serializable transaction. Failed assignment
  leaves no orphan login or partial access.
- The API checks Superadmin authority, active Store status, current Store name,
  existing Admin links and email uniqueness. Tenant locking and transaction
  isolation protect simultaneous requests. A linked suspended/disabled Admin
  also blocks new-account creation; manage that account or assign an existing one.
- The account receives Store Admin access only for the selected merchant tenant,
  with the existing permission ceiling. It receives no platform role.
- Products, stock, plan/subscription, contact details and history are preserved.
- Passwords use the shared Argon2id service. Responses and audit metadata never
  include passwords or hashes. The UI clears the password after API completion,
  cancellation or switching panels and offers a show/hide control while entering it.
- Creation and assignment expand inline in the same popup. Errors retain the
  non-secret draft, and busy state prevents conflicting parent-popup actions.

## Verification

The Users service/controller suites cover 36 cases. New coverage verifies
creation, safe response/audit data, password hashing, unchanged real catalog/stock
and subscription/history rows, permission ceilings, duplicate/deleted emails,
authorization, renamed/inactive Stores, existing Admin links, transaction rollback
and concurrent creation. Related Store/Users UI suites pass 29 cases, including
inline creation, contact-email prefill, refresh, duplicate-email lookup, password
clearing and single-popup integration.

The existing user/Store deletion regression suite also passes all 15 cases.
API and web typechecks and changed-file lint pass. Database checks use disposable localhost PostgreSQL;
no production account, SMTP or payment-provider operation is performed.

## Deployment and next step

Deploy the API and web together. No new migration or environment variable is
needed for this change. Deployment does not create accounts automatically.
After deployment, open Avinash stores as Superadmin and use the steps above;
then sign in with the newly created Store Admin in a separate browser session
and verify the Store dashboard and migrated products.
