# Move the platform catalog to Avinash stores

Prepared: 2026-10-17. Production has not been accessed or changed.

This is an explicitly run maintenance tool, not a schema migration or application
startup task. Deploying this code does not transfer products. The platform
Products pages and fallback remain in place until a separate retirement change.

## What is transferred

All current `PLATFORM_DEFAULT` products with no merchant tenant, including both
garments and jewellery and inactive products, move into one ACTIVE Store. The
destination slug in these examples is `avinash-stores`; the dry run prints its
actual name and UUID for verification. SelfX uses the internal `organizations`
row as the Store tenant, not the legacy child `stores` table.

Product IDs and referenced category IDs are preserved. Category/product ownership
and catalog keys change together. Existing destination products are not overwritten.
If slugs collide, the plan allocates deterministic audience/ID suffixes and lists
every rename. Names, descriptions, audiences, product types, prices, active/VTO
states and generation settings remain unchanged. Unused platform categories are
left alone.

Stored images are copied to a transfer-specific path under
`catalog/stores/STORE_UUID/`. Copies are validated and read back for SHA-256
comparison before the ownership transaction. Original objects are retained.
For stored images the old `imageUrl` is cleared so reads use the Store-owned copy.
URL-only images keep their URLs; the command does not fetch arbitrary external
URLs, so manually verify that those URLs are durable and usable.

Customer photos, sessions, results, historical run/look ownership, existing
billing records, plans, memberships and kiosk assignments are not moved. Stock is
not invented: configure sizes, colours and actual quantities separately before
shopping. A successful transfer increments existing configurations for active
kiosks so their normal refresh path notices the catalog change. It does not
assign any kiosk to Avinash stores.

Other Stores that relied on platform fallback will lose those fallback products.
Their own products remain unchanged. Offline kiosks can show old cached entries
until reconnecting; the backend resolves new product selections against current
ownership.

## 1. Deploy the tool and make a backup

Push and deploy this revision to the **API service**, using its normal API build.
The compiled command is `npm run catalog:transfer --workspace @selfx/api`.
No new dependency, database migration, frontend deployment or new secret is
required for this tool.

Before applying, create a fresh backup in the production PostgreSQL service's
**Backups** tab or take a verified logical database export. The catalog plan is a
row-level inverse manifest, not a substitute for a database backup. Railway's
[Postgres backup guide](https://docs.railway.com/guides/postgres-backups-restores)
describes manual backups and exports.

Use a brief quiet window: stop catalog edits, catalog seeding/sync jobs and
catalog-based kiosk testing while previewing/applying. The tool refuses current
queued/processing source-product Try-Ons, but that check is not a replacement for
pausing new test requests during an ownership transfer.

## 2. Open the deployed API shell

In Railway, select the correct production project/environment and the **API
service**, then use **Copy SSH Command** and run that command on your computer.
This selects the right container without guessing its service name. Railway's
[SSH documentation](https://docs.railway.com/cli/ssh) also supports explicit
project/service/environment flags.

Inside the shell, work from the deployed repository root containing the root
`package.json` and `backend/api/package.json`. Check the command is deployed:

```sh
npm run catalog:transfer --workspace @selfx/api -- --help
```

Use this API shell so the private Railway database hostname and existing object
storage credentials work. `railway run` executes locally; it is not interchangeable
with running inside the deployed API container when `DATABASE_URL` uses private DNS.
Do not print or send `DATABASE_URL`, storage keys or passwords.

## 3. Generate and review the dry run

Run inside the API shell:

```sh
npm run catalog:transfer --workspace @selfx/api -- --dry-run --store-slug avinash-stores --out /tmp/avinash-catalog-plan.json
```

This uses a PostgreSQL read-only transaction and storage HEAD requests. It writes
only the private JSON artifact; no database row or storage object changes.
Existing artifact files are not overwritten: use a new filename for a new plan.

Check the printed Store name/UUID, product/category counts, garment/jewellery
counts, stored-image copy count, slug changes, historical reference counts and
warnings. The full artifact lists each product/category and its original values.
It contains catalog business data and image references, not customer images or
database/storage credentials. Keep it private; do not commit it to Git.

Save the plan off the container before applying or redeploying. Railway documents
SCP using its service-instance SSH target. On your local computer, replace the
placeholder with the **API Service Instance ID**, not its Service ID:

```sh
scp API_SERVICE_INSTANCE_ID@ssh.railway.com:/tmp/avinash-catalog-plan.json ./avinash-catalog-plan.json
```

Use the identity/SSH options from your copied SSH command if necessary. Plan
files under `/tmp` are ephemeral and may disappear on redeploy. Keep the same
container/session through the reviewed transfer.

If products, destination data, historical reference counts or Railway
project/environment change after preview, apply refuses the old plan. Generate
and review a fresh one; do not edit the JSON or its hash to bypass the check.

## 4. Apply the reviewed plan

Use your actual active **platform administrator login email**, not the Avinash
Store owner's email unless that user also has platform permissions. The command
validates platform Products management and Store update permissions without
changing the permission registry. Database credentials still provide the CLI's
access; the supplied operator email provides validated administrative attribution.

Copy the exact `target.id` and `planHash` from the dry run. Replace the placeholders:

```sh
npm run catalog:transfer --workspace @selfx/api -- --apply --plan /tmp/avinash-catalog-plan.json --store-id STORE_UUID_FROM_DRY_RUN --confirm-plan PLAN_HASH_FROM_DRY_RUN --actor-email YOUR_PLATFORM_LOGIN --backup /tmp/avinash-catalog-before-apply.json
```

Before mutation, the script saves another private copy of the inverse manifest.
It copies images, rechecks the complete plan under short catalog write locks,
then changes categories/products and records cache-version increments plus an
actor-attributed audit entry in one transaction. It never calls an AI provider.
The audit entry also retains the inverse manifest and hash in the database.

Successful output is `APPLIED`. Repeating the same completed plan returns
`ALREADY_APPLIED` without copying/moving anything again. Do not automatically
retry a different plan against partially understood state.

## 5. Verify and retain the artifacts

- Sign in to Avinash stores and check garments, jewellery, prices, images and
  edit forms. Compare counts to the reviewed plan.
- Confirm other Stores' existing products and historical Try-On access still work.
- Pair/assign a test kiosk to Avinash stores through normal Store management.
  Refresh its catalog and test with an actual Store account.
- Configure real stock/variants separately before enabling purchases.
- Download `/tmp/avinash-catalog-before-apply.json` in the same way as the plan.
  Retain the database backup and both manifests privately.
- Do not run `catalog:seed` afterwards: that existing tool can recreate platform
  defaults under their former catalog keys. Platform catalog retirement follows
  only after the Store transfer is verified.

## Failures and recovery

A backup-write or image-copy failure leaves catalog ownership unchanged. A
database commit failure rolls back category/product changes, cache-version
increments and audit creation together. Some new image copies may remain as
unused objects; originals remain intact, and the tool never deletes them.

For a retry of the same plan, an existing identical backup file is accepted.
A stale plan requires a new dry run. Lock contention fails after a short wait;
resolve active catalog work rather than repeatedly forcing production writes.
Source products with stock, integration mappings, storefront sessions, mixed
ownership or shared cross-scope categories require review instead of an automatic
transfer.

There is deliberately no automatic rollback command. After Store staff edit or
sell migrated products, blindly restoring old ownership can break newer records.
Use the before-state manifest/audit and database backup to prepare a reviewed
targeted reversal. Do not restore the entire production database over newer
business activity without assessing it.

## Local verification

The transfer integration suite uses a dedicated local PostgreSQL database and
simulated object storage. Production was not inspected, connected to or modified.

- 28 tests passed: 9 transfer integration tests plus catalog/Store regressions.
- Backend TypeScript and changed-code ESLint passed.
- API production build passed, producing the compiled maintenance command.
- Compiled `--help` worked, and incomplete `--apply` was rejected before any
  database/environment loading.
- Formatting and `git diff --check` passed.

Tests verify collisions, retained IDs, stored-image copying and failure handling,
preserved historical customer photos/results and other Stores' products, stale
plans, operator permissions, rollback, cache-version increments and idempotency.
