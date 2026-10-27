## Document Evolution

### CUSTOMER-MOBILE-11 — Email/mobile authentication (2026-10-27)

Replace email-only credential entry and the secondary optional phone field with one country-aware email/mobile field and conditional verification email. Align linked policy text without a checkbox; keep manual keyboard/small-screen scrolling. Add direct Google continuation, Profile linking and ten-second SMS retry/diagnostic states across the 20-language UI. See `CUSTOMER-MOBILE-11-AUTH-METHODS.md`.

### CUSTOMER-MOBILE-10 — Reference-led welcome and authentication (2026-10-27)

Use a full-screen fashion welcome, cream information screens with layered image cards and progress dots, then matching clean login/signup forms. Preserve official branding, language selection, RTL, small-screen/large-text scrolling and existing authentication controls. See `CUSTOMER-MOBILE-10-WELCOME-AUTH.md`.

### CUSTOMER-MOBILE-9 — Compact profile settings (2026-10-27)

Remove the large Add profile photo button, inline removal control, lengthy instructions and profile logout/delete group. Add an accessible 44-pixel + target over the avatar and a compact scrollable chooser with a one-line retention caption. Move Log out/Delete account to outer settings; retain all other settings and 20 languages. See `CUSTOMER-MOBILE-9-PROFILE-SIMPLIFICATION.md`.


### CUSTOMER-MOBILE-8 — Native Firebase wiring (2026-10-27)

Do not leave Send code permanently disabled by an old startup capability result. Recheck availability and show one readable setup error when needed. Phone alerts remain disabled until both native configuration and server delivery are ready; ensure the enabled switch has a Material surface for visible interaction. See `CUSTOMER-MOBILE-8-FIREBASE-WIRING.md`.


### CUSTOMER-MOBILE-7 — Profile and header (2026-10-27)

Use a compact 20-language header dropdown and a zero-credit plus/Add credits control leading to existing Plans & credits. Me has one named profile card with avatar/initial. The profile screen consolidates account settings and offers consent-gated gallery/camera/change/remove actions. Preserve RTL, narrow-screen scrolling and the absence of license UI. See `CUSTOMER-MOBILE-7-PROFILE-HEADER.md`.


### CUSTOMER-MOBILE-6 — Country and account UI (2026-10-27)

Add a searchable country dropdown and phone keyboard, shared warm keyboard-aware sheets, profile save/error states and a real About screen. Remove the Licenses section from the customer app UI while preserving bundled notices; show installed version/build instead of hardcoded text. Preserve all 20 languages, RTL identifiers and header positions. See `CUSTOMER-MOBILE-6-ACCOUNT-UI.md`.

### CUSTOMER-MOBILE-5 — Email and phone codes (2026-10-27)

Keep the independent premium customer theme and existing header. Add email/mobile code entry, six-digit OTP/autofill, consent before SMS, loading/errors, resend countdown and new-account access. Signup adds optional country-code/phone fields; Me adds phone verification. Translate new text in all 20 languages and retain RTL layout with LTR contact/code fields. See `CUSTOMER-MOBILE-5-OTP.md`.

### CUSTOMER-MOBILE-4 — Customer languages (2026-10-27)

Provide a real language picker with native names, search, selected state, save progress/error and immediate locale changes. Localize app-owned screens, validation, tooltips, skeleton semantics and date/number displays. Support Arabic/Urdu RTL, directional navigation/alignment and LTR identifier entry. Long labels wrap on narrow screens. Never translate customer/store/product names or external release notes. Preserve current premium branding and all working flows. See `CUSTOMER-MOBILE-4-LANGUAGES.md`.

### CUSTOMER-MOBILE-3 — Customer services and distribution (2026-10-26)

Use functional Contact, Notifications and App updates screens in the existing premium mobile theme. Keep known policy/contact fallbacks available before login. Show loading, retry, empty inbox, expired-result and unsupported-update states accurately. Disable unavailable phone alerts without blocking the inbox. A signing/package mismatch prevents an update offer. The release management Application selector separates kiosk and customer builds without adding duplicate management screens. See `CUSTOMER-MOBILE-3-SERVICES.md`.

### CUSTOMER-MOBILE-2 — Working Try-On, free trial and Store QR (2026-10-26)

Customer Flutter UI uses a shared warm ivory/peach background, official logo/colors and original compressed editorial photography. Four introduction slides keep Skip and reduced-motion navigation. Header order is scanner, Plans, personal credits. Home, Studio, Saved, result and account states connect to real APIs; loading skeletons end on success/error. Consent is accepted and persisted before photo picker/camera access. Store mode visibly names the payer and prevents automatic personal fallback. Failures explain credit restoration; uncertain requests offer Check my request. The Plans screen does not invent paid products. Mobile Dashboard uses existing business-dashboard styling with separate real mobile usage/trial/QR aggregates.

### Count-up metrics and progressive page loading (2026-10-25)

Suitable numeric KPI cards on Business/Mobile dashboards, shared statistics cards, workspace resources and commerce details count from zero to their real value over about 850 ms when entering view. Preserve final number, currency/grouping/decimal/percentage formatting. Status text, dates, ratios, zero, unavailable values, chart ticks and product tables remain literal. Reduced motion bypasses animation and stops active animations; screen readers receive the actual final value throughout. Unrelated renders must not restart counting. Animation is presentation only and never changes exports or business calculations.

Show current dashboard metrics while previous-period comparisons and resource cards load independently; identify pending comparisons rather than claiming there is no prior usage. Show Shopify connection details before slower secondary metrics. Product search waits briefly after typing stops and ignores obsolete responses. Preserve skeleton, failure, unavailable and empty states and server-enforced permissions across all changes.

### Styled tooltips and matching dashboard presentation (2026-10-25)

The Business view is labelled **Dashboard** in its sidebar row and page heading; only the mobile view says **Mobile Dashboard**. Keep the vertical sliding name change and reduced-motion behavior. Row-label clicks still open the normal Dashboard. Tooltips read "Open Dashboard", "Switch to Mobile Dashboard" or "Switch to Dashboard" according to the action. The sidebar row reserves space for the compact switch so its label is not clipped.

Web controls use centralized shadcn/Base UI tooltips with a dark background, white text, rounded corners, a subtle shadow, hover delay, keyboard-focus support and Escape dismissal. Portals avoid card clipping and collision handling keeps content inside screen edges. Icon-only shared Buttons use their existing accessible action labels; explicit Button titles become styled tooltip descriptions. Visible-text buttons do not need redundant tooltips. Disabled actions with explanations remain focusable for the tooltip while action execution stays blocked. Collapsed/truncated navigation, account/collapse controls, Store/plan actions and image-upload controls use the same style. Essential instructions, visible labels and accessible names remain available independently of hover, including touch devices.

Mobile uses the actual shared Capitalio metric panels, shaded icon badges, spacing, typography and chart-tooltip presentation used by the normal Dashboard. It retains customer-specific counts, signup charts and meaningful proportions; do not invent historical trends or generation/billing/QR data to fill the layout. Current status, empty, unavailable, error and loading semantics remain unchanged.

### Dashboard sidebar switch and mobile metrics (2026-10-25)

Place a compact shadcn toggle at the right of the existing Dashboard sidebar row. OFF is Business Dashboard; ON is Mobile Dashboard. The visible label moves vertically in a fixed-height clipped track (260ms); reduced motion removes the transition. Row-label clicks always navigate to Business independently of the switch. Keep the switch keyboard-accessible and available in collapsed navigation and the mobile drawer. On Mobile, show its name, date filter, refresh/export, account KPI cards, UTC signup growth and sign-in-method charts, current status overview and explicit future-feature states. Business charts, Store filters and resource metrics retain their current behavior. Mobile contains no Store-scope filter or customer PII.

### Supplied SelfX X logo for installed apps and PWAs (2026-10-25)

Use the exact user-supplied `Selfx Logo.png` X artwork for customer Android/iOS launchers, Android/Windows kiosk launchers and the existing web PWA/browser/Apple touch icons. Store the original unchanged as `frontend/web/public/brand/selfx-mark.png`; do not derive a replacement by cropping the wordmark. Use correctly sized square PNGs, opaque iOS artwork and dedicated maskable PWA variants with safe padding. Full wordmark headers and the customer skeleton UI remain unchanged. Preserve the legacy PWA icon URL with the supplied artwork. This request is source-asset preparation only; do not build APKs.

### CUSTOMER-MOBILE-1.1 — Official logo and genuine loading states (2026-10-25)

Use the existing official SelfX logo asset for onboarding, authentication, header, retry/configuration and native launch screens. Derive launcher/system splash X artwork from that same approved source. This explicitly adds logo reuse to the earlier color-only direction; all mobile presentation and widgets remain independent from web/kiosk layouts. Replace the temporary sparkles/typed-wordmark branding. Sparkles may still identify Try-On actions and credits.

Use skeletons shaped like the pending content during sign-in capability loading, session restoration and account profile requests. They disappear on completion/failure without a forced minimum duration. Expose one accessible loading status, hide placeholder details/actions and stop animation for reduced-motion users. Keep form-button indicators for submissions. Static onboarding, Saved empty states and unavailable Plans/QR features must not pretend to fetch content. Add those content skeletons only with their real services.

### CUSTOMER-MOBILE-1 — Independent mobile presentation (2026-10-25)

The customer app shares the approved SelfX logo and brand colors; do not inherit the dashboard/kiosk shell, components or layouts. Use Flutter-native controls, warm surfaces, editorial headings, compact pill actions, a distinct launcher mark and accessible scrollable forms. Four introduction pages include Skip, page indicators and Continue/Get started. Separate screens/states cover sign-in, signup, verification, forgot/reset password, network retry and unavailable accounts. Include input validation, password visibility, loading/disabled actions and useful inline errors. Require explicit terms acceptance for signup and provider creation.

Home/Saved/Me use persistent bottom navigation. The top-right order is Store QR scanner, Plans, personal credits. Until implemented, scanner/Plans open honest explanatory states and balance displays an unavailable dash rather than invented credits. Home does not collect photos or trigger generation yet. Saved is an empty state explaining future generated-result expiry after 30 days. Me includes profile/security, subscriptions, English language, notification preference, app updates, Privacy, Terms, contact, intro replay, sign-out and confirmed account deletion. Referrals/coupons, actual pushes and extra translations remain deferred.

Show expiry and charging context when generation is introduced. Original photos retain the shorter seven-day policy. Account routes disappear after sign-out/revocation. Support narrow phones, keyboard scrolling, safe areas and larger text without overflow.

### WooCommerce Try-On block editor controls (2026-10-25)

In the WordPress Single Product template editor, selecting SelfX Try-On exposes Button text in Settings and native colors/gradients, typography, padding/margins and borders/corner radius in Styles, subject to the theme's available design settings. Preview changes on an inert button and save the template to publish. The preview is illustrative, while the live button still requires an eligible connected product. Styles apply to each block individually; automatic classic placement and shortcodes keep theme styling. Use one product-template placement to avoid duplicates.

### Platform Store performance / Store product performance (2026-10-25)

On the all-Stores dashboard, replace Product performance with Store performance: Store name, generated Try-Ons, success rate, downloads, failed attempts and View Store. Rank by generated Try-Ons, then attempts. View Store switches the dashboard to that authorized Store's product metrics and keeps the current date range. Offer navigation only for Stores already selectable under the user's Store access; unassigned Platform fleet and unselectable Stores have no action. Platform usage viewers can read Store aggregates without receiving Store-management rights.

Selecting one Store or opening a merchant/staff dashboard retains Product performance with the existing product share metric. Choosing All Stores restores Store metrics. Loading/error/empty states and CSV exports follow the resolved scope, and mobile uses the same metric semantics in cards. Existing charts, insights, resource counts, date controls and account/navigation remain intact.

### Shopify overview and detail alignment (2026-10-25)

Shopify uses the same overview/detail navigation, summary cards, search, connection filter, pagination, desktop table and mobile Store cards as WooCommerce. View details opens the selected Store's integration details rather than its general Store page. Show its readable shop domain, active imported products, successful Shopify Try-Ons over the last 30 days and last completed full sync. Failed attempts must not appear as completed syncs. Keep loading, empty and failure states distinct.

Store details retain Connect/Reconnect Shopify, the shop-domain OAuth dialog, Sync Catalog, callback recovery messages and confirmed disconnect. Reconnect stays bound to the selected authorized SelfX Store. Shopify setup uses three compact steps and a safe Shopify admin link. Keep Store-wide plan/allowance information separate from Shopify generation counts and collapse credit diagnostics. Viewers see no mutation controls; product management is required for catalog/OAuth actions. Product enablement and native Shopify billing remain in the embedded SelfX Shopify app. No Change Store control is introduced.

### WooCommerce overview and Store details (2026-10-25)

Platform integration administrators land on a WooCommerce Store overview with connection counts, successful Try-Ons over the last 30 days, search, connection-health filters and server pagination. Each row shows the SelfX Store, website, connection health, active imported products, acknowledged last full sync and View details. Store details open separately with a back action and a bookmarkable Store ID; merchants always resolve their own authorized Store and cannot select another tenant through the URL. Loading/error/empty states must be distinct, and failed or superseded requests must not populate another Store's details.

Replace the large setup/token panel with a compact connection summary and three-step plugin setup card with a download action. Group manual token generation, existing token status and confirmed revocation under a collapsed Advanced connection section. The normal setup remains automatic linking from WordPress. Secrets remain one-time, are cleared on collapse/permission loss/navigation and are never stored in the browser. Disconnect remains a separate confirmed management action. Platform/Store viewers see no mutations. Keep the existing SelfX shadcn design system and responsive light/dark layouts. This supersedes WOO-1's Platform Store-selector layout; it does not introduce Change Store or change Shopify flows.

### Capitalio dashboard presentation (2026-10-25)

The approved Capitalio visual structure is adapted to the existing `/app/dashboard` for Platform and Store scopes: four summary cards with miniature charts/progress/allocation, a large performance chart with four supporting metrics, a donut distribution with legend, a ranked product table and a three-item insights panel. Retain these sections in loading, empty and restricted-access states. Use Total Try-Ons, Downloads, Generation attempts and Success rate; the performance chart plots actual daily generated results and attempts, and the distribution shows actual generation outcomes. Do not relabel the existing coarse channel aggregation as a Shopify/WooCommerce split. Empty denominators or unavailable comparisons show a dash, not an invented percentage. Product rows adapt to cards on phones.

Retain the shared SelfX navigation, account/logout/theme controls, Store scoping, permissions, resource counts and kiosk snapshot. Date presets, scope selection, Refresh, same-scope analysis details and CSV export operate on real authorized data. Scope/access changes clear the previous metrics immediately; failed loads cannot leave stale results exportable. No financial demo data, hard-coded customer identities or remote avatar services are used. Styling is scoped to this dashboard appearance; other screens retain their current design.

### Commerce controls and native Shopify approval (2026-10-25)

Shopify Plans cards use the existing catalog and native approval action. Usage cards require a currency-labelled 30-day spending cap and show the successful-generation rate. Scheduled changes show the new plan and renewal date while the current approved plan remains displayed. Cancellation and embedded disconnection require explicit confirmation; reconnect retains Store identity. The theme block starts hidden and appears only after authenticated product/plan availability succeeds; failures keep it hidden. WooCommerce settings add bounded integer visitor/monthly fields, day/week/month selection, last-sync status, retry actions and safe recovery guidance. Zero disables a custom allowance cap, while plan/credit enforcement remains active. Existing source-platform shopping and purchasing stay unchanged.

### Shopify visitor initialization (2026-10-25)

Reuse the existing Preparing Try-On state while first-party visitor binding completes. Do not render a ready photo flow on initialization failure. Shopify's brief opening page includes a Continue to SelfX fallback. No visitor identifiers or technical identity controls appear in customer UI. Visitor-limit failures retain a friendly explanation. Browser initialization deduplicates concurrent mounts and serializes across tabs through Web Locks where available.

### COMMERCE-TRYON-2 — Try-On-only website integrations (2026-10-23)

Woo product-page button supports automatic classic placement and an explicit block/shortcode for block templates. Customer SelfX page shares Shopify consent, photo, progress, result, download and return-link UI without provider diagnostics or commerce selectors. Imported Store product rows show source and website management, allow SelfX eligibility/classification, hide native stock/edit/delete controls, and direct source edits back to the website. Kiosk result/My Looks hide native buying for imported references. Setup explains public URLs and plugin token rotation.

### WOO-1 — Website catalog to Store/kiosk sync (2026-10-22)

WooCommerce settings offer an authorized Platform Store selector, plugin download/setup, one-time catalog-token creation and confirmed revocation; integration viewers see no credential mutation controls. Never persist the one-time secret in browser storage. Use WooCommerce labels/instructions rather than Shopify copy. WordPress uses native admin UI with blank saved-token input, verified Store identity, explicit Store-change confirmation, progress/counts/timestamps, Sync now/retry and local disconnect. New imports need explicit Try-On enablement. No customer-facing website Try-On button is claimed in WOO-1.


### MAIL-2 — Automatic templates and controlled outgoing mail (2026-10-22)

Mail Settings groups SMTP Configuration, Email Templates, Send Custom Email and Delivery History. Disable locked SMTP controls and hide Save until the user confirms Edit configuration. Preserve saved passwords without revealing them and clear newly entered passwords after save attempts. Template context lists Stores, Purchases and the reusable Custom mails draft; show supported variables, sample preview, Save and Restore default. Remove Test Email. Keep failed drafts for retry, preserve drafts during routine token refresh and use the same custom-send idempotency key on an unchanged retry. Show masked recipients and safe delivery failure codes, never message payloads or SMTP secrets.


### ROLES-3 — Restore shared defaults and configurable Staff grants (2026-10-22)

Both Store role editors offer the full Store permission registry to authorized Platform role managers. Staff checkboxes and Select all no longer use a hardcoded operational subset. Merchant viewers remain read-only; required Admin permissions stay checked. Platform-only permissions never appear for Store roles.


### PRODUCTS-EDITOR-1 / SHOPPING-3 — Product options and kiosk purchasing (2026-10-21)

Replace Add/Edit Product popups with responsive pages for garments/jewellery and explicit Platform Store product routes. Product management and Stock & Pricing links open the same page; authorized view-only stock browsing remains available. Group basic information, product image and pricing/variants in shared @selfx/ui cards. Include optional colour upload previews, main-image fallback guidance, validation, explicit partial-save errors, leave confirmation and sticky Save/Cancel actions. Kiosk Buy This Look shows image, option chips, quantity, availability, cart and total. Disable unavailable choices; wholly sold-out products show the Store-named toast. Payment UI distinguishes test mode, pending, failure, confirmed success, staff review and expiry. Do not display an expired QR or call a timeout a failed payment.


### PRODUCTS-RBAC-1 — Hide unauthorized product controls (2026-10-21)

When products.manage is absent, omit Add, Edit, Delete, Sync to Kiosks and imported
eligibility actions. Render garment/jewellery type and Active/Inactive as text or
badges instead of disabled selectors/toggles. Keep View Stock & Pricing for users
with catalog viewing access, using values and a table instead of disabled inputs,
option actions, reason fields or Save. Managers retain the existing editors;
temporary saving/conflict states may disable visible controls. Dismiss editors
when permission is lost and hide stale actions after a server 403.

### BILLING-STORE-1 — Merchant usage tables (2026-10-21)

At /app/billing, Store users see a full-width Your Kiosks table with Kiosk, Looks
and Downloads columns. Hide Top Stores and the Client selector. Authorized
Platform-wide usage retains Top Stores and Top Kiosks, including the Store column;
a selected Store uses the single-table layout. Never render an AI provider/model
table. Do not request global usage before the current Store is resolved.

### AI-PRIVACY-1 — Remove AI vendor presentation (2026-10-21)

Remove Provider Usage and Provider/Model tables from Usage & Billing and Developer
/ API for every role. Retain existing SelfX totals and business breakdowns without
replacement vendor labels. Lab responses omit vendor/model/cost telemetry, and
result images do not navigate browsers to vendor CDNs. Show safe SelfX errors
while preserving useful image instructions. Jewellery catalog copy describes
ornament types and SelfX Try-On rather than provider routing. This supersedes
earlier Lab diagnostics and admin usage UI permission to display AI identities.
Payment gateway selection and Continue with Google are separate user-facing
integrations and keep their existing labels.

### APPS-1 / REGIONAL-1 — Apps sidebar and account settings (2026-10-21)

Platform Apps & Downloads is a top-level permission-filtered sidebar destination
at /app/apps-downloads, separate from Platform Settings. Show release cards with
version/code, architecture, file size, min SDK, notes, uploader (Platform only),
upload date, checksum, state and recommended badge. Managers see upload draft,
Publish, Set recommended and Retire; viewers see history and Download. Confirm
lifecycle changes and surface upload, validation, stale-state and download errors.
Keep drafts/retired releases out of the Store download page. Kiosks exposes a
Download Kiosk APK action to /app/kiosks/downloads with paginated published builds.
Account & Regional Settings is available through both shell account menus for all
staff users at /app/account: searchable timezone suggestions, empty = device
automatic, date/time format controls, live preview, Save, load failure Retry and
save feedback. Existing workspace timestamps use shared reactive formatting.

### NAV-ORDER-1 — Operational modules before configuration (2026-10-21)

Store navigation is Dashboard, Products, Kiosks, Try-On Lab, Integrations,
Team & Locations, User Management, Analytics, Activity, Usage & Billing, Settings,
filtered by current permissions and plan entitlements. Move Payment Settings
inside Settings; retain its /app/payments URL and existing access rules. Hide
Settings when none of its children is permitted. Platform users retain Stores
after Dashboard, Plans after the operational groups, Developer / API and their
separate Platform Settings group with Payment Gateways. This supersedes the
PAYMENTS-1D top-level Payment Settings placement.

### AUTH-UI-2A — Desktop login viewport fit (2026-10-21)

Use tighter desktop spacing around the logo, header, form and footer so the normal
login card fits the available browser height, including typical desktop display
scaling. Keep readable input/button sizes. Do not lock document overflow or hide
controls to remove a scrollbar: mobile, short windows, enlarged text and expanded
error/linking notices retain natural scrolling when the content needs it.

### AUTH-UI-2 — Compact login and shared workspace loading (2026-10-21)

Login uses one compact shadcn/SelfX card containing the logo, Welcome back,
short description, optional single-line demo selector and existing authentication
controls in AUTH-LOGIN-ORDER order. Remove redundant badges and security footer
rows. Use the SelfX primary action token and retain recovery, account creation,
legal/support links, password visibility, errors and Google linking notices.
Keep configured media, headline/body and two compact feature cards on desktop;
omit the extra bullet list and media badge. Mobile uses the login card alone.
The document scrolls naturally on short screens instead of a separate scrolling
login panel, and controls remain reachable with errors or enlarged text.

Full-page navigation, Google completion and session restoration use the shared
public @selfx/ui LoadingScreen, composed with the SelfX brand asset, centered card,
spinner, Loading workspace title and contextual status. Announce status politely
and respect reduced motion. Keep session-restoration failure recoverable through
Return to sign in; do not mask failures with indefinite progress. In-workspace
route loading retains the shell. Existing section skeletons, background refresh
and action/button loading remain local instead of covering the whole page.

### AUTH-LOGIN-ORDER — Email form before Google (2026-10-21)

Login shows the optional demo selector first, followed by email, password,
Forgot password and Sign in. When Google is available, place an Or divider and
Continue with Google after the email form, followed by Create account. Hide the
divider with Google when unavailable. Signup retains Google above its email form.
This supersedes the earlier above-form Google placement for Login only.

### AUTH-GOOGLE-1 / DEV-PLATFORM-1 (2026-10-20)

Show a shared Continue with Google button above the email form only when backend
configuration enables it. Support opening, disabled and recoverable error states.
Keep password login/signup, recovery and Shopify continuation. Explain matching
password authentication when Google linking is pending. After a successful Google
callback, restore the HttpOnly SelfX session on /auth/google/complete and resolve
the permitted destination; never expose tokens in the completion URL. A failed
session restore offers Return to sign in.

Remove Developer / API from Store navigation, Store role checkboxes and Store
permission bypasses. Direct page access shows a Platform-only explanation; backend
denial remains authoritative. Platform view/manage permissions control the console.

### PAYMENTS-1K — Available gateway cards without verification panel (2026-10-20)

Store Payment Settings shows only supported gateways marked Available to Stores.
Hide disabled and Coming soon/Planned cards and their configuration controls.
Summary counts reflect available gateways only. Show an explanatory empty state
when none are available. Preserve responsive logos, modes, historical Verified
status, setup/edit/delete dialogs and selection switches. Selected configured
accounts without historical verification show Configured rather than prompting
verification. Remove the INR 1 verification/history panel and post-save verify
instruction from this page. Platform administration retains every gateway and
its availability controls and testing workspace. This supersedes PAYMENTS-1J
Store visibility and separate verification-panel requirements.

### ROLES-2 — Global registry without Store controls (2026-10-19)

Keep the five-role registry on the left and the selected role's permission panel
on the right, stacking on mobile. Remove Store search, Store selector, pagination
and Manage Store permission limit. Keep a clear orange selected border and small
Platform/Store labels. The permission search bar, grouped checkboxes, Select all,
Clear, required/read-only states and Save permissions remain. Explicitly state
that Store role saves apply across all Stores while membership and plans still
restrict data/features. Merchant viewers cannot edit global roles or see global
assigned-user counts. Preserve failed drafts and stale-save guidance. This
supersedes ROLES-1 Store controls and per-Store scope wording.

### PAYMENTS-1J — Aligned gateway identity and compact status

Align the provider logo left and group its name, description and compact wrapping
badges on the right. Supported configured gateways show Live mode, Test mode or
Mode unconfirmed, plus Verified, Needs verification or Off. Disabled/unselected
configured gateways show Off. Unconfigured supported gateways show Needs setup;
unsupported gateways show Planned only. Verified means account verification,
never checkout readiness: customer checkout remains unavailable. Keep Edit/Delete,
the selection switch and separate verification/history. Align Edit then Delete
at the bottom-right of the card footer with consistent spacing and padding.
Mobile logos narrow to
leave space for text; no horizontal overflow. This supersedes PAYMENTS-1I's removal
of mode/status badges while keeping its other simplifications.

### PAYMENTS-1I — Provider logos and account dialog

Supersedes PAYMENTS-1H card badges and two-column modal presentation. Use large
local provider logos with names/descriptions, planned badges where applicable,
selection switch and only Edit/Delete for configured gateways. Remove redundant
Live/Verified labels and Verify payment from cards; keep verification below.
Both Set up and Edit use a provider-logo header, scrollable single-column Account
details body and fixed Cancel/Save gateway footer. Maintain responsive viewport
bounds. Secret presence uses an eight-dot placeholder plus a replacement hint;
the controlled field value remains empty until typed. SMTP and user-password
edits use the same presence convention. Eye buttons reveal only typed passwords
and are unavailable with no typed value; Salt Keys have no eye. New setup shows
no saved-secret placeholder. Do not add unsupported payment-account fields.

### PAYMENTS-1H — Gateway management cards and Edit modal

Use shared Card/Badge/Switch/StatCard and Dialog primitives. Show a compact gateway
brand mark, description, configuration/verification state and Test/Live badge.
Unconfigured gateways have Set up; configured supported gateways have Edit,
Delete configuration and Verify payment. The future-checkout switch automatically
saves selection; it does not enable customer checkout. Planned methods remain
informational. Show configured, turned-on and live-verified account counts.

Edit uses a responsive 3xl modal, two columns on desktop and one on mobile, with
prefilled non-secret fields, empty optional Salt Key and persistent save/cancel
actions. Clear entered secrets after failed submissions. Deletion has explicit
confirmation and recoverable errors. Disable concurrent page operations while
dialogs/actions are active. Credential changes reset current verification;
unchanged edits preserve it. Keep QR verification/history accessible and show Live
account verified instead of Ready for checkout. Platform testing remains separate.

### PAYMENTS-1G — Production QR labels and readiness

For saved production accounts, show Generate INR 1 live verification QR and an
inline real-money explanation. Do not require the UAT access dropdown for this
action. Show missing SelfX execution/production-connection/callback prerequisites
and disable Generate until ready. Production popup, QR alternative text, result
and history environment labels distinguish real payments from UAT. Derive result
labels from the opened record, not the current configuration. Display Live
verification passed after independent success; customer checkout remains disabled.
Reuse the shared popup, active-test reopening, expiry and diagnostic behavior.

### PAYMENTS-1F — Expiry-aware Generate action

Keep Generate enabled when the account is ready and no operation is in flight.
If the current configuration has an unexpired unresolved test, Generate opens it.
Once its five-minute QR deadline passes, Generate creates a fresh test without a
page reload. Use API time to account for browser clock differences. Explain that
expired tests remain in history and continue checking for delayed payment. This
supersedes the earlier indefinite pending/uncertain test block in the test UI.

### PAYMENTS-1E — Store QR test popup

Use public @selfx/ui Dialog components with a responsive desktop width up to the
shared 3xl utility and viewport-bounded scrolling. Show Generating/Open progress
before the API resolves, then the shared result view. Block duplicate clicks and
dismissal during in-flight actions. Show a server-time-based countdown and remove
expired or terminal-state QRs. Present initialization and latest status-check
guidance, diagnostic references, test id and callback status. Keep failure/retry
inside the popup; uncertain retries reuse the request key. Open test reuses that
dialog, without adding a second popup. Viewing-only accounts retain safe history
and cannot open QR details or execute tests. This supersedes Store inline result
placement, while platform testing retains its existing single dialog.

### ROLES-1 — Unified Roles page

Keep /app/roles under User Management. Use one left-hand Role Registry for all
five role types, without separate Platform/Store tabs, and show the selected
role's grouped permission checkboxes on the right (stacked on narrow screens).
Use a clear selected border/highlight and small Platform/Store scope labels.
Show Platform roles only to authorized platform viewers; Store accounts see
their accessible Store roles. Provide searchable,
paginated active Store selection and keep the selected Store visibly labelled
while browsing other pages. Render protected/read-only states, role scope,
assigned-user count, grouped searchable permission checkboxes, bulk selection
within delegation limits and Save permissions. Clearly mark required Admin
permissions and permissions unavailable within the Store limit.

Superadmin alone sees Manage Store permission limit, separate from the five role
types. Disable saves while loading/in flight, keep failed drafts visible and show
stale-save guidance. Refresh the role view and current navigation authority after
saving. Store Roles navigation requires actual roles.view or explicit platform
viewing/management permission; a generic Store platform bypass is insufficient.
Use public @selfx/ui components and accessible checkbox labels/descriptions.

After sign-in, validate the saved return destination against the newly signed-in
account's server-resolved navigation permissions and entitlements. Fall back to
/app/dashboard for inaccessible destinations (including Store-only /app/payments
for Platform accounts). Preserve permitted return paths, queries and fragments,
including the separately authorized Shopify installation approval continuation.

### PAYMENTS-1D — Store Payment Settings navigation and verification

Show Payment Settings directly in Store sidebar when server-resolved
paymentAccess.view is true. Empty setup still has a menu. Platform mode does not
show this merchant destination. Resolve the current Store automatically; explicit
Store detail links use the same page and permission policy. Credential/selection
controls appear only with paymentAccess.manage and outside impersonation.

Show Not configured, Configured/Not tested, Test pending, Confirmation pending,
Test failed or Test passed alongside Live payments: Not enabled. Show missing UAT
access, API execution/callback prerequisites and disabled platform availability
with clear guidance. A separate Store verification panel provides Generate INR
1.00 test QR, Refresh verification, recent tests and Open test. Shared result UI
shows QR, status, callback receipt, deadlines and provider status-check action.
Only Admin management access exposes QR/start/check controls. Read-only viewers
see safe history. Pending/uncertain tests block another start for that version.

### KIOSK-STORE-1 — Merchant-only resource UI

Hide Products/Kiosks and their operational metrics from platform navigation and
screens; block direct merchant routes in platform mode. In Store mode use actual
membership resource permissions, not platformBypass. Show permitted menus for
empty Stores; Kiosks retains plan feature visibility rules. Pairing asks for code
and name in one popup. Configuration uses the same Store-scoped API and existing
configuration controls, with no platform/Store assignment selector. Name changes
require kiosks.update. Confirm unpair/removal. Show clear access/API errors and
disable mutations while busy. Store detail product links, kiosk table, pairing
and configuration actions require actual Store permissions.

### CATALOG-STORE-1 — Store Products menu

Show Products with Garments and Jewellery children only in an authorized Store
workspace. Visibility does not depend on product counts, kiosk entitlements or
location limits. Wait for Store context before mounting the catalog and show a
clear access error if absent. Each destination opens its vertical using the
shared Store product component; the merchant back action opens Dashboard.
Preserve search, pagination, imported-product controls, uploads, stock and product
dialogs. Disable edit actions without products.manage. Remove standalone platform
catalog UI and retired product permission choices from platform Roles/Users.


### USERS-4 — Inline first-admin creation

Show Create new account only after linked Admin discovery succeeds with zero
results. Expand full name, new login email and masked password in the existing
Edit Store popup; support password show/hide. Creation and assignment panels
are mutually exclusive. Clear password on cancel, panel switch and API outcome.
Keep errors and non-secret drafts visible, and offer existing-account lookup on
email conflict. Lock account controls and parent popup actions during mutation.
After success refresh current Admin discovery. Ordinary Store admins cannot see
these account creation controls.


### USERS-3 — Single Edit Store popup

Edit Store includes a Superadmin-only Store Admin account section with a
paginated linked-admin selector, login email input, save action and session/reset
notice. Shared accounts list other Store names and require acknowledging the
account-wide change. Existing-account assignment expands inline with paginated
server search, an account selector and exact Store-name confirmation. No second
popup is opened. The content scrolls within the viewport and the footer remains
visible. Loading/errors, protected accounts and busy controls are explicit.


### USERS-2 — User Management and deletion confirmations

Navigation shows User Management -> Users, Roles and Permissions. Users retain
their login identity and separate Platform/Store access. Current, deleted and
all-user filters are server-side. Deleted rows show `Name (Deleted user)` plus
the original email and disabled editing. Deletion history is paginated.

Superadmin Delete opens one confirmation dialog requiring the login email; the
Store Staff list uses the same dialog for authorized Staff removal. Errors keep
the dialog open. Protected, current-user and peer-admin deletion is guarded.
Store role selectors expose Store Admin and Staff only; ordinary Platform role
selectors expose Platform Admin and Platform Staff. Superadmin stays protected.
The explicit first-admin repair action retains the existing controlled API.

Stores distinguish Archive from Delete permanently. Only Superadmin sees the
permanent-delete action; its dialog requires exact Store-name confirmation and
describes permanent business-data removal, exclusive-user removal, retained audit
snapshots and revoked/unassigned physical kiosks. Archived Stores can be filtered.


### USERS-1 — `/app/users`

Navigation and heading say Users. The shared table shows name/login email,
account status, platform access, Store access and account creation date. Search,
status/access/role/Store filters and 25/50/100-row pagination run server-side.
Superadmin Edit opens a single scrollable modal with a persistent action footer:
name, login email, blank optional new password, account status, dynamic platform
roles and separate Store membership rows. Password visibility is optional;
failed submissions clear the password. Owner and inactive Store links are
read-only; a separate first-owner section requires exact Store-name confirmation
and no unsaved ordinary edits. Errors keep the modal open. Protected Superadmin
Edit is disabled. Other authorized platform readers see a read-only table.

### MAIL-1 — Mail Settings and recovery pages

Platform Settings contains General Settings and Mail Settings as direct siblings.
/app/platform/mail-settings uses @selfx/ui controls for host, port, TLS/STARTTLS,
username, write-only password, sender name/email, optional reply-to and outgoing
email switch. Save clears the entered secret on success/failure. Test email uses
saved settings; unsaved edits disable testing. Loading, forbidden, missing-key,
stale-save and SMTP failure states are explicit. Navigation is Superadmin-only.

/forgot-password collects login email and displays generic acknowledgement.
/reset-password reads the fragment once, removes it from the address bar, retains
it only in component memory and requires matching 12–256 character passwords.
Success clears inputs/local session and offers ordinary sign-in. Recovery pages
are not indexed and include no external analytics/media or automatic login.

### PAYG-1 — Pay-as-you-go plan and usage screens

The shared plan editor offers Monthly plan with credits or Pay as you go
(postpaid). Billing mode is fixed after creation; a different mode requires an
explicitly assigned new plan. Postpaid forms collect a positive price per credit
and omit allowance/trial/credit-pack controls. Plan cards, onboarding and Change
plan show per-credit postpaid terms. Store detail and billing replace remaining
balance warnings with current-cycle usage, historical credits included, rate,
estimated generation charges and explicit UTC dates. Estimates are labeled as
estimates, with invoices unavailable in PAYG-1. Platform pricing permission and
server-validated Store scope continue to control access.

### PAYMENTS-1C — Platform gateway cards and test workspace

Use compact shared cards with provider marks, availability/test badges, an
accessible Available to Stores switch and Set up & test. Planned connectors show
Coming soon with disabled controls. Refresh is a compact toolbar action.
The PhonePe workspace uses one wide dialog for credentials, execution/callback
readiness, QR/results and collapsible recent test history. With no saved account,
show credential inputs immediately: two columns on desktop, one on mobile.
After save, collapse inputs to a saved-status summary; Replace credentials reopens
blank fields inline. Shared fields require full replacement, clear the Salt Key
after save attempts, and discard unsaved values on cancel/close. Never offer live
mode for platform testing. Prevent dismissal and competing actions while a save
or explicit status check runs. A fixed INR 1.00 test shows its QR/result inline in
the same dialog, refreshes safe status and provides an explicit provider status
check. Show callback receipt independently from Test passed. Do not show passed
merely after credentials save or QR creation.
Pending/conflicting tests block another start; expired QR does not imply failure.
Read-only viewers receive history without QR/setup/check actions. Omit platform
default checkout and shared-account toggles: Stores always use their own account.

### PAYMENTS-1B — Payment visibility in Store orders

Orders & Tax filters include Payment confirmation pending, Paid and Paid — staff
action needed. Detail shows bounded payment attempt summaries, test labels,
amount/currency, provider reference and safe failure/recovery guidance. Hide unpaid
cancellation for pending/paid orders. After hold expiry, explain that confirmation
is still pending while the stock hold expired; do not display failure or expired
order solely from the countdown. Check payment status is permission-dependent.
Paid stock issues show Retry stock allocation for authorized editors; read-only
staff can inspect. Duplicate-payment guidance remains separate from stock recovery.
No QR is shown in staff order history and no arbitrary Mark paid control exists.

PhonePe setup adds a shared SelectMenu for explicit UAT Dynamic QR access
confirmation, defaulting to unconfirmed on every full credential replacement.
This declaration does not mark provider verification complete or enable production.
The server-side test execution switch remains independent. APK Buy and payment
screens remain unchanged pending merchant/simulator acceptance testing.

### PAYMENTS-1A — Gateway availability and Store Payments

Platform page `/app/platform/payment-gateways` shows gateway cards, setup
availability and enable/disable actions for authorized platform administrators.
PhonePe setup is available; planned gateways have disabled setup controls.
Store page `/app/stores/:storeId/payments` is linked from its dashboard for
authorized integration viewers. It shows saved environment, unverified status
and the gateway selected for future checkout. Shared @selfx/ui controls are used.

Configure/Replace PhonePe opens Merchant ID, optional Provider ID, optional
merchant-side Store reference, Salt Index, masked Salt Key and environment.
Environment defaults to Not confirmed yet. Blank Store reference generates a
stable SelfX Store reference. Saving replaces all credentials; no previous
values are loaded. Clear the Salt Key after submission and unmount on close.
Loading, empty setup, error, refresh, save success, read-only and stale-version
states are explicit. Setup/selection must never show payment-ready success.
APK screens and Buy remain unchanged in this stage.

### SHOPPING-2 — Orders & Tax

The Store dashboard links to `/app/stores/:storeId/shopping`. It uses shared SelfX
page/card/table/dialog primitives. Tax settings offer No tax, Tax included in product
price and Add tax to product price, with a default percentage. Stock & Pricing
adds an optional product tax percentage override and on-hand/reserved/available totals.

Order history has reference search, status filtering, pagination, refresh,
loading/error/empty states and View order. The detail dialog shows original item
labels, options, quantities, unit prices, tax rates/amounts and totals; a countdown
uses server time. Cancel unpaid order requires a reason and update permission.
The expired display is applied at the deadline without waiting for the background
sweep. Read-only staff can inspect but cannot change tax or cancel orders.

Payments and collection are explicitly unavailable; there is no Mark paid control.
APK Buy buttons remain disabled and the Flutter customer/cart UI is deferred by
the owner's explicit backend/dashboard-first decision.

### SHOPPING-1 — Stock & Pricing panel

The Store Products list exposes Stock & Pricing per product. A shared SelfX dialog
loads current backend values with loading, error/retry and read-only permission states.
It offers option mode, pricing mode, size/colour labels, non-negative whole quantities,
optional variant prices, availability labels and a required change reason. No-option
products use one Standard row. Rows are bounded at 100; individual unavailable
rows show Out of stock. Base price/currency are edited through Edit Product.

The panel explains Store-shared stock, continued Try-On at zero stock, unconfigured
stock and inherited pricing. Saves stay open with confirmation and updated totals.
Concurrent-edit conflicts block further saves until staff explicitly discard edits
and reload. Removed options are archived; constant pricing clears saved overrides.
Narrow screens scroll the options table and short windows scroll the dialog.
Imported products display an external-shop management explanation. Existing kiosk
Buy buttons remain disabled; no buying/payment screen is part of this milestone.

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

# SelfX Virtual Try-On

## UI/UX Flow & Screen Specification

**Version:** 1.0  
**Status:** APPROVED BASELINE  
**Document:** `04-UI-UX-FLOW.md`

---

## STORE-1 UI Addendum

**Status:** UPDATED

New admin product surfaces must present:

```text
SelfX Platform
→ Store
→ Kiosks
```

### `/app/stores` — Store Directory

- Stores is a direct sidebar destination with no submenu. Current Store
  onboarding is immediate, so no separate Onboarding Status item is shown.
- Page title: Stores.
- Primary action: Add Store.
- Add Store navigates to `/app/stores/create`, not a popup.
- Store results use responsive cards rather than table rows.
- Each card shows Store name, slug, status, kiosk totals, active/offline kiosk
  counts, owner/contact email, location, last activity and created date.
- Card actions use compact icon buttons for View Store, Suspend/Reactivate,
  Impersonate owner and Delete. Impersonation remains disabled until the
  approved impersonation backend flow exists. Delete remains protected by
  inactive-Store and confirmation rules.
- Search covers Store name and slug.
- Status filter supports All Stores, Active and Inactive.
- Empty state explains that a Store is required before pairing/managing SelfX
  kiosks.

### `/app/stores/create` - Create Store

- Use a medium-width workspace with three compact bordered form cards: Store
  name, Plan and Owner account. A read-only onboarding summary sits beside
  them on desktop and below them on narrow screens. It reflects the Store
  name, selected plan, owner and login email live, but never shows passwords.
- Only Store name is collected for the Store. The server generates the slug and
  applies its default timezone; optional profile fields can be edited later.
- Active plans appear as selectable tabs, with the selected plan's current
  monthly price, credits and supported location limits shown beneath. Do not
  invent yearly prices or trial overrides.
- Owner fields: name, login email, password and confirmation; password visibility
  uses a named icon button.
- Cancel and Create Store are bottom-right; duplicate submits are blocked.
- Creation is one transaction, followed by navigation to View Store. Existing
  email, unavailable plan and validation failures stay on the form for correction.
- Creation requires platform STORES_CREATE and PRICING_MANAGE permissions.
- Current Store creation and Shopify self-service signup do not require separate
  activation, superseding older pending-activation UI rules for these paths.
  Legacy organization-application review and suspension controls remain unchanged.

### `/app/stores/[storeId]` — Store Dashboard

- Page title is the Store name.
- Header actions include Stores, Refresh and Pair Kiosk.
- Summary metrics show total kiosks, active kiosks, last activity and
  configurable kiosk count.
- Plan usage is read-only and shows the current plan, total credit allocation,
  consumed credits, remaining credits and current period end. Manual credit
  top-ups and credit-ledger administration are not part of Store detail.
- Store Kiosks table lists device, status, platform/app version, latest
  configuration version, last seen and Manage action.
- Store Settings shows profile details plus Edit Store and Activate/
  Deactivate actions.
- Pair Kiosk from this page assigns the kiosk to the current Store without
  asking for a legacy Organization or child Store.
- Manage configuration opens the existing KIOSK-6A/KIOSK-6B kiosk
  configuration dialog through nested Store routes.
- Store Permissions, Store Users and Store Roles are not shown on the Store
  dashboard. Store detail should remain focused on Store profile, kiosk fleet
  and runtime operations.

Visible product copy on these screens should say Store/Stores/Store Dashboard/
Store Kiosks. Organization terminology is allowed only as an internal
diagnostic or implementation detail outside normal product copy.

### `/app/locations` — Store Locations

- Store users see a Team & locations navigation group with Locations and Staff
  only when their active Store plan includes at least one location or a custom
  unlimited location allowance.
- Locations shows the current Store's primary/default location and compares
  active locations against the Store's pricing-plan location allowance.
- If the location allowance is exhausted or zero, the page shows a clear
  upgrade prompt linking to plans/billing.
- Store staff and Store role management are also locked when the plan has a
  zero location allowance; platform staff management remains a separate
  SelfX-admin function.
- Until dedicated persisted branch/location records are approved, the default
  location is derived from the Store profile and Store-level kiosk count.

---

## RBAC-1 UI Addendum

**Status:** UPDATED

Store-scoped access control uses dedicated RBAC views rather than inline Store
dashboard sections:

- Store Users: list existing Store memberships, membership status, assigned
  Store roles and actions to add an existing user, edit assigned roles, activate
  or suspend the membership.
- Store Roles: list system and custom Store roles, permission counts, assigned
  user counts and actions to create, edit or delete eligible custom roles.

System roles are visually readable but protected from permission editing and
deletion. Role forms group permission checkboxes by module using backend
permission codes. If an email is not an existing SelfX user, the UI must surface
the deferred invitation state rather than pretending an invitation was sent.

Store dashboard actions must be capability-aware: missing Store permissions hide
or disable kiosk configuration and Store mutation controls. This is only a UX
affordance; every protected action must still be enforced by the API. Store user
screens must not expose protected platform or Superadmin controls.

---

## RBAC-2 UI Addendum

**Status:** UPDATED

Access Control appears as a global SaaS navigation group with:

- Permissions: read-only global permission registry with code, module, action
  and applicability.
- Platform Roles: configurable global SelfX Platform roles and their
  Platform-applicable permission maps.
- Platform Users: existing SelfX users and configurable Platform role
  assignments. Protected bootstrap Superadmins are shown as protected and are
  not editable through this screen.

Dedicated Store access-control views show Store Permissions, the SelfX-granted
permission ceiling for that Store. Store users can see granted/unavailable
permissions when authorized. Superadmin users may update Store grants. Store
role forms must disable permissions that are unavailable to the Store and must
not allow a Store role to delegate a permission outside the current ceiling.

---

## 1. Purpose

This document defines the screen-level UI/UX flow for the SelfX Virtual Try-On platform.

It converts the approved product requirements and user journeys into:

- application areas;
- screens;
- navigation;
- user actions;
- loading/empty/error states;
- permission-aware behavior;
- responsive behavior;
- shared interaction conventions.

This document does not define database tables, API schemas, or implementation order.

Those belong in:

- `05-DATABASE-SCHEMA.md`
- `06-IMPLEMENTATION-PLAN.md`

---

## 2. UI/UX Principles

All SelfX interfaces should follow these principles:

- Clear primary action on every screen.
- Minimal friction in Try-On flows.
- Consistent status language across web, kiosk, mobile, Shopify, and WooCommerce.
- No raw AI-provider terminology in customer-facing interfaces.
- Permission-aware UI that hides or disables actions users cannot perform.
- Server-side authorization remains authoritative even when UI hides controls.
- Sensitive customer images must never appear outside approved contexts.
- Shared design language across SelfX-owned interfaces.
- Merchant-embedded Try-On may inherit merchant branding while preserving SelfX interaction patterns.
- Loading, empty, offline, suspended, permission-denied, and failure states must be designed intentionally.

---

## 3. SelfX Design System

### Web Foundation

- Next.js
- shadcn/ui as the primary SelfX web UI/component framework
- Tailwind CSS
- Mantine or another UI toolkit only by explicit user request
- shared SelfX UI package/design tokens

### Phase 4 Web Implementation

The web design-system implementation lives in `packages/ui`.

SELFX-UI-MIGRATION-1 makes shadcn/ui the primary implementation of the SelfX
web design language.
`packages/ui` owns:

```text
packages/ui/src/components
packages/ui/src/selfx
packages/ui/src/styles/globals.css
```

Centralized SelfX semantic tokens define common colors, typography, spacing,
radii, shadows, focus behavior and component defaults. The tokens include
`--selfx-primary`, `--selfx-primary-hover`, `--selfx-primary-pressed` and
`--selfx-on-primary` so future organization white-labeling can override
branding safely.

shadcn/ui is configured for the monorepo through:

```text
frontend/web/components.json
packages/ui/components.json
```

shadcn/ui is the default choice for app shell, navigation, common controls,
forms, cards, state views and normal admin UI. Future Mantine or external UI
toolkit use requires an explicit user request.

Tailwind CSS remains secondary utility/layout infrastructure and compatibility
support. It must not become a parallel component design system.

Application-specific shell composition lives in `frontend/web`, while reusable
web primitives and SelfX shell/state components live in `packages/ui`.

The Phase 4 route shell reserves documented navigation areas without
implementing their business workflows.

SELFX-UI-MIGRATION-1.1 current screen status:

- `/`, `/login`, authenticated app shell/header/sidebar/account controls,
  `/app/dashboard`, placeholder module routes and organization/access state
  routes and `/app/try-on-lab` use Shadcn-first SelfX components and semantic
  tokens.
- Frontend consumers must import public components and types from `@selfx/ui`
  rather than private `@selfx/ui/selfx/*` source-tree paths.
- Mantine runtime usage is retired from current web/UI source.
- Future SaaS modules must start from the Shadcn-first SelfX web patterns.

### CORE VTO-1 Try-On Lab UI

The internal development route `/app/try-on-lab` is available to authenticated
Platform users and authenticated users with any active Store role. It remains a
guarded workflow page for testing the core person-image plus garment-image VTO
loop before Product Catalog and production VTO infrastructure.

The lab screen uses the shared Phase 4 layout primitives:

```text
PageContainer
→ PageHeader
→ PageSection
→ SectionCard
```

Main screen areas:

- truthful Inputs needed, Checking images, Ready to run, Creating Try-On,
  Completed or Failed status near the page heading;
- one responsive Inputs workspace with person and garment upload/preview panels;
- OpenCV.js quality preflight results inside each image panel;
- a capture-guidance band using normal SelfX language;
- optional ambiguity modal when the garment image appears to contain multiple
  clothing areas;
- Generate Try-On and New Try-On actions at the end of the Inputs workspace;
- a compact action-level reminder that the tester must be authorized to use the
  selected images;
- a separate responsive Try-On Result rail for idle, processing, failed and
  completed output states;
- the two source previews remain beside the generated result on wide screens,
  providing a compact comparison without a second full-width result section;
- Try Another Garment and New Try-On actions.

OpenCV.js must be lazy-loaded only when this lab is used. UI quality messages
must use normal SelfX language such as resolution, exposure, contrast and blur
warnings, not raw OpenCV terminology.

Uploaded-image preflight uses three user-facing states:

- `PASS` — technically valid and no significant detected quality concern.
- `WARNING` — technically valid, but quality may reduce Try-On result quality.
  The tester may re-upload or proceed anyway.
- `BLOCKED` — technically invalid, unsafe or unusable. The tester cannot
  generate until the input is replaced.

Technical validation remains blocking for invalid files, unsupported formats,
corrupt/undecodable images, unsafe MIME/signature mismatches, hard size limits
and invalid/zero dimensions. Quality concerns such as blur, low brightness,
overexposure, low contrast, low resolution, unusual framing, person framing and
garment framing are advisory for uploaded images.

If OpenCV analysis fails after the upload is technically valid, the UI must show
an advisory analysis-unavailable warning and unavailable/null metrics rather
than fake `0x0`, sharpness `0`, brightness `0` or contrast `0` metrics.

When Generate Try-On is pressed with one or more warnings, show a SelfX
confirmation dialog titled "Image quality warning". The dialog groups issues
under "Person photo" and "Garment photo" and offers:

- Re-upload — close the modal so the tester can replace inputs.
- Proceed anyway — continue through the existing SelfX API to provider flow.

Proceed-anyway confirmation applies only to the current unchanged input state.
Changing either image recalculates warnings and resets the warning override.
If both images pass, Generate Try-On proceeds without the warning modal.

CORE VTO-1.2 removes default visible garment category, garment photo type and
generation profile controls from the normal Lab workflow. SelfX resolves those
settings automatically. Direct-upload garment images may be analyzed with a
lazy-loaded browser-only pose/body-coverage analyzer to infer no-person,
upper-body on-model, lower-body on-model, full-body on-model or unknown. The
analysis is advisory and provider-neutral; it does not identify the exact
garment, classify fashion attributes or perform biometrics.

If the garment image appears full-body/on-model and therefore ambiguous, show a
SelfX dialog titled "We found multiple clothing areas in this image.
Which item would you like to try on?" The choices are:

- Upper garment — shirts, tops, jackets and similar upper-body items.
- Lower garment — pants, skirts, shorts and similar lower-body items.
- One-piece — dresses, jumpsuits and single garments covering both areas.
- Full outfit — use the complete outfit shown in the reference image.

The selected disambiguation intent is retained for the unchanged garment image.
Replacing the garment image clears stale analysis, disambiguation and internal
override state. FULL_OUTFIT is a provider-neutral intent distinct from
ONE_PIECE.

The internal Lab does not use a customer-style consent checkbox. A compact
authorized-use reminder remains beside the generation action because this is a
guarded staff/development tool. Automatic policy resolution remains internal and
is not exposed through a settings summary or Advanced settings controls.
Customer web, mobile and kiosk experiences still require consent before camera
access, customer photo upload or AI processing.

Upload cards should stay compact. On desktop, person and garment cards appear
side-by-side with consistent dimensions and image previews approximately
260-320px high where practical. Images use `object-fit: contain` and preserve
aspect ratio. On mobile, upload cards stack vertically.

Completed result comparison keeps three panels on desktop: Person, Garment and
Generated Try-On. Tablet and mobile layouts may stack responsively. Clicking an
image opens a larger SelfX dialog preview. No before/after slider is included
in CORE VTO-1.1.

After a run, the default Lab view prioritizes the result and source-image
comparison. The normal Lab interface does not disclose provider identity,
model names, request identifiers, timestamps, raw failure codes or provider
telemetry. Operational telemetry remains available to authorized backend
logging and diagnostics rather than being displayed in this workflow.

Try Another Garment preserves the person image and clears garment, garment
quality, prior result and run state. New Try-On clears person, garment, result,
warning overrides and run state. Blob URL cleanup must remain correct.

CORE VTO-1.1 exposes only safe current-run telemetry in the Lab UI. It does not
build a production analytics dashboard or fake aggregate analytics from the
temporary in-memory registry. Durable telemetry persistence waits for the
production TryOnRun/ProviderAttempt/storage phase.

OpenCV's primary future production role is live camera/capture quality guidance.
Kiosk/live capture may use OpenCV more strictly because SelfX can guide the user
before taking the photo. CORE VTO-1 does not implement live camera, WebRTC,
pose/body-landmark capture readiness or kiosk functionality.

This screen must not expose FASHN prediction IDs, provider credentials, raw
provider stack traces or durable production consent claims.

### Flutter Foundation

- Flutter-native components
- same SelfX typography, spacing, status semantics, and interaction hierarchy

### KIOSK-1 Windows Camera Foundation UI

The KIOSK-1 Flutter kiosk app uses four local development screens:

- `KioskHomeScreen` — minimal SelfX kiosk development home with **Start Camera
  Test** and **Camera Settings** actions, clearly marked as KIOSK-1 foundation.
- `CameraCaptureScreen` — large camera preview, current camera status, static
  framing guide, large touch-friendly **Capture** action, initialization,
  unavailable, permission/error and retry states.
- `CaptureReviewScreen` — captured image, quality summary, **Retake** and
  **Use Photo**. **Use Photo** only accepts the local capture into the
  development session and never submits to FASHN or SelfX Try-On APIs.
- `CameraSettingsScreen` — detected cameras, preferred camera, connection
  status, preview, basic capabilities, **Refresh Cameras** and **Test Camera**.

KIOSK-1 capture guidance is static:

- `TOP` -> upper/full body guidance.
- `BOTTOM` -> lower/full body guidance.
- `ONE_PIECE` -> full body guidance.
- `AUTO` -> full body recommended.

The UI must not claim live body detection, pose detection, garment
classification or automatic full/upper/lower detection in KIOSK-1.

Quality UI uses SelfX-friendly language and the same core states as the web
lab: `PASS`, `WARNING` and `BLOCKED`.
Warnings such as blur, dark lighting, overexposure, low contrast and low
resolution are advisory in KIOSK-1 and normally allow **Use Photo**.
Genuine technical invalidity blocks **Use Photo**.
OpenCV analysis failure must appear as an advisory unavailable-analysis warning
with unavailable metrics rather than fake zero metrics.

Temporary captures are local only.
Retake/session reset should clear old captures where practical.
The kiosk app must not show product selection, customer consent, AI generation,
QR handoff, provider identifiers or direct FASHN actions in KIOSK-1.

### KIOSK-1.5 Android Primary Kiosk UI

KIOSK-1.5 keeps the same local development screens and makes them
multi-platform:

- Android is the primary commercial kiosk display target.
- Windows remains supported for Windows kiosks and desktop camera testing.
- The app remains one Flutter application under `kiosk`.
- Android commercial kiosk screens are portrait-first for SelfX's current
  32-inch and 42-inch vertically mounted displays, while Windows remains
  responsive in both portrait and landscape windows.
- Screens adapt from logical viewport dimensions and aspect ratio rather than
  hardcoded physical inch sizes or one Windows resolution.
- Camera Settings must handle long hardware names without horizontal overflow.
- Capture, Review and Settings screens should collapse from wide two-column
  layouts into scrollable stacked layouts on constrained windows or smaller
  displays.
- Dropdowns should use expanded/ellipsis behavior for long camera names.
- Android immersive/fullscreen presentation is appropriate for kiosk
  foundation testing, while operator/development escape remains available.
- Production lock-task/device-owner/dedicated-device UX and remote fleet
  controls are deferred.

Android camera UX:

- Camera access is requested through the platform camera flow.
- The UI must distinguish camera unavailable, permission denied, permission
  blocked/permanently denied and recoverable camera errors in SelfX-friendly
  language.
- Camera Settings remains common across Android and Windows and may show
  platform diagnostics such as CameraX or `camera_windows` only in the
  operator/development context.
- Integrated and external cameras are displayed as normal camera options when
  the platform exposes them.
- Operator Camera Settings includes Camera Orientation: Auto, 0, 90, 180 and
  270 degrees. The control is local-only, updates the bounded preview
  immediately, remains available for connected external cameras even when
  sensor orientation metadata is unknown or unreliable, and is never shown in
  customer capture.
- Camera previews preserve source/effective aspect ratio with contained
  letterboxed framing in portrait viewports. A landscape camera buffer must not
  be stretched or cropped into a portrait camera area.

Quality UX remains the KIOSK-1 still-capture flow. Whole-frame brightness is
only an initial quality signal because bright backgrounds can mask a backlit
person. Subject-aware exposure/backlight readiness belongs to KIOSK-2.

### KIOSK-1.6 Assisted Capture UI

KIOSK-1.6 replaces instant customer capture with an assisted customer capture
flow shared by Android and Windows.

Commercial display baseline:

- SelfX currently deploys/rents primarily 32-inch and 42-inch vertically
  mounted kiosks;
- Android kiosk UX is portrait-first;
- Windows desktop/kiosk operation remains responsive across portrait and
  landscape windows;
- physical inch size is not hardcoded into layout behavior.

Customer camera screen:

- primary action is **Take Photo**;
- no instant customer **Capture Now** control is shown;
- live camera preview remains visible during countdown;
- portrait composition prioritizes SelfX header/status, a large/tall live
  preview, standing full-body framing, minimal text and lower-region touch
  controls;
- the camera preview is reserved for customer image, static framing and future
  camera-specific overlays;
- `CaptureGuidancePanel` renders countdown/customer guidance outside the
  preview, below it in portrait layouts and beside it in wide layouts;
- countdown guidance uses a very large number, clear instruction text, final
  3/2/1 emphasis, lightweight scale/fade animation and a prominent **Cancel**
  action;
- guidance text is scripted and instructional only, such as "Step into
  position", "Move to a comfortable distance from the kiosk", "Face the camera
  and center yourself" and "Hold still";
- guidance must not say "ready", "detected", "perfect position", "lighting is
  good" or similar live-analysis claims.

Local Camera/Operator Settings include a Capture Experience section:

- Countdown: 5 seconds, 10 seconds or 15 seconds; default 5 seconds;
- Capture sounds: On/Off; default On;
- Sound profile: Soft, Classic, Digital or Minimal; default Soft;
- Preview Sound: operator-only local audio preview.

Customers do not choose countdown duration during each capture session.
Customers do not choose sound profiles during capture. Countdown, shutter and
capture-success sounds require no microphone permission. Sound failure falls
back to silent capture without blocking the customer flow. Capture-success audio
plays only after still capture succeeds.

Capture state UI:

- preparing/countdown keeps the preview visible with guidance outside the
  preview;
- capturing shows a brief "Capturing..." state;
- analyzing shows "Checking your photo..." and refers only to still-image
  technical/quality processing, not AI body analysis;
- review shows captured image, quality summary, **Retake** and **Use Photo**;
- Photo Ready shows "Your photo is ready for this Try-On session" with
  **Retake** and **Continue**;
- Continue shows the temporary local-session placeholder until garment
  selection and production Try-On submission are implemented.

Quality behavior remains SelfX-friendly:

- technical invalidity can block **Use Photo**;
- warnings such as blur, exposure, contrast, low resolution and analysis
  unavailable are advisory and allow **Retake** or **Use Photo**;
- temporary captures remain local and are cleaned on retake/replacement/session
  reset where practical.

KIOSK-1.6 does not implement MediaPipe, live OpenCV readiness, person or
multiple-person detection, body coverage, subject-aware exposure, distance
estimation, product/catalog selection, QR handoff, SelfX API upload or provider
generation.

The portrait capture canvas should remain suitable for future KIOSK-2 overlays
such as shoulders/hips/knees/ankles guides, full-body coverage, move-back
guidance, subject-lighting warnings and multi-person warnings, without claiming
those capabilities in KIOSK-1.6.

### KIOSK-2A Live Capture Intelligence UI

KIOSK-2A adds a customer CaptureScope step before camera capture:

- **TOP** — Upper-body clothing;
- **BOTTOM** — Lower-body clothing;
- **FULL BODY** — Dresses and complete outfits.

These labels are provider-neutral SelfX capture scopes. They must not expose
FASHN categories, model names, inference modes or technical CV settings.
CaptureScope is not the final garment taxonomy; FULL BODY may later resolve to
ONE_PIECE, FULL_OUTFIT or another canonical garment semantic.
BOTTOM copy and framing must keep the customer's face/full-person context
visible for the current ML Kit pose path; it emphasizes lower-body readiness
without cropping the live camera to legs only.

Camera preview:

- remains large and portrait-first for Android kiosks;
- contains the customer image and a subtle scope-aware framing overlay;
- does not show raw MediaPipe skeletons, dozens of landmark dots, confidence
  values or technical diagnostics;
- keeps dynamic customer guidance out of the preview.

Person capture uses one static white dashed silhouette over the live camera
image. The previous orange duplicate is removed, and the retained white outline
is slightly thicker. Faint alignment lines remain. **Stand in Position** and its
centered supporting guidance appear before countdown, including readiness
preparation; the left-side tip badges are removed. These are instructions,
not detected conditions. During countdown the header disappears, the
silhouette stays in the same position at lower opacity, and the existing large
countdown remains prominent. Cancelling countdown restores the heading/guidance.
TOP shows head, shoulders and torso; BOTTOM emphasizes waist, legs and feet while
retaining faint head/shoulder context; FULL BODY shows the complete outline and
foot placement. Guides adapt to available viewport size and reserve bottom
capture/upload controls. Camera crop, orientation, readiness checks, timing,
capture, garment guides and jewellery-specific guides remain unchanged.

`CaptureGuidancePanel`:

- remains below the preview in portrait layouts and beside the preview in wide
  layouts;
- shows dynamic readiness guidance such as **Move back slightly**, **Move
  closer**, **Center yourself**, **More light is needed**, **Hold still**,
  **Almost ready** and **Ready**;
- starts the final 3/2/1 only after readiness is stable/debounced;
- may return to guidance if the customer becomes substantially invalid during
  final countdown;
- exposes **Try Again** and **Capture Anyway** after bounded readiness timeout.

Capture Anyway bypasses readiness/quality warnings only. It does not bypass
unavailable camera, still-capture failure, corrupt capture, decode failure or
other technical invalidity.

Customer UI must not show **Multiple people detected** or **Please keep only one
person in the capture area** while the active analyzer is ML Kit Pose Detection,
because that path exposes only one tracked/prominent pose and does not provide
reliable active multi-person awareness.

Operator/development diagnostics may show safe local performance details such as
target/effective analysis FPS, dropped frames, analyzer latency,
PrimarySubject lock state, visual prominence, normalized target region, tracking
age, analyzer mode and multi-person awareness as unsupported for ML Kit.
Customer UI must not show raw pose data, live frame bytes/base64, fake physical
distance, technical confidence or OpenCV metric names.

If live frames or analyzers are unavailable, the UI falls back to KIOSK-1.6
scripted assisted capture and still allows photo capture whenever the camera is
technically usable.

KIOSK-2A.1 preserves the original still and only prepares local normalized
TargetSubjectRegion semantics for future target-only Try-On. Future KIOSK-3
must dress the selected PrimarySubject only and leave unrelated/background
people unchanged through target extraction and compositing; no provider
generation or compositing UI is implemented here.

### Core Design Tokens

The design system should define:

- primary/secondary brand colors;
- backgrounds and surfaces;
- borders;
- typography scale;
- spacing scale;
- radius;
- elevation/shadows;
- success;
- warning;
- error;
- info;
- disabled state;
- focus state;
- loading state.

### Component Consistency

Common patterns should be reused for:

- page headers;
- cards;
- forms;
- tables;
- filters;
- search;
- dialogs;
- drawers;
- tabs;
- badges;
- alerts;
- empty states;
- confirmation prompts;
- pagination;
- skeleton/loading states.

### Page & Layout Standards

SelfX web pages must use the shared Shadcn-first layout primitives from
`@selfx/ui` rather than local one-off layout systems.

Standard page anatomy:

```text
PageContainer
→ PageHeader
→ optional StatGrid
→ PageSection / SectionHeader
→ approved content card or workflow surface
```

Page width modes:

- `wide` — dashboard, list and broad admin workspace pages;
- `medium` — detail and settings pages;
- `form` — create/edit forms.

Spacing conventions:

- desktop: 24–32px page padding, 24px major section gap, 16–20px card/grid gap,
  20–24px card padding;
- tablet: 20–24px page padding and about 20px major section gap;
- mobile: about 16px page padding, section gap and card padding.

Approved page archetypes:

- Dashboard Page: `PageHeader` → `StatGrid` → `PageSection` content;
- List Page: `PageHeader` → optional `StatGrid` → `FilterBar` →
  `TableContainer` → pagination/footer;
- Detail Page: `PageHeader` → summary → tabs/sections → related information;
- Form Page: `PageHeader` → constrained `FormPageContainer` → `FormSection`
  → `FormActions`;
- Settings Page: `PageHeader` → settings navigation/content sections;
- Workflow Page: specialized flow layout that still follows SelfX typography,
  spacing, state and control standards.

Approved card patterns:

- `StatCard` for label/value/trend summaries;
- `SectionCard` for titled content sections;
- `SummaryCard` for compact summary information;
- `ActionCard` for icon/title/description/action prompts;
- `TableContainer` for future table surfaces with explicit footer/pagination
  space.

Forms use one column by default. Two-column layout is reserved for closely
related compact fields and must collapse to one column on mobile. Labels appear
above fields and validation/help text must remain visually predictable.

Cards should normally size to content and use centralized radius/border/shadow
tokens. The approved global web card hover uses the shared `selfx-card-motion`
treatment: 1% growth, 1px lift and a 300ms smooth easing curve on both entry and
exit, with matching shadow transitions. This applies to shared cards and custom
card layouts across pages. Disabled choices stay static; touch-only pointers and
reduced-motion preferences do not trigger growth/lift. Do not nest cards simply
to create page spacing.

---

## 4. Global Web Application Structure

The primary SelfX web application should support these major areas:

- Authentication
- Organization registration/onboarding status
- Organization selection
- Organization/Store portal
- SelfX Super Admin
- SelfX Support
- Customer account
- QR continuation
- Public/developer settings where applicable

The exact route names may evolve during implementation.

---

# 5. Authentication UI

## 5.1 Staff/Admin Login Screen

### Purpose

Authenticate organization staff, organization admins, and SelfX platform users.

### Main Elements

- SelfX logo
- email field
- password field
- sign-in button
- forgot password
- optional MFA step when enabled

### States

- default
- submitting
- invalid credentials
- account suspended
- MFA required
- too many attempts
- server unavailable

---

## 5.2 Customer Authentication Screen

### Available Methods

- Email OTP
- Phone OTP
- Google
- Apple

### Flow

1. Customer chooses sign-in method.
2. Identity verification screen opens.
3. Verification succeeds.
4. User returns to the interrupted customer flow.

### OTP Screen

Should include:

- masked destination;
- OTP fields;
- verify button;
- resend control;
- countdown where appropriate;
- change email/phone;
- rate-limit feedback.

---

## 5.3 Organization Registration / Onboarding Status

### Purpose

Allow prospective organization owners to submit and track onboarding without exposing normal operational tenant functionality before activation.

### Registration Flow

1. User enters required applicant and organization information.
2. User submits registration.
3. UI confirms submission and shows onboarding status.
4. User can return to the onboarding/status area.

### Applicant Status States

Show clear status language for:

- draft;
- registration submitted;
- under review;
- more information/documents required;
- approved but activation pending;
- activated;
- rejected.

### Activation Boundary

Do not show the normal organization dashboard, store management, staff management, product management, kiosk operation, paid Try-On controls or normal tenant business APIs until the organization is `ACTIVE`.

An approved application may still show activation pending when commercial, payment, document, verification or contract prerequisites remain.

---

# 6. Organization Selection

Shown only when a user belongs to multiple organizations.

### Main Elements

- current user
- organization cards/list
- organization name
- organization status
- role
- switch action

### Behavior

Selecting an organization changes the active organization context.

The UI must not assume the selected organization is valid without backend confirmation.

Organizations in `PENDING_ACTIVATION`, `SUSPENDED` or `ARCHIVED` state must be visually distinguishable from active organizations.

Selecting a pending organization should route to the approved onboarding/status experience rather than the normal operational dashboard.

---

# 7. Organization / Store Portal Navigation

Recommended primary navigation:

- Dashboard
- Stores
- Staff
- Products
- Kiosks
- Try-On Activity
- Analytics
- Integrations
- Developer / API
- Usage & Billing
- Settings

Items appear only when allowed by role/entitlement.

A store-scoped user may see only the applicable store context.

This portal is the normal operational tenant experience and should only be shown for `ACTIVE` organizations unless a specific onboarding/status route is being shown instead.

Internal AppShell navigation should use client-side routing for normal
unmodified in-app clicks so the React in-memory access token is not discarded
by a full document reload. The reusable `@selfx/ui` AppShell/sidebar remains
framework-neutral and receives a navigation callback from the host app rather
than importing Next.js routing directly.

Anchor `href` values must remain present for ordinary browser affordances such
as copy link address, middle-click and modified-click new-tab behavior.
Disabled navigation items must not navigate. Client-side navigation is only an
ergonomic fix; reload, direct URL and new-tab session restoration still depend
on the HttpOnly refresh-cookie flow through `SessionProvider`.

AUTH-PERSISTENCE-FIX-1 requires protected web API screens to use the shared
refresh-aware request path. If access-token expiry can be recovered by refresh,
the UI must continue silently and must not show raw token messages such as
"Access token is invalid or expired." Terminal refresh failure uses the existing
session-expired/login behavior; transient refresh failure may show a recoverable
network-style error.

---

# 8. Organization Dashboard

### Main Purpose

Provide an operational summary.

### Suggested Sections

- active stores
- online/offline kiosks
- Try-Ons today
- Try-On success rate
- recent activity
- usage summary
- integration health
- alerts/issues

### States

- loading
- no stores yet
- no Try-Ons yet
- partial data
- degraded integration
- suspended subscription

---

# 9. Store Management

## 9.1 Store List

### Elements

- search
- status filter
- store name
- location
- kiosk count
- staff count
- product count
- actions

### Actions

- create store
- open store
- edit store
- deactivate where permitted

---

## 9.2 Create/Edit Store

### Form Areas

- store name
- store code if required
- address/location details
- contact details
- status
- store-specific configuration

### States

- validation errors
- permission denied
- save in progress
- save successful
- save failed

---

## 9.3 Store Detail

Recommended tabs:

- Overview
- Staff
- Products
- Kiosks
- Try-On Activity
- Analytics
- Settings

---

# 10. Staff Management

The `/app/staff` workspace is hierarchical:

- SelfX Platform users with Platform staff permissions may view Platform staff
  and, when authorized, assign non-protected Platform roles.
- Platform users with Store user permissions may select a Store and manage that
  Store's staff according to Store-scoped permissions.
- Store users see only their permitted Store scope and must not see staff from
  other Stores.
- Store staff actions must use Store roles from the selected Store only.

## 10.1 Staff List

### Elements

- search
- role filter
- store filter
- status filter
- staff name/email
- role
- store scope
- status

### Actions

- invite staff
- edit access
- suspend/reactivate
- revoke sessions where permitted

---

## 10.2 Invite Staff

### Flow

1. Enter identity information.
2. Select predefined role.
3. Select organization/store scope.
4. Review.
5. Send invitation.

The UI must prevent assigning scopes/roles that the inviter cannot grant.

---

## 10.3 Staff Access Editor

### Sections

- role
- permissions summary
- allowed stores
- account status

Use clear warning/confirmation states for access removal or suspension.

---

# 11. Product Management

## 11.1 Product List

### Elements

- search
- Platform Products entry point under Platform for the SelfX default/fallback
  catalog
- Store entry point from the Store dashboard
- source filter: SelfX / Shopify / WooCommerce / API
- VTO status filter
- store availability filter
- product image
- product name
- price when available
- platform default currency from Platform Settings
- source
- VTO status
- stores
- last sync where relevant

### Actions

- create native product
- create/edit Platform default product for platform-owned kiosks and Store
  fallback catalogs
- edit Store product name, category, price, image and VTO readiness; currency
  is inherited from Platform Settings
- open product
- enable/disable VTO
- bulk enable or disable imported products for VTO by product vertical;
  enabling includes only active imported products with a usable image
- sync/retry where appropriate

---

## 11.2 Product Detail

Recommended sections:

- Product Information
- Garment Images
- VTO Configuration
- Store Availability
- External Mapping
- Integration Sync Status

Commerce fields imported from Shopify/WooCommerce should be visually identified as externally managed where appropriate.
Bulk imported-product VTO actions change only SelfX eligibility. They must not
change the product or its status on Shopify/WooCommerce, must be confirmed
before execution and should report skipped inactive/imageless products and
notified kiosks.

---

## 11.3 VTO Configuration

### Controls

- VTO enabled/disabled
- approved garment image
- supported garment category
- organization/store availability
- generation profile if user is allowed to configure it

Provider-specific technical settings should not be exposed to normal merchant users.

---

# 12. Kiosk Management

## 12.1 Kiosk List

### Elements

- kiosk name
- store
- online/offline state
- app version
- last heartbeat
- pairing state
- latest configuration version
- health badge

### Filters

- store
- status
- version
- pairing state

---

## 12.2 Pair Kiosk

### Flow

1. Admin selects Pair Kiosk.
2. Pairing code/QR input appears.
3. Admin selects store.
4. Admin enters kiosk name.
5. Admin confirms.
6. Success screen shows paired device.

### Error States

- invalid/expired pairing code
- code already used
- permission denied
- device already paired

---

## 12.3 Kiosk Detail

Recommended tabs/sections:

- Overview
- Device Health
- Configuration
- Recent Activity
- Version
- Remote Actions

### Remote Actions

- refresh config
- force sync
- reset session
- disable
- unpair

Sensitive actions require confirmation.

### Configuration

KIOSK-6A configuration UI may appear as a detail tab, drawer or focused dialog
from the fleet row while the broader kiosk-detail surface matures.

Editable fields:

- idle mode: static or slideshow;
- slide duration, 3-60 seconds;
- presentation title, subtitle and CTA label;
- ordered presentation images/videos using bundled asset keys, uploaded SelfX
  object-storage media or validated HTTPS image URLs;
- Store-assigned kiosk presentation slots for videos and wallpapers. The
  bundled SelfX default video remains the fallback until Store media is saved;
- uploaded video duration validation with clear feedback when a video exceeds
  one minute;
- capture countdown: 5, 10 or 15 seconds;
- capture sounds enabled and sound profile;
- guidance audio enabled;
- enabled customer garment intent categories: Top, Bottom, Full Outfit;
- session idle timeout (default 120 seconds).

During an active customer session, every Flutter customer screen shares the
inactivity guard, including catalog, camera, preview, QR upload, processing and
results. With the default timeout, 90 seconds without touch/scroll activity
opens a centered warning over the current page with a black 52% dimming layer.
The warning matches the consent popup: white card, 24-pixel rounded corners,
dark heading, a thin orange top accent and an **ENDING SOON** badge with timer
icon. A large orange number and **SEC** sit inside an orange circular progress
ring that smoothly shrinks with the remaining time. Copy is **No activity
detected** and **You will be redirected to the home screen when the timer runs
out.** A full-width solid orange **Keep Browsing** button with white content sits
above the smaller **Tap anywhere to continue.** hint.
The countdown updates each second. Pressing Keep Browsing or tapping anywhere dismisses the warning and
restarts the entire idle timeout without activating a control underneath.
At expiry the existing upload cancellation, customer-session cleanup and return
to the start screen run once. No warning appears on an inactive start screen.
Saved timeout settings remain valid (30-900 seconds); their warning uses the
final 30 seconds. Changing the default does not overwrite saved configuration.

States:

- loading existing configuration;
- validation error with safe field-level or dialog-level copy;
- saving;
- saved version visible after success;
- presentation asset upload unavailable until durable object-storage ownership
  exists.

Customer kiosk screens must not show configuration/debug labels. Operator
Display/Diagnostics may show safe status such as active remote version, cached
version, bundled default fallback and safe sync failure codes.

---

# 13. Try-On Activity

## 13.1 Try-On List

Merchant-visible Try-On activity should show only data permitted by the PRD and user role.

Possible fields:

- Try-On ID
- product
- store
- channel
- status
- created time
- completion time

Generated-result visibility must follow approved Store Manager access rules.

Original customer photograph must not be shown to Store Managers.

---

## 13.2 Try-On Detail

Possible sections:

- status
- product
- store
- channel
- timestamps
- generated result where permitted
- provider-neutral error/status summary
- operational references for authorized SelfX staff

Raw provider credentials and sensitive customer data must never appear.

---

# 14. Analytics

### Main Views

- Try-Ons over time
- success/failure rate
- top products
- store comparison
- channel distribution
- kiosk utilization
- usage against allowance

The detailed Analytics screen is Store-scoped:

- SelfX platform users with usage visibility see aggregate usage through the
  Dashboard and Usage & Billing, not the merchant Analytics menu.
- Team & locations and detailed Analytics are merchant-only navigation and
  routes. Controlled Store impersonation uses the target Store's permissions
  and plan gates. Platform Staff/Roles remain separate.
- Provider Health is not displayed in merchant Analytics. Underlying telemetry
  remains available for internal diagnostics.
- The platform View Store page may show a read-only usage overview for that
  Store with usage visibility permission: top five products and categories by
  completed Try-Ons, garment/jewellery labels and catalog-only thumbnails.
  Date filters are last 7 days, last 30 days and the current billing cycle when
  valid subscription dates are available. Customer photos and generated results
  are never included, and the overview replaces duplicate product diagnostics.
- Store users with analytics visibility see only their Store scope, including
  product usage, category usage, kiosk activity and channel split.
- Kiosk analytics must show operational counts and product references only, not
  customer source images or generated image assets.

SelfX Super Admin may additionally see:

- provider distribution
- provider latency
- provider cost
- queue health
- failure ratios

Charts should use the SelfX design system even when a specialized chart library is used.

---

# 15. Integrations

## 15.1 Integration List

Cards/rows for:

- Shopify
- WooCommerce
- future integrations

### Status

- connected
- syncing
- healthy
- degraded
- authentication required
- disconnected

---

## 15.2 Integration Detail

Recommended sections:

- connection status
- connected store/site
- last successful sync
- last reconciliation
- recent errors
- product count
- sync action
- disconnect action

Secrets are never displayed.

---

# 16. Developer / Public API UI

Visible only when Public API entitlement is enabled.

## 16.1 API Key List

### Elements

- key name
- prefix
- environment
- scopes
- created date
- last used
- status

### Actions

- create key
- revoke
- rotate where supported

The secret is shown only once at creation.

---

## 16.2 Create API Key

### Flow

1. Enter key name.
2. Select environment.
3. Select scopes.
4. Create.
5. Show secret once.
6. Require user acknowledgement before leaving.

---

## 16.3 Webhook Settings

### Elements

- endpoint URL
- subscribed events
- status
- secret rotation
- recent deliveries
- retry status

---

# 17. Usage & Billing

### Sections

- current subscription/trial
- usage this period
- generation allowance
- API allowance if applicable
- store/kiosk entitlement usage
- billing status
- invoices/payment management where enabled

### Trial State

Show both:

- time remaining
- generation usage remaining

### Suspended State

Clearly explain what is restricted without implying organization data is deleted.

---

# 18. SelfX Super Admin Navigation

Recommended areas:

- Platform Dashboard
- Organization Applications
- Organizations
- Stores
- Users
- Kiosks
- Try-Ons
- AI Providers
- Usage
- Subscriptions
- Integrations
- System Health
- Audit Logs
- Support

Platform actions must be permission-aware.

---

# 18.1 Organization Application Review UI

SelfX platform-admin UI should eventually include organization onboarding review.

### Main Views

- pending organization applications;
- application detail;
- applicant/business details;
- requirements/documents status;
- review notes;
- commercial status when available;
- audit history for review and activation actions.

### Actions

Actions appear only with explicit platform permissions:

- start review;
- request more information;
- approve application;
- reject application;
- activate organization;
- suspend organization.

### UI Rules

- Approval and activation are distinct actions.
- Application status and organization operational status must both be visible where applicable.
- `APPROVED` application with `PENDING_ACTIVATION` organization is a valid state.
- Review notes and metadata must not expose secrets or raw sensitive documents.
- Document upload/review implementation is deferred until the approved storage/document phase.
- Commercial/payment automation is deferred; manual confirmation by an authorized SelfX platform administrator may be shown as an activation prerequisite signal.

---

# 19. SelfX Platform Dashboard

The `/app/dashboard` workspace must resolve the current RBAC scope before
loading data. Platform roles may see platform-wide usage and Store summaries
only when they hold the required Platform permissions. Store roles see only
their selected Store's permitted staff, product, kiosk and usage snapshots.

Recommended high-level widgets:

- total organizations
- active stores
- active kiosks
- Try-On volume
- success rate
- queue depth
- provider health
- integration incidents
- subscription/usage alerts

Do not expose sensitive customer images on the platform dashboard.

---

# 20. AI Provider Operations UI

SelfX-only operational area.

### Possible Information

- provider name
- enabled/disabled
- health
- current capacity
- queue depth
- recent latency
- failure rate
- routing role
- configuration version

Provider credentials must never be displayed after secure configuration.

Normal organization users do not need provider-specific screens.

---

# 21. Support View

### Purpose

Allow authorized SelfX Support staff to inspect organization/store operational state.

### UI Rules

- clear Support Mode banner
- organization context always visible
- secrets hidden
- original customer photos hidden unless an explicit future policy permits otherwise
- sensitive actions audited

---

# 22. Impersonation UI

### Start Impersonation

1. Select organization.
2. Select store/context where applicable.
3. Select approved effective role/context.
4. Enter support reason.
5. Confirm.

### During Impersonation

Persistent banner must show:

- impersonation active
- target organization/store
- effective context
- exit action

The UI must never make impersonation visually indistinguishable from a normal login session.

---

# 23. Customer Kiosk Screen Flow

Recommended flow:

Welcome / Idle  
→ Consent  
→ Choose Try-On Type  
→ Select Garment OR Capture Physical Garment  
→ Customer Capture  
→ Preview  
→ Generate  
→ Queued / Processing  
→ Result  
→ Try Another / QR / Finish  
→ Session Cleanup  
→ Welcome / Idle

---

# 24. Kiosk Welcome / Idle Screen

### Purpose

Attract customer attention and start a clean session.

### Elements

- organization/store branding
- SelfX/white-label branding as entitled
- primary **Start Try-On** button
- optional promotional/product content
- privacy/help entry

No previous customer state may be visible.

---

# 25. Kiosk Consent Screen

The Flutter kiosk shows a centered white privacy dialog over the current home
menu. The existing video keeps playing behind a dark, non-dismissible modal
barrier, with the current buttons still visible and blocked from interaction.
The dialog uses an orange shield, **PRIVACY CHECK**, **Ready to try on?**, the
message "Your photo and garment image are used only for this try-on session."
and a **Session-only use** badge. **Agree & Continue** uses solid `#FF7119`
with white text/checkmark and no gradient; **Cancel** closes without starting
camera/upload/session work. Narrow windows stack the actions; short windows
scroll the dialog contents. Existing consent gates and continuation routes stay
unchanged.

The current session completion path revokes shares and requests image deletion,
but storage deletion is best-effort and completion can fail offline. This dialog
therefore does not promise guaranteed immediate deletion or zero temporary
storage. The policy of no retained images requires separate verified cleanup
and retention guarantees before stronger deletion wording is displayed.

### Elements

- concise privacy/AI processing notice
- image-retention summary
- disclosure about authorized Store Manager access to generated results as approved by the PRD
- Accept & Continue
- Cancel

Customer cannot proceed to capture without required consent.

---

# 26. Kiosk Try-On Type Selection

Platform-owned kiosks enable both supported Try-On capabilities by default.
Store-owned and platform-owned kiosks default to both Try-On capabilities.
Store-owned kiosks continue to use the Store-level capability list, which
determines the visible primary choices and lets administrators disable a mode
when the business does not need it:

- **Try On Garments** uses an orange gradient with white title/subtitle, orange
  border/glow, an orange shirt on a white circle and an orange arrow on a white circle.
- **Try On Jewellery** uses a cream/light peach surface and neutral border/glow,
  navy title, grey subtitle, a gold diamond on a pale peach circle and a white
  arrow on an orange circle. Both cards retain their current sizes, spacing,
  text, icon sizes and menu actions; Browse Garments retains its label.

These are the only primary customer actions on the starting screen. They appear
as two equally sized, wide rectangular buttons stacked vertically with a
consistent gap. Each button places its icon on the left, its single-line title
and subtitle in the middle, and its circular arrow on the right. Buttons use
reduced vertical padding and 80px compact / 100px regular heights, while keeping
the existing title/subtitle/icon sizes, horizontal padding and 16px gap.
Selecting a category fades/slides the cards into a stacked action menu over the same
background and branding; selection alone does not start a session or request
camera permission. Back (including system Back) returns to the category cards.

The Garments menu offers **Browse Garments**, **Virtual Try-On** and **Upload From
Mobile**. The Jewellery menu offers **Browse Jewellery** and **Upload From
Mobile** only. Browse actions use an orange gradient with white text/icons;
Virtual Try-On uses a dark translucent surface, orange outline and white
text/icons; Upload From Mobile uses a white surface with dark navy text/icons.
Controls use rounded corners and remain real Flutter touch controls. The bundled
SelfX default video loops behind both the landing cards and category action
menus. Category transitions animate the controls without restarting the video.
Configured Store media replaces the bundled default through the existing kiosk
presentation settings; custom videos, wallpapers and playlists remain supported.
The packaged wallpaper is used while video initializes or if playback fails.
SelfX branding and the headline **See It. Try It. Love It.** remain separate
overlays. On the starting menu, the orange highlight cycles through See It,
Try It and Love It, with 1.5 seconds per phrase and smooth 350 ms colour fades.
After each complete cycle, Love It stays orange during a three-second pause,
then the sequence repeats. The active phrase grows subtly by 5% as it turns
orange and returns to normal as the highlight moves on. Love It holds this
emphasis during the pause. Scaling affects painting only, so surrounding text
and the overall layout stay stationary. Category
menus and reduced-motion settings retain a static Love It highlight; custom
Store headlines remain unchanged. Operator access remains hidden and PIN
protected. Consent is required before starting photo/AI session work.

When garment Try-On is selected and physical capture is enabled:

- **Choose From Store Catalog**
- **Capture Physical Garment**

If physical garment capture is disabled, skip this screen.

Jewellery Try-On always opens jewellery selection before person capture. The
customer does not select a technical jewellery type.

Garment and Jewellery use the same kiosk layout, controls, preview geometry,
review/result surfaces and interaction conventions. The active Try-On vertical
supplies labels, icons, permitted product acquisition, capture-guide family and
generation-visual family through one shared presentation configuration. This
keeps the established garment UI intact while allowing jewellery-specific
guidance and motion without creating a second visual system.

Jewellery results may use a local target-aware portrait preview to remove
irrelevant side areas without stretching the generated image. Rings/bracelets
use hand bounds; necklaces/earrings use confident face/shoulder landmarks.
Unavailable or ambiguous detection and targets that cannot fit completely in
the portrait frame fall back to the full, contained result. Tapping the
jewellery preview opens the unchanged full image with zoom and pan. Garment
result presentation is unchanged. Preview bounds are ephemeral and local;
temporary analysis files are deleted after detection, and the generated asset
used for saved looks/downloads remains unchanged.

---

# 27. Kiosk Catalog Browser

### Elements

- product grid
- garment image
- product name
- price if available
- category/filter/search
- availability where relevant

### Product Detail

- images
- product details
- variants where useful
- Try It On
- back to catalog

No checkout button is required.

The Flutter garment catalog uses a white background, centered SelfX logo and
**Choose Garment** heading. Portrait layouts keep two product columns; wider
landscape layouts may show more. All/Men/Women filters use orange for the active
segment, while the active category has a pale orange fill. Selected products
have an orange border and checkmark; unselected products have a white circular
orange plus button. Prices are orange. **Load More** and **My Picks** use white
surfaces with orange borders and labels; **Continue** uses an orange gradient
with white content. Categories and products come from the Store catalog.

My Picks belongs to the current customer session. Browsing, filtering, closing
the picks sheet and moving between capture, catalog and results preserve picks.
**Finish** or returning to the landing screen clears all picks and the active
pick, including returns after intermediate screens have been replaced.

For Jewellery, **Browse Jewellery** opens the catalog. Selecting a product and
pressing Continue requests its person-photo requirements from SelfX and opens
live person capture. **Upload From Mobile** opens the QR immediately; the
uploaded-photo preview offers **Choose Jewellery**, followed by catalog
selection and validation against the selected item's requirements. An unsuitable
uploaded photo returns to phone upload with item-specific guidance. Ring,
bracelet, necklace and earring products use different target-region instructions.
Earring guidance asks for the face and at least one visible ear so side-facing
photos can proceed; it does not require both ears to be visible.

The catalog-first path is single-selection: jewellery catalog -> selected-product
requirements -> live camera (or Mobile Upload) -> photo preview -> Continue ->
generation. These guides are framing aids, not claims of live region detection.
Upload-first acquisition preserves the original accepted photo and rechecks it
against the chosen item before generation. No jewellery product photo capture
is requested.

Jewellery reuses the garment QR and photo-focused preview presentation, solid
orange primary buttons and outlined camera Back controls. Jewellery
categories use item-specific icons with the existing active highlighting.
An uploaded preview shows **Upload Again** on the left and **Continue** (selected
item) or **Choose Jewellery** (upload-first) on the right. A live preview shows
**Retake Photo** and **Continue**. Retry, expiry and cancellation preserve the
selected jewellery. Result/error photo replacement preserves camera versus
phone input. Garment screens, styling and navigation remain unchanged.

Person-image preflight shows only two outcomes:

- accepted -> Preview with the action to continue;
- rejected -> correction screen with Retake Photo or Upload Another Photo and
  one primary corrective message.

The internal Jewellery Lab implements the same ordering for development:
jewellery type/product image first, followed by the person image. Type-specific
MediaPipe framing checks run before submission, and the SelfX backend performs
the final technical-validity check before creating provider work. Jewellery
quality characteristics do not add warning prompts or block this flow.

The Jewellery Lab presents this order as a three-step workspace: Upload
Jewellery, Upload Person, and Review & Run. Jewellery-type selection, resolved
capture guidance and the two image inputs remain in the primary work area;
the generated output remains visible in a separate Try-On result rail. The
normal Lab interface does not disclose provider identity, model names, request
identifiers, timestamps or raw failure codes. Idle status describes missing
inputs rather than claiming provider readiness, and Reset clears local previews,
validation state and the current ephemeral lab run.

Jewellery catalog create/edit forms verify image dimensions before upload.
Images below 640 x 640 pixels or above 4096 x 4096 pixels show one direct error
and are not saved. During generation, SelfX may resize a usable person photo to
the provider minimum without showing a quality warning; a technically unusable
person image or undersized direct jewellery reference returns the normal
corrective error state.

The internal Jewellery Lab shows the supported format, file-size and resolution
requirements beside each upload. After selection it displays the measured image
resolution and one technical status: ready, ready with SelfX resizing, or image
too small/invalid. Continue is disabled for a blocking technical status. These
messages explain provider compatibility only and must not introduce blur,
lighting or subjective image-quality warnings.

---

# 28. Kiosk Customer Capture

### KIOSK-2C Home

- The kiosk starts on a customer-facing idle home, not settings or technical
  camera-test UI.
- The home uses local/offline static or slideshow presentation visuals with an
  offline fallback.
- The bundled SelfX wallpaper is the default visual until organization/kiosk
  wallpaper management is available from the SaaS dashboard.
- Primary visible action: **Start Try-On**.
- No visible Camera Settings action appears on the home.
- A hidden top-left double-tap hotspot reveals a temporary operator icon.
- The operator icon opens a 6-digit PIN dialog before settings.
- PIN failure messaging is generic and does not expose entered values.
- Operator lockout messaging must not block or visually disable **Start
  Try-On**.

### KIOSK-2C Operator Settings

- Settings sections: Camera, Capture, Display, Diagnostics and System.
- Settings content scrolls vertically in portrait, landscape and narrow Windows
  viewports.
- Camera controls include detected camera selection and refresh/test actions.
- Capture controls include countdown, capture sounds and sound profile.
- Display shows local idle mode/presentation source status.
- Diagnostics show safe local analysis status only.
- System shows safe local app/platform status only.

### SELFX-DESIGN-SYSTEM-2 Operator Settings

- Wide settings use a category rail/sidebar for Camera, Capture, Display,
  Audio, Diagnostics and System.
- Narrow/portrait settings use tabs or stacked controls.
- Human-readable camera names are primary.
- Raw camera hardware IDs are hidden under Diagnostics or hardware details.
- Camera preview is bounded and preserves aspect ratio.
- Status indicators combine icon, text and tone.
- Capture countdown selection uses selected-button semantics with SelfX orange.
- Audio settings prepare for SelfX Signature, Soft, Studio, Minimal and Muted
  profiles without adding new sound assets.

### SELFX-UI-MIGRATION-1.1 Kiosk Visual Harmonization

- Windows/Android Flutter apps use reusable solid SelfX button primitives for
  primary, secondary, selected, ghost and danger semantics.
- Primary buttons read as SelfX orange with white text and orange border;
  secondary and inactive buttons use white/light surfaces, dark text and visible
  neutral borders.
- CaptureScope uses solid selection cards with icon, description and arrow
  affordance. Selected choices use orange/white semantics; inactive choices use
  white/dark/border semantics.
- Customer home keeps wallpaper/slideshow and hidden operator reveal, uses a
  solid primary **Start Try-On** CTA, and removes normal customer-mode
  implementation labels such as wallpaper mode or platform readiness.
- Operator reveal uses a compact solid secondary button while visible.
- Operator PIN uses a bounded solid dialog, preserves six-digit secure input,
  cancel, unlock, lockout and verifier abstraction.
- Controls over wallpaper imagery must stay readable through solid surfaces or
  a simple scrim; do not blur the wallpaper or large live camera areas.

### KIOSK-3A Real Generation Flow

- **Start Try-On** opens customer-friendly garment selection before photo
  source choice.
- Garment selection asks for customer-facing intended scope: **Top**,
  **Bottom** or **Full Outfit**.
- Garment acquisition offers **Take a Photo** and **Use Your Phone** before the
  model/person photo step. SelfX resolves garment reference semantics
  internally. Customer UI must not expose technical garment photo type,
  flat-lay/segmentation, provider or FASHN terminology.
- Product/hanger/unknown garment references should use safe internal AUTO
  photo-type behavior. Verified person-worn garment references may map to
  ON_MODEL internally.
- Garment review shows the selected garment image with **Choose Another** and
  **Continue**.
- Garment review may show simple advisory copy such as "For best results, use a
  photo where the item you want to try is clearly visible." It must not block
  all layered references by default or expose provider/category terminology.
- CaptureScope remains **Top**, **Bottom** and **Full Body** internally and is
  resolved from provider-neutral garment semantics before assisted/live capture.
- Review keeps **Retake** and **Use Photo**. **Use Photo** submits the accepted
  capture to SelfX instead of stopping at Photo Ready.
- Generation progress shows friendly states such as preparing, uploading,
  creating and generating. Do not show provider names, provider run IDs, raw
  HTTP status, backend stack traces or internal queue names.
- Failure actions may include retry polling, retake photo and choose another
  garment. Retry polling for an existing run must not create another paid run.
- Result screen shows the generated image directly with **Try Another Garment**,
  **Retake Photo** and **Finish**.
- **Try Another Garment** clears run/result state but may keep the accepted
  customer capture and internal ModelCoverage for another garment in the same
  kiosk session. The category screen is still shown before the next garment.
- For phone-uploaded model/person photos, **Use This Photo** waits for internal
  still-image coverage resolution after download/validation. The customer sees
  the normal preview/continue flow, not coverage enums, landmark names or
  technical metrics.
- If the retained customer photo is incompatible with the selected category,
  show a plain update-photo screen before any paid generation. Bottoms copy:
  **Update your photo to try bottoms** / "We need to see more of your lower
  body for this item." Full Outfit copy: **Update your photo to try a full
  outfit** / "We need a full-body photo for this item." Actions are **Update My
  Photo** and **Try Another Garment**.
- UNKNOWN or unavailable phone-upload coverage uses the same update-photo path.
  Do not show a fallback that treats the selected category or CaptureScope as
  sufficient coverage proof.
- **Retake Photo** clears run/result and prepared target state while preserving
  selected garment where appropriate.
- **Finish** clears customer capture, garment, run/result and prepared target
  state before returning to the home.
- KIOSK-3A does not add QR handoff, catalog browsing, checkout, target-region
  compositing or fleet-driven remote content UI.

### KIOSK-4A Pairing and Fleet UI

- Unpaired kiosk startup renders a dedicated **Pair this kiosk** screen instead
  of customer home.
- Pairing screen shows SelfX branding, the six-digit code formatted for display,
  instructions, visible `MM:SS` remaining and a linear timer progress indicator.
- The screen may show safe platform/app version metadata. It must never display
  provisioning secret, device refresh token, access token, JWT or hashes.
- When the pairing expires, the kiosk automatically requests a new session/code.
- Temporary network failure shows retry without erasing a previously valid
  device identity.
- Paired/active device startup routes to customer home after `session/me`.
- Revoked/unpaired device state clears local credentials and returns to pairing.
- SaaS **Kiosks** page shows fleet devices with name, ID, platform, status,
  assignment, organization/store, last seen and paired time.
- Fleet device rows expose lifecycle actions appropriate to the current status:
  **Deactivate** for active devices, **Activate** for inactive devices,
  **Revoke** for unpairing credentials, and **Delete** for soft-removing a
  kiosk from the normal list.
- **Pair New Kiosk** modal collects pairing code, device name and assignment
  scope. `PLATFORM` requires no org/store; `ORGANIZATION` requires org;
  `STORE` requires org and store.
- Pairing errors use safe copy such as "Pairing code expired or invalid."
- Revoke and Delete actions are visible only through the protected superadmin
  fleet surface, require confirmation and use danger/destructive styling.

### KIOSK-4B Production Device Try-On UI

- Normal paired kiosks use production device-authenticated generation after
  photo review. The customer UI remains the same flow: garment preview, photo
  source, capture/review, generation progress and generated result.
- Generation progress may show preparing, uploading, creating and generating
  states. It must not show provider names, provider prediction IDs, device
  tokens, organization/store IDs, raw HTTP status or backend stack traces.
- The processing screen uses a full-page rounded white card with SelfX branding
  and a top-left light-grey rounded **Back** button with an arrow and dark text,
  matching other customer screens. Its existing navigation action is unchanged,
  and the centered logo reserves space for the label on narrow screens.
  The safe card height targets 10% branding, 60%
  side-by-side image cards, 20% dynamic messages/progress and 10% animated steps.
  The heading, dynamic copy, step icons and vertical gaps use compact sizing.
  The percentage sits beside a thinner progress bar instead of a separate row.
  Short windows scroll a readable minimum-height composition instead of clipping
  image labels, progress text or steps.
- Preview cards show **Your Photo** and **Garment Photo** with orange icon
  badges and existing product name/price where present. Images fill their preview
  areas edge to edge using proportional cover fitting, with rounded top corners
  and no inset padding or letterboxing. Differing aspect ratios may crop image
  edges for display only; original generation inputs remain unchanged. Labels
  retain their separate padded footer below each image.
  Jewellery uses **Jewellery Photo** and the existing jewellery icon.
  Missing/failed preview images retain a placeholder without blocking generation.
- The orange progress bar and numeric percentage animate together between
  existing workflow estimates (6, 18, 34, 52 and 78 percent). They are labelled
  **Estimated progress** and reach 100% only after success. No elapsed-time
  simulation or provider completion percentage is invented.
- Connected **Analyzing / your photo**, **Fitting / the garment** and
  **Creating / your look** steps illustrate the workflow; jewellery changes the
  middle step to **the jewellery**. Completed icons remain orange, the current
  icon pulses orange, and future icons stay grey. Highlight/connector progress
  shares the bar's animated value. These steps do not assert additional local
  image analysis or expose internal provider stages.
- Dynamic text uses customer-safe controller messages, including slow-connection
  updates. Existing error actions, retry-polling semantics, single submission
  and automatic result navigation are preserved.
- The kiosk uses the existing device session controller for generation auth and
  refresh. It must not ask the customer/operator for a staff/admin token.
- If the backend reports the device is inactive, revoked, deleted, unpaired or
  has an invalid device token, generation stops safely, local device auth is
  cleared and the startup shell routes to the pairing screen.
- Retry polling for an existing run does not create another paid run. Retrying
  create with the same device `clientRequestId` returns the same run.
- Result screen continues to show the generated image with **Try Another
  Garment**, **Retake Photo** and **Finish**.
- **Finish** clears customer capture, garment, prepared input, active run and
  result state but preserves a valid paired device identity.
- Catalog audience/category filters add grid/person icons for All, Men and
  Women; icons inherit
  the existing selected-white/inactive-dark foreground. Category chips add grid,
  trousers, outfit/dress and shirt icons for All categories, Bottoms, Full outfit
  and Tops, with orange selected icons and dark inactive icons. Unknown custom
  category slugs use the grid icon. Category icons occupy the existing chip
  avatar/checkmark slot, retaining chip height and removing the redundant tick.
  Label text, surfaces, ordering, filtering and product-selection logic remain
  unchanged; narrow audience labels scale down only as needed to fit the icon.

- Category selector selected state must update atomically: selected background
  SelfX orange `#FF7119`, selected foreground white and selected border
  `#FF7119`; inactive controls use white/light background, dark foreground and
  neutral border. Text/icon content must be horizontally and vertically
  centered and never briefly render white text on a white surface.

### KIOSK-4C Mobile Photo Upload UI

The accepted garment-person preview shares one layout for camera Review and
phone Ready: start with 10% of safe screen height for SelfX branding/back, 70%
for the rounded photo preview and 20% for status and touch actions, then give
28 logical pixels from the removed instruction row to the photo preview. Short
windows reserve readable minimum header/footer heights and can scroll instead
of clipping controls. The photo remains visible without a carousel or dimming.
The preview's top-left Back control uses a dark arrow and visible **Back** label
on a light grey rounded rectangle, matching the result screen. Branding stays
centered with space reserved to prevent overlap on narrow screens. Its existing
retake/cancel/navigation action is unchanged for camera and phone previews.

The pale green success panel shows **You're Ready!** and the next-step
instruction directly beneath it, centered within the whole panel with balanced
space beside a static green tick. Random per-photo success subtext is removed.
The instruction no longer occupies a separate row beneath the success panel.
Checking and invalid-photo messages retain their existing behavior.

Retake Photo sits on the left and the next-step action on the right. When a
catalog garment is selected, **Continue** uses the existing accepted-person
attachment and generation path with that selected product and preserves My
Picks. Without a selected garment, Virtual Try-On keeps **Take Garment Photo**
and the existing physical garment capture flow. Only the enabled **Continue**
button subtly pulses, stopping while disabled or busy. The button stays solid orange
(#FF7119) with white text/icon; Retake stays white with a gold outline.
Invalid captures still offer Retake and Upload Photo.

There are no recommendation or Browse Catalog controls in the accepted garment
preview. The full catalog retains Men/Women tabs, My Picks, pick limits and
Continue. Existing jewellery-specific requirements and continuation remain.

Usable camera photos are accepted locally in place after validation. READY
phone person photos use the existing download/validation/consumption path once.
Experimental MobileNet inference, its model and recommendation infrastructure
have been removed. OpenCV quality, ML Kit coverage/pose and MediaPipe jewellery
analysis remain. Backend person attachment and generation use the existing SelfX
path. Busy locks prevent repeated submissions; the try-on controller's customer
session revision and photo identity invalidate stale acceptance callbacks.
Retake/upload-again clear the reusable backend person-asset reference, and
failed phone attachment keeps the accepted preview available for retry.
When Back reveals a retained camera route, it restores preview mode and the
original capture purpose while preserving accepted person data and selected
products. Hidden camera routes ignore shared capture-review notifications.
Phone upload's visible Back and system Back use the same cancellation path for
garments and jewellery: invalidate pending acceptance, finish in-flight photo
preparation and stop upload polling before returning. Next-step actions remain
disabled during cancellation; late upload work cannot disable the resumed
camera controls.

- After garment review and internal CaptureScope resolution, the kiosk shows a
  model/person photo source choice with **Take Photo** and **Use Your Phone**.
- **Use Your Phone** opens a purpose-specific QR upload screen with SelfX
  branding. It is used for both garment and model/person acquisition. Before a
  valid session exists it shows a preparation state and no countdown. After
  session creation succeeds, it shows a large QR code, five-minute `MM:SS`
  countdown, progress indicator, status text and cancel.
- The QR size is derived from available viewport space so Windows landscape,
  Windows portrait, shorter/narrow Windows windows and Android portrait keep
  the countdown, status and actions reachable.
- The QR screen must not show capability internals, object keys, auth tokens,
  organization/store IDs or storage URLs.
- If session creation fails, the QR screen shows **Unable to start phone
  upload** with **Try Again** and **Cancel** instead of an indefinite spinner.
- Normal upload request failures, including validation, conflict, rate limit,
  server and network failures, keep the customer on the mobile-upload
  retry/cancel UI and do not clear a healthy kiosk pairing.
- `DEVICE_TOKEN_INVALID` and `DEVICE_TOKEN_EXPIRED` during upload requests use
  one device-session refresh and retry once. Unpaired, revoked, deleted or
  inactive device states clear invalid auth and route to pairing.
- The public phone page at `/upload/[capability]` is a mobile-first SelfX page
  outside authenticated app chrome. It uses a centered SelfX logo, top-left
  **Back**, warm white/peach background, and a large rounded photo frame with
  orange corners directly below the logo. The introductory heading is kept
  accessible to screen readers but visually hidden; the generic paragraph is
  removed. The active camera/review page uses reduced outer padding and a compact
  logo/Back header. The full-width frame takes the available viewport height after
  reserving space for the header and compact actions, with a minimum usable height
  and normal scrolling on short screens. Live video fills the frame with cover fitting
  without stretching; this display crop does not change the full captured image.
  Before
  selection a valid upload link requests video-only camera permission and shows
  a live, inline camera view in the frame. Person uploads prefer the front camera;
  garment, ring and bracelet uploads prefer the rear camera. **Switch Camera**
  releases the current stream before requesting the other facing mode. Browser
  constraints are preferences; camera availability depends on the phone/browser.
  **Take Photo** captures one unmirrored JPEG frame locally (maximum 2048px long
  edge), then shows review with **Retake Photo**, **Choose Another** and explicit
  **Upload Photo**. The front-camera preview is mirrored for positioning only.
  Selected photos remain contained and local in the preview. Live frames/audio
  are never uploaded or recorded. Streams stop on selection, expiry, page hiding
  or leaving, and late permission/capture completions cannot restore old streams.
  Unsupported/denied live capture retains the native phone-camera file input and
  photo-picker fallback; no extra screen or consent dialog is introduced. The
  existing kiosk consent gate remains before QR handoff. One short purpose-specific
  instruction appears over the preview, retaining relevant jewellery guidance;
  the large guidance-icon row is removed. **Switch Camera** retains its existing
  labelled button styling and position within the preview. The same large frame
  is used for local photo review. The compact bottom action area sticks within
  reach while scrolling; review keeps Upload Photo full-width above Retake Photo
  and Choose Another side by side. **Take Photo** is orange with white text; **Choose from Phone**
  is white with a neutral outline and dark text. Enabled **Take Photo** and
  **Upload Photo** buttons use the same gentle
  bulging pulse as Continue, stopping during capture/upload or when disabled and
  remaining static when reduced motion is requested. Other controls stay static.
  Controls adapt to narrow phones, with normal scrolling for short screens.
  Back uses browser history,
  or gives return-to-kiosk guidance when the QR opened a fresh tab.
  Expired upload sessions show **Upload link expired** and ask the customer to
  scan a new QR code at the kiosk, with photo/upload actions unavailable. Upload
  checks the server-derived deadline even if the browser suspended its timer;
  failed transfers recheck SelfX session status before showing a connection
  error. Expiry must not retain stale upload/connection messages. Genuine
  connection failures remain retryable while the session is active.
  Model/person uploads retain the accessible **Add Your Photo** heading; garment
  uploads retain **Add Garment Photo**. All action buttons use equal side-icon
  slots and centered labels, including Retake Photo, with no automatic icon
  margins that shift content. The page offers **Take Photo**, **Choose from Phone**, preview,
  **Choose Another** and explicit **Upload Photo**.
- Upload progress uses customer-safe text: "Uploading your photo...",
  "Validating photo..." and "Photo sent to the kiosk".
  Successful phone uploads replace camera/review controls with a rounded white
  confirmation card, an orange check in a peach halo, **Photo sent to the kiosk**
  and **You can return to the kiosk now.** The logo and Back remain above, with
  soft peach page accents. A lock-icon privacy note reads **Secure photo transfer**
  and explains that the photo is transferred securely and stored temporarily for
  Try-On; never claim that server-side storage does not occur.
- Expired/cancelled/consumed links show a safe terminal state telling the
  customer to return to the kiosk for a new QR.
- Expired kiosk QR sessions stop being displayed as usable; the kiosk refreshes
  to a new backend upload session before showing a scannable QR again.
- When a model/person upload is `READY`, the kiosk shows the uploaded photo
  preview with **Upload Another** and **Use This Photo**. Selecting it continues
  to production generation. When a garment upload is `READY`, selecting it opens
  garment review before the model/person photo step.
- KIOSK-4C UI does not add QR result handoff, customer account screens,
  checkout, catalog browsing or provider diagnostics.

---

# 28.1 SelfX Button and Visual System

- Typography:
  - kiosk H1/main heading: Manrope 700, 44-52px;
  - kiosk H2/screen title: Manrope 650/700, 30-36px;
  - kiosk section heading: Manrope 600, 22-26px;
  - kiosk body: Inter 400, 18-20px;
  - kiosk subtext: Inter 400, 16-18px;
  - kiosk buttons: Inter 600, 18-20px;
  - kiosk small labels: Inter 500, 14-16px.
- SaaS sidebar menu items use the same Inter-led SelfX type system through the
  shared `@selfx/ui` AppShell/sidebar boundary and should follow the shadcn
  sidebar composition pattern.
- Primary buttons: `#FF7119` background, white text, orange border.
- Active/selected buttons: same orange selected state.
- Secondary/inactive buttons: white/light background, dark text and neutral
  border.
- Ghost buttons: low-priority borderless treatment.
- Danger buttons: semantic red, never orange.
- Default button shape: premium rounded rectangle around 8-10px visual radius.
- SaaS web uses premium clean Shadcn-first surfaces.
- Windows, mobile and kiosk use solid premium cards/buttons rather than
  glassmorphism; readability takes priority over transparency.
- The required orange/white combination may need an accessible action variant
  before formal WCAG AA compliance.

### Elements

- live camera preview
- body-position guide
- clear capture button
- help/guidance
- cancel/back

### Preview Screen

- captured image
- Retake
- Continue

Do not display technical camera/provider errors to the customer.

---

# 29. Kiosk Physical Garment Capture

The existing garment capture view uses a taller, open white corner-bracket
frame over the live preview, with no inner garment drawing. Only this framing
artwork and button surfaces change: **Back**, with arrow and text, sits at the
top-left beside the guidance header. Back and **Upload From Mobile** share a
translucent dark background, white outline, icon and text. The bottom row contains
orange `#FF7119` **Capture** on the left and static **Upload From Mobile** on the
right where available. Capture gets more width; without phone upload it uses the
available bottom width. Buttons retain rounded pill shapes and single-line labels
that scale down to fit narrower widths. Capture's pulse glow follows its outline. Only
Capture uses the gentle action pulse, stopping when disabled or during countdown/
processing. During countdown the top-left control becomes **Cancel**, preserving
countdown cancellation while the guidance hides without moving the framing guide.
Back remains accessible when the camera is starting or unavailable.
Flip is removed from customer capture controls; operator
camera selection remains available. The left-side Stand straight, Look at camera
and Good lighting badges are removed; the centered heading, relevant icon,
supporting text and framing outline remain. Countdown, readiness, shutter and
phone-upload behavior stay unchanged. All person, garment and jewellery
capture panels share centered heading/supporting text, typography and spacing,
with the relevant icon immediately beside the heading, centered together as one
group, and supporting text centered below. Heading and supporting text use
moderately larger responsive sizes (22/16 logical pixels at the medium size).
Supporting text wraps instead of being restricted to one truncated line. Each
panel preserves its existing background and border. Person scope guidance and
product-specific jewellery wording/icons remain relevant to the capture target.
No logo or orange underline is added.

### Elements

- garment positioning guide
- camera preview
- capture button
- capture tips

### Preview

- garment photo
- Retake / Choose Another
- Continue

If input validation fails, explain the correction in customer-friendly language.

---

# 30. Kiosk Generating Screen

The kiosk must never freeze while AI runs.

### States

- validating
- queued
- processing
- recovering/retrying
- completed
- failed

### UX

Use friendly status text such as:

- Preparing your Try-On
- Your Try-On is in the queue
- Creating your look
- Almost ready

Do not display:

- provider name;
- provider request ID;
- HTTP errors;
- internal queue names.

Provide Cancel/Start Over only when safe.

---

# 31. Kiosk Result Screen

### Garment Result

- centered SelfX logo and top-left **Back**, with no Your Look heading;
- generated result filling a large rounded card edge to edge; cover fitting
  may crop display edges without changing the original generated asset;
- compact category icons/text sit in equal-width tab areas filling the available
  width with small eight-pixel gaps; tabs scroll when their minimum widths cannot
  fit. The selected category/icon is highlighted orange;
- shorter garment cards below categories use square image areas with cover
  fitting and no inner image padding (display edges may crop without stretching),
  a small inter-card gap and compact name/price footers.
  Selection shows an orange border and a small orange circle with a white tick
  at the image's top-right, removed on deselection or changing selection;
- catalog loading uses the existing repository/gateway at audience ALL, preserves
  cached images and shows a compact first-page product row without **Load More**.
  **Show All** opens the full catalog with its existing paging, Men/Women tabs
  and My Picks;
- no garment selected: one generated session look shows **Download My Looks**
  directly beside **Buy This Look** (disabled until buying is implemented).
  Multiple looks show **Get My Looks** and **Back to Home**. If the look count
  cannot yet be retrieved, retain My Looks with refresh/retry rather than assuming
  a single look. A selected garment hides the download/buy/home actions and shows only pulsing orange
  **Continue** aligned right. Deselecting restores the two actions. The footer
  has a small bottom margin and no unused action row; reclaimed height goes to
  the result preview;
- selecting a garment only updates temporary screen state. Tapping it again
  deselects it; changing category clears selection. Continue commits through
  existing catalog/session logic and uses the original accepted person photo,
  never the generated result, for the next Try-On;
- Get My Looks is orange with white text and the same gentle pulse as Continue,
  stopping when disabled. It retains the existing bottom-sheet/QR behavior and
  disabled-QR handling. Back to Home is a static white outlined button with dark
  text. The header has no camera shortcut;
- an existing queued pick remains available as **Try Next Pick** in the garment
  row; selection followed by Continue uses the existing next-pick/session path;
- Back uses normal navigation. Back to Home finishes and clears photo, picks and
  result; pending catalog work is guarded against replaced customer sessions;
- the result page observes session changes and keeps its last successful preview
  separate from the current attempt. Returning from a cancelled or failed attempt
  preserves that preview; a new success replaces it. Ending or replacing the
  customer session clears the preview immediately. Recovery navigation is not
  disabled by another action's busy state; generation and downloads retain
  session checks and duplicate-action protection. My Looks remains accessible
  after an unsuccessful attempt and uses the preserved image as a fallback;
- loading, empty categories, missing images and failures do not block downloads,
  finishing or full-catalog access. Short windows scroll rather than clipping.

### Jewellery Result

Jewellery retains its current Your Look heading, target-aware result preview/
full-image zoom, Browse Jewellery and Upload Another Photo. One generated look
shows Download My Looks and the disabled Buy This Look action directly; multiple
looks retain Get My Looks and Back to Home. Existing phone-based photo replacement,
queued-pick handling, session rules and generation policy remain unchanged.

Gallery/download viewers and original generated assets remain unchanged.
Customers can continue browsing garments in-session without another person photo
when the accepted photo meets the existing capture/compatibility policy.
---

# 32. Kiosk Failure Screen

Failure UI should distinguish recoverable actions without exposing technical details.

The generation failure screen uses the SelfX logo, a labelled **Back** control,
soft peach corner accents and a bundled friendly illustration. The centered
**Try-On Unavailable** heading has an orange underline; specific compatibility,
garment-resolution and photo-size titles/messages remain available. Messages
describe the actual failure rather than always asking for a clearer photo.
The shared action-card component renders orange/white **Try Again**, light blue
photo recovery and light peach item-selection actions with icon bubbles and
chevrons. Existing failure-specific actions, retry-polling and navigation are
preserved. Short windows scroll the content without clipping recovery controls.

For a garment-resolution failure, **Retake Garment Photo** opens the garment
camera directly, clearing the rejected garment/run while preserving the accepted
customer photo and session. **Back** from that camera restores the saved
customer-photo preview. This action does not retake the customer photo; the
separate **Update My Photo** compatibility recovery keeps its existing behavior.

Photo-compatibility guidance uses the same branded illustration layout while
preserving the item-specific heading, explanation and existing recovery wording.
**Update My Photo** is orange with white text and the same gentle pulse as
Continue. The alternative garment action uses a static white outlined secondary
surface. This styling applies both before generation and to compatibility
failures during generation; photo requirements and recovery navigation are unchanged.

Possible actions:

- Retry
- Retake Photo
- Choose Another Garment
- Start Over
- Finish

If service is temporarily unavailable, provide a clear non-blaming message.

---

# 33. Kiosk Offline Screen

If connectivity is unavailable:

- explain Try-On generation requires connection;
- optionally allow cached product browsing;
- provide retry connection action;
- do not silently retain large amounts of customer imagery for later submission.

---

# 34. Kiosk QR Handoff Screen

For multiple generated looks, **Get My Looks** opens a modal gallery sliding up over the result screen,
with white surfaces, rounded top corners and a black 52% dimming layer. Its
**My Looks** heading has an orange accent and a top-right **X** to close.
The sheet fits its content up to a maximum viewport height. Two looks use one
centered row of two, three use one row of three, four use two centered rows of
two, and five or more use three columns with only the required rows. Thumbnail
sizes stay consistent across counts. The countdown and buttons sit directly
below the grid; the gallery scrolls only when it exceeds the available height,
keeping the header and footer accessible. The large complete-image preview keeps
its proportions with rounded corners clipped to the actual fitted image.
Selecting a thumbnail updates the preview and highlights that
look with an orange border and checkmark. Available product names label looks;
otherwise use numbered Look labels without inventing product metadata.

A five-minute **Download available MM:SS** strip sits above **Download My Looks**,
which replaces the gallery content with a centered rounded download popup on the
same modal route. Only one popup is visible. The centered SelfX logo and top-right
**X** sit above a large orange-bordered QR. Centered Download My Looks text, scan
instructions and link expiry appear below the QR, followed by Select More Looks
and Back to Home buttons. Narrow screens stack the buttons, and short windows
scroll the content and actions. A single generated look bypasses the gallery:
the result screen's Download My Looks opens this QR popup directly. The existing secure
session-wide share link, link expiry and failure/retry behavior are preserved.
**Select More Looks** restores the gallery, selected thumbnail and its original
download countdown for multiple looks; for a single look it closes to the result.
**Back to Home** ends the customer session and clears its
photo, result and picks. **X** closes the sheet back to the result.
Thumbnail selection changes the preview only; the share still includes
the session's looks. **Buy This Look** is visible but disabled pending the buying
flow. Short windows scroll the gallery while keeping the close and footer controls
available; narrow windows stack the actions. **X**, system Back or tapping the
dimmed background closes the sheet without clearing the result, photo or picks.

### Elements

- QR code
- selected product
- brief instruction
- expiration guidance if appropriate
- Select More Looks
- Back to Home

One QR shares all generated looks from the current session, regardless of the
selected thumbnail. The QR itself contains only the opaque SelfX handoff token/link.

---

# 35. Customer Mobile / Web Product Flow

Recommended product screen:

- product image/gallery
- product name
- merchant
- price
- variants where applicable
- product details
- **Try It On**
- **Continue to Store / Buy at Merchant** where appropriate

The purchase destination belongs to the merchant.

---

# 36. Customer Mobile / Web Try-On Flow

Product  
→ Try It On  
→ Choose/Re-use Person Image  
→ Consent if required  
→ Preview  
→ Generate  
→ Queued/Processing  
→ Result  
→ Save / Try Another / Continue to Merchant

Authenticated users may access history.

Anonymous users may be prompted to sign in only when they choose to save/access later.

---

# 37. Customer History UI

### List

- result thumbnail while retained
- product
- merchant
- date/time
- status

### Expired Image State

When image retention expires:

- do not show a broken image;
- show a clear placeholder;
- retain permitted product/history metadata;
- allow merchant product continuation where valid.

---

# 38. QR Mobile Continuation

When customer scans kiosk QR:

### Possible Screen

- generated result where still permitted
- selected product
- merchant
- product details
- continue to merchant
- sign in to save

Expired/invalid handoff tokens should show a clear expired-session screen rather than a generic server error.

---

# 39. Shopify Storefront Try-On UI

SelfX appears alongside the normal Shopify product experience.

Typical placement:

Product information  
→ variant selection  
→ **Try It On**  
→ Add to Cart / Buy Now

Try-On may open as:

- modal;
- drawer;
- embedded panel;
- another approved theme-extension pattern.

Core flow:

Start Try-On  
→ person image  
→ preview  
→ generate  
→ result  
→ close/continue shopping

Shopify checkout remains unchanged.

---

# 40. WooCommerce Storefront Try-On UI

The WooCommerce experience follows the same SelfX Try-On interaction model as Shopify.

Merchant styling may differ, but the Try-On steps and status behavior should remain recognizable.

WooCommerce cart/checkout remains unchanged.

---

# 41. Shared Loading States

Every major data-driven screen should define:

- initial skeleton/loading;
- inline action loading;
- background refresh;
- retry state.

Avoid blank screens with only a spinner when meaningful skeletons/statuses can be shown.

---

# 42. Shared Empty States

Examples:

- No stores yet → Create Store
- No staff yet → Invite Staff
- No products → Add/Connect Products
- No kiosks → Pair Kiosk
- No API keys → Create API Key
- No Try-Ons → explain that activity will appear after first generation
- No integrations → Connect Shopify/WooCommerce

Empty states should usually include the next useful action when the user has permission.

---

# 43. Shared Error States

Errors should be grouped into user-meaningful categories:

- validation error
- permission denied
- subscription/entitlement restriction
- network error
- service temporarily unavailable
- Try-On input problem
- Try-On provider failure
- integration authentication required

Do not expose stack traces or raw provider errors.

---

# 44. Permission-Aware UI

The UI must respect roles and scopes.

Examples:

- Store Staff should not see platform billing.
- Store Manager should not see unrelated stores.
- Organization Admin may see organization-wide controls if permitted.
- SelfX Support sees only support-authorized functions.
- Public API settings appear only with entitlement and permission.

Hiding controls is a UX measure only; backend authorization remains mandatory.

---

# 45. Suspended / Grace State UX

When an organization is in pending activation, grace or suspended state:

- show a clear banner/status;
- explain affected capabilities;
- preserve access to allowed business data;
- provide resolution/contact/billing action where appropriate;
- do not imply data has been deleted.

Pending activation should direct the applicant to onboarding/status actions and must not expose normal operational dashboard functionality.

Try-On generation may be disabled while read-only/management capabilities remain according to policy.

---

# 46. Responsive Web Behavior

Organization/SelfX dashboards should primarily optimize for desktop/tablet administration while remaining usable on smaller screens.

Responsive rules should include:

- collapsible navigation;
- stacked cards;
- responsive tables or alternate list/card views;
- dialogs/drawers appropriate to screen size;
- accessible touch targets.

---

# 47. Accessibility

SelfX web UI should follow standard accessibility practices including:

- keyboard navigation;
- visible focus;
- semantic form labels;
- accessible dialogs;
- meaningful status text;
- sufficient contrast;
- alternative text where appropriate.

Camera/Try-On instructions should use both visual and textual cues when practical.

---

# 48. Confirmation Patterns

Sensitive actions require explicit confirmation.

Examples:

- unpair kiosk;
- disable staff;
- revoke API key;
- disconnect integration;
- start impersonation;
- suspend organization where applicable.

Confirmation dialogs should clearly state impact and avoid vague labels like “Are you sure?” without context.

---

# 49. Notification Patterns

Use consistent UI notifications:

- toast for lightweight success;
- inline validation for form issues;
- banner for persistent system/organization state;
- modal/dialog for destructive confirmation;
- dedicated screen for full-flow failures.

---

# 50. UI/UX Guardrails

Do not:

- show raw provider terminology to customers;
- expose secrets in admin screens;
- expose original customer images to Store Managers;
- make customers log in before basic anonymous kiosk Try-On;
- place checkout/payment UI on the kiosk in the initial product;
- create inconsistent screen patterns for the same action across modules;
- introduce another full design system without justification;
- rely on hidden UI controls as authorization;
- display previous customer kiosk data after session reset;
- use permanent public customer-image URLs.

---

# 51. Status

**UI/UX Flow & Screen Specification v1.0 — APPROVED BASELINE**

This document is sufficient to guide detailed Figma/design work and implementation planning while leaving exact visual styling and component composition to the approved SelfX design system.
