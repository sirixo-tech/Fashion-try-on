ALTER TABLE "kiosk_try_on_runs"
  ADD COLUMN "api_key_id" UUID,
  ALTER COLUMN "kiosk_device_id" DROP NOT NULL;

ALTER TABLE "kiosk_try_on_runs"
  ADD CONSTRAINT "kiosk_try_on_runs_api_key_id_fkey"
  FOREIGN KEY ("api_key_id") REFERENCES "api_keys"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "kiosk_try_on_runs_api_key_id_client_request_id_key"
  ON "kiosk_try_on_runs"("api_key_id", "client_request_id");

CREATE INDEX "kiosk_try_on_runs_api_key_id_created_at_idx"
  ON "kiosk_try_on_runs"("api_key_id", "created_at");
