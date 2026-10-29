## Document Evolution

### CUSTOMER-MOBILE-17 — Shared credit price and custom purchases (2026-10-29)

Customers may buy any whole number of personal credits from 1 to 1,000, including a single credit. The server calculates mobile purchase and Mobile Plan totals from one platform-managed INR per-credit rate. INR Store per-credit terms use the same rate for future billing cycles. Completed orders and existing Store billing cycles keep their saved prices. Monthly Store subscription fees remain separate.

### CUSTOMER-MOBILE-16 — SelfX mobile payments (2026-10-29)

The platform Mobile Payments setting stores a SelfX-owned PhonePe checkout account separately from Store gateway accounts. Active INR Mobile Plans can be purchased in the direct customer APK when production checkout is configured and enabled. PhonePe checkout presents supported UPI app and QR payment options. The backend verifies the provider order and exact amount before granting credits, and grants once per completed purchase. A plan's introductory bonus credits are granted only on the customer's first verified mobile purchase. Personal paid credits remain separate from the one-time trial and Store-sponsored billing. One-time credits do not expire; monthly plan credits expire one month after verified payment and renew only after another payment. Monthly plans do not auto-renew.

### CUSTOMER-MOBILE-15 — Shared demo collection (2026-10-28)

Every signed-in mobile customer can browse sample clothing products and choose a sample model or their saved full-body photo for a personal Try-On. Demo items are clearly identified as samples and use ordinary personal credits. Store products and Store-sponsored sessions remain separate. See `CUSTOMER-MOBILE-15-DEMO-CATALOG.md`.

Platform administrators can configure separate Mobile Plans with price, billing period, included Try-On credits and introductory trial credits. Active Mobile Plans are visible in the customer app. The original catalog-only scope is superseded by CUSTOMER-MOBILE-16 for purchases and verified credit grants. The existing one-time personal trial and Store-sponsored QR billing remain separate.

### CUSTOMER-MOBILE-14 — Interests and saved avatar (2026-10-28)

After authentication, choose Men/Women interests, then save a private selfie and full-body photo using the supplied PoC. Jewellery is deferred in the customer mobile app and must not appear in its category selection or other customer-facing flows until implemented. The user explicitly approves persistent saved avatar originals until replacement/removal/account deletion. Ordinary Try-On inputs retain seven-day expiry; default to a temporary copy of the saved full-body photo, with a one-off Change photo. Manage references in Me → My avatar. See `CUSTOMER-MOBILE-14-AVATAR.md`.

### CUSTOMER-MOBILE-12 — Google linking and editorial welcome (2026-10-28)

Automatically link an authoritative, verified Google email to the same existing verified ACTIVE customer, preserving account identity, password, credits and history. Ambiguous matches require additional verification. Replace only the welcome cover with a premium two-model editorial image. See `CUSTOMER-MOBILE-12-GOOGLE-AUTO-LINK-COVER.md`.

### CUSTOMER-MOBILE-11 — Email/mobile authentication (2026-10-27)

Allow email/mobile password entry and number-first signup with an email for required email verification; SMS verification stays optional. Use inline linked Terms/Privacy without a checkbox, direct Google continuation and controlled linking to the same existing account. Ten-second phone retries retain broader abuse limits. See `CUSTOMER-MOBILE-11-AUTH-METHODS.md`.

### CUSTOMER-MOBILE-10 — Reference-led welcome and authentication (2026-10-27)

First launch shows an editorial welcome, three illustrated information screens and existing login/signup. Use the supplied fashion reference while describing only implemented photo Try-On, Store QR and Saved behavior. Preserve returning sessions and local onboarding completion. See `CUSTOMER-MOBILE-10-WELCOME-AUTH.md`.

### CUSTOMER-MOBILE-9 — Compact profile settings (2026-10-27)

Move Log out and Delete account to outer Me/settings and remove Sign out on all devices from the app UI. Replace verbose profile-photo controls with an avatar + and compact Gallery/Camera/Remove chooser. The user explicitly approves new profile pictures staying until replaced/removed/account deletion; Try-On photo retention is unchanged. See `CUSTOMER-MOBILE-9-PROFILE-SIMPLIFICATION.md`.


### CUSTOMER-MOBILE-8 — Native Firebase wiring (2026-10-27)

Implement the Firebase app wiring using the downloaded native Android settings. Preserve explicit SMS consent, notification opt-in and backend verification; do not require duplicated public values in the Dart config. Firebase Console/Railway setup and real delivery acceptance remain rollout work. See `CUSTOMER-MOBILE-8-FIREBASE-WIRING.md`.


### CUSTOMER-MOBILE-7 — Profile and header (2026-10-27)

Consolidate account details under one profile card; add optional private profile photos. Replace the Plans header button with a compact language dropdown, and show Add credits at zero personal balance. Keep subscriptions, language, notifications, updates, support and policy links; remove See the introduction. Firebase remains deferred. See `CUSTOMER-MOBILE-7-PROFILE-HEADER.md`.


### CUSTOMER-MOBILE-6 — Country and account UI (2026-10-27)

Approved follow-up adds searchable country codes with editable device-region defaults and remembered manual choice, consistent profile editing, About navigation and actual installed versions. The customer app has no Licenses section, per the latest UI direction; bundled notices remain intact. Phone formatting remains separate from verified ownership. Firebase configuration is explicitly deferred. See `CUSTOMER-MOBILE-6-ACCOUNT-UI.md`.

### CUSTOMER-MOBILE-5 — Email and phone codes (2026-10-27)

Approved follow-up adds six-digit email verification/reset/login codes and prepared Firebase phone login/linking. Keep existing account IDs, credits/history and password/Google/Apple login. Phone is optional at signup and becomes a login method only after verified linking to an authenticated account. No automatic account merging or phone-only signup. See `CUSTOMER-MOBILE-5-OTP.md`.

### Customer account password minimum (2026-10-27)

The user approved an eight-character minimum for customer account passwords on signup and password reset. Longer passwords remain allowed up to the existing 128-character maximum. Existing passwords and sign-in continue to work; staff and merchant password policies are unchanged.

### CUSTOMER-MOBILE-4 — Customer languages (2026-10-27)

The user approved 20 customer app languages: English default, Hindi, Tamil, Telugu, Spanish, Arabic, Kannada, Bengali, Marathi, Malayalam, Gujarati, Urdu, French, Portuguese, German, Simplified Chinese, Japanese, Korean, Russian and Indonesian. Save the selected language locally and to the customer account; switch immediately, including Arabic/Urdu RTL. Translate app-owned copy and prepared notifications; retain customer/merchant content and external legal/OS/email content in its source language. See `CUSTOMER-MOBILE-4-LANGUAGES.md`.

### CUSTOMER-MOBILE-3 — Customer services and distribution (2026-10-26)

The user approved functional customer support, public Terms/Privacy, a customer look-ready inbox, optional phone alerts and direct Android APK updates. Reuse the existing SelfX contact/site. Prepare Firebase integration now; configure it later, with delivery inactive until configured. Mobile and kiosk releases remain separate. Support opens the user's composer; updates require user installation approval. No APK build or production publication is included. See `CUSTOMER-MOBILE-3-SERVICES.md`.

### CUSTOMER-MOBILE-2 — Working Try-On, free trial and Store QR (2026-10-26)

The user approved working customer mobile photo Try-On, Saved, premium image-led onboarding and Store QR sponsorship. Customers without a personal paid plan receive the existing Starter trial-credit setting once per customer account; no merchant tenant is created. Personal paid products remain separate and are not offered until configured. Reserve one credit at admission, use it only after a saved result, release on failure and never reset used credits on image expiry/deletion. Store QR selects eligible Store products and explicitly charges only the Store, with no personal fallback. Mobile generated results expire within 30 days from result creation; originals/captures stay within 7 days. This implements the previously approved mobile retention exception; all other channel policies remain unchanged.

### Dashboard sidebar switch and mobile metrics (2026-10-25)

Keep Business and Mobile dashboards separate. Business is the default at /app/dashboard. Authorized platform users switch through a compact toggle inside the existing Dashboard sidebar row; do not add a Mobile sidebar entry. Clicking the row label always opens Business and resets the toggle. Switching changes the displayed dashboard name with a vertical sliding animation. Mobile customer account counts are real aggregates; unavailable Try-On, personal revenue/plans and Store-QR services must not be represented as zero or fabricated data. Mobile personal billing remains separate from Store sponsorship; no financial totals are double-counted.

### CUSTOMER-MOBILE-1 — Independent customer app foundation (2026-10-25)

The user approved a standalone Flutter customer app for Android/iOS with a fresh premium visual identity using the approved SelfX logo and colors while keeping web/kiosk layouts separate. Start with four skippable introduction slides; explicit email/password and Google/Apple account flows; email verification; recovery; and Home, Saved and Me navigation. Customer accounts are SelfX-wide, separate from staff/merchant identities and Store memberships. Never automatically merge accounts based on matching email addresses. Unknown-account login errors remain generic, with an explicit Create account action.

The user explicitly approved **30 days for generated results saved by the customer mobile app**. This supersedes the seven-day generated-result maximum only for this future customer-mobile saved-result purpose. Original customer/person photos, physical customer garment captures and sensitive derived/provider inputs retain their existing maximum of seven days. Kiosk, commerce, API and other generated results keep the existing seven-day policy. The app must eventually show expiry, support earlier deletion and remove expired private objects and access paths; saving is not permanent storage. A Store-sponsored mobile result needs explicit customer ownership and approved Store-session consent before entering this purpose. This milestone stores no customer photographs or generated results and does not extend existing asset expiries.

Future personal Try-Ons use distinct customer plans. A verified Store QR session exposes only that Store's eligible products and charges that Store. The server chooses payer and entitlement; an expired or exhausted Store session must never silently charge personal credits. The header order is scanner, Plans, personal balance. QR redemption, image processing, customer purchases, credit balances, result retention jobs, referrals/coupons and additional languages remain later work. Account deletion and profile/security settings are functional in this foundation.

### Commerce reliability, controls and Shopify billing (2026-10-25)

Approved follow-up scope: recover Shopify catalog sync automatically, show its storefront button only after eligibility checks, support disconnect/reconnect to the same approved Store, and expose WooCommerce visitor/monthly limits with actionable errors. Do not add Change Store. Merchants buy existing active Shopify-compatible SelfX plans through Shopify payment approval; WooCommerce retains SelfX billing. Paid Shopify plan changes start at the next renewal, preserving the current price and allowance until then. Approved terms remain fixed until new approval. Usage plans require an explicit merchant spending cap and charge only successful generations across the Store's included channels. Public WooCommerce distribution preparation does not authorize directory publication.

### Shopify anonymous visitor limits (2026-10-25)

Anonymous Shopify Try-On remains available without login. SelfX remembers a browser with its own secure, HttpOnly first-party cookie, with independent usage limits per Store. Opening a product or launching a session does not consume an allowance; admitted generation attempts retain the existing counting policy. Clearing cookies, private browsing or switching devices can reset anonymous identity. Store credits and monthly caps remain separate protections.

### STORE-ARCHIVE-INTEGRATIONS — Release commerce connections (2026-10-23)

Archiving a Store disconnects its integrations, revokes integration credentials and pending connection sessions, and releases Shopify shop identity. Imported catalog references in the archived Store become inactive; native Store products and historical records are retained. Restoring the Store does not restore connections. A merchant must authorize each integration again, and a newly linked Store imports its own catalog without inheriting the archived Store's tenant data.

### COMMERCE-TRYON-2 — Try-On-only website integrations (2026-10-23)

Shopify/WooCommerce are Try-On-only channels: show the product-page SelfX button and import one parent image/reference into the correct Store for kiosks. Website platforms retain all size/color selection, price, inventory, cart, checkout and orders. Imported products cannot enter native SelfX purchasing; sold-out items remain eligible for Try-On. Native SelfX products retain approved shopping functionality. This supersedes WOO-1 variant/price import and proposed cart handoff.

### WOO-1 — Website catalog to Store/kiosk sync (2026-10-22)

Authorize an installable WooCommerce plugin connecting a website to its correct SelfX Store using a scoped integration token. Synchronize simple/variable parent products, variant size/color/images/prices and availability in one direction. WooCommerce remains the source of truth; one variable parent is one kiosk item. Preserve SelfX Try-On eligibility and allow sold-out products for Try-On. Initial/manual sync, change/deletion delivery, retries and reconciliation are included. Storefront Try-On, purchase continuation, orders and inventory writeback remain the next milestone; imported references cannot use native SelfX checkout.


### MAIL-2 — Automatic templates and controlled outgoing mail (2026-10-22)

Mail Settings now has locked SMTP configuration, editable automatic templates, custom email and delivery history. Superadmin confirms before editing SMTP; Save/Cancel relocks it. Automatic Store creation, application approval/rejection, activation/suspension/archive/deletion and verified production purchase emails use saved defaults or edited templates. Store notifications go to current Store Admin/owner logins and the Store contact email, deduplicated. Anonymous kiosk purchases do not collect customer email in this slice. Remove the separate Test Email interface; custom email uses enabled saved settings. Password recovery remains supported.


### ROLES-3 — Restore shared defaults and configurable Staff grants (2026-10-22)

Store Admin starts with Store administration/operations and Store Staff starts with daily operations, including products.manage. Authorized Platform role managers may grant or revoke any Store-applicable permission for Staff; its initial defaults are not a permission ceiling. Shared edits apply to all existing and future Stores. Platform-only and Developer/API permissions remain excluded. Merchant users cannot edit global role maps.


### PRODUCTS-EDITOR-1 / SHOPPING-3 — Product options and kiosk purchasing (2026-10-21)

A Store product remains one kiosk catalog item even with multiple size/colour combinations. Add/Edit Product uses a dedicated page with basic information, the main Try-On image, pricing and stock. Each colour may have one optional purchase-preview image shared across sizes, falling back to the main product image. Variant prices may override the base price. Zero stock does not remove an otherwise eligible product from Try-On. Buy This Look opens product options and a shared session cart; an entirely sold-out product shows “Out of stock. Please contact {Store name}.” Customer payment success requires verified server reconciliation. This explicitly authorizes APK shopping and controlled production checkout following SHOPPING-2 and PAYMENTS-1B.


### PRODUCTS-RBAC-1 — Permission-based product actions (2026-10-21)

Initial Store Admin and Store Staff role maps include products.manage. Shared
role revocations remain authoritative across existing and future Stores; reads
and onboarding must not restore revoked grants. Without product management,
hide catalog mutation actions and retain authorized catalog/stock viewing.
Current catalog viewing uses stores.view; no new products.view permission is
introduced. Enforce product mutations on the server for every role.

### BILLING-STORE-1 — Store-only usage presentation (2026-10-21)

Store Usage & Billing shows only the authorized Store's own totals and kiosks.
Top Stores is reserved for authorized Platform-wide comparisons. Store kiosk
tables omit the redundant Store column. Historical usage remains attributable
to its original Store, but must not expose current metadata for kiosks reassigned
to another Store. AI-PRIVACY-1 remains mandatory for every role.

### AI-PRIVACY-1 — SelfX-only AI service presentation (2026-10-21)

Do not expose AI provider identities, model identifiers, prediction IDs or provider
cost breakdowns in application pages (including Platform/Superadmin), ordinary
API responses, exports or client errors. Show SelfX usage, results and actionable
SelfX errors instead. Keep execution attribution and technical diagnostics on the
backend for operations and auditing. This supersedes earlier provider/model usage
tables and client-visible Lab provider metadata. Payment gateway branding and
Google authentication remain visible because users explicitly configure/use them.

### APPS-1 / REGIONAL-1 — Kiosk downloads and personal display preferences (2026-10-21)

Platform Apps & Downloads distributes signed standalone SelfX kiosk APKs. Separate
view/manage authorities control release administration. Uploads create validated
drafts; explicit publication exposes downloads to active Store members with kiosk
viewing permission and kiosk plan access. Keep version history; recommend one
release per architecture and retire old releases without updating installed kiosks.
User accounts may select automatic/device or explicit timezone, date order and
12/24-hour display. Preferences follow the user across devices, without changing
UTC persistence, entitlement periods, operational schedules or report day buckets.

### AUTH-GOOGLE-1 / DEV-PLATFORM-1 (2026-10-20)

Dashboard staff, Store owners and Platform users may sign in with Google alongside
email/password. Google verifies identity; SelfX retains its own user, memberships,
roles and sessions. Existing email matches require existing-account password
authentication before linking. New Google Store signups reuse active Store,
owner membership and Starter trial onboarding exactly once. Never auto-grant
Platform access or reactivate suspended users/Stores. This is separate from
future customer social login and kiosk device authentication.

Developer / API is now reserved for Platform roles with explicit Developer API
permissions. Retire Store developer permissions, navigation and console access.
Direct Public API credentials require an active creator with current Platform
Developer API management authority; historical Store-issued keys cannot bypass
the restriction. Keep credentials/history for administration. Stores currently
use kiosks, Shopify and WooCommerce through their existing authentication paths.
This supersedes the older Store Developer API administration requirement.

### PAYMENTS-1K — Store gateway availability (2026-10-20)

Stores see only supported payment gateways enabled as Available to Stores by
SelfX administration. Hide disabled and planned gateways; keep the full registry
in Platform settings. Disabling availability blocks new setup, selection and
payments while preserving saved accounts, selection and historical records.
Remove the routine INR 1 account-verification panel from Store Payment Settings;
retain verification records and backend reconciliation. Configuring an account
does not enable customer checkout or implement payment in the player APK.
This supersedes earlier Store planned-card and mandatory verification-panel UX.

### ROLES-2 — Application-wide role permissions (2026-10-19)

Role definitions are shared across the application. Editing Store Admin or Store
Staff applies the saved map to all assigned users across all existing and future
Stores. Platform roles retain their global definitions and separate authority.
There are no per-Store permission overrides or Store permission ceilings in this
model. Store membership determines which tenant data a user may access; plans,
Store/user/membership/role status and protected Superadmin safeguards still apply.
Only Superadmin or explicit Platform STORE_ROLES_MANAGE authority may edit shared
Store maps. Store administrators may view definitions and manage authorized user
assignments within their Store, but cannot change application-wide permissions.
Staff remains operational-only; essential Store Admin permissions and final-Admin
membership protections remain. This supersedes ROLES-1 and older per-Store maps,
ceiling and merchant role-permission delegation behavior.

### PAYMENTS-1J — Accurate compact gateway status

Group gateway name, short description and compact mode/status badges beside its
logo. Badges derive from the current saved environment, verification, selection
and platform availability. A verified live account may show Live mode / Verified;
it must not show Ready for checkout while customer checkout remains disabled.

### PAYMENTS-1I — Simplified cards and saved-secret fields

Use larger provider logos on Store gateway cards. Remove per-card Live/Verified
badges, repeated verification text and Verify payment; configured cards retain
Edit/Delete and selection controls. Keep separate verification/history and all
existing payment gates. Setup/Edit uses one account-details column with fixed
header/footer. Saved secrets show fixed-length placeholder dots, never a stored
value or length. Untouched fields preserve secrets. New secrets remain empty and
required. Password eyes reveal newly typed text only; Salt Keys and integration
secrets have no reveal control.

### PAYMENTS-1H — Store gateway cards, Edit and Delete

Store Payment Settings uses gateway cards with account verification status,
Test/Live badges, Set up, Edit, Delete configuration and a future-checkout on/off
control. Turning off keeps credentials. Delete removes active configuration and
selection while preserving transactions, history and encrypted snapshots needed
for pending verification. Editing prefills non-secret account fields; blank Salt
Key retains the existing secret. Never return/display saved Salt Keys. Unchanged
edits retain verification; changed account details receive a new version and must
be verified again. Re-created accounts cannot inherit deleted-account verification.
Keep Store Admin permissions and impersonation restrictions. Account verification
is distinct from checkout readiness; do not label a verified account Ready for
checkout while product checkout is unavailable.

### PAYMENTS-1G — Store production account verification

Store Admins may generate an INR 1.00 real-payment QR using their saved production
PhonePe account. Label it Production and real money throughout the popup/history;
never present it as a UAT simulation. Keep platform testing UAT-only. Successful
account verification is not permission to enable shopping checkout or APK Buy.
Production execution requires a separately enabled, PhonePe-confirmed v3 Dynamic
QR endpoint. Credentials alone do not establish provider access or API support.
Store isolation, versioned encrypted snapshots, strict response matching,
idempotency, five-minute expiry and delayed confirmation checks remain mandatory.

### PAYMENTS-1F — Fresh test QR after expiry

An unexpired UAT test is reopened by Generate instead of initializing another
payment. After its five-minute QR deadline, Generate may create a fresh test even
if the older payment remains pending or unknown. Keep older tests in history and
continue independent checks and callbacks for late success. Expiry never proves
payment failure. This supersedes the indefinite pending-test block in PAYMENTS-1E
for Store and platform test QRs only; live shopping payment behavior is unchanged.

### PAYMENTS-1E — Store test QR popup and understandable failures

Generate test QR opens a single Store test popup immediately, showing progress,
the usable QR with expiry countdown, processing/confirmation, success or verified
failure. Open test resumes the same saved test. Closing does not cancel/delete it.
An uncertain browser request retries with its original idempotency key; pending
tests continue to prevent duplicate payment initialization. Expiry/timeouts alone
do not prove payment failure. Expose safe reasons for QR initialization and the
latest provider status check without exposing credentials or raw provider data.
Live checkout, product orders and APK Buy remain outside this test milestone.

### ROLES-1 — Unified role visibility and controlled permission editing

User Management > Roles presents the five approved role types: Platform
Superadmin, Platform Admin, Platform Staff, Store Admin and Store Staff. Platform
roles remain global; Store roles apply only to the selected Store. Superadmin
authority remains protected outside ordinary role assignment and editing.

Superadmin may configure ordinary roles and each Store's permission limit.
Delegated platform role managers may change Platform Staff permissions only
within their own authority. Delegated Store role managers may configure Store
roles within that Store's permission limit. An actual Store Admin may configure
only Staff's daily operational permissions in their own Store, bounded by their
own permissions and the Store limit. Staff cannot receive user, role, account or
payment administration. Keep essential Store Admin user/role administration
permissions in the role map and preserve final-Admin membership protections.
Saved revocations persist through refresh and affect all assigned users. Role
assignment to individual accounts continues through Users. This supersedes the
earlier rule that fixed Store role permission maps cannot be edited.

### PAYMENTS-1D — Store payment setup and account verification

Store accounts have Payment Settings directly in their workspace. Each Store
configures and selects its own merchant gateway account. Actual active Store
membership and integration viewing permission permit safe setup/history viewing;
credential replacement, selection and test execution require Store Admin authority
and integrations.manage within the Store permission ceiling. Platform authority
alone does not grant Store payment access; impersonation never permits mutation
or QR access. Platform availability controls and isolated platform testing remain.

PhonePe is the first connector. Confirmed UAT Dynamic QR accounts can run a fixed
INR 1.00 test against their saved credentials. Tests create no shopping orders,
stock holds or stock deductions. Only independently verified provider success
passes a test, and callback delivery is tracked separately. A passed result is
bound to that Store and credential version, never another Store or live account.
Replacing credentials resets current verification. Live checkout and the APK Buy
button remain disabled; other gateway connectors remain Planned. This supersedes
earlier platform bypass rules for Store payment configuration.

### KIOSK-STORE-1 — Store-only products and kiosks

Product and kiosk operations belong to active Store memberships and Store roles.
Platform Superadmin, Admin and Staff authority alone grants no product/stock or
kiosk access, including through Store detail pages or impersonation. Remove
platform product/kiosk navigation, operational metrics, permission choices and
runtime administration routes. Store Admins pair their own physical kiosks;
Staff perform only their granted daily operations. Empty Stores still show their
authorized Products/Kiosks menus. Keep platform account, plan, user and billing
administration separate. Retain existing data without automatic reassignment.
This supersedes earlier platform-fleet, catalog-fallback and support-bypass rules
for these operational resources.

### CATALOG-STORE-1 — Store-owned operational catalog

Products belong to Stores, not user accounts or the platform testing catalog.
Products -> Garments / Jewellery appears in the Store workspace based on Store
view permission, including an empty catalog; product/stock edits require
products.manage. Remove the standalone platform catalog, its platform permissions
and its runtime administration routes. Keep authorized Store-scoped support.
Kiosks use only their assigned Store catalog. Empty, inactive or disabled catalog
content never falls back to platform products; unassigned kiosks receive no
products. Existing product data is retained and no automatic transfer is implied.


### USERS-4 — Create the first Store Admin login

When an active Store has no current linked Admin, Superadmin may create a new
login from Edit Store using full name, login email and an initial password.
Account creation and Admin linking succeed together or roll back together.
Existing emails are never overwritten; assign an existing active account instead.
Store contact email remains independent, and products, stock, plan and history
are preserved. Existing account assignment remains available in the same popup.


### USERS-3 — Store Admin accounts in Edit Store

Superadmin can manage linked Store Admin login emails from the Edit Store popup.
The Store contact email remains independent. A shared account's login email
changes across all its linked Stores; the UI requires acknowledging that effect.
Selecting an existing active account explicitly adds Store Admin access while
retaining current admins and the account's other access and credentials. A Store
with no active admin uses controlled first-admin repair. Protected Superadmins,
deleted accounts/links and Store permission ceilings remain protected.


### USERS-2 — Five roles and user/Store deletion

The approved role model is Platform Superadmin, Platform Admin, Platform Staff,
Store Admin and Staff. Store Owner/Admin and Manager/Staff are consolidated in
product language. Historical database role values remain compatibility details.
User Management replaces Access Control; Roles replaces Platform Roles.

Superadmins may delete ordinary accounts; protected Superadmin removal remains
out of scope. Store-associated accounts are soft deleted, lose login access and
retain name/email as `Name (Deleted user)` without a restore action. Accounts
with no Store association are permanently removed, retaining audit identity
snapshots. Store Admins may remove Staff only within their authorized Store.
Removal of a shared account's Store membership preserves its other access.
The final active Store Admin must have a replacement before ordinary removal.

Archive remains separate from permanent Store deletion. Confirmed Superadmin
permanent deletion removes the tenant's products, shopping, billing and other
business data and accounts exclusive to it, including soft-deleted accounts.
Shared users and platform identities survive; physical kiosks are revoked and
unassigned. Audit snapshots survive. Staff have daily products/stock, kiosk and
analytics access, with no user/role administration or Store payment settings.


### USERS-1 — Clear account management and Store linking

The platform Users page replaces the Platform Users label. Authorized platform
readers see login identity, account status, separate platform roles and Store
memberships (including inactive Stores), and creation date with paginated search
and filters. Only protected SelfX Superadmins may edit account name, login email,
optional new password, status, dynamic platform roles and non-owner memberships
in one modal. Contact email is separate. Email/password changes revoke old login
sessions and reset links; blank password preserves the current password.
Protected Superadmin accounts are not editable here. Final active owners cannot
be disabled. An explicit, confirmed first-owner action can establish ownership
only when an active Store has no active owner; it must not transfer ownership or
broaden Store permission ceilings. Multiple Store memberships remain supported.

### MAIL-1 — Platform email and account recovery

Mail Settings is a direct navigation item under Platform Settings, alongside
General Settings. Only protected Superadmins manage/inspect SMTP configuration
and explicitly send test emails. Stores share SelfX's mail service. Credentials
are encrypted and passwords are write-only; blank keeps the saved password.
Outgoing email can be disabled independently of an explicit test send. SMTP
acceptance does not prove inbox delivery.

Forgot password uses registered login email, never Store contact email. Eligible
SelfX merchant/staff/platform users share the flow. A successful single-use link
resets only the password, preserves roles/memberships, and invalidates old login
sessions. Links expire 15 minutes from request. Unknown/ineligible addresses get
the same generic response. Delivery/retries run in the background. Invitations
and billing delivery remain later milestones.

### PAYG-1 — Postpaid successful generations (2026-10-16)

Stores may be explicitly assigned a postpaid pay-as-you-go plan with a platform-set
price per credit, no advance credit purchase and no generation credit limit.
One successfully saved generation counts as one credit, independent of provider
attempts or retries. Failed generations do not count. Monthly cycles follow the
activation anniversary in UTC. Existing Stores retain their current cycle anchor.
Switching includes verifiable, previously uncharged successes from the current
cycle at the switch-date rate; previously consumed prepaid/trial credits and
already recorded postpaid charges must not be billed again. Current cycle terms
are fixed; price changes apply to later cycles. PAYG-1 implements configuration,
durable metering and estimates; invoices, delivery and collection are deferred.

### PAYMENTS-1C — Platform gateway controls and isolated testing (2026-10-16)

Platform administrators control which implemented gateways Stores can configure.
The platform also has separate UAT-only credentials and a PhonePe testing
workspace. Platform test accounts never act as a fallback for Store purchases.
Tests use a fixed INR 1.00 amount, create no merchant tenant/order/reservation,
and do not change stock or sales analytics. Test success requires independently
verified provider status; callback delivery is shown separately. Configuration
replacement resets the current test result without deleting prior history.
Live execution, APK Buy and other gateway connectors remain deferred.

### PAYMENTS-1B — Order-linked PhonePe payment execution (2026-10-15)

Adds durable order payment attempts, authenticated notifications, server-side
status checks and paid stock allocation. This stage supports UAT/test payments
only. It requires explicit UAT Dynamic QR access confirmation and an API-side
execution switch; unknown/live credentials remain blocked. APK Buy stays disabled.

The stock hold lasts five minutes. An initiated payment awaiting confirmation
remains unresolved after that deadline while its stock becomes available again.
Do not silently mark it failed or allow overlapping attempts on the same order.
Retries require verified failure. Successful payments survive session/device loss,
expired holds and catalog edits. Allocate all order items atomically once, or
retain a paid order needing staff action. Staff may retry allocation after stock
is replenished. Extra successful payments require staff resolution and never
deduct stock twice. Refund execution, collection and printing remain later stages.
Test payments must be clearly labeled and excluded from future real-sales metrics.

### PAYMENTS-1A — Merchant gateway configuration foundation (2026-10-15)

SelfX supports a registry of payment gateways. The platform controls which
implemented gateways Stores can configure/select. Each Store connects its own
merchant account and selects one gateway shared by its kiosks. SelfX does not
collect garment payments into a platform merchant account. PhonePe is first;
Razorpay, Stripe, Paytm and PayPal are planned connectors, not working payments.

Current merchant credentials have Salt Key, Salt Index, Merchant ID and Provider
ID, but their environment and Dynamic QR entitlement are not confirmed. Save
configuration as unverified; distinguish UNCONFIRMED, UAT and PRODUCTION without
assuming which credentials were supplied. Setup/selection never implies payment
readiness. PAYMENTS-1A covers platform/Store configuration and offline-tested
PhonePe protocol handling only. Checkout remains unpaid and APK Buy disabled.

Approved later payment rule: verified successful payments must remain paid
orders, including late success. Allocate stock safely if available; if an expired
hold's stock was reallocated, retain the payment/order for staff fulfillment or
refund resolution. Never invent stock or silently discard a paid order. Printing
failure must not affect payment/order validity. This rule is approved design;
payment persistence, allocation and reconciliation are subsequent implementation.

### SHOPPING-2 — Cart, orders, reservations and Store taxes (2026-10-15)

Approved scope extends SHOPPING-1 with backend customer-session carts containing
multiple native SelfX products/options and customer-selected quantities. A cart
does not hold stock. Checkout revalidates available stock, current prices and
taxes, then creates an unpaid Store order and reserves its items for five minutes.
Customers and authorized staff may cancel unpaid orders. Unpaid orders expire
automatically and their stock becomes available again. Stock remains shared by
all kiosks of the Store; zero stock continues to permit Try-On.

Store administrators choose no tax, tax included in prices or tax added to prices.
Each Store has one default percentage with optional product-specific percentage
overrides; null inherits and zero is tax-free. No tax disables all overrides.
Orders retain original product/variant labels, quantities, price and tax snapshots.
Staff may update stock/products, but may not remove options with active holds or
reduce their quantity below reserved stock. Order history survives catalog edits.

Per the explicit stage decision, SHOPPING-2 implements backend and Store dashboard
only. The APK Buy button remains disabled. Payment execution, merchant-provider
connection, receipt printing, collection, refunds and shopping analytics remain
later milestones. No real payment or paid status can be created in this milestone.

### SHOPPING-1 — Store catalog stock and pricing (approved 2026-10-15)

The approved shopping expansion begins with SelfX-managed stock for products
created directly in SelfX. All kiosks assigned to a Store share one stock pool.
Products may have no options, size only, colour only, or size/colour combinations;
each option has a non-negative quantity. Stores choose a constant product price
or optional per-variant prices that otherwise inherit the product price and currency.
Zero stock does not disable Try-On. Existing products start unconfigured, without
invented stock. Imported commerce products and platform default products are excluded.

This is a narrow approved extension of the older VTO-only inventory boundary,
not approval for a general POS/warehouse system. The future agreed kiosk journey
is product/variant selection, availability check, order, merchant-account payment
QR, verified payment status, receipt and staff collection. Only stock/pricing is
implemented in SHOPPING-1; orders, reservations, payments, receipt printing,
collection, refunds and shopping analytics require later milestones. The existing
disabled Buy action stays disabled until those prerequisites exist.

This is a living document.

The contents represent the currently approved product/design/technical baseline
and may be updated as implementation, testing, business requirements, provider
capabilities, or operational requirements evolve.

Material changes must:

1. be intentional;
2. remain consistent with related project documents;
3. update affected documentation;
4. include required database migrations/API changes/tests where applicable;
5. not silently invalidate already deployed behavior.

# SelfX Virtual Try-On Platform

## Product Requirements Document — PRD v1.0

**Status:** APPROVED BASELINE
**Product Type:** Multi-Tenant SaaS / AI Virtual Try-On Platform
**Initial Production Channel:** SelfX Retail Kiosks
**Future Channels:** Public API, Mobile, Shopify, WooCommerce, Web SDK and partner integrations

---

## Store Onboarding Policy Update - 2026-09-17

This current Store policy supersedes the registration-is-not-activation rules
below for platform-admin Store creation and self-service Store signup used by
Shopify. Successful creation assigns a plan and immediately creates an ACTIVE
tenant and ACTIVE owner membership. No additional approval is required.
Plan entitlements and permissions still limit normal operations. Shopify
installation/linking must not reactivate suspended Stores or bypass account
ownership authorization. Legacy organization-application review is unchanged.

Platform onboarding creates the Store, new owner account, membership, RBAC,
subscription and initial credits atomically. Existing accounts are not modified
or silently linked by email. Platform suspension/reactivation remains available.

## STORE-1 Product Hierarchy Update

**Status:** UPDATED

STORE-1 defines the customer/admin-facing merchant hierarchy as:

```text
SelfX Platform
→ Store
→ Kiosks
```

For new Store management, kiosk assignment, Store dashboard and kiosk
configuration experiences, **Store** is the merchant tenant shown to SelfX
platform administrators and merchant users. New product copy must not introduce
Organization as a customer-facing business layer.

The existing internal database tenant row may continue to be named
`Organization` while STORE-1 is implemented, but that name is a compatibility
detail rather than the product model. The legacy child Store/location model is
not the basis for STORE-1 merchant Store management.

Product requirements affected by this update:

1. SelfX Super Administrators can create, view, update, activate and deactivate
   Stores.
2. A Store dashboard shows Store details, kiosk counts and Store-owned kiosks.
3. Kiosks can be paired or assigned directly under a Store.
4. Store-owned kiosk configuration reuses the existing kiosk configuration
   system and must validate Store ownership before read/update/upload intent.
5. Deactivating a Store must not delete Store data, kiosks or kiosk
   configuration, but inactive Stores cannot receive new kiosk assignments.

Historic Organization terminology elsewhere in this baseline remains
documentation history until the related membership/RBAC/onboarding phases are
renamed. New customer/admin product surfaces should use Store terminology.

---

## RBAC-1 Store Authorization Update

**Status:** UPDATED

RBAC-1 makes Store access permission-driven while preserving the STORE-1
compatibility mapping where product Stores are internal `Organization` tenant
rows.

Product rules:

1. Store memberships reuse the existing tenant membership relation rather than
   introducing a second membership table for the same Store/user relationship.
2. Store roles belong to exactly one Store and resolve to stable permission
   codes such as `stores.view`, `users.view`, `roles.assign` and
   `kiosks.configure`.
3. Store role assignment must never assign a role from another Store.
4. SelfX platform roles remain separate from Store roles. `SELFX_SUPER_ADMIN`
   remains protected platform authority; `SELFX_STAFF_ADMIN` is a constrained
   platform administration role.
5. Permission definitions and Store role assignment are initially controlled by
   authorized SelfX platform administrators.
6. Store management UI includes Store Users and Store Roles views in dedicated
   Store-scoped access-control surfaces, separate from the Store dashboard.
7. Email invitations are deferred in RBAC-1; the initial add-user flow may add
   existing SelfX users only and must report `EMAIL_INVITATION_FLOW_DEFERRED`
   when the target account does not exist.
8. Store permissions are deny-by-default and must be evaluated from current
   server-side membership, Store, role and permission state.
9. Removing a role, permission or active membership must revoke the affected
   Store capability on the next protected request without requiring the user to
   log in again.
10. Store RBAC must not create, mutate, demote or delete SelfX platform roles.
    Normal Store users and `SELFX_STAFF_ADMIN` must not be able to assign or
    remove `SELFX_SUPER_ADMIN`.
11. Global Superadmin kiosk fleet management remains a platform capability and
    must not be moved under normal Store-scoped menus or authorization.

## RBAC-2 Global Authorization Update

**Status:** UPDATED

RBAC-2 introduces the global SelfX permission hierarchy:

```text
SELFX_SUPERADMIN
→ Global permission registry
→ SelfX Platform roles/users and Store permission ceilings
→ Store roles/staff
```

Product rules:

1. Permission definitions are owned by SelfX and live in one global registry.
   Stores cannot create or rename permission definitions.
2. Permission definitions have stable codes and an applicability of
   `PLATFORM_ONLY`, `STORE` or `BOTH`.
3. SelfX Platform roles are global and separate from Store roles.
4. Protected Superadmin bootstrap authority must not be demoted, deleted or
   assigned through ordinary role-management flows.
5. Each Store has a SelfX-granted permission ceiling. Store roles may delegate
   only Store-applicable permissions currently granted to that Store.
6. Effective Store permissions are the intersection of active Store role
   permissions and the Store permission ceiling.
7. Revoking a Store permission grant must affect the next protected request
   without a new login.
8. Store Users and Store Roles remain Store-scoped and must preserve
   cross-Store isolation.

---

# 1. Purpose

SelfX Virtual Try-On is an AI-powered SaaS platform that allows customers to visualize themselves wearing garments before purchasing them.

The platform must support physical retail stores as well as future ecommerce and third-party integrations through one centralized SelfX backend.

SelfX must not be designed as only a kiosk application.

The kiosk is the first customer-facing channel of a broader SaaS platform.

---

# 2. Core Product Scenarios

## PRD-TRYON-001 — Catalog Garment Try-On

A customer must be able to:

1. Upload or capture a photograph of themselves.
2. Select a garment from the permitted retailer catalog.
3. Start Virtual Try-On.
4. Receive an AI-generated image showing themselves wearing the selected garment.

---

## PRD-TRYON-002 — Physical Garment Try-On

Where enabled, a customer must be able to:

1. Upload or capture a photograph of themselves.
2. Capture a photograph of a physical garment.
3. Confirm the garment image.
4. Start Virtual Try-On.
5. Receive an AI-generated image showing themselves wearing the captured garment.

---

# 3. Product Vision

SelfX must act as the central platform for:

- Customer Virtual Try-On
- Organizations
- Stores/branches
- Customers
- Staff
- Roles and access
- Products and garments
- Kiosks
- AI generation
- Usage
- Subscriptions
- Trials
- Analytics
- Integrations
- SelfX administration
- Support
- Auditability

The long-term channel model is:

SelfX Platform
→ Retail Kiosks
→ Public API
→ Mobile Applications
→ Shopify
→ WooCommerce
→ Web SDK / Widget
→ Custom Integrations

All channels must share the same SelfX backend.

---

# 4. Mandatory Architecture Principle

Client applications must communicate with SelfX.

The required logical architecture is:

Customer / Client Application
→ SelfX Platform
→ AI Provider

Direct client-to-AI-provider integration is prohibited.

Examples of clients include:

- Kiosk
- Flutter application
- Shopify application
- WooCommerce plugin
- Web widget
- Public API customer

AI-provider credentials must never be exposed to these clients.

---

# 5. AI Provider Independence

SelfX must not be permanently tied to one AI provider.

The platform may initially use:

- FASHN AI

Future providers may include:

- Google Virtual Try-On
- Other third-party Virtual Try-On providers
- SelfX-hosted AI models

Changing AI providers must not require changes to the client-facing SelfX integrations.

SelfX must be capable of recording which provider/model handled a Virtual Try-On.

Detailed routing, retry, fallback, provider limits and provider API implementation belong in the Technical Requirements & System Design document.

---

# 6. Product Goals

SelfX must:

1. Generate Virtual Try-On images quickly.
2. Produce visually realistic results.
3. Preserve customer identity as accurately as practical.
4. Preserve garment appearance as accurately as practical.
5. Support image upload.
6. Support camera capture.
7. Support catalog garments.
8. Support physical garment capture.
9. Support organizations with one or multiple stores.
10. Support independent retailers.
11. Support staff management.
12. Support role- and scope-based access.
13. Support SelfX Super Administration.
14. Support SelfX customer support.
15. Support controlled impersonation.
16. Support managed kiosk devices.
17. Track AI and customer usage.
18. Track provider cost where available.
19. Support subscriptions and trials.
20. Provide merchant analytics.
21. Support multiple channels through one backend.
22. Support future external API customers.
23. Avoid unnecessary vendor lock-in.
24. Scale into a commercial SaaS platform.

---

# 7. Non-Goals

The initial product does not guarantee:

- Exact physical fit.
- Exact garment sizing.
- Body measurements.
- Exact size recommendations.
- Replacement of physical fitting rooms.
- Replacement of professional fashion photography.
- Live AR Try-On.
- Video Try-On.
- Custom garment generation.
- Full inventory management.
- POS functionality.

These may be considered separately in future releases.

---

# 8. Tenant Model

## PRD-ORG-001 — Organization

An Organization represents a SelfX SaaS customer.

Examples:

- Clothing brand
- Retail chain
- Independent retailer
- Franchise
- Ecommerce business
- Enterprise customer

Each organization is an independent tenant.

Organization A must never gain unauthorized access to Organization B data.

---

## PRD-STORE-001 — Stores / Branches

An organization may contain one or multiple stores.

Example:

Organization
→ Hyderabad Store
→ Tirupati Store
→ Bengaluru Store

Each store belongs to an organization.

Stores may have their own:

- Staff
- Managers
- Kiosks
- Product availability
- Usage
- Analytics
- Settings

---

## PRD-STORE-002 — Independent Retailer

An independent retailer must use the same architecture.

Example:

Independent Retailer
→ Organization
→ One Store

SelfX must not maintain a separate backend architecture for individual store owners.

---

# 9. User Account Model

## PRD-USER-001 — Multi-Organization Membership

A single platform user may belong to multiple organizations.

Example:

User
→ Organization A — Store Manager
→ Organization B — Consultant / Staff

A user account must therefore not be permanently restricted to one organization.

---

## PRD-USER-002 — Multi-Store Membership

Authorized staff may have access to multiple stores within an organization.

Example:

Regional Manager
→ Tirupati
→ Hyderabad
→ Chennai

Other staff may only have access to one store.

Access must respect assigned scope.

---

# 10. Major User Types

SelfX must support at least:

### Customer

Uses Virtual Try-On.

### Organization Owner

Highest-level organization-side authority.

### Organization Administrator

Manages permitted organization operations.

### Organization Staff

Performs assigned organization-level functions.

### Store Owner

Manages one or more assigned stores.

### Store Manager

Manages permitted store operations.

### Store Staff

Performs restricted store-level tasks.

### Kiosk Operator

Performs permitted kiosk-related operations.

### SelfX Support Administrator

Provides controlled customer support.

### SelfX Super Administrator

Manages the SelfX SaaS platform.

Exact role/permission mappings belong in Technical Requirements.

---

# 11. Staff Management

## PRD-STAFF-001

Authorized organization administrators must be able to:

- Invite staff.
- Assign predefined roles.
- Assign one or multiple stores.
- Change store assignments.
- Modify permitted staff access.
- Suspend staff.
- Reactivate staff.
- Disable staff.

---

## PRD-STAFF-002

Authorized Store Owners/Managers may manage staff within their permitted store scope.

They must not manage staff belonging exclusively to stores outside their authorized scope.

---

## PRD-STAFF-003

The initial product will use predefined SelfX roles.

Custom organization-created roles are not required in PRD v1.

---

# 12. Customer Access

## PRD-CUSTOMER-001 — Anonymous Usage

Customers must be able to use basic Virtual Try-On without creating an account.

Account creation must not block the initial kiosk Try-On experience.

---

## PRD-CUSTOMER-002 — Account Requirement

A customer account is required when the customer wants to:

- Save Try-On results.
- Access saved results later.
- Access previous Try-On history.
- Use account-dependent continuation functionality.

---

## PRD-CUSTOMER-003 — Authentication Methods

Customer authentication should support:

- Phone OTP
- Email OTP
- Approved social authentication

Social authentication may include providers such as Google and Apple where supported.

Detailed authentication implementation belongs in Technical Requirements.

---

# 13. Global SelfX Customer Account

## PRD-CUSTOMER-004

A customer's SelfX account must be platform-wide rather than retailer-specific.

The same SelfX customer account may be used across participating organizations.

Example:

SelfX Customer Account
→ Brand A Try-Ons
→ Brand B Try-Ons
→ Brand C Try-Ons

Merchant tenant isolation must remain enforced even though the customer identity exists across SelfX.

One merchant must not automatically gain visibility into the customer's interactions with another merchant.

---

# 14. Customer Consent

## PRD-PRIVACY-001

Customer consent must be collected before:

- Camera access.
- Capturing a customer photograph.
- Uploading a customer photograph.
- Processing the photograph through Virtual Try-On.

The experience must clearly communicate that AI processing is involved.

---

# 15. Customer Image Reuse

## PRD-TRYON-010

A customer must be able to upload/capture their photograph once and reuse it for multiple garments during the same Try-On session.

The customer must not be required to retake their photograph for every garment unless:

- They choose to.
- The current image is invalid.
- The session expires.
- A technical requirement requires a new image.

---

# 16. Multiple Garment Behavior

## PRD-TRYON-011

SelfX must support channel-dependent garment selection behavior.

Examples:

### Kiosk

May allow:

Customer Photo
→ Garment A
→ Garment B
→ Garment C

with multiple Try-On results.

### Shopify

May naturally start from:

Current Shopify Product
→ Try It On

Both channels must use the same underlying SelfX platform.

Exact concurrency/job behavior belongs in Technical Requirements.

---

# 17. Customer Images and Results

## PRD-RESULT-001 — Result

Successful Virtual Try-On must provide a generated result image.

Customers should be able to:

- View result.
- Try another garment.
- Retry where permitted.
- Save result when authenticated.
- Access permitted history.

---

## PRD-RESULT-002 — Download / Sharing

Organizations must be able to configure whether customers may:

- Download generated results.
- Share generated results.

SelfX may provide sensible platform defaults.

---

# 18. Saved Try-On History

## PRD-RESULT-010

Registered customers must be able to view saved Try-On history.

History may contain:

- Product/garment information
- Retail organization
- Store where applicable
- Try-On date
- Generated result while it remains retained

---

# 19. Image and Result Retention

## PRD-PRIVACY-010

Customer original photographs and generated Try-On images will normally be retained for:

**7 days.**

---

## PRD-PRIVACY-011

After seven days:

- Original customer images must be deleted.
- Generated Try-On images must be deleted.

---

## PRD-PRIVACY-012

Deletion of images does not require deletion of the customer's entire Try-On history entry.

SelfX may retain non-image history information such as:

- Product
- Organization
- Store
- Date/time
- Channel
- Generation status

where permitted.

The expired history entry must not continue to expose the deleted customer/generated image.

---

# 20. Merchant Access to Customer Results

## PRD-PRIVACY-020

Authorized Store Managers may view generated customer Try-On results associated with their permitted store.

They must not automatically receive access to the customer's original photograph.

---

## PRD-PRIVACY-021

Per the current product decision, Store Manager access to generated Try-On results does not require a separate per-result customer consent action beyond the general SelfX customer consent/privacy terms.

This permission must:

- Be limited to authorized Store Managers.
- Be restricted to the appropriate store/organization.
- Follow the applicable retention period.
- Be auditable where appropriate.

SelfX must clearly disclose applicable merchant access in the customer privacy/consent experience.

---

# 21. Products and Garments

## PRD-PRODUCT-001

SelfX must manage product information necessary for Virtual Try-On across the
supported product verticals.

Initial product verticals:

- Garments.
- Jewellery.

SelfX is not intended to become a complete inventory/POS platform.

---

## PRD-PRODUCT-002

Products may originate from:

- SelfX merchant dashboard
- Shopify
- WooCommerce
- Approved external APIs
- Future integrations

---

## PRD-PRODUCT-003

Products may be configured as:

- Available organization-wide.
- Available only in selected stores.

SelfX must support both models.

---

## PRD-PRODUCT-004

Externally synchronized products must maintain a relationship between:

External Product
↔ SelfX Product

Detailed synchronization and ownership rules belong in Technical Requirements.

---

## PRD-PRODUCT-005

Garment and jewellery products share the Products domain but have different VTO
configuration rules.

Garment categories such as tops, bottoms and full outfit are primarily catalog,
filtering and customer-selection concepts. They may inform internal garment
policy resolution but customers must not choose provider-specific garment
parameters.

Jewellery products must have an explicit jewellery type before VTO is exposed:

- Ring.
- Bracelet.
- Necklace.
- Earring.

The jewellery type is operationally required because it selects the correct
jewellery capture guidance, validation expectations and provider adapter route.
SelfX must not rely on provider-side image guessing as the authoritative
jewellery type.

Jewellery catalog-first customer flows select the jewellery product before
live person capture. The kiosk Mobile Upload action may acquire a photo first,
then require jewellery selection and validate the photo before generation.
SelfX resolves the selected product's trusted jewellery type and
returns the corresponding person-image framing, guidance, permitted input
methods and validation expectations. Customers must not choose or override the
technical jewellery type during this flow.

Person-image preflight has two customer-facing outcomes: proceed with the
preview, or retake/upload another image with one clear corrective reason.
Detailed checks and metrics remain internal diagnostics and must not introduce
a third technical quality level into the customer flow.

Store Try-On capabilities are configured at the Store business level, not per
kiosk. A Store may enable garment Try-On, jewellery Try-On or both. Kiosks
assigned to that Store inherit these capabilities from Store settings; kiosk
settings remain limited to device/runtime behavior such as camera, countdown,
audio, idle presentation and local capture controls.

Platform-owned kiosks use the SelfX platform catalog and enable both garment
and jewellery Try-On by default. Their customer start screen presents two
category cards: **Browse Garments** and **Try On Jewellery**, subject to Store
capabilities. Selecting a card transitions to its action menu. Garments offers
**Browse Garments**, **Virtual Try-On** and **Upload From Mobile**. Jewellery
offers **Browse Jewellery** and **Upload From Mobile**. Browse opens the catalog
and then live person capture with item-specific guidance. Upload opens the QR
immediately, then the photo preview and jewellery selection. Uploaded photos are
checked against the selected item's requirements before generation.

---

# 22. Physical Garment Capture

## PRD-GARMENT-001

Where enabled, a customer must be able to photograph a physical garment.

SelfX should determine whether the garment image is sufficiently suitable for Virtual Try-On.

The user should be able to:

- Capture.
- Retake.
- Confirm.

Detailed image preprocessing belongs in Technical Requirements.

---

## PRD-GARMENT-002 — CORE VTO-1 Internal Validation

SelfX may use a guarded internal development Try-On Lab to validate person-image
plus physical-garment-image Virtual Try-On quality before exposing the final
production customer/kiosk workflow.

This lab must preserve the mandatory product boundaries:

- clients still communicate only with SelfX;
- AI-provider credentials are never exposed to clients;
- provider-specific values remain behind SelfX provider adapters;
- customer-facing consent, durable assets, retention, usage and production
  Try-On history are not implied by the development lab.

Uploaded-image preflight in the lab must separate technical validation from
quality analysis:

- technical validation may block generation for non-images, unsupported
  formats, corrupt/undecodable images, unsafe MIME/signature mismatches, hard
  upload size limits and invalid or zero dimensions;
- quality analysis is advisory for uploaded images. Blur, dark lighting,
  overexposure, low contrast, low but technically valid resolution and
  suboptimal body/garment framing should be warnings, not normal blockers;
- if OpenCV quality analysis cannot complete after technical validation
  succeeds, the user should be allowed to re-upload or proceed anyway;
- unavailable analysis metrics must not be shown as fake `0x0` dimensions or
  zero-valued sharpness/brightness/contrast metrics;
- future production analytics may compare detected warning codes and accepted
  overrides with generated Try-On quality.

CORE VTO-1.1 further distinguishes internal lab policy from customer consent:

- the internal authenticated Lab shows an authorized-use notice rather than a
  customer consent checkbox;
- the notice states that internal testers should upload only images they are
  authorized to process;
- this does not weaken PRD-PRIVACY-001. Customer web, mobile and kiosk flows
  still require consent before camera access, customer photo upload or AI
  processing;
- the Lab may expose safe current-run telemetry for development feedback, but
  it must not store or expose raw person images, garment images, generated
  Base64 payloads, provider credentials, Authorization headers or provider
  prediction IDs in normal Lab UI.

CORE VTO-1.2 further defines automatic garment resolution expectations:

- normal customers, kiosk users and public/commerce Try-On consumers should not
  configure technical garment category, garment photo type or generation
  profile parameters during normal Try-On;
- SelfX should resolve those values from trusted catalog/commerce metadata,
  direct-upload analysis, safe fallback policy or one focused ambiguity answer
  where truly needed;
- store/site/catalog products include SelfX-native catalog products, Shopify
  products synchronized through a future SelfX Shopify integration and
  WooCommerce products synchronized through a future SelfX WooCommerce
  integration. CORE VTO-1.2 defines this normalization contract but does not
  implement Shopify or WooCommerce synchronization;
- `FULL_OUTFIT` is a provider-neutral customer intent for a multi-garment look
  and remains distinct from `ONE_PIECE`, such as a dress or jumpsuit;
- body-coverage analysis may help identify product-like/no-person,
  upper-body-on-model, lower-body-on-model, full-body-on-model or unknown
  framing, but it does not identify the exact clothing item and must fall back
  safely when confidence is low or analysis is unavailable.
- Customer kiosk users must never choose technical garment photo type,
  model-coverage or provider parameters. SelfX resolves garment reference
  semantics internally and converts model/category compatibility failures into
  simple guidance such as "Update your photo to try bottoms" or "Update your
  photo to try a full outfit."

---

# 23. Kiosk Requirements

## PRD-KIOSK-001

Every managed kiosk must be associated with:

Organization
→ Store
→ Kiosk

---

## PRD-KIOSK-002

Authorized users must be able to:

- Register/pair kiosks.
- Assign kiosk to a store.
- View kiosk status.
- Identify online/offline state.
- Suspend kiosk.
- Reactivate kiosk.
- Revoke/unpair kiosk.
- View kiosk usage.
- View kiosk-related statistics.

---

## PRD-KIOSK-003

Kiosks must authenticate as devices.

Employee passwords must not be used as permanent kiosk credentials.

---

## PRD-KIOSK-004 — KIOSK-1 Windows Camera Foundation

SelfX may implement an early Windows desktop kiosk camera and capture
foundation before the full managed kiosk Try-On flow.

This foundation supports local development/operator camera testing only:

- Windows desktop is the initial kiosk platform target.
- The kiosk hardware may use an integrated camera or an external USB/UVC
  webcam. SelfX treats both consistently as camera devices.
- Multiple cameras may be detected and selected. SelfX must not permanently
  assume camera index `0`.
- Preferred camera selection in KIOSK-1 is local device configuration, not
  server-side kiosk configuration.
- Captured customer/person images remain temporary and local in KIOSK-1.
- KIOSK-1 does not upload images, create Try-Ons, call FASHN or require provider
  credentials.
- OpenCV may analyze the captured still image for quality warnings after
  capture. Live frame processing and pose/body-landmark validation are deferred.
- OpenCV analysis failure is not equivalent to an invalid captured image.

The full production kiosk customer flow still requires consent, device
authentication, SelfX API upload/orchestration, durable assets, retention,
entitlement/quota and provider execution through the central SelfX backend.

## PRD-KIOSK-005 — KIOSK-1.5 Android Primary Kiosk Platform

Android is the primary commercial SelfX kiosk deployment platform for rented
SelfX kiosk hardware. Windows remains a fully supported secondary platform for
Windows kiosks, desktop testing and future Windows capture workflows.

SelfX continues to use one Flutter kiosk application under `kiosk`.
Platform-specific camera details must remain behind `CameraService`.

KIOSK-1.5 product rules:

- Android boxes with touch displays are the primary kiosk deployment target.
- Windows remains supported and must not be described as deprecated.
- Android initially uses Flutter `camera` through the endorsed CameraX path.
- Integrated cameras, external/USB cameras and multi-camera hardware are all
  conceptual `CameraDevice` values.
- Android USB webcam support depends on what the selected Android box exposes
  through CameraX; a dedicated UVC stack is deferred until certified hardware
  testing proves it is necessary.
- Kiosk capture requires camera permission only. Microphone permission is not
  required for still-image capture.
- Preferred camera selection remains local device configuration, not
  server-side kiosk configuration.
- External camera orientation calibration is local physical-device
  configuration. Auto is the default, and authorized operators may select 0,
  90, 180 or 270 degrees only from local Camera Settings when a mounted USB
  camera appears rotated. Manual 0/90/180/270 calibration remains available for
  connected cameras even when external-camera sensor orientation metadata is
  unavailable or unreliable.
- Camera orientation correction must keep preview, captured image, still-image
  analysis, live-readiness coordinates and TargetSubjectRegion semantics
  consistent. Customer-facing screens must not expose technical orientation
  controls.
- Android commercial kiosk UX is portrait-first because SelfX currently
  deploys/rents primarily 32-inch and 42-inch vertically mounted displays.
- Windows remains responsive across portrait and landscape desktop/window
  operation.
- Kiosk UI must adapt from actual logical viewport dimensions and aspect ratio,
  not hardcode physical 32-inch/42-inch panel sizes.
- KIOSK-1.5 keeps the KIOSK-1 still-capture quality flow and does not implement
  continuous live vision.
- Whole-frame brightness can miss subject backlighting, so subject-aware
  exposure/backlight readiness belongs to KIOSK-2.
- Production kiosk rental rollout will require managed device identity,
  provisioning, store assignment, device auth, heartbeats, app/version
  reporting, camera health, remote diagnostics/configuration and
  dedicated-device management in a later milestone.
- SelfX should certify known-good kiosk hardware combinations rather than
  promise support for every Android box/webcam combination.

KIOSK-1.5 does not implement FASHN/provider access, production Try-On upload,
device provisioning/auth, fleet backend, QR handoff, billing, API Gateway or
KIOSK-2 live vision.

## PRD-KIOSK-006 — KIOSK-1.6 Assisted Customer Capture Experience

SelfX kiosk customer capture should use an assisted countdown experience before
still-image capture.

KIOSK-1.6 product rules:

- The normal customer camera screen exposes **Take Photo** and starts a
  countdown. It does not expose an instant customer **Capture Now** action.
- Portrait Android kiosk capture prioritizes a large/tall live preview,
  standing full-body framing, distance-readable countdown/guidance in a panel
  below the preview and lower-region touch actions. Countdown/customer guidance
  must not live inside the camera preview.
- The default countdown is 5 seconds.
- Operators may configure the local device countdown to 5, 10 or 15 seconds.
  Customers do not choose this duration during each session.
- Countdown guidance is scripted and time-based only. It must not imply live
  detection of person position, body coverage, lighting, pose, distance or
  readiness.
- Countdown, shutter and capture-success sounds are allowed, enabled by default
  and configurable off locally. No microphone permission is required.
- Operators may select a local capture sound profile: Soft, Classic, Digital or
  Minimal. The customer does not choose the sound profile during capture.
- Capture-success audio must occur only after a still photo is actually
  captured. Capture failure must not play a success cue.
- Countdown cancellation must safely return to preview and prevent delayed
  capture.
- Countdown completion captures exactly one still image, then runs the existing
  post-capture OpenCV quality analysis.
- Review continues to show captured image, quality summary, **Retake** and
  **Use Photo**.
- Technical invalidity may block use. Quality warnings remain advisory, so the
  customer may retake or use the photo.
- **Use Photo** transitions to a Photo Ready state. **Continue** is only a
  temporary local placeholder until the approved product/catalog/Try-On phase.
- Captured photos remain local and temporary in KIOSK-1.6. They are not
  uploaded, sent to FASHN/provider services or persisted server-side.

KIOSK-1.6 does not implement MediaPipe, live OpenCV, person/multiple-person
detection, body coverage, subject-aware exposure, automatic readiness,
product/catalog selection, QR handoff, SelfX Try-On API upload, device
provisioning/auth, fleet backend, API Gateway or provider execution.

## PRD-KIOSK-007 — KIOSK-2A Live Capture Intelligence

SelfX kiosk capture should guide the customer with on-device live readiness
before the final still photo is taken. KIOSK-2A applies first to Android, the
primary commercial kiosk platform. Windows remains fully supported for the
KIOSK-1.6.1 preview/still-capture experience, with Windows live frames deferred
to KIOSK-2B.

KIOSK-2A product rules:

- Live analysis runs locally on the kiosk. Live video frames are not uploaded to
  SelfX, sent to FASHN/provider services, logged or persisted.
- Before camera capture, the customer selects a provider-neutral CaptureScope:
  TOP, BOTTOM or FULL BODY.
- CaptureScope affects capture framing/readiness and later search/policy space.
  It is not the final garment category. FULL BODY must not be treated as
  permanently equivalent to ONE_PIECE; later garment resolution may choose
  ONE_PIECE, FULL_OUTFIT or another canonical garment semantic.
- TOP readiness emphasizes appropriate upper-body visibility and does not
  require ankles. BOTTOM readiness emphasizes lower-body visibility. FULL BODY
  requires suitable full-body visibility.
- With the current Android ML Kit pose path, BOTTOM must still preserve enough
  full-person/face framing for pose continuity. BOTTOM emphasizes lower-body
  readiness; it does not mean intentionally cropping the live camera to legs
  only.
- Capture starts with preparation/guidance, then waits for stable readiness
  before the final 3/2/1 countdown. Do not blindly capture when the preparation
  timer expires.
- READY requires stability/debounce across analyzed samples.
- If readiness is not achieved within a bounded window, the kiosk shows **Try
  Again** and **Capture Anyway**.
- **Capture Anyway** bypasses readiness/quality warnings only. It must not
  bypass unavailable camera, failed still capture, corrupt image, decode failure
  or other technical failures.
- SelfX selects one PrimarySubject per capture session: the prominent/target
  customer selected as the local Try-On model, not an identity-recognized
  person. Selection uses visual prominence such as apparent body size,
  centrality, capture-guide overlap, pose visibility and confidence, not true
  physical distance.
- The current ML Kit pose path exposes only one tracked/prominent pose and does
  not provide reliable active multi-person awareness. Do not claim background
  bystander classification or meaningful-second-person blocking while using this
  adapter. Explicit multi-person analysis is deferred until real hardware
  testing proves it is needed.
- The PrimarySubject target is locked ephemerally across frames to reduce
  transient switching and releases after absence or session/scope reset. It is
  not identity recognition and must not create persistent biometric state.
- Dynamic customer guidance remains below the camera. The camera preview
  contains the customer image, subtle scope-aware framing overlay and future
  camera-specific overlays only.
- Subject-aware lighting guidance should improve on KIOSK-1 whole-frame
  brightness limitations where practical, without claiming professional
  photometric accuracy.
- Live pose/landmark data is ephemeral capture assistance. SelfX must not
  persist raw landmarks, pose histories, biometric identifiers or embeddings.
- KIOSK-2A.1 may prepare a normalized TargetSubjectRegion for the selected
  PrimarySubject while preserving the full-resolution original still. Future
  KIOSK-3 generation must target the selected customer only; SelfX must not
  rely solely on the AI provider guessing which visible person should be dressed.
  Unrelated/background people should remain unchanged through future target
  extraction and compositing.

KIOSK-2A does not implement FASHN/provider calls, SelfX Try-On API upload,
product/catalog selection, QR handoff, device provisioning/auth, fleet backend,
API Gateway, Redis/BullMQ, R2, billing, production spoken voice/TTS expansion or
permanent biometric data.

## PRD-DESIGN-002 — Premium Cross-Application Design System

SelfX must present one cohesive premium visual language across SaaS web,
Windows kiosk/application, Android kiosk and future mobile applications.

Product rules:

- The primary SelfX action and selected-control color is `#FF7119`.
- Primary buttons use `#FF7119` with white foreground.
- Secondary/inactive buttons use white/light backgrounds, dark text and neutral
  borders.
- Danger/destructive actions remain semantically red and must not use the
  orange primary simply for brand consistency.
- Default buttons are rounded rectangles around an 8-10px visual radius, not
  global pill buttons.
- The SaaS web application should be modern, premium, professional, clean and
  information-dense where appropriate.
- Glassmorphism is no longer the kiosk/Windows visual direction. SelfX kiosk
  and mobile application UI should use solid premium cards/buttons, clear
  borders, restrained shadows and readable hierarchy.
- shadcn/ui controls are preferred for SaaS buttons, segmented controls, tabs,
  menus, forms, badges and status indicators.
- Flutter kiosk/mobile implementations use matching SelfX visual semantics with
  Flutter-native components. Primary actions remain visibly `#FF7119` with
  white foreground and orange border; inactive choices use white/light surfaces,
  dark text and neutral borders; selected grouped controls use orange/white.
- Customer wallpaper/slideshow imagery remains supported, but controls over
  imagery must prioritize readability with solid surfaces or simple scrims
  rather than blur.
- Normal customer kiosk screens must not expose implementation labels such as
  wallpaper mode or platform readiness; those belong to operator
  Display/Diagnostics views.
- The SelfX design tokens are the source of truth for future Organizations,
  Stores, Users, Roles, Permissions, Catalog, Kiosks, Try-On, Reports, Audit
  and Settings modules.
- The required `#FF7119` plus white text combination may need an accessible
  action variant before formal WCAG AA compliance.

## PRD-KIOSK-008 — KIOSK-2C Customer Home and Operator Access

SelfX kiosks should open into a customer-facing idle home instead of operator
settings or technical camera-test controls. KIOSK-2C adds this kiosk shell while
keeping Android primary and Windows fully supported.

KIOSK-2C product rules:

- Startup/default UI is the customer kiosk home with local/offline static or
  slideshow presentation content and a clear **Start Try-On** action.
- Customer flow is Kiosk Home -> Start Try-On -> garment selection/preview ->
  photo source choice -> existing capture/review/photo-ready flow.
- Camera Settings must not be visible from the home. Operator access is hidden
  behind a top-left double-tap hotspot that reveals an operator icon briefly.
- The operator icon opens a 6-digit PIN challenge before local settings. It must
  not open settings directly.
- Operator PIN checking is isolated behind a provider-neutral verifier. Widgets
  must not hardcode production PINs, persist plaintext PINs or log PIN input.
- After five failed attempts, operator access locks for 60 seconds. Customer
  Try-On must remain available during operator lockout.
- A correct PIN unlocks settings for that visit only. Leaving settings re-locks
  operator access; no persistent local unlock is created.
- Operator settings must be grouped as Camera, Capture, Display, Diagnostics and
  System and remain scrollable/responsive in Android portrait and Windows
  portrait, landscape and narrow windows.
- SELFX-DESIGN-SYSTEM-2 refines operator settings into Camera, Capture,
  Display, Audio, Diagnostics and System categories. Normal operator UI shows
  human-readable camera labels; raw hardware IDs belong under diagnostics or
  hardware details.
- Idle presentation uses a local/offline fallback and a provider-neutral model
  that can later be backed by CMS or fleet configuration.
- The bundled SelfX wallpaper is the default kiosk wallpaper until
  organization/kiosk-specific wallpapers can be managed from the SaaS dashboard.

KIOSK-2C does not implement backend fleet sync, kiosk provisioning/device auth,
remote content management, SelfX Try-On API upload, product/catalog selection,
FASHN/provider calls, API Gateway, migrations or new database persistence.

## PRD-KIOSK-009 — KIOSK-3A Real Kiosk Try-On Generation

SelfX kiosks must be able to complete a real provider-backed Try-On generation
through SelfX after the customer selects a garment, captures a photo and accepts
the review image. This phase proves the end-to-end kiosk product loop while
keeping production device management and catalog expansion separate.

KIOSK-3A product rules:

- Customer flow is Kiosk Home -> Start Try-On -> customer-friendly garment
  image selection/preview -> photo source choice -> Take Photo or Use My Phone
  -> Try-On generation progress -> generated result.
- The kiosk must submit to SelfX, not directly to FASHN or another provider.
  Provider credentials remain backend-only.
- Temporary local garment-image input is acceptable for this milestone only
  through customer-friendly picker/preview UI. Normal customer UI must not show
  raw filesystem paths, KIOSK milestone labels, garment type overrides or
  photo-style controls. Product Catalog selection, physical garment capture,
  commerce-synced garments and QR result handoff remain future product work.
- Generation uses the accepted full-resolution customer capture. If local
  PrimarySubject/TargetSubjectRegion metadata is available, SelfX may prepare a
  padded target input from the original still; otherwise the full frame is used.
- The generated provider result is displayed directly in KIOSK-3A. Final
  target-region compositing and background-person preservation remain future
  work.
- The customer must see bounded async progress and safe failure choices such as
  retry polling, retake photo, choose another garment or finish.
- Ordinary retry actions must not create duplicate paid provider submissions for
  the same accepted capture/run.
- Session finish, retake and try-another-garment actions must clear customer
  image/result state so the next customer cannot see prior data.

KIOSK-3A does not implement Organizations, Stores expansion, RBAC expansion,
managed kiosk device auth, fleet management, Product Catalog, physical garment
capture, QR handoff, billing, API Gateway, provider client code in Flutter,
database migrations or new persistence semantics.

## PRD-KIOSK-010 — KIOSK-4A Device Provisioning and Platform Fleet

SelfX kiosks must use production device provisioning before commercial device
Try-On endpoints are connected. A new or unpaired kiosk must show a pairing
screen and must not enter the normal customer home until it has a valid active
device identity.

KIOSK-4A product rules:

- Pairing codes are backend-generated, exactly six numeric digits and valid for
  exactly 8 minutes. Leading zeroes are valid.
- The kiosk displays the code, an `MM:SS` countdown and a visual timer derived
  from backend `expiresAt` and `serverTime`.
- Expired codes automatically rotate to a new backend-generated pairing session.
- Superadmins use **Kiosks -> Pair New Kiosk**, enter the physical kiosk code,
  name the kiosk and select `PLATFORM`, `ORGANIZATION` or `STORE` assignment.
- Kiosk records belong to the SelfX platform fleet. Superadmin users are not
  modeled as kiosk owners.
- `PLATFORM` assignment requires no organization/store. `ORGANIZATION` requires
  an organization. `STORE` requires an organization and a store belonging to it.
- Superadmins must be able to deactivate and reactivate kiosk devices without
  deleting audit/pairing history. Only `ACTIVE` devices may operate.
- Superadmins must be able to delete kiosks from the normal fleet list using a
  soft-delete lifecycle state so historical audit records remain intact.
- Pairing is one-time use and atomically creates the active kiosk device.
- Device credentials belong only to the physical kiosk. Superadmin browsers must
  never receive device credentials or provisioning secrets.
- A paired kiosk restores its device session on restart without re-pairing.
- Revoked/unpaired kiosks clear local device credentials and return to pairing.
- KIOSK-4A introduces future fleet permission capabilities:
  `kiosks.view`, `kiosks.pair`, `kiosks.update`, `kiosks.assign`,
  `kiosks.revoke`, `kiosks.delete`, `kiosks.configure`. In this phase, SelfX
  Superadmin is authorized.

KIOSK-4A does not implement production kiosk Try-On endpoints, Product Catalog,
full Roles/Permissions, CMS wallpaper sync, remote commands, OTA updates, deep
telemetry, FASHN changes, Shopify, WooCommerce, billing, Redis/BullMQ or API
Gateway. Production device-authenticated kiosk Try-On belongs to KIOSK-4B.

## PRD-KIOSK-010B — KIOSK-4B Device-Authenticated Production Kiosk Try-On

SelfX paired kiosks must be able to complete customer Try-On generation through
a production device-authenticated API without a human/staff access token.

KIOSK-4B product rules:

- Customer flow is unpaired kiosk -> pairing -> device authentication ->
  customer home -> garment -> photo source -> capture/review -> production
  kiosk Try-On -> generated result.
- A properly paired kiosk uses its device session for generation and must not
  require `SELFX_KIOSK_DEV_ACCESS_TOKEN`.
- Production kiosk Try-On must not require `TRYON_LAB_ENABLED=true`; that flag
  remains only for the internal Web Try-On Lab.
- Kiosks submit only to SelfX. Flutter must never call FASHN or store provider
  credentials.
- The production kiosk endpoint must accept only active kiosk-device
  credentials and must reject human user tokens plus inactive, revoked, deleted
  or unpaired devices.
- The backend derives run organization/store context from the current
  `KioskDevice` record. Flutter must not be able to spoof assignment context.
- `PLATFORM`, `ORGANIZATION` and `STORE` kiosk assignments are valid.
- A kiosk may read only its own generated run/status/result.
- Run creation requires a customer-attempt `clientRequestId`; retrying the same
  device and `clientRequestId` must return the same SelfX run and must not
  create duplicate paid provider work.
- If a device is revoked during generation, the kiosk stops polling, clears
  device authentication and returns to pairing.
- Customer **Finish** clears capture, garment, prepared input and result state
  without clearing a valid paired device identity.

KIOSK-4B does not implement Product Catalog, Organizations management, full
RBAC, QR result continuation, checkout, billing, API Gateway, Shopify,
WooCommerce, Redis/BullMQ, target compositing or provider client code in
Flutter.

## PRD-KIOSK-011 — KIOSK-4C Secure Customer Mobile Photo Upload

SelfX kiosks may let a customer use their personal phone to provide the person
photo for the current kiosk Try-On session. This is an alternate photo input
source for the existing kiosk flow, not a customer account or QR continuation
feature.

KIOSK-4C product rules:

- After garment selection/preview, the kiosk resolves the existing CaptureScope
  internally and the customer may choose **Take Photo** on the kiosk or **Use
  My Phone**.
- The kiosk displays a QR code for a short-lived customer upload session owned
  by the active kiosk device.
- The QR code contains only an opaque capability URL. It must not expose raw
  customer data, kiosk assignment data, object-storage keys, image URLs,
  provider data, access tokens or secrets.
- Customer-upload request failures such as validation, conflict, rate limit,
  server or network errors must not clear a healthy kiosk pairing. They remain
  in the upload retry/cancel flow.
- Expired or invalid kiosk device access tokens may trigger one device-session
  refresh and one retry. Unpaired, revoked, deleted or inactive device states
  return the kiosk to pairing.
- The kiosk must show a clear preparing state until a valid upload session
  exists. It must not display a countdown such as `00:00` before backend
  `expiresAt/serverTime` is available.
- The QR screen must adapt to Windows portrait/landscape, shorter or narrow
  Windows windows and Android portrait without hiding the QR, countdown, status
  or actions.
- If session creation fails, the kiosk must stop loading indefinitely and show
  safe retry/cancel actions without exposing tokens, capability values, stack
  traces or internal secrets.
- Customer upload links expire after five minutes and cannot be reused after
  expiry, cancellation or consumption.
- Expired QR sessions must no longer be displayed as usable; the kiosk either
  replaces them with a fresh backend session or requires the customer to refresh
  the QR.
- The phone upload page accepts only supported image files and requires an
  explicit customer upload action after photo selection.
- SelfX validates the uploaded image before the kiosk can select it.
- Once ready, the kiosk previews the uploaded photo, lets the customer upload
  another photo or select the ready photo, then continues the current kiosk
  Try-On flow.
- For phone-uploaded model/person photos, SelfX resolves internal model body
  coverage from the uploaded still image before accepting the photo for
  generation. The selected category or CaptureScope must not be used as proof
  that a phone-uploaded model image contains the required body coverage.
- If model coverage is unavailable or UNKNOWN, SelfX must fail safe before paid
  provider execution and ask for an updated photo with plain customer guidance.
  Customer UI must not expose coverage enum values, landmark names or
  compatibility matrices.
- Garment phone uploads do not run model/person coverage analysis.
- Temporary uploaded customer photos remain subject to the approved customer
  image privacy and retention rules.

KIOSK-4C does not implement Product Catalog, persistent customer accounts, QR
result handoff/continuation, checkout, billing, Redis/BullMQ, API Gateway or
provider client code in Flutter.

## PRD-KIOSK-012 — KIOSK-6A Remote Kiosk Configuration

SelfX superadmins must be able to configure individual paired kiosks from the
SaaS fleet surface without changing physical kiosk credentials.

KIOSK-6A includes:

- one active runtime configuration per kiosk device;
- monotonic per-device configuration versioning;
- heartbeat/session discovery of the latest configuration version without
  sending the full configuration body;
- a device-authenticated configuration endpoint available only to active
  current kiosk devices;
- configurable idle presentation mode, slide duration, title, subtitle,
  **Start Try-On** CTA label and ordered presentation image/video references;
- the bundled SelfX default video is used for newly connected kiosks until a
  Store-assigned kiosk receives a Store-managed presentation playlist;
- Store-assigned kiosks may use Store-selected video and wallpaper slots in
  place of the default video, with uploaded presentation videos limited to one
  minute;
- configurable capture countdown, capture sound enablement, sound profile and
  guidance-audio flag;
- configurable customer-facing garment intent availability for `TOP`, `BOTTOM`
  and `FULL_OUTFIT`;
- local kiosk cache and offline fallback to the last valid configuration, or
  bundled defaults if no cache exists;
- remote configuration activation only after presentation assets are validated
  and locally available;
- kiosks cache downloaded presentation media and fetch replacement videos or
  wallpapers only when the versioned configuration references changed media.

KIOSK-6A does not implement remote camera selection, remote reboot/commands,
OTA updates, Product Catalog, Shopify/WooCommerce sync, premium audio asset
distribution, deep telemetry, billing, API Gateway or provider changes. SaaS
presentation image/video upload is supported through SelfX object storage and
remains scoped to the target kiosk configuration.

---

# 24. QR Kiosk-to-Mobile Handoff

## PRD-QR-001

QR handoff is part of the initial MVP.

A kiosk customer must be able to scan a SelfX-generated QR code and continue the permitted customer journey on a personal device.

Possible continuation includes:

- Viewing the current Try-On session.
- Accessing generated results.
- Signing into/creating a SelfX customer account.
- Saving results.
- Opening product information.
- Continuing toward purchase.

Detailed token/security/session behavior belongs in Technical Requirements.

---

# 25. SelfX Super Administration

## PRD-ADMIN-001

SelfX Super Admin must provide platform-level management of:

- Organizations
- Stores
- Users/staff
- Kiosks
- Subscriptions/commercial configurations
- Trials
- Usage
- AI-provider usage
- AI cost
- Integrations
- Platform analytics
- Support
- Impersonation
- Audit information

---

# 26. SelfX Support View

## PRD-SUPPORT-000

The first production SelfX platform super administrator must be initialized
through a controlled one-time operator bootstrap, not through public signup,
direct SQL inserts, demo accounts or a hidden browser setup route.

The production bootstrap may be used only for an empty production user database
and must create the first user plus active `SELFX_SUPER_ADMIN` platform role as
one atomic operation. A safe retry may report that the exact first administrator
is already initialized, but the bootstrap must not become a general production
user-creation or password-reset mechanism.

Temporary bootstrap secrets must be removed after successful initialization.
Normal production login uses the standard staff/admin authentication flow after
the first platform administrator exists.

## PRD-SUPPORT-001

Authorized SelfX personnel must be able to inspect a client environment for support without requesting customer passwords.

Support View should be read-only.

Support may inspect permitted:

- Organization
- Store
- Products
- Staff configuration
- Kiosks
- Integrations
- Usage
- Try-On status/errors
- Relevant diagnostics

---

# 27. Controlled Impersonation

## PRD-SUPPORT-010

Authorized SelfX administrators must be able to impersonate an organization/store context when support requires operational access.

Example:

SelfX Administrator
→ Organization A
→ Tirupati Store
→ Store Manager Context

---

## PRD-SUPPORT-011

Impersonation must:

- Never expose customer passwords.
- Never expose provider secrets.
- Be explicitly visible.
- Identify active organization/store context.
- Identify the acting SelfX administrator.
- Be permission controlled.
- Be time limited.
- Support immediate exit.
- Be auditable.

Detailed security controls belong in Technical Requirements.

---

## PRD-SUPPORT-012

Production web staff/admin authentication must support reliable session
restoration after reload, direct URL open and normal internal navigation without
exposing refresh tokens to browser JavaScript.

The SelfX web application may use a same-origin web proxy/BFF boundary for
browser API traffic so HttpOnly refresh cookies remain first-party to the web
origin. This web proxy must not become a general API Gateway or move tenant
authorization out of the SelfX API. Non-web clients may continue to call the
SelfX API directly through approved client-specific authentication.

AUTH-PERSISTENCE-FIX-1 clarifies that normal short-lived web access-token
expiry is recoverable while the refresh session is valid. A protected web
request must refresh transparently and retry once before showing any
session-expired/login state. Users must not see raw token-internal messages such
as "Access token is invalid or expired" for ordinary access-token expiry.

Paired kiosks must remain paired across normal device access-token expiry,
recoverable heartbeat/configuration/customer-upload/Try-On failures, backend
restarts and temporary network loss. The kiosk may clear secure device
credentials and return to pairing only for authoritative terminal lifecycle
states such as unpaired, revoked, deleted or intentionally inactive device
status, or genuine refresh-session expiry/invalidity.

---

# 28. Usage Tracking

## PRD-USAGE-001

SelfX must record Virtual Try-On usage.

Usage should be attributable where applicable to:

- Organization
- Store
- Kiosk
- Channel
- Integration
- Product
- Try-On
- AI provider/model
- Generation status
- Provider usage/cost
- Timestamp

---

# 29. Subscription / Commercial Model

## PRD-COMMERCIAL-001

SelfX must not require every customer to use one identical commercial model.

Organizations may have configurable commercial agreements.

Examples may include:

- Standard SaaS plan
- Custom subscription
- Enterprise contract
- Usage-based pricing
- Negotiated limits
- Custom kiosk arrangements

---

## PRD-COMMERCIAL-002

Commercial configuration may control:

- Successful Try-On allowance
- Stores
- Kiosks
- Users
- API access
- API limits
- Integrations
- Analytics
- Branding
- Support level
- Other entitlements

Exact pricing is outside PRD v1.

---

# 30. Free Trial

## PRD-TRIAL-001

SelfX must support trial plans that may include both:

- Time limit
- Generation limit

Example concept:

Trial expires when either:

- Trial duration expires, or
- Allowed Try-On generation quota is exhausted

Exact commercial values will be configured separately.

---

# 31. Non-Payment / Commercial Suspension

## PRD-SUB-001

Organizations must not be immediately deleted when payment/commercial status expires.

The expected lifecycle is conceptually:

Active
→ Payment/Commercial Issue
→ Grace Period
→ Suspended

---

## PRD-SUB-002

During suspension:

- New billable functionality may be restricted.
- Virtual Try-On generation may be disabled.
- Existing business data should remain preserved according to platform retention policy.
- Authorized SelfX personnel must be able to restore access after resolution.

Exact payment handling belongs in Technical Requirements.

---

# 32. White-Label Capability

## PRD-BRAND-001

Higher commercial tiers may support configurable branding.

Possible capabilities include:

- Client logo
- Brand name
- Theme/accent customization
- SelfX branding visibility
- White-label customer-facing experience

Exact customization options belong in UI/UX and Technical Requirements.

---

# 33. Organization Onboarding

## PRD-ORG-010

SelfX must support both:

### SelfX-Managed Onboarding

SelfX administrator creates/configures an organization.

### Self-Service Onboarding

A new customer may register and create a SelfX organization.

Self-service availability may be controlled during launch.

## PRD-ORG-011 — Registration Is Not Activation

An organization must never become operational immediately simply because a user registers or submits it.

Organization registration and organization activation are separate actions.

Approved lifecycle:

1. User submits organization registration.
2. Organization/application enters pending onboarding or review.
3. SelfX reviews required information and documents where applicable.
4. Commercial, pricing, payment or contract requirements may be evaluated.
5. Authorized SelfX platform administrator approves activation.
6. Organization becomes active.
7. Normal organization, store, product, kiosk and Try-On functionality becomes available.

## PRD-ORG-012 — Onboarding Application Lifecycle

The onboarding/application lifecycle is separate from the operational organization status.

Baseline application states:

- DRAFT
- SUBMITTED
- UNDER_REVIEW
- NEEDS_INFORMATION
- APPROVED
- REJECTED

Baseline organization operational states:

- PENDING_ACTIVATION
- ACTIVE
- SUSPENDED
- ARCHIVED

An approved application does not necessarily mean the organization is active.

Example:

```text
application_status = APPROVED
organization_status = PENDING_ACTIVATION
```

This is valid when a commercial, payment, document, verification or contract prerequisite still remains.

## PRD-ORG-013 — Activation Requirements

Activation requirements may depend on organization type, commercial model, launch policy, geography, risk, or SelfX operational requirements.

Possible activation requirements include:

- required business information;
- required organization documents;
- identity/business verification;
- commercial terms;
- pricing agreement;
- subscription selection;
- payment;
- enterprise contract;
- other SelfX-defined onboarding requirements.

SelfX must not hard-code one universal requirement set.

Initially, activation eligibility may be confirmed manually by an authorized SelfX platform administrator. Later billing, payment, document or verification automation may supply activation signals without redesigning the organization lifecycle.

## PRD-ORG-014 — Applicant and Initial Owner

The person who submits an organization may be recorded as the intended initial `ORGANIZATION_OWNER`.

Submitting an organization must not grant normal active tenant operation immediately.

Before organization activation, the applicant must not receive normal store management, membership administration, product management, kiosk operation, paid Try-On execution, or normal tenant business API access except explicitly approved onboarding/status functionality.

When the organization becomes `ACTIVE`, the approved initial owner membership becomes usable for normal tenant authorization.

---

# 34. Analytics

## PRD-ANALYTICS-001

SelfX should provide platform, organization and store analytics.

Potential metrics include:

- Total Try-Ons
- Successful Try-Ons
- Failed Try-Ons
- Most tried garments
- Most active stores
- Try-Ons by kiosk
- Try-Ons by channel
- Usage trends
- Generation performance
- AI cost
- Customer engagement
- Add-to-cart conversion where available
- Purchase conversion where available

---

## PRD-ANALYTICS-002

Data visibility must follow access scope.

### SelfX Super Admin

Platform-wide visibility.

Platform roles with the appropriate usage/analytics permission may see
platform-wide totals and store-wise breakdowns, but must not receive raw
customer images through analytics.

### Organization

Organization-level and permitted store data.

### Store

Permitted store data only.

Store analytics should prioritize product-specific, category-specific, kiosk and
channel usage for that Store.

Kiosk analytics are count-based because kiosk customers are unauthenticated.
SelfX may store session counts, generated-look counts, download counts, run
status, provider/model usage and product references, but kiosk customer source
photos, physical-session garment captures and generated assets must follow the
approved temporary retention rules rather than becoming permanent analytics
assets.

The Staff and Dashboard workspaces must be hierarchical. SelfX Platform roles
may see platform-wide staff, Store staff or dashboard summaries only through
explicit Platform permissions. Store users may see only the staff, products,
kiosks and usage data permitted inside their own Store scope.

---

# 35. Channel Identification

## PRD-CHANNEL-001

Every Virtual Try-On should identify its originating channel where applicable.

Provider-neutral channel taxonomy:

- WEB_LAB
- WEB_CUSTOMER
- KIOSK
- MOBILE
- SHOPIFY
- WOOCOMMERCE
- PUBLIC_API

Only WEB_LAB is used by the CORE VTO-1.1 internal development Lab. Production
customer and partner channels must use the same SelfX backend and may not call
AI providers directly.

This must support usage, analytics and reporting.

---

# 36. Public API

## PRD-API-001

After stabilization of the core kiosk/SaaS system, Public API is the highest-priority external expansion.

SelfX must expose approved capabilities programmatically to external customers/partners.

Potential API capabilities include:

- Authentication
- Product access
- Image handling
- Create Virtual Try-On
- Retrieve status
- Retrieve result
- Usage information
- Completion notifications where supported

Exact API endpoints and payloads belong in Technical Requirements.

## PRD-API-002

Public API and Store-owned kiosk integrations must not require merchants to
move their product catalog into SelfX before using Try-On.

SelfX may accept and persist lightweight product reference metadata on a
Try-On run, including catalog source, external product ID, external variant ID,
SKU, product name, display price and currency. This metadata supports
analytics, support, reporting, webhooks and usage review only. Authorization
must still come from the SelfX credential, Store context and server-side
permissions, not from a client-supplied product reference.

Platform-owned demo kiosks may use the SelfX catalog. Store-owned kiosks may
use the Store's own catalog system and should pass product reference metadata
when available.

Authorized product managers must be able to explicitly request a catalog
refresh after changing garment or jewellery products. A Store catalog refresh
targets only active kiosks assigned to that Store. A platform catalog refresh
targets platform-owned kiosks and Store kiosks currently using that product
vertical as their platform fallback. Offline kiosks keep their valid cache and
apply the refresh after reconnecting.

Developer API administration must follow the same Store tenant boundary as
analytics. Store users may view or manage only API keys, API usage, webhook
endpoints, webhook deliveries and Try-On runs that belong to Stores where they
hold the required Store permission. Platform roles may view or manage
cross-Store Developer API resources only through explicit platform permissions.
If a request combines filters from different Stores, SelfX must reject the
request instead of silently mixing scopes.

---

# 37. Mobile Application

## PRD-MOBILE-001

The SelfX backend must support a future mobile application, expected initially to be developed using Flutter.

The mobile application may support:

- Customer authentication.
- Customer account.
- Product retrieval.
- Camera capture.
- Image upload.
- Virtual Try-On.
- Saved Try-Ons.
- QR handoff.
- Result viewing.
- Purchase continuation.

The Flutter application must consume SelfX APIs and must not communicate directly with the AI provider.

---

# 38. Shopify

## PRD-SHOPIFY-001

SelfX should support a Shopify application/integration.

It should enable a merchant to:

- Connect Shopify to their SelfX organization.
- Associate a Shopify store.
- Synchronize/map relevant products.
- Enable Virtual Try-On on eligible products.
- Attribute usage to the correct organization/store/integration.
- Manage connection status.

Detailed Shopify implementation belongs in Technical Requirements.

---

# 39. WooCommerce

## PRD-WOO-001

SelfX should support a WooCommerce plugin/integration offering equivalent core Virtual Try-On capabilities.

The plugin must communicate with SelfX rather than directly with the AI provider.

Detailed implementation belongs in Technical Requirements.

---

# 40. Security Requirements

At product level, SelfX must:

- Prevent cross-organization access.
- Prevent unauthorized cross-store access.
- Protect customer images.
- Protect authentication credentials.
- Protect integration/provider credentials.
- Use secure authentication.
- Use role/scope-based authorization.
- Protect administrative functionality.
- Protect device authentication.
- Protect impersonation.
- Maintain appropriate auditability.

Exact technical controls belong in Technical Requirements.

---

# 41. Privacy Requirements

SelfX must:

- Collect appropriate customer consent.
- Clearly explain AI image processing.
- Enforce the approved retention period.
- Protect original customer photos.
- Protect generated results.
- Restrict merchant image access according to product rules.
- Protect customer history across retailers.
- Prevent one merchant from viewing another merchant's customer interaction data.
- Maintain privacy-aware analytics.

---

# 42. Reliability Requirements

SelfX must handle gracefully:

- Invalid customer images.
- Invalid garment images.
- AI generation failure.
- AI-provider unavailability.
- Internet/connectivity failure.
- Timeouts.
- Kiosk connectivity problems.
- Subscription/quota restrictions.
- Authorization failures.

The user interface must not crash or enter an unsafe state due to these conditions.

---

# 43. Performance Requirements

Core application interactions must remain responsive.

Virtual Try-On generation must be treated as a long-running operation.

The customer-facing interface must:

- Acknowledge requests quickly.
- Display generation status.
- Remain responsive during AI processing.
- Display completed results when available.

Exact timeout, concurrency and queue implementation belongs in Technical Requirements.

---

# 44. Scalability Requirements

The architecture must support growth from:

Initial:

- SelfX-owned retail locations
- Limited organizations
- Limited kiosks
- Hundreds/thousands of Try-Ons

toward:

- Thousands of organizations
- Thousands of stores
- Thousands of kiosks
- Ecommerce traffic
- Public API customers
- Mobile traffic
- Millions of Try-Ons per month

Detailed infrastructure scaling belongs in Technical Requirements.

---

# 45. MVP Scope

PRD v1 MVP consists of:

## Core SaaS

- Authentication
- Global customer accounts
- Organization management
- Store management
- Staff management
- Predefined role/scope access
- Multi-organization membership
- Multi-store staff access
- SelfX Super Admin
- Support View
- Controlled impersonation
- Basic auditability

## Customer Experience

- Anonymous basic Try-On
- Customer registration/login
- Phone OTP
- Email OTP
- Approved social login
- Saved history
- Seven-day image/result retention
- QR kiosk-to-mobile handoff

## Products

- Product/garment management
- Organization-wide products
- Store-specific products
- Garment images
- Physical garment capture
- External product mapping foundation

## Virtual Try-On

- Customer image upload
- Camera capture
- Customer-image reuse within a session
- Catalog garment selection
- Multiple garment support according to channel
- Image validation
- AI generation
- Result status
- Result display
- Retry
- Save result
- Configurable download/share

## AI

- Provider-independent SelfX interface
- Initial AI provider integration
- Provider usage tracking
- Basic provider cost tracking

## Retail / Kiosk

- Kiosk registration/pairing
- Store assignment
- Device authentication
- Status monitoring
- Customer Virtual Try-On flow
- QR mobile handoff

## Commercial

- Organization commercial configuration
- Subscription/entitlements foundation
- Trial with time + generation limits
- Grace period
- Suspension
- White-label entitlement foundation

## Analytics

- SelfX platform analytics
- Organization analytics
- Store analytics
- Product/Try-On/usage/channel statistics

---

# 46. Post-MVP Priorities

After the core SelfX SaaS/kiosk system is stable:

1. Public API
2. Additional API/partner capabilities
3. Flutter mobile application
4. SelfX Web Widget / SDK
5. Shopify integration
6. WooCommerce integration
7. Advanced analytics
8. Conversion attribution
9. Advanced billing
10. Additional AI providers
11. Intelligent provider routing/fallback

The exact sequence after Public API may change according to business priority.

---

# 47. Future Features

Possible future features include:

- Live AR Virtual Try-On
- Video Try-On
- Size recommendation
- Body-measurement-assisted sizing
- Complete outfit Try-On
- AI fashion assistant
- Outfit recommendations
- Customer wardrobe
- Personalized recommendations
- Loyalty integration
- Advanced conversion attribution
- Enterprise SSO
- Custom merchant roles
- Advanced white labeling
- SelfX-hosted AI models
- Additional ecommerce integrations

---

# 48. Product Success Metrics

SelfX should monitor:

## Technical

- Virtual Try-On success rate
- AI quality
- Generation duration
- Platform availability
- Provider failure rate
- Kiosk availability
- API reliability

## Product / Business

- Try-Ons per customer/session
- Try-Ons per organization
- Try-Ons per store
- Try-Ons by channel
- Most tried products
- Customer engagement
- Add-to-cart conversion where measurable
- Purchase conversion where measurable
- Active organizations
- Active kiosks

## Financial

- Provider cost per generation
- Cost per Try-On
- AI cost by organization
- Revenue by organization
- Subscription/commercial usage
- Gross margin

Exact target thresholds will be finalized using AI proof-of-concept and production data.

---

# 49. Mandatory Product Boundaries for Implementation

Coding agents and developers must observe the following boundaries.

### Boundary 1

Do not implement client applications that call FASHN, Google or another AI provider directly.

### Boundary 2

Do not make users permanently belong to only one organization.

### Boundary 3

Do not assume staff can access only one store.

### Boundary 4

Do not implement an independent-store backend separate from the normal organization/store model.

### Boundary 5

Do not allow cross-organization data access.

### Boundary 6

Do not allow unauthorized cross-store access.

### Boundary 7

Do not expose AI-provider or integration secrets to customer-facing clients.

### Boundary 8

Do not turn SelfX into a full POS/inventory system as part of PRD v1.

### Boundary 9

Do not make kiosk authentication depend on an employee's permanent credentials.

### Boundary 10

Do not permanently store customer images beyond the approved retention policy.

### Boundary 11

Deleting customer images after seven days must not require deleting non-image Try-On history/analytics that SelfX is permitted to retain.

### Boundary 12

Store Managers may see generated results for their permitted store but must not automatically see original customer photographs.

### Boundary 13

Customer SelfX accounts are global across participating retailers, but merchant data access remains tenant-isolated.

### Boundary 14

AI-provider implementation must remain replaceable.

### Boundary 15

Technical implementation decisions must not silently change these product requirements.

### Boundary 16

Do not make organization registration automatically activate an operational tenant. Review, approval and activation are explicit SelfX platform-controlled lifecycle steps.

---

# 50. Documents Governing Implementation

This PRD defines:

**WHAT SelfX must do and the product rules that implementation must preserve.**

Implementation must additionally follow these project documents:

## Document 2 — Technical Requirements & System Design

Defines:

- Tech stack
- System architecture
- APIs
- Authentication implementation
- RBAC implementation
- Kiosk architecture
- AI integration
- Queues/jobs
- Storage
- Infrastructure
- Security
- Shopify/WooCommerce technical integration
- Scaling
- Deployment

## Document 3 — User Journey & System Flow

Defines:

- Customer journeys
- Organization journeys
- Store journeys
- Staff journeys
- SelfX Admin journeys
- Kiosk journeys
- QR handoff
- Support/impersonation flows

## Document 4 — UI/UX Flow & Screen Specification

Defines:

- Screens
- Navigation
- Actions
- Forms
- Loading states
- Error states
- Permission-based UI
- Responsive behaviour
- Figma requirements

## Document 5 — Database & Schema Design

Defines:

- Entities
- Relationships
- Tables
- Fields
- Foreign keys
- Indexes
- Tenant scope
- Membership model
- Retention fields
- Audit schema
- Migrations

## Document 6 — Implementation Plan

Defines:

- Development phases
- Dependencies
- Tasks
- Priorities
- Acceptance checks
- Tests
- Verification
- Rollout plan

---

# 51. Coding Agent Instruction

Before implementing a feature, the coding agent must:

1. Identify the relevant PRD requirement.
2. Check the Technical Requirements document for implementation constraints.
3. Check the User Journey document for expected behavior.
4. Check the UI/UX document for client behavior where applicable.
5. Check the Database & Schema document before altering persistence.
6. Follow the active Implementation Plan phase.
7. Avoid introducing architecture that conflicts with future Shopify, WooCommerce, mobile or Public API clients.
8. Preserve multi-tenancy, store scope and provider independence.
9. Avoid making undocumented product decisions.
10. Surface contradictions or missing requirements before making irreversible architectural decisions.

---

# 52. PRD Status

All major product questions required for the initial product baseline have been resolved.

**Status: APPROVED — PRD v1.0**

Further implementation detail must be added to the appropriate supporting document rather than unnecessarily expanding this PRD.

A new PRD version should only be required when the product itself materially changes.
