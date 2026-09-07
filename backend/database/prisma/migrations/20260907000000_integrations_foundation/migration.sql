CREATE TYPE "IntegrationType" AS ENUM ('SHOPIFY', 'WOOCOMMERCE');

CREATE TYPE "IntegrationStatus" AS ENUM ('ACTIVE', 'DISCONNECTED', 'ERROR');

CREATE TYPE "IntegrationCredentialStatus" AS ENUM ('ACTIVE', 'REVOKED');

CREATE TYPE "IntegrationEventStatus" AS ENUM (
  'RECEIVED',
  'PROCESSED',
  'FAILED',
  'IGNORED'
);

CREATE TYPE "ExternalProductMappingStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

CREATE TABLE "integrations" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "type" "IntegrationType" NOT NULL,
  "status" "IntegrationStatus" NOT NULL DEFAULT 'ACTIVE',
  "external_account_id" VARCHAR(180),
  "external_account_name" VARCHAR(240),
  "metadata_json" JSONB,
  "connected_at" TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP,
  "disconnected_at" TIMESTAMPTZ(3),
  "created_by_user_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "integrations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "integration_credentials" (
  "id" UUID NOT NULL,
  "integration_id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "token_prefix" VARCHAR(48) NOT NULL,
  "token_hash" VARCHAR(128) NOT NULL,
  "scopes_json" JSONB NOT NULL,
  "status" "IntegrationCredentialStatus" NOT NULL DEFAULT 'ACTIVE',
  "expires_at" TIMESTAMPTZ(3),
  "last_used_at" TIMESTAMPTZ(3),
  "created_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revoked_at" TIMESTAMPTZ(3),

  CONSTRAINT "integration_credentials_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "integration_events" (
  "id" UUID NOT NULL,
  "integration_id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "external_event_id" VARCHAR(220) NOT NULL,
  "event_type" VARCHAR(120) NOT NULL,
  "status" "IntegrationEventStatus" NOT NULL DEFAULT 'RECEIVED',
  "payload_json" JSONB,
  "processed_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "integration_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "external_product_mappings" (
  "id" UUID NOT NULL,
  "integration_id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "external_product_id" VARCHAR(180) NOT NULL,
  "external_variant_id" VARCHAR(180),
  "external_sku" VARCHAR(120),
  "external_handle" VARCHAR(220),
  "status" "ExternalProductMappingStatus" NOT NULL DEFAULT 'ACTIVE',
  "metadata_json" JSONB,
  "external_updated_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "external_product_mappings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "integrations_organization_id_type_key"
  ON "integrations"("organization_id", "type");
CREATE INDEX "integrations_organization_id_status_idx"
  ON "integrations"("organization_id", "status");
CREATE INDEX "integrations_type_status_idx"
  ON "integrations"("type", "status");
CREATE INDEX "integrations_created_by_user_id_idx"
  ON "integrations"("created_by_user_id");

CREATE INDEX "integration_credentials_integration_id_idx"
  ON "integration_credentials"("integration_id");
CREATE INDEX "integration_credentials_organization_id_status_idx"
  ON "integration_credentials"("organization_id", "status");
CREATE INDEX "integration_credentials_token_prefix_idx"
  ON "integration_credentials"("token_prefix");
CREATE INDEX "integration_credentials_created_by_user_id_idx"
  ON "integration_credentials"("created_by_user_id");

CREATE UNIQUE INDEX "integration_events_integration_id_external_event_id_key"
  ON "integration_events"("integration_id", "external_event_id");
CREATE INDEX "integration_events_organization_id_created_at_idx"
  ON "integration_events"("organization_id", "created_at");
CREATE INDEX "integration_events_integration_id_status_created_at_idx"
  ON "integration_events"("integration_id", "status", "created_at");
CREATE INDEX "integration_events_event_type_created_at_idx"
  ON "integration_events"("event_type", "created_at");

CREATE INDEX "external_product_mappings_integration_id_idx"
  ON "external_product_mappings"("integration_id");
CREATE INDEX "external_product_mappings_organization_id_status_idx"
  ON "external_product_mappings"("organization_id", "status");
CREATE INDEX "external_product_mappings_product_id_idx"
  ON "external_product_mappings"("product_id");
CREATE INDEX "external_product_mappings_integration_id_external_product_id_idx"
  ON "external_product_mappings"("integration_id", "external_product_id");
CREATE INDEX "external_product_mappings_integration_id_external_sku_idx"
  ON "external_product_mappings"("integration_id", "external_sku");
CREATE UNIQUE INDEX "external_product_mappings_external_identity_key"
  ON "external_product_mappings"(
    "integration_id",
    "external_product_id",
    COALESCE("external_variant_id", '')
  );

ALTER TABLE "integrations"
  ADD CONSTRAINT "integrations_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "integrations"
  ADD CONSTRAINT "integrations_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "integration_credentials"
  ADD CONSTRAINT "integration_credentials_integration_id_fkey"
  FOREIGN KEY ("integration_id") REFERENCES "integrations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "integration_credentials"
  ADD CONSTRAINT "integration_credentials_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "integration_credentials"
  ADD CONSTRAINT "integration_credentials_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "integration_events"
  ADD CONSTRAINT "integration_events_integration_id_fkey"
  FOREIGN KEY ("integration_id") REFERENCES "integrations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "integration_events"
  ADD CONSTRAINT "integration_events_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "external_product_mappings"
  ADD CONSTRAINT "external_product_mappings_integration_id_fkey"
  FOREIGN KEY ("integration_id") REFERENCES "integrations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "external_product_mappings"
  ADD CONSTRAINT "external_product_mappings_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "external_product_mappings"
  ADD CONSTRAINT "external_product_mappings_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION pg_temp.selfx_integrations_uuid(input text) RETURNS uuid AS $$
DECLARE
  hash text;
BEGIN
  hash := md5(input);
  RETURN (
    substr(hash, 1, 8) || '-' ||
    substr(hash, 9, 4) || '-4' || substr(hash, 14, 3) || '-' ||
    substr('89ab', (('x' || substr(hash, 17, 1))::bit(4)::int % 4) + 1, 1) ||
    substr(hash, 18, 3) || '-' ||
    substr(hash, 21, 12)
  )::uuid;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

INSERT INTO "permissions" (
  "id",
  "code",
  "module",
  "action",
  "label",
  "description",
  "applicability",
  "is_system",
  "updated_at"
)
VALUES
  (pg_temp.selfx_integrations_uuid('permission:INTEGRATIONS_VIEW'), 'INTEGRATIONS_VIEW', 'platform.integrations', 'view', 'View Integrations', 'View Store integration status across SelfX.', 'PLATFORM_ONLY', true, CURRENT_TIMESTAMP),
  (pg_temp.selfx_integrations_uuid('permission:INTEGRATIONS_MANAGE'), 'INTEGRATIONS_MANAGE', 'platform.integrations', 'manage', 'Manage Integrations', 'Connect, disconnect and create Store integration credentials.', 'PLATFORM_ONLY', true, CURRENT_TIMESTAMP),
  (pg_temp.selfx_integrations_uuid('permission:integrations.manage'), 'integrations.manage', 'integrations', 'manage', 'Manage Integrations', 'Connect, disconnect and create Store-scoped integration credentials.', 'STORE', true, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE
SET
  "module" = EXCLUDED."module",
  "action" = EXCLUDED."action",
  "label" = EXCLUDED."label",
  "description" = EXCLUDED."description",
  "applicability" = EXCLUDED."applicability",
  "is_system" = EXCLUDED."is_system",
  "updated_at" = CURRENT_TIMESTAMP;

WITH role_permission_codes("system_code", "permission_code") AS (
  VALUES
    ('platform-staff-admin', 'INTEGRATIONS_VIEW'),
    ('platform-staff-admin', 'INTEGRATIONS_MANAGE')
)
INSERT INTO "platform_role_permissions" (
  "id",
  "role_id",
  "permission_id"
)
SELECT
  pg_temp.selfx_integrations_uuid('platform-role-permission:' || pr."id"::text || ':' || p."id"::text),
  pr."id",
  p."id"
FROM "platform_roles" pr
JOIN role_permission_codes rpc ON rpc."system_code" = pr."system_code"
JOIN "permissions" p ON p."code" = rpc."permission_code"
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

WITH store_permission_codes("permission_code") AS (
  VALUES
    ('integrations.manage')
)
INSERT INTO "store_permission_grants" (
  "id",
  "store_tenant_id",
  "permission_id"
)
SELECT
  pg_temp.selfx_integrations_uuid('store-permission-grant:' || o."id"::text || ':' || p."id"::text),
  o."id",
  p."id"
FROM "organizations" o
CROSS JOIN "permissions" p
JOIN store_permission_codes spc ON spc."permission_code" = p."code"
ON CONFLICT ("store_tenant_id", "permission_id") DO NOTHING;

WITH role_permission_codes("system_code", "permission_code") AS (
  VALUES
    ('store-admin', 'integrations.manage'),
    ('manager', 'integrations.manage')
)
INSERT INTO "store_role_permissions" (
  "id",
  "role_id",
  "permission_id"
)
SELECT
  pg_temp.selfx_integrations_uuid('store-role-permission:' || sr."id"::text || ':' || p."id"::text),
  sr."id",
  p."id"
FROM "store_roles" sr
JOIN role_permission_codes rpc ON rpc."system_code" = sr."system_code"
JOIN "permissions" p ON p."code" = rpc."permission_code"
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
