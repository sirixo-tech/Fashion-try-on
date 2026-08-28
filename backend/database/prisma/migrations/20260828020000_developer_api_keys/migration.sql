CREATE TABLE "api_keys" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "key_prefix" VARCHAR(40) NOT NULL,
  "secret_hash" VARCHAR(128) NOT NULL,
  "environment" VARCHAR(20) NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  "scopes_json" JSONB NOT NULL,
  "expires_at" TIMESTAMPTZ(3),
  "last_used_at" TIMESTAMPTZ(3),
  "created_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revoked_at" TIMESTAMPTZ(3),

  CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "api_keys_organization_id_idx" ON "api_keys"("organization_id");
CREATE INDEX "api_keys_key_prefix_idx" ON "api_keys"("key_prefix");
CREATE INDEX "api_keys_organization_id_status_idx" ON "api_keys"("organization_id", "status");

ALTER TABLE "api_keys"
  ADD CONSTRAINT "api_keys_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "api_keys"
  ADD CONSTRAINT "api_keys_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION pg_temp.selfx_developer_api_uuid(input text) RETURNS uuid AS $$
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
  (pg_temp.selfx_developer_api_uuid('permission:DEVELOPER_API_VIEW'), 'DEVELOPER_API_VIEW', 'platform.developer_api', 'view', 'View Developer API', 'View Store developer API keys across SelfX.', 'PLATFORM_ONLY', true, CURRENT_TIMESTAMP),
  (pg_temp.selfx_developer_api_uuid('permission:DEVELOPER_API_MANAGE'), 'DEVELOPER_API_MANAGE', 'platform.developer_api', 'manage', 'Manage Developer API', 'Create and revoke Store developer API keys.', 'PLATFORM_ONLY', true, CURRENT_TIMESTAMP),
  (pg_temp.selfx_developer_api_uuid('permission:developer_api.view'), 'developer_api.view', 'developer_api', 'view', 'View Developer API', 'View Store API keys for external integrations.', 'STORE', true, CURRENT_TIMESTAMP),
  (pg_temp.selfx_developer_api_uuid('permission:developer_api.manage'), 'developer_api.manage', 'developer_api', 'manage', 'Manage Developer API', 'Create and revoke Store API keys for external integrations.', 'STORE', true, CURRENT_TIMESTAMP)
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
    ('platform-staff-admin', 'DEVELOPER_API_VIEW'),
    ('platform-staff-admin', 'DEVELOPER_API_MANAGE')
)
INSERT INTO "platform_role_permissions" (
  "id",
  "role_id",
  "permission_id"
)
SELECT
  pg_temp.selfx_developer_api_uuid('platform-role-permission:' || pr."id"::text || ':' || p."id"::text),
  pr."id",
  p."id"
FROM "platform_roles" pr
JOIN role_permission_codes rpc ON rpc."system_code" = pr."system_code"
JOIN "permissions" p ON p."code" = rpc."permission_code"
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

WITH store_permission_codes("permission_code") AS (
  VALUES
    ('developer_api.view'),
    ('developer_api.manage')
)
INSERT INTO "store_permission_grants" (
  "id",
  "store_tenant_id",
  "permission_id"
)
SELECT
  pg_temp.selfx_developer_api_uuid('store-permission-grant:' || o."id"::text || ':' || p."id"::text),
  o."id",
  p."id"
FROM "organizations" o
CROSS JOIN "permissions" p
JOIN store_permission_codes spc ON spc."permission_code" = p."code"
ON CONFLICT ("store_tenant_id", "permission_id") DO NOTHING;

WITH role_permission_codes("system_code", "permission_code") AS (
  VALUES
    ('store-admin', 'developer_api.view'),
    ('store-admin', 'developer_api.manage'),
    ('manager', 'developer_api.view'),
    ('manager', 'developer_api.manage')
)
INSERT INTO "store_role_permissions" (
  "id",
  "role_id",
  "permission_id"
)
SELECT
  pg_temp.selfx_developer_api_uuid('store-role-permission:' || sr."id"::text || ':' || p."id"::text),
  sr."id",
  p."id"
FROM "store_roles" sr
JOIN role_permission_codes rpc ON rpc."system_code" = sr."system_code"
JOIN "permissions" p ON p."code" = rpc."permission_code"
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
