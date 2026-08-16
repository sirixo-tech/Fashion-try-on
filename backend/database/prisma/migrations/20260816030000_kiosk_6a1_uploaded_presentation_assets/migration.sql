ALTER TYPE "KioskConfigurationAssetType" ADD VALUE IF NOT EXISTS 'UPLOADED_IMAGE';

ALTER TABLE "kiosk_device_configuration_assets"
  ADD COLUMN IF NOT EXISTS "object_key" VARCHAR(512),
  ADD COLUMN IF NOT EXISTS "content_type" VARCHAR(80),
  ADD COLUMN IF NOT EXISTS "size_bytes" INTEGER;
