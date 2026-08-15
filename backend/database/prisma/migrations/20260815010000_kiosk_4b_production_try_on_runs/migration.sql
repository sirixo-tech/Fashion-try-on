-- KIOSK-4B: device-authenticated production kiosk Try-On run state.

CREATE TABLE "kiosk_try_on_runs" (
  "id" UUID NOT NULL,
  "kiosk_device_id" UUID NOT NULL,
  "client_request_id" VARCHAR(160) NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'QUEUED',
  "assignment_scope" "KioskAssignmentScope" NOT NULL,
  "organization_id" UUID,
  "store_id" UUID,
  "provider" VARCHAR(80) NOT NULL,
  "provider_display_name" VARCHAR(120) NOT NULL,
  "provider_model" VARCHAR(120) NOT NULL,
  "provider_prediction_id" VARCHAR(160),
  "garment_source" VARCHAR(40) NOT NULL,
  "garment_intent" VARCHAR(40) NOT NULL,
  "garment_category" VARCHAR(40) NOT NULL,
  "garment_photo_type" VARCHAR(40) NOT NULL,
  "generation_profile" VARCHAR(40) NOT NULL,
  "result_image" TEXT,
  "error_code" VARCHAR(120),
  "error_message" TEXT,
  "started_at" TIMESTAMPTZ(3),
  "submitted_at" TIMESTAMPTZ(3),
  "completed_at" TIMESTAMPTZ(3),
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "kiosk_try_on_runs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "kiosk_try_on_runs_kiosk_device_id_client_request_id_key"
  ON "kiosk_try_on_runs"("kiosk_device_id", "client_request_id");
CREATE INDEX "kiosk_try_on_runs_kiosk_device_id_created_at_idx"
  ON "kiosk_try_on_runs"("kiosk_device_id", "created_at");
CREATE INDEX "kiosk_try_on_runs_kiosk_device_id_status_idx"
  ON "kiosk_try_on_runs"("kiosk_device_id", "status");
CREATE INDEX "kiosk_try_on_runs_organization_id_created_at_idx"
  ON "kiosk_try_on_runs"("organization_id", "created_at");
CREATE INDEX "kiosk_try_on_runs_store_id_created_at_idx"
  ON "kiosk_try_on_runs"("store_id", "created_at");
CREATE INDEX "kiosk_try_on_runs_status_expires_at_idx"
  ON "kiosk_try_on_runs"("status", "expires_at");
CREATE INDEX "kiosk_try_on_runs_expires_at_idx"
  ON "kiosk_try_on_runs"("expires_at");

ALTER TABLE "kiosk_try_on_runs"
  ADD CONSTRAINT "kiosk_try_on_runs_kiosk_device_id_fkey"
  FOREIGN KEY ("kiosk_device_id") REFERENCES "kiosk_devices"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
