-- RBAC-2 Global permission registry, platform access roles and Store ceilings.

CREATE TYPE "PermissionApplicability" AS ENUM ('PLATFORM_ONLY', 'STORE', 'BOTH');

ALTER TABLE "permissions"
  ADD COLUMN "applicability" "PermissionApplicability" NOT NULL DEFAULT 'STORE';

CREATE INDEX "permissions_applicability_idx" ON "permissions"("applicability");

CREATE TABLE "platform_roles" (
  "id" UUID NOT NULL,
  "system_code" VARCHAR(80),
  "name" VARCHAR(120) NOT NULL,
  "description" TEXT,
  "is_system" BOOLEAN NOT NULL DEFAULT false,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "platform_roles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "platform_role_permissions" (
  "id" UUID NOT NULL,
  "role_id" UUID NOT NULL,
  "permission_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "platform_role_permissions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "platform_user_roles" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "role_id" UUID NOT NULL,
  "status" "PlatformRoleAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
  "assigned_by_user_id" UUID,
  "assigned_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revoked_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "platform_user_roles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "store_permission_grants" (
  "id" UUID NOT NULL,
  "store_tenant_id" UUID NOT NULL,
  "permission_id" UUID NOT NULL,
  "granted_by_user_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "store_permission_grants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "platform_roles_name_key" ON "platform_roles"("name");
CREATE UNIQUE INDEX "platform_roles_system_code_key" ON "platform_roles"("system_code");
CREATE INDEX "platform_roles_is_active_idx" ON "platform_roles"("is_active");

CREATE UNIQUE INDEX "platform_role_permissions_role_id_permission_id_key" ON "platform_role_permissions"("role_id", "permission_id");
CREATE INDEX "platform_role_permissions_permission_id_idx" ON "platform_role_permissions"("permission_id");

CREATE UNIQUE INDEX "platform_user_roles_user_id_role_id_key" ON "platform_user_roles"("user_id", "role_id");
CREATE INDEX "platform_user_roles_role_id_status_idx" ON "platform_user_roles"("role_id", "status");
CREATE INDEX "platform_user_roles_user_id_status_idx" ON "platform_user_roles"("user_id", "status");
CREATE INDEX "platform_user_roles_assigned_by_user_id_idx" ON "platform_user_roles"("assigned_by_user_id");

CREATE UNIQUE INDEX "store_permission_grants_store_tenant_id_permission_id_key" ON "store_permission_grants"("store_tenant_id", "permission_id");
CREATE INDEX "store_permission_grants_permission_id_idx" ON "store_permission_grants"("permission_id");
CREATE INDEX "store_permission_grants_granted_by_user_id_idx" ON "store_permission_grants"("granted_by_user_id");

ALTER TABLE "platform_role_permissions"
  ADD CONSTRAINT "platform_role_permissions_role_id_fkey"
  FOREIGN KEY ("role_id") REFERENCES "platform_roles"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "platform_role_permissions"
  ADD CONSTRAINT "platform_role_permissions_permission_id_fkey"
  FOREIGN KEY ("permission_id") REFERENCES "permissions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "platform_user_roles"
  ADD CONSTRAINT "platform_user_roles_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "platform_user_roles"
  ADD CONSTRAINT "platform_user_roles_role_id_fkey"
  FOREIGN KEY ("role_id") REFERENCES "platform_roles"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "platform_user_roles"
  ADD CONSTRAINT "platform_user_roles_assigned_by_user_id_fkey"
  FOREIGN KEY ("assigned_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "store_permission_grants"
  ADD CONSTRAINT "store_permission_grants_store_tenant_id_fkey"
  FOREIGN KEY ("store_tenant_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "store_permission_grants"
  ADD CONSTRAINT "store_permission_grants_permission_id_fkey"
  FOREIGN KEY ("permission_id") REFERENCES "permissions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "store_permission_grants"
  ADD CONSTRAINT "store_permission_grants_granted_by_user_id_fkey"
  FOREIGN KEY ("granted_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE FUNCTION pg_temp.selfx_rbac2_uuid(input text) RETURNS uuid AS $$
  SELECT (
    substr(md5(input), 1, 8) || '-' ||
    substr(md5(input), 9, 4) || '-7' ||
    substr(md5(input), 14, 3) || '-8' ||
    substr(md5(input), 18, 3) || '-' ||
    substr(md5(input), 21, 12)
  )::uuid;
$$ LANGUAGE SQL IMMUTABLE;

UPDATE "permissions"
SET "applicability" = 'STORE'
WHERE "code" IN (
  'stores.view',
  'stores.update',
  'users.view',
  'users.invite',
  'users.update',
  'users.deactivate',
  'roles.view',
  'roles.create',
  'roles.update',
  'roles.delete',
  'roles.assign',
  'kiosks.view',
  'kiosks.pair',
  'kiosks.update',
  'kiosks.assign',
  'kiosks.configure',
  'kiosks.revoke',
  'analytics.view',
  'integrations.view'
);

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
  (pg_temp.selfx_rbac2_uuid('permission:ORGANIZATION_APPLICATION_REVIEW'), 'ORGANIZATION_APPLICATION_REVIEW', 'platform.organizations', 'review_application', 'Review Store Applications', 'Review submitted Store onboarding applications.', 'PLATFORM_ONLY', true, CURRENT_TIMESTAMP),
  (pg_temp.selfx_rbac2_uuid('permission:ORGANIZATION_APPLICATION_APPROVE'), 'ORGANIZATION_APPLICATION_APPROVE', 'platform.organizations', 'approve_application', 'Approve Store Applications', 'Approve Store applications and activation requirements.', 'PLATFORM_ONLY', true, CURRENT_TIMESTAMP),
  (pg_temp.selfx_rbac2_uuid('permission:ORGANIZATION_APPLICATION_REJECT'), 'ORGANIZATION_APPLICATION_REJECT', 'platform.organizations', 'reject_application', 'Reject Store Applications', 'Reject Store onboarding applications.', 'PLATFORM_ONLY', true, CURRENT_TIMESTAMP),
  (pg_temp.selfx_rbac2_uuid('permission:ORGANIZATION_ACTIVATE'), 'ORGANIZATION_ACTIVATE', 'platform.organizations', 'activate', 'Activate Stores', 'Activate approved Stores for operational use.', 'PLATFORM_ONLY', true, CURRENT_TIMESTAMP),
  (pg_temp.selfx_rbac2_uuid('permission:ORGANIZATION_SUSPEND'), 'ORGANIZATION_SUSPEND', 'platform.organizations', 'suspend', 'Suspend Stores', 'Suspend Stores from operational use.', 'PLATFORM_ONLY', true, CURRENT_TIMESTAMP),
  (pg_temp.selfx_rbac2_uuid('permission:STORES_VIEW'), 'STORES_VIEW', 'platform.stores', 'view', 'View All Stores', 'View Stores across the SelfX platform.', 'PLATFORM_ONLY', true, CURRENT_TIMESTAMP),
  (pg_temp.selfx_rbac2_uuid('permission:STORES_CREATE'), 'STORES_CREATE', 'platform.stores', 'create', 'Create Stores', 'Create Stores from the SelfX platform console.', 'PLATFORM_ONLY', true, CURRENT_TIMESTAMP),
  (pg_temp.selfx_rbac2_uuid('permission:STORES_UPDATE'), 'STORES_UPDATE', 'platform.stores', 'update', 'Update Stores', 'Update Store records from the SelfX platform console.', 'PLATFORM_ONLY', true, CURRENT_TIMESTAMP),
  (pg_temp.selfx_rbac2_uuid('permission:STORES_DEACTIVATE'), 'STORES_DEACTIVATE', 'platform.stores', 'deactivate', 'Deactivate Stores', 'Deactivate Stores from the SelfX platform console.', 'PLATFORM_ONLY', true, CURRENT_TIMESTAMP),
  (pg_temp.selfx_rbac2_uuid('permission:STORE_USERS_VIEW'), 'STORE_USERS_VIEW', 'platform.store_users', 'view', 'View Store Users Globally', 'View Store users across Store tenants.', 'PLATFORM_ONLY', true, CURRENT_TIMESTAMP),
  (pg_temp.selfx_rbac2_uuid('permission:STORE_USERS_MANAGE'), 'STORE_USERS_MANAGE', 'platform.store_users', 'manage', 'Manage Store Users Globally', 'Manage Store users across Store tenants.', 'PLATFORM_ONLY', true, CURRENT_TIMESTAMP),
  (pg_temp.selfx_rbac2_uuid('permission:STORE_ROLES_VIEW'), 'STORE_ROLES_VIEW', 'platform.store_roles', 'view', 'View Store Roles Globally', 'View Store roles across Store tenants.', 'PLATFORM_ONLY', true, CURRENT_TIMESTAMP),
  (pg_temp.selfx_rbac2_uuid('permission:STORE_ROLES_MANAGE'), 'STORE_ROLES_MANAGE', 'platform.store_roles', 'manage', 'Manage Store Roles Globally', 'Manage Store roles across Store tenants.', 'PLATFORM_ONLY', true, CURRENT_TIMESTAMP),
  (pg_temp.selfx_rbac2_uuid('permission:PERMISSIONS_VIEW'), 'PERMISSIONS_VIEW', 'platform.access', 'view_permissions', 'View Permission Registry', 'View the global SelfX permission registry.', 'PLATFORM_ONLY', true, CURRENT_TIMESTAMP),
  (pg_temp.selfx_rbac2_uuid('permission:PERMISSIONS_MANAGE'), 'PERMISSIONS_MANAGE', 'platform.access', 'manage_permissions', 'Manage Access Control', 'Manage platform roles, platform users and Store permission ceilings.', 'PLATFORM_ONLY', true, CURRENT_TIMESTAMP),
  (pg_temp.selfx_rbac2_uuid('permission:KIOSKS_VIEW'), 'KIOSKS_VIEW', 'platform.kiosks', 'view', 'View Kiosks Globally', 'View kiosks across the SelfX platform.', 'PLATFORM_ONLY', true, CURRENT_TIMESTAMP),
  (pg_temp.selfx_rbac2_uuid('permission:KIOSKS_PAIR'), 'KIOSKS_PAIR', 'platform.kiosks', 'pair', 'Pair Kiosks Globally', 'Pair kiosks from the SelfX platform console.', 'PLATFORM_ONLY', true, CURRENT_TIMESTAMP),
  (pg_temp.selfx_rbac2_uuid('permission:KIOSKS_UPDATE'), 'KIOSKS_UPDATE', 'platform.kiosks', 'update', 'Update Kiosks Globally', 'Update kiosk metadata across the SelfX platform.', 'PLATFORM_ONLY', true, CURRENT_TIMESTAMP),
  (pg_temp.selfx_rbac2_uuid('permission:KIOSKS_ASSIGN'), 'KIOSKS_ASSIGN', 'platform.kiosks', 'assign', 'Assign Kiosks Globally', 'Assign kiosks to Store tenants.', 'PLATFORM_ONLY', true, CURRENT_TIMESTAMP),
  (pg_temp.selfx_rbac2_uuid('permission:KIOSKS_REVOKE'), 'KIOSKS_REVOKE', 'platform.kiosks', 'revoke', 'Revoke Kiosks Globally', 'Revoke kiosk devices or sessions.', 'PLATFORM_ONLY', true, CURRENT_TIMESTAMP),
  (pg_temp.selfx_rbac2_uuid('permission:KIOSKS_DELETE'), 'KIOSKS_DELETE', 'platform.kiosks', 'delete', 'Delete Kiosks Globally', 'Delete kiosk devices from the platform console.', 'PLATFORM_ONLY', true, CURRENT_TIMESTAMP),
  (pg_temp.selfx_rbac2_uuid('permission:KIOSKS_CONFIGURE'), 'KIOSKS_CONFIGURE', 'platform.kiosks', 'configure', 'Configure Kiosks Globally', 'Configure kiosk runtime settings across Store tenants.', 'PLATFORM_ONLY', true, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE
SET
  "module" = EXCLUDED."module",
  "action" = EXCLUDED."action",
  "label" = EXCLUDED."label",
  "description" = EXCLUDED."description",
  "applicability" = EXCLUDED."applicability",
  "is_system" = EXCLUDED."is_system",
  "updated_at" = CURRENT_TIMESTAMP;

WITH platform_roles("system_code", "name", "description") AS (
  VALUES
    ('platform-staff-admin', 'Platform Staff Admin', 'Broad SelfX platform operations except Superadmin-only access control and suspension authorities.'),
    ('platform-support-admin', 'Platform Support Admin', 'Support access for Store onboarding review.')
)
INSERT INTO "platform_roles" (
  "id",
  "system_code",
  "name",
  "description",
  "is_system",
  "is_active",
  "updated_at"
)
SELECT
  pg_temp.selfx_rbac2_uuid('platform-role:' || pr."system_code"),
  pr."system_code",
  pr."name",
  pr."description",
  true,
  true,
  CURRENT_TIMESTAMP
FROM platform_roles pr
ON CONFLICT ("system_code") DO UPDATE
SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "is_system" = true,
  "is_active" = true,
  "updated_at" = CURRENT_TIMESTAMP;

WITH platform_role_permission_codes("system_code", "permission_code") AS (
  VALUES
    ('platform-staff-admin', 'ORGANIZATION_APPLICATION_REVIEW'),
    ('platform-staff-admin', 'ORGANIZATION_APPLICATION_APPROVE'),
    ('platform-staff-admin', 'ORGANIZATION_APPLICATION_REJECT'),
    ('platform-staff-admin', 'ORGANIZATION_ACTIVATE'),
    ('platform-staff-admin', 'STORES_VIEW'),
    ('platform-staff-admin', 'STORES_CREATE'),
    ('platform-staff-admin', 'STORES_UPDATE'),
    ('platform-staff-admin', 'STORES_DEACTIVATE'),
    ('platform-staff-admin', 'STORE_USERS_VIEW'),
    ('platform-staff-admin', 'STORE_USERS_MANAGE'),
    ('platform-staff-admin', 'STORE_ROLES_VIEW'),
    ('platform-staff-admin', 'STORE_ROLES_MANAGE'),
    ('platform-staff-admin', 'PERMISSIONS_VIEW'),
    ('platform-staff-admin', 'KIOSKS_VIEW'),
    ('platform-staff-admin', 'KIOSKS_PAIR'),
    ('platform-staff-admin', 'KIOSKS_UPDATE'),
    ('platform-staff-admin', 'KIOSKS_ASSIGN'),
    ('platform-staff-admin', 'KIOSKS_REVOKE'),
    ('platform-staff-admin', 'KIOSKS_DELETE'),
    ('platform-staff-admin', 'KIOSKS_CONFIGURE'),
    ('platform-support-admin', 'ORGANIZATION_APPLICATION_REVIEW')
)
INSERT INTO "platform_role_permissions" (
  "id",
  "role_id",
  "permission_id"
)
SELECT
  pg_temp.selfx_rbac2_uuid('platform-role-permission:' || pr."id"::text || ':' || p."id"::text),
  pr."id",
  p."id"
FROM "platform_roles" pr
JOIN platform_role_permission_codes prpc ON prpc."system_code" = pr."system_code"
JOIN "permissions" p ON p."code" = prpc."permission_code"
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

INSERT INTO "store_permission_grants" (
  "id",
  "store_tenant_id",
  "permission_id"
)
SELECT
  pg_temp.selfx_rbac2_uuid('store-permission-grant:' || o."id"::text || ':' || p."id"::text),
  o."id",
  p."id"
FROM "organizations" o
CROSS JOIN "permissions" p
WHERE p."applicability" IN ('STORE', 'BOTH')
ON CONFLICT ("store_tenant_id", "permission_id") DO NOTHING;
