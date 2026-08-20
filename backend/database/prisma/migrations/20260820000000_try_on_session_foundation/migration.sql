-- Try-On session foundation for future kiosk customer sessions, reusable assets,
-- and customer-facing looks. Existing kiosk runs remain valid because all new
-- run relationships are nullable.

CREATE TYPE "TryOnSessionStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'EXPIRED');

CREATE TYPE "TryOnAssetPurpose" AS ENUM ('PERSON', 'GARMENT', 'RESULT');

ALTER TABLE "kiosk_try_on_runs"
  ADD COLUMN "try_on_session_id" UUID,
  ADD COLUMN "person_asset_id" UUID,
  ADD COLUMN "garment_asset_id" UUID,
  ADD COLUMN "result_asset_id" UUID;

CREATE TABLE "try_on_sessions" (
  "id" UUID NOT NULL,
  "status" "TryOnSessionStatus" NOT NULL DEFAULT 'ACTIVE',
  "assignment_scope" "KioskAssignmentScope" NOT NULL,
  "organization_id" UUID,
  "store_id" UUID,
  "kiosk_device_id" UUID,
  "current_person_asset_id" UUID,
  "completed_at" TIMESTAMPTZ(3),
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "try_on_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "try_on_assets" (
  "id" UUID NOT NULL,
  "try_on_session_id" UUID NOT NULL,
  "purpose" "TryOnAssetPurpose" NOT NULL,
  "assignment_scope" "KioskAssignmentScope" NOT NULL,
  "organization_id" UUID,
  "store_id" UUID,
  "kiosk_device_id" UUID,
  "storage_key" VARCHAR(512) NOT NULL,
  "content_type" VARCHAR(80),
  "size_bytes" INTEGER,
  "width" INTEGER,
  "height" INTEGER,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "deleted_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "try_on_assets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "try_on_looks" (
  "id" UUID NOT NULL,
  "try_on_session_id" UUID NOT NULL,
  "kiosk_try_on_run_id" UUID NOT NULL,
  "person_asset_id" UUID NOT NULL,
  "garment_asset_id" UUID,
  "result_asset_id" UUID NOT NULL,
  "assignment_scope" "KioskAssignmentScope" NOT NULL,
  "organization_id" UUID,
  "store_id" UUID,
  "kiosk_device_id" UUID,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "try_on_looks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "try_on_assets_storage_key_key"
  ON "try_on_assets"("storage_key");
CREATE UNIQUE INDEX "try_on_looks_kiosk_try_on_run_id_key"
  ON "try_on_looks"("kiosk_try_on_run_id");

CREATE INDEX "kiosk_try_on_runs_try_on_session_id_created_at_idx"
  ON "kiosk_try_on_runs"("try_on_session_id", "created_at");
CREATE INDEX "kiosk_try_on_runs_person_asset_id_idx"
  ON "kiosk_try_on_runs"("person_asset_id");
CREATE INDEX "kiosk_try_on_runs_garment_asset_id_idx"
  ON "kiosk_try_on_runs"("garment_asset_id");
CREATE INDEX "kiosk_try_on_runs_result_asset_id_idx"
  ON "kiosk_try_on_runs"("result_asset_id");

CREATE INDEX "try_on_sessions_kiosk_device_id_status_created_at_idx"
  ON "try_on_sessions"("kiosk_device_id", "status", "created_at");
CREATE INDEX "try_on_sessions_organization_id_created_at_idx"
  ON "try_on_sessions"("organization_id", "created_at");
CREATE INDEX "try_on_sessions_store_id_created_at_idx"
  ON "try_on_sessions"("store_id", "created_at");
CREATE INDEX "try_on_sessions_status_expires_at_idx"
  ON "try_on_sessions"("status", "expires_at");
CREATE INDEX "try_on_sessions_expires_at_idx"
  ON "try_on_sessions"("expires_at");
CREATE INDEX "try_on_sessions_current_person_asset_id_idx"
  ON "try_on_sessions"("current_person_asset_id");

CREATE INDEX "try_on_assets_try_on_session_id_purpose_created_at_idx"
  ON "try_on_assets"("try_on_session_id", "purpose", "created_at");
CREATE INDEX "try_on_assets_kiosk_device_id_purpose_created_at_idx"
  ON "try_on_assets"("kiosk_device_id", "purpose", "created_at");
CREATE INDEX "try_on_assets_organization_id_purpose_created_at_idx"
  ON "try_on_assets"("organization_id", "purpose", "created_at");
CREATE INDEX "try_on_assets_store_id_purpose_created_at_idx"
  ON "try_on_assets"("store_id", "purpose", "created_at");
CREATE INDEX "try_on_assets_purpose_expires_at_idx"
  ON "try_on_assets"("purpose", "expires_at");
CREATE INDEX "try_on_assets_expires_at_idx"
  ON "try_on_assets"("expires_at");
CREATE INDEX "try_on_assets_deleted_at_idx"
  ON "try_on_assets"("deleted_at");

CREATE INDEX "try_on_looks_try_on_session_id_created_at_idx"
  ON "try_on_looks"("try_on_session_id", "created_at");
CREATE INDEX "try_on_looks_kiosk_device_id_created_at_idx"
  ON "try_on_looks"("kiosk_device_id", "created_at");
CREATE INDEX "try_on_looks_organization_id_created_at_idx"
  ON "try_on_looks"("organization_id", "created_at");
CREATE INDEX "try_on_looks_store_id_created_at_idx"
  ON "try_on_looks"("store_id", "created_at");
CREATE INDEX "try_on_looks_person_asset_id_idx"
  ON "try_on_looks"("person_asset_id");
CREATE INDEX "try_on_looks_garment_asset_id_idx"
  ON "try_on_looks"("garment_asset_id");
CREATE INDEX "try_on_looks_result_asset_id_idx"
  ON "try_on_looks"("result_asset_id");
CREATE INDEX "try_on_looks_expires_at_idx"
  ON "try_on_looks"("expires_at");

ALTER TABLE "try_on_sessions"
  ADD CONSTRAINT "try_on_sessions_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "try_on_sessions"
  ADD CONSTRAINT "try_on_sessions_organization_id_store_id_fkey"
  FOREIGN KEY ("organization_id", "store_id") REFERENCES "stores"("organization_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "try_on_sessions"
  ADD CONSTRAINT "try_on_sessions_kiosk_device_id_fkey"
  FOREIGN KEY ("kiosk_device_id") REFERENCES "kiosk_devices"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "try_on_assets"
  ADD CONSTRAINT "try_on_assets_try_on_session_id_fkey"
  FOREIGN KEY ("try_on_session_id") REFERENCES "try_on_sessions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "try_on_assets"
  ADD CONSTRAINT "try_on_assets_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "try_on_assets"
  ADD CONSTRAINT "try_on_assets_organization_id_store_id_fkey"
  FOREIGN KEY ("organization_id", "store_id") REFERENCES "stores"("organization_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "try_on_assets"
  ADD CONSTRAINT "try_on_assets_kiosk_device_id_fkey"
  FOREIGN KEY ("kiosk_device_id") REFERENCES "kiosk_devices"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "try_on_sessions"
  ADD CONSTRAINT "try_on_sessions_current_person_asset_id_fkey"
  FOREIGN KEY ("current_person_asset_id") REFERENCES "try_on_assets"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "try_on_looks"
  ADD CONSTRAINT "try_on_looks_try_on_session_id_fkey"
  FOREIGN KEY ("try_on_session_id") REFERENCES "try_on_sessions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "try_on_looks"
  ADD CONSTRAINT "try_on_looks_kiosk_try_on_run_id_fkey"
  FOREIGN KEY ("kiosk_try_on_run_id") REFERENCES "kiosk_try_on_runs"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "try_on_looks"
  ADD CONSTRAINT "try_on_looks_person_asset_id_fkey"
  FOREIGN KEY ("person_asset_id") REFERENCES "try_on_assets"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "try_on_looks"
  ADD CONSTRAINT "try_on_looks_garment_asset_id_fkey"
  FOREIGN KEY ("garment_asset_id") REFERENCES "try_on_assets"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "try_on_looks"
  ADD CONSTRAINT "try_on_looks_result_asset_id_fkey"
  FOREIGN KEY ("result_asset_id") REFERENCES "try_on_assets"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "try_on_looks"
  ADD CONSTRAINT "try_on_looks_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "try_on_looks"
  ADD CONSTRAINT "try_on_looks_organization_id_store_id_fkey"
  FOREIGN KEY ("organization_id", "store_id") REFERENCES "stores"("organization_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "try_on_looks"
  ADD CONSTRAINT "try_on_looks_kiosk_device_id_fkey"
  FOREIGN KEY ("kiosk_device_id") REFERENCES "kiosk_devices"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "kiosk_try_on_runs"
  ADD CONSTRAINT "kiosk_try_on_runs_try_on_session_id_fkey"
  FOREIGN KEY ("try_on_session_id") REFERENCES "try_on_sessions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "kiosk_try_on_runs"
  ADD CONSTRAINT "kiosk_try_on_runs_person_asset_id_fkey"
  FOREIGN KEY ("person_asset_id") REFERENCES "try_on_assets"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "kiosk_try_on_runs"
  ADD CONSTRAINT "kiosk_try_on_runs_garment_asset_id_fkey"
  FOREIGN KEY ("garment_asset_id") REFERENCES "try_on_assets"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "kiosk_try_on_runs"
  ADD CONSTRAINT "kiosk_try_on_runs_result_asset_id_fkey"
  FOREIGN KEY ("result_asset_id") REFERENCES "try_on_assets"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
