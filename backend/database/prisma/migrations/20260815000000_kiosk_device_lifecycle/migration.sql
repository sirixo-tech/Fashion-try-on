ALTER TYPE "KioskDeviceStatus" ADD VALUE IF NOT EXISTS 'INACTIVE';
ALTER TYPE "KioskDeviceStatus" ADD VALUE IF NOT EXISTS 'DELETED';

ALTER TABLE "kiosk_devices"
  ADD COLUMN "inactive_at" TIMESTAMPTZ(3),
  ADD COLUMN "deleted_at" TIMESTAMPTZ(3);

CREATE INDEX "kiosk_devices_deleted_at_idx" ON "kiosk_devices"("deleted_at");
