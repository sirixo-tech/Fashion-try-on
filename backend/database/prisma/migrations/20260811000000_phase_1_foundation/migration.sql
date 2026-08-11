-- Phase 1 foundation: PostgreSQL + Prisma Migrate baseline.
-- SelfX primary IDs are native uuid columns populated by the application layer with UUIDv7.

CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DISABLED');
CREATE TYPE "OrganizationStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');
CREATE TYPE "OrganizationMembershipRole" AS ENUM (
  'ORGANIZATION_OWNER',
  'ORGANIZATION_ADMIN',
  'ORGANIZATION_STAFF',
  'STORE_OWNER',
  'STORE_MANAGER',
  'STORE_STAFF',
  'KIOSK_OPERATOR'
);
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'INVITED', 'SUSPENDED', 'REVOKED');
CREATE TYPE "StoreStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CLOSED');
CREATE TYPE "PlatformRole" AS ENUM ('SELFX_SUPPORT_ADMIN', 'SELFX_SUPER_ADMIN');
CREATE TYPE "PlatformRoleAssignmentStatus" AS ENUM ('ACTIVE', 'REVOKED');

CREATE TABLE "users" (
  "id" UUID NOT NULL,
  "email" VARCHAR(320) NOT NULL,
  "password_hash" TEXT NOT NULL,
  "display_name" VARCHAR(160),
  "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
  "email_verified_at" TIMESTAMPTZ(3),
  "last_login_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_sessions" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "refresh_token_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "revoked_at" TIMESTAMPTZ(3),
  "last_used_at" TIMESTAMPTZ(3),
  "device_label" VARCHAR(160),
  "user_agent_json" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "organizations" (
  "id" UUID NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "slug" VARCHAR(120) NOT NULL,
  "status" "OrganizationStatus" NOT NULL DEFAULT 'ACTIVE',
  "timezone" VARCHAR(64) NOT NULL DEFAULT 'UTC',
  "settings" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "organization_memberships" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "role" "OrganizationMembershipRole" NOT NULL,
  "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
  "joined_at" TIMESTAMPTZ(3),
  "suspended_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "organization_memberships_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "stores" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "code" VARCHAR(80),
  "status" "StoreStatus" NOT NULL DEFAULT 'ACTIVE',
  "timezone" VARCHAR(64) NOT NULL DEFAULT 'UTC',
  "address_json" JSONB,
  "settings" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "membership_store_scopes" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "membership_id" UUID NOT NULL,
  "store_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "membership_store_scopes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "platform_role_assignments" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "role" "PlatformRole" NOT NULL,
  "status" "PlatformRoleAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
  "assigned_by_user_id" UUID,
  "assigned_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revoked_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "platform_role_assignments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "audit_logs" (
  "id" UUID NOT NULL,
  "organization_id" UUID,
  "store_id" UUID,
  "actor_user_id" UUID,
  "action" VARCHAR(160) NOT NULL,
  "resource_type" VARCHAR(160) NOT NULL,
  "resource_id" UUID,
  "request_id" VARCHAR(120),
  "metadata_json" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE INDEX "user_sessions_user_id_idx" ON "user_sessions"("user_id");
CREATE INDEX "user_sessions_expires_at_idx" ON "user_sessions"("expires_at");
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");
CREATE INDEX "organizations_status_idx" ON "organizations"("status");
CREATE UNIQUE INDEX "organization_memberships_organization_id_user_id_key" ON "organization_memberships"("organization_id", "user_id");
CREATE UNIQUE INDEX "organization_memberships_organization_id_id_key" ON "organization_memberships"("organization_id", "id");
CREATE INDEX "organization_memberships_user_id_idx" ON "organization_memberships"("user_id");
CREATE INDEX "organization_memberships_organization_id_role_idx" ON "organization_memberships"("organization_id", "role");
CREATE INDEX "organization_memberships_organization_id_status_idx" ON "organization_memberships"("organization_id", "status");
CREATE UNIQUE INDEX "stores_organization_id_code_key" ON "stores"("organization_id", "code");
CREATE UNIQUE INDEX "stores_organization_id_id_key" ON "stores"("organization_id", "id");
CREATE INDEX "stores_organization_id_idx" ON "stores"("organization_id");
CREATE INDEX "stores_organization_id_status_idx" ON "stores"("organization_id", "status");
CREATE UNIQUE INDEX "membership_store_scopes_membership_id_store_id_key" ON "membership_store_scopes"("membership_id", "store_id");
CREATE INDEX "membership_store_scopes_organization_id_idx" ON "membership_store_scopes"("organization_id");
CREATE INDEX "membership_store_scopes_store_id_idx" ON "membership_store_scopes"("store_id");
CREATE UNIQUE INDEX "platform_role_assignments_user_id_role_key" ON "platform_role_assignments"("user_id", "role");
CREATE INDEX "platform_role_assignments_role_status_idx" ON "platform_role_assignments"("role", "status");
CREATE INDEX "platform_role_assignments_assigned_by_user_id_idx" ON "platform_role_assignments"("assigned_by_user_id");
CREATE INDEX "audit_logs_organization_id_created_at_idx" ON "audit_logs"("organization_id", "created_at");
CREATE INDEX "audit_logs_store_id_created_at_idx" ON "audit_logs"("store_id", "created_at");
CREATE INDEX "audit_logs_actor_user_id_created_at_idx" ON "audit_logs"("actor_user_id", "created_at");
CREATE INDEX "audit_logs_resource_type_resource_id_idx" ON "audit_logs"("resource_type", "resource_id");
CREATE INDEX "audit_logs_request_id_idx" ON "audit_logs"("request_id");

ALTER TABLE "user_sessions"
  ADD CONSTRAINT "user_sessions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "organization_memberships"
  ADD CONSTRAINT "organization_memberships_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "organization_memberships"
  ADD CONSTRAINT "organization_memberships_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "stores"
  ADD CONSTRAINT "stores_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "membership_store_scopes"
  ADD CONSTRAINT "membership_store_scopes_organization_id_membership_id_fkey"
  FOREIGN KEY ("organization_id", "membership_id") REFERENCES "organization_memberships"("organization_id", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "membership_store_scopes"
  ADD CONSTRAINT "membership_store_scopes_organization_id_store_id_fkey"
  FOREIGN KEY ("organization_id", "store_id") REFERENCES "stores"("organization_id", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "platform_role_assignments"
  ADD CONSTRAINT "platform_role_assignments_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "platform_role_assignments"
  ADD CONSTRAINT "platform_role_assignments_assigned_by_user_id_fkey"
  FOREIGN KEY ("assigned_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "audit_logs"
  ADD CONSTRAINT "audit_logs_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "audit_logs"
  ADD CONSTRAINT "audit_logs_store_id_fkey"
  FOREIGN KEY ("store_id") REFERENCES "stores"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "audit_logs"
  ADD CONSTRAINT "audit_logs_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
