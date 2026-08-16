CREATE TYPE "KioskIdleMode" AS ENUM ('STATIC', 'SLIDESHOW');

CREATE TYPE "KioskConfigurationAssetType" AS ENUM ('BUNDLED_IMAGE', 'REMOTE_IMAGE');

CREATE TYPE "KioskConfigurationSoundProfile" AS ENUM ('SELFX_SIGNATURE', 'SOFT', 'STUDIO', 'MINIMAL', 'MUTED');

CREATE TYPE "KioskConfigurationGarmentIntent" AS ENUM ('TOP', 'BOTTOM', 'FULL_OUTFIT');

CREATE TABLE "kiosk_device_configurations" (
  "id" UUID NOT NULL,
  "kiosk_device_id" UUID NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "idle_mode" "KioskIdleMode" NOT NULL DEFAULT 'STATIC',
  "slide_duration_seconds" INTEGER NOT NULL DEFAULT 6,
  "title" VARCHAR(120),
  "subtitle" VARCHAR(180),
  "cta_label" VARCHAR(40) NOT NULL DEFAULT 'Start Try-On',
  "countdown_seconds" INTEGER NOT NULL DEFAULT 10,
  "sound_enabled" BOOLEAN NOT NULL DEFAULT true,
  "sound_profile" "KioskConfigurationSoundProfile" NOT NULL DEFAULT 'SELFX_SIGNATURE',
  "guidance_audio_enabled" BOOLEAN NOT NULL DEFAULT false,
  "enabled_garment_intents" "KioskConfigurationGarmentIntent"[] NOT NULL DEFAULT ARRAY['TOP', 'BOTTOM', 'FULL_OUTFIT']::"KioskConfigurationGarmentIntent"[],
  "session_idle_timeout_seconds" INTEGER NOT NULL DEFAULT 120,
  "updated_by_user_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "kiosk_device_configurations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "kiosk_device_configuration_assets" (
  "id" UUID NOT NULL,
  "configuration_id" UUID NOT NULL,
  "sort_order" INTEGER NOT NULL,
  "type" "KioskConfigurationAssetType" NOT NULL,
  "label" VARCHAR(120) NOT NULL,
  "url" TEXT,
  "bundled_asset_key" VARCHAR(120),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "kiosk_device_configuration_assets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "kiosk_device_configurations_kiosk_device_id_key"
  ON "kiosk_device_configurations"("kiosk_device_id");

CREATE INDEX "kiosk_device_configurations_kiosk_device_id_version_idx"
  ON "kiosk_device_configurations"("kiosk_device_id", "version");

CREATE INDEX "kiosk_device_configurations_updated_by_user_id_idx"
  ON "kiosk_device_configurations"("updated_by_user_id");

CREATE UNIQUE INDEX "kiosk_device_configuration_assets_configuration_id_sort_order_key"
  ON "kiosk_device_configuration_assets"("configuration_id", "sort_order");

CREATE INDEX "kiosk_device_configuration_assets_configuration_id_idx"
  ON "kiosk_device_configuration_assets"("configuration_id");

ALTER TABLE "kiosk_device_configurations"
  ADD CONSTRAINT "kiosk_device_configurations_kiosk_device_id_fkey"
  FOREIGN KEY ("kiosk_device_id") REFERENCES "kiosk_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "kiosk_device_configurations"
  ADD CONSTRAINT "kiosk_device_configurations_updated_by_user_id_fkey"
  FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "kiosk_device_configuration_assets"
  ADD CONSTRAINT "kiosk_device_configuration_assets_configuration_id_fkey"
  FOREIGN KEY ("configuration_id") REFERENCES "kiosk_device_configurations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
