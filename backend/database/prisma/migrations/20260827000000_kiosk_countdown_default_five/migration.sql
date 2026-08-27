ALTER TABLE "kiosk_device_configurations"
  ALTER COLUMN "countdown_seconds" SET DEFAULT 5;

UPDATE "kiosk_device_configurations"
SET
  "countdown_seconds" = 5,
  "version" = "version" + 1,
  "updated_at" = CURRENT_TIMESTAMP
WHERE "countdown_seconds" = 10;
