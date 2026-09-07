ALTER TABLE "kiosk_device_configuration_assets"
  ADD COLUMN IF NOT EXISTS "duration_seconds" INTEGER;

ALTER TABLE "kiosk_device_configuration_assets"
  ADD CONSTRAINT "kiosk_device_configuration_assets_duration_seconds_check"
  CHECK ("duration_seconds" IS NULL OR ("duration_seconds" >= 1 AND "duration_seconds" <= 60));
