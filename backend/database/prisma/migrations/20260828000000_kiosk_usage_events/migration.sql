ALTER TABLE "kiosk_device_configurations"
  ALTER COLUMN "session_idle_timeout_seconds" SET DEFAULT 90;

CREATE TABLE "usage_events" (
  "id" UUID NOT NULL,
  "idempotency_key" VARCHAR(180) NOT NULL,
  "event_name" VARCHAR(80) NOT NULL,
  "channel" VARCHAR(40) NOT NULL,
  "assignment_scope" "KioskAssignmentScope",
  "organization_id" UUID,
  "store_id" UUID,
  "kiosk_device_id" UUID,
  "try_on_session_id" UUID,
  "kiosk_try_on_run_id" UUID,
  "try_on_look_id" UUID,
  "product_id" UUID,
  "provider" VARCHAR(80),
  "provider_model" VARCHAR(120),
  "status" VARCHAR(80),
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "metadata_json" JSONB,
  "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "usage_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "usage_events_idempotency_key_key"
  ON "usage_events"("idempotency_key");

CREATE INDEX "usage_events_event_name_occurred_at_idx"
  ON "usage_events"("event_name", "occurred_at");

CREATE INDEX "usage_events_channel_occurred_at_idx"
  ON "usage_events"("channel", "occurred_at");

CREATE INDEX "usage_events_organization_id_occurred_at_idx"
  ON "usage_events"("organization_id", "occurred_at");

CREATE INDEX "usage_events_store_id_occurred_at_idx"
  ON "usage_events"("store_id", "occurred_at");

CREATE INDEX "usage_events_kiosk_device_id_occurred_at_idx"
  ON "usage_events"("kiosk_device_id", "occurred_at");

CREATE INDEX "usage_events_try_on_session_id_occurred_at_idx"
  ON "usage_events"("try_on_session_id", "occurred_at");

CREATE INDEX "usage_events_kiosk_try_on_run_id_idx"
  ON "usage_events"("kiosk_try_on_run_id");

CREATE INDEX "usage_events_try_on_look_id_idx"
  ON "usage_events"("try_on_look_id");

CREATE INDEX "usage_events_product_id_occurred_at_idx"
  ON "usage_events"("product_id", "occurred_at");
