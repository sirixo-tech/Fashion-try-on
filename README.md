# SelfX Virtual Try-On

SelfX is a multi-tenant SaaS platform for AI-powered clothing Virtual Try-On.

This repository is currently implemented through Phase 4: repository
foundation, PostgreSQL/Prisma, staff authentication, organization
registration/review/activation, and active organization/store/membership RBAC.
It also includes the shared SelfX web design-system foundation and authenticated
admin shell. The Phase 4 web UI decision has been revised so Mantine is the
primary SelfX web component system, while shadcn/ui remains available only as a
secondary source where justified. It intentionally contains no product catalog, customer accounts,
Try-On logic, queueing, storage, AI provider, kiosk business flow, integrations,
operational dashboards, or billing implementation.

## Requirements

- Node.js 24 LTS
- npm 11

## Install

```bash
npm install
```

## Development

```bash
npm run dev
```

Run individual services:

```bash
npm run dev:web
npm run dev:api
npm run dev:worker
```

For a production-mode local web smoke test on the approved SelfX web port:

```bash
npm run start:local --workspace @selfx/web
```

Current Phase 0 structure:

```text
frontend/web
backend/api
backend/worker
packages/ui
packages/api-client
packages/shared
packages/config
mobile/kiosk
mobile/customer-app
integrations/shopify
integrations/woocommerce
```

Phase 4 web design-system files:

```text
frontend/web/components.json
frontend/web/app/app
packages/ui/components.json
packages/ui/src/theme
packages/ui/src/components
packages/ui/src/selfx
packages/ui/src/styles/globals.css
```

Phase 4 UI architecture:

- Mantine is the primary web UI/component framework.
- `packages/ui` owns the shared SelfX Mantine theme, provider and reusable web
  components.
- shadcn/ui remains installed only as a secondary component source; generated
  shadcn files live in `packages/ui/src/components`.
- Tailwind remains secondary utility/layout infrastructure and compatibility
  support, not the primary component system.
- New common admin UI should import reusable SelfX components from `@selfx/ui`
  and use Mantine-first components by default.

Phase 4 page/layout standards:

- Page anatomy is `PageContainer` → `PageHeader` → `PageSection`/content.
- Width modes are `wide` for dashboard/list/admin workspaces, `medium` for
  detail/settings pages and `form` for create/edit forms.
- Standard card surfaces are `StatCard`, `SectionCard`, `SummaryCard`,
  `ActionCard` and `TableContainer`.
- Future list pages should compose `FilterBar` and `TableContainer` with an
  explicit pagination/footer region rather than creating one-off table chrome.
- Forms should use `FormPageContainer`, `FormSection` and `FormActions` with
  one-column layout by default and responsive collapse for compact grouped
  fields.
- New pages should not invent arbitrary spacing, card shadows, radii or visual
  systems outside the shared SelfX Mantine theme and `@selfx/ui` primitives.

Default local ports:

- Web: `http://localhost:3002`
- API: `http://localhost:3001`
- PostgreSQL: `localhost:5433`

The API placeholder health endpoint is available at:

```text
GET /health
```

## Local Bootstrap

Create the first local staff user explicitly:

```bash
npm run auth:bootstrap
```

Assign that existing local user the development-only SelfX platform admin role
explicitly:

```bash
npm run platform:bootstrap
```

Both commands require their corresponding `SELFX_*_BOOTSTRAP_ENABLED` variables
and are blocked in `NODE_ENV=production`.

Create/update temporary local demo logins for each current platform and
merchant role explicitly:

```bash
npm run demo:bootstrap
```

These accounts all use the local-only `SELFX_DEMO_LOGIN_PASSWORD` from `.env`.
The current local value is `SelfXLocalAdmin123!`.

| Role                       | Email                             |
| -------------------------- | --------------------------------- |
| Existing local super admin | `admin@selfx.local`               |
| SELFX_SUPER_ADMIN          | `platform.superadmin@selfx.local` |
| SELFX_SUPPORT_ADMIN        | `platform.support@selfx.local`    |
| ORGANIZATION_OWNER         | `owner@selfx.local`               |
| ORGANIZATION_ADMIN         | `org.admin@selfx.local`           |
| ORGANIZATION_STAFF         | `org.staff@selfx.local`           |
| STORE_OWNER                | `store.owner@selfx.local`         |
| STORE_MANAGER              | `store.manager@selfx.local`       |
| STORE_STAFF                | `store.staff@selfx.local`         |
| KIOSK_OPERATOR             | `kiosk.operator@selfx.local`      |

## Database

The canonical Prisma schema and migration history live in:

```text
backend/database/prisma
```

Copy `.env.example` to `.env` and set `DATABASE_URL` for local development.
Use `TEST_DATABASE_URL` for isolated migration/integration checks.

Useful commands:

```bash
npm run db:validate
npm run db:generate
npm run db:migrate:dev
npm run db:migrate:deploy
npm run db:migrate:status
npm run db:test:uuid
```

SelfX primary IDs are generated in the application layer with UUIDv7 and stored
as PostgreSQL native `uuid` columns. The Phase 1 implementation uses the npm
`uuid` package from `backend/database`.

## Verification

```bash
npm run lint
npm run typecheck
npm run build
npm run format:check
npm test --workspace @selfx/web
```

## Phase Boundary

Phase 4 implements the shared web design system and admin shell only. Products,
customers, Try-On, Redis/BullMQ, AI providers, kiosk functionality,
integrations, operational dashboards, Public API functionality and billing must
be implemented only when their later phases are explicitly approved.
