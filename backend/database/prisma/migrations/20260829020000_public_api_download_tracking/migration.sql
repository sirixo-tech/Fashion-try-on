ALTER TABLE "usage_events"
  ADD COLUMN "api_key_id" UUID;

CREATE INDEX "usage_events_api_key_id_occurred_at_idx"
  ON "usage_events"("api_key_id", "occurred_at");

ALTER TABLE "usage_events"
  ADD CONSTRAINT "usage_events_api_key_id_fkey"
  FOREIGN KEY ("api_key_id") REFERENCES "api_keys"("id") ON DELETE SET NULL ON UPDATE CASCADE;
