-- Phase 3A: organization registration, review, activation, explicit store scope mode.
-- Do not edit the already-applied Phase 1 migration.

ALTER TABLE "organizations"
  ALTER COLUMN "status" SET DEFAULT 'PENDING_ACTIVATION';

ALTER TABLE "organization_memberships"
  ADD COLUMN "store_scope_mode" "MembershipStoreScopeMode" NOT NULL DEFAULT 'SELECTED_STORES';

CREATE TABLE "organization_applications" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "submitted_by_user_id" UUID NOT NULL,
  "status" "OrganizationApplicationStatus" NOT NULL DEFAULT 'DRAFT',
  "submitted_at" TIMESTAMPTZ(3),
  "review_started_at" TIMESTAMPTZ(3),
  "reviewed_by_user_id" UUID,
  "approved_at" TIMESTAMPTZ(3),
  "rejected_at" TIMESTAMPTZ(3),
  "review_notes" TEXT,
  "requirements_status_json" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "organization_applications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "organization_activation_requirements" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "application_id" UUID NOT NULL,
  "code" VARCHAR(120) NOT NULL,
  "required" BOOLEAN NOT NULL DEFAULT true,
  "status" "ActivationRequirementStatus" NOT NULL DEFAULT 'PENDING',
  "metadata_json" JSONB,
  "satisfied_at" TIMESTAMPTZ(3),
  "waived_at" TIMESTAMPTZ(3),
  "reviewed_by_user_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "organization_activation_requirements_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "organization_memberships_organization_id_store_scope_mode_idx"
  ON "organization_memberships"("organization_id", "store_scope_mode");

CREATE INDEX "organization_applications_organization_id_idx"
  ON "organization_applications"("organization_id");
CREATE INDEX "organization_applications_submitted_by_user_id_idx"
  ON "organization_applications"("submitted_by_user_id");
CREATE INDEX "organization_applications_status_submitted_at_idx"
  ON "organization_applications"("status", "submitted_at");
CREATE INDEX "organization_applications_reviewed_by_user_id_idx"
  ON "organization_applications"("reviewed_by_user_id");

CREATE UNIQUE INDEX "organization_activation_requirements_application_id_code_key"
  ON "organization_activation_requirements"("application_id", "code");
CREATE INDEX "organization_activation_requirements_organization_id_idx"
  ON "organization_activation_requirements"("organization_id");
CREATE INDEX "organization_activation_requirements_application_id_status_idx"
  ON "organization_activation_requirements"("application_id", "status");
CREATE INDEX "organization_activation_requirements_reviewed_by_user_id_idx"
  ON "organization_activation_requirements"("reviewed_by_user_id");

ALTER TABLE "organization_applications"
  ADD CONSTRAINT "organization_applications_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "organization_applications"
  ADD CONSTRAINT "organization_applications_submitted_by_user_id_fkey"
  FOREIGN KEY ("submitted_by_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "organization_applications"
  ADD CONSTRAINT "organization_applications_reviewed_by_user_id_fkey"
  FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "organization_activation_requirements"
  ADD CONSTRAINT "organization_activation_requirements_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "organization_activation_requirements"
  ADD CONSTRAINT "organization_activation_requirements_application_id_fkey"
  FOREIGN KEY ("application_id") REFERENCES "organization_applications"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "organization_activation_requirements"
  ADD CONSTRAINT "organization_activation_requirements_reviewed_by_user_id_fkey"
  FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
