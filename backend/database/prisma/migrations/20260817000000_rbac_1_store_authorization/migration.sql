-- RBAC-1 Store authorization foundation.
-- Product Store continues to map to the existing organizations tenant row.

ALTER TYPE "PlatformRole" ADD VALUE IF NOT EXISTS 'SELFX_STAFF_ADMIN';

CREATE TABLE "permissions" (
  "id" UUID NOT NULL,
  "code" VARCHAR(120) NOT NULL,
  "module" VARCHAR(80) NOT NULL,
  "action" VARCHAR(80) NOT NULL,
  "label" VARCHAR(160) NOT NULL,
  "description" TEXT,
  "is_system" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "store_roles" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "system_code" VARCHAR(80),
  "name" VARCHAR(120) NOT NULL,
  "description" TEXT,
  "is_system" BOOLEAN NOT NULL DEFAULT false,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "store_roles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "store_role_permissions" (
  "id" UUID NOT NULL,
  "role_id" UUID NOT NULL,
  "permission_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "store_role_permissions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "store_membership_roles" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "membership_id" UUID NOT NULL,
  "role_id" UUID NOT NULL,
  "assigned_by_user_id" UUID,
  "assigned_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "store_membership_roles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");
CREATE INDEX "permissions_module_action_idx" ON "permissions"("module", "action");

CREATE UNIQUE INDEX "store_roles_organization_id_id_key" ON "store_roles"("organization_id", "id");
CREATE UNIQUE INDEX "store_roles_organization_id_name_key" ON "store_roles"("organization_id", "name");
CREATE UNIQUE INDEX "store_roles_organization_id_system_code_key" ON "store_roles"("organization_id", "system_code");
CREATE INDEX "store_roles_organization_id_is_active_idx" ON "store_roles"("organization_id", "is_active");

CREATE UNIQUE INDEX "store_role_permissions_role_id_permission_id_key" ON "store_role_permissions"("role_id", "permission_id");
CREATE INDEX "store_role_permissions_permission_id_idx" ON "store_role_permissions"("permission_id");

CREATE UNIQUE INDEX "store_membership_roles_membership_id_role_id_key" ON "store_membership_roles"("membership_id", "role_id");
CREATE INDEX "store_membership_roles_organization_id_idx" ON "store_membership_roles"("organization_id");
CREATE INDEX "store_membership_roles_role_id_idx" ON "store_membership_roles"("role_id");
CREATE INDEX "store_membership_roles_assigned_by_user_id_idx" ON "store_membership_roles"("assigned_by_user_id");

ALTER TABLE "store_roles"
  ADD CONSTRAINT "store_roles_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "store_role_permissions"
  ADD CONSTRAINT "store_role_permissions_role_id_fkey"
  FOREIGN KEY ("role_id") REFERENCES "store_roles"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "store_role_permissions"
  ADD CONSTRAINT "store_role_permissions_permission_id_fkey"
  FOREIGN KEY ("permission_id") REFERENCES "permissions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "store_membership_roles"
  ADD CONSTRAINT "store_membership_roles_organization_id_membership_id_fkey"
  FOREIGN KEY ("organization_id", "membership_id")
  REFERENCES "organization_memberships"("organization_id", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "store_membership_roles"
  ADD CONSTRAINT "store_membership_roles_organization_id_role_id_fkey"
  FOREIGN KEY ("organization_id", "role_id")
  REFERENCES "store_roles"("organization_id", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "store_membership_roles"
  ADD CONSTRAINT "store_membership_roles_assigned_by_user_id_fkey"
  FOREIGN KEY ("assigned_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE FUNCTION pg_temp.selfx_rbac_uuid(input text) RETURNS uuid AS $$
  SELECT (
    substr(md5(input), 1, 8) || '-' ||
    substr(md5(input), 9, 4) || '-7' ||
    substr(md5(input), 14, 3) || '-8' ||
    substr(md5(input), 18, 3) || '-' ||
    substr(md5(input), 21, 12)
  )::uuid;
$$ LANGUAGE SQL IMMUTABLE;

INSERT INTO "permissions" (
  "id",
  "code",
  "module",
  "action",
  "label",
  "description",
  "is_system",
  "updated_at"
)
VALUES
  (pg_temp.selfx_rbac_uuid('permission:stores.view'), 'stores.view', 'stores', 'view', 'View Stores', 'View Store details and Store-scoped operational data.', true, CURRENT_TIMESTAMP),
  (pg_temp.selfx_rbac_uuid('permission:stores.update'), 'stores.update', 'stores', 'update', 'Update Stores', 'Update Store profile and settings within authorized scope.', true, CURRENT_TIMESTAMP),
  (pg_temp.selfx_rbac_uuid('permission:users.view'), 'users.view', 'users', 'view', 'View Store Users', 'View Store memberships and assigned roles.', true, CURRENT_TIMESTAMP),
  (pg_temp.selfx_rbac_uuid('permission:users.invite'), 'users.invite', 'users', 'invite', 'Add Store Users', 'Add an existing user to a Store membership when authorized.', true, CURRENT_TIMESTAMP),
  (pg_temp.selfx_rbac_uuid('permission:users.update'), 'users.update', 'users', 'update', 'Update Store Users', 'Update Store membership status and basic membership metadata.', true, CURRENT_TIMESTAMP),
  (pg_temp.selfx_rbac_uuid('permission:users.deactivate'), 'users.deactivate', 'users', 'deactivate', 'Suspend Store Users', 'Suspend or reactivate a Store membership.', true, CURRENT_TIMESTAMP),
  (pg_temp.selfx_rbac_uuid('permission:roles.view'), 'roles.view', 'roles', 'view', 'View Store Roles', 'View Store roles and permission counts.', true, CURRENT_TIMESTAMP),
  (pg_temp.selfx_rbac_uuid('permission:roles.create'), 'roles.create', 'roles', 'create', 'Create Store Roles', 'Create custom Store roles.', true, CURRENT_TIMESTAMP),
  (pg_temp.selfx_rbac_uuid('permission:roles.update'), 'roles.update', 'roles', 'update', 'Update Store Roles', 'Update Store role metadata, status and permissions.', true, CURRENT_TIMESTAMP),
  (pg_temp.selfx_rbac_uuid('permission:roles.delete'), 'roles.delete', 'roles', 'delete', 'Delete Store Roles', 'Delete unused custom Store roles.', true, CURRENT_TIMESTAMP),
  (pg_temp.selfx_rbac_uuid('permission:roles.assign'), 'roles.assign', 'roles', 'assign', 'Assign Store Roles', 'Assign or remove roles on Store memberships.', true, CURRENT_TIMESTAMP),
  (pg_temp.selfx_rbac_uuid('permission:kiosks.view'), 'kiosks.view', 'kiosks', 'view', 'View Kiosks', 'View kiosks owned by the Store.', true, CURRENT_TIMESTAMP),
  (pg_temp.selfx_rbac_uuid('permission:kiosks.pair'), 'kiosks.pair', 'kiosks', 'pair', 'Pair Kiosks', 'Pair new physical kiosks to a Store.', true, CURRENT_TIMESTAMP),
  (pg_temp.selfx_rbac_uuid('permission:kiosks.update'), 'kiosks.update', 'kiosks', 'update', 'Update Kiosks', 'Update kiosk metadata.', true, CURRENT_TIMESTAMP),
  (pg_temp.selfx_rbac_uuid('permission:kiosks.assign'), 'kiosks.assign', 'kiosks', 'assign', 'Assign Kiosks', 'Assign existing kiosks to a Store.', true, CURRENT_TIMESTAMP),
  (pg_temp.selfx_rbac_uuid('permission:kiosks.configure'), 'kiosks.configure', 'kiosks', 'configure', 'Configure Kiosks', 'Update Store-owned kiosk runtime configuration.', true, CURRENT_TIMESTAMP),
  (pg_temp.selfx_rbac_uuid('permission:kiosks.revoke'), 'kiosks.revoke', 'kiosks', 'revoke', 'Unpair Kiosks', 'Unpair or revoke Store-owned kiosk device sessions.', true, CURRENT_TIMESTAMP),
  (pg_temp.selfx_rbac_uuid('permission:analytics.view'), 'analytics.view', 'analytics', 'view', 'View Analytics', 'View Store-scoped analytics when analytics is implemented.', true, CURRENT_TIMESTAMP),
  (pg_temp.selfx_rbac_uuid('permission:integrations.view'), 'integrations.view', 'integrations', 'view', 'View Integrations', 'View Store integration status when integrations are implemented.', true, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE
SET
  "module" = EXCLUDED."module",
  "action" = EXCLUDED."action",
  "label" = EXCLUDED."label",
  "description" = EXCLUDED."description",
  "is_system" = EXCLUDED."is_system",
  "updated_at" = CURRENT_TIMESTAMP;

WITH default_roles("system_code", "name", "description") AS (
  VALUES
    ('store-admin', 'Store Admin', 'Full operational Store administration without platform authority.'),
    ('manager', 'Manager', 'Manage daily Store operations, kiosks and basic user visibility.'),
    ('staff', 'Staff', 'Operate assigned Store workflows with limited access.'),
    ('viewer', 'Viewer', 'Read-only Store visibility.')
)
INSERT INTO "store_roles" (
  "id",
  "organization_id",
  "system_code",
  "name",
  "description",
  "is_system",
  "is_active",
  "updated_at"
)
SELECT
  pg_temp.selfx_rbac_uuid('store-role:' || o."id"::text || ':' || dr."system_code"),
  o."id",
  dr."system_code",
  dr."name",
  dr."description",
  true,
  true,
  CURRENT_TIMESTAMP
FROM "organizations" o
CROSS JOIN default_roles dr
ON CONFLICT ("organization_id", "system_code") DO UPDATE
SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "is_system" = true,
  "is_active" = true,
  "updated_at" = CURRENT_TIMESTAMP;

WITH role_permission_codes("system_code", "permission_code") AS (
  VALUES
    ('store-admin', 'stores.view'),
    ('store-admin', 'stores.update'),
    ('store-admin', 'users.view'),
    ('store-admin', 'users.invite'),
    ('store-admin', 'users.update'),
    ('store-admin', 'users.deactivate'),
    ('store-admin', 'roles.view'),
    ('store-admin', 'roles.assign'),
    ('store-admin', 'kiosks.view'),
    ('store-admin', 'kiosks.pair'),
    ('store-admin', 'kiosks.update'),
    ('store-admin', 'kiosks.assign'),
    ('store-admin', 'kiosks.configure'),
    ('store-admin', 'kiosks.revoke'),
    ('store-admin', 'analytics.view'),
    ('store-admin', 'integrations.view'),
    ('manager', 'stores.view'),
    ('manager', 'users.view'),
    ('manager', 'kiosks.view'),
    ('manager', 'kiosks.configure'),
    ('manager', 'analytics.view'),
    ('staff', 'stores.view'),
    ('staff', 'kiosks.view'),
    ('viewer', 'stores.view'),
    ('viewer', 'kiosks.view'),
    ('viewer', 'analytics.view')
)
INSERT INTO "store_role_permissions" (
  "id",
  "role_id",
  "permission_id"
)
SELECT
  pg_temp.selfx_rbac_uuid('store-role-permission:' || sr."id"::text || ':' || p."id"::text),
  sr."id",
  p."id"
FROM "store_roles" sr
JOIN role_permission_codes rpc ON rpc."system_code" = sr."system_code"
JOIN "permissions" p ON p."code" = rpc."permission_code"
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

WITH legacy_role_map("legacy_role", "system_code") AS (
  VALUES
    ('ORGANIZATION_OWNER', 'store-admin'),
    ('ORGANIZATION_ADMIN', 'store-admin'),
    ('ORGANIZATION_STAFF', 'staff'),
    ('STORE_OWNER', 'manager'),
    ('STORE_MANAGER', 'manager'),
    ('STORE_STAFF', 'staff'),
    ('KIOSK_OPERATOR', 'staff')
)
INSERT INTO "store_membership_roles" (
  "id",
  "organization_id",
  "membership_id",
  "role_id",
  "assigned_at"
)
SELECT
  pg_temp.selfx_rbac_uuid('store-membership-role:' || om."id"::text || ':' || sr."id"::text),
  om."organization_id",
  om."id",
  sr."id",
  CURRENT_TIMESTAMP
FROM "organization_memberships" om
JOIN legacy_role_map lrm ON lrm."legacy_role" = om."role"::text
JOIN "store_roles" sr
  ON sr."organization_id" = om."organization_id"
 AND sr."system_code" = lrm."system_code"
ON CONFLICT ("membership_id", "role_id") DO NOTHING;
