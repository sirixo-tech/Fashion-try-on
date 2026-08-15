CREATE TYPE "KioskCustomerUploadPurpose" AS ENUM ('MODEL', 'GARMENT');

ALTER TABLE "kiosk_customer_upload_sessions"
  ADD COLUMN "purpose" "KioskCustomerUploadPurpose" NOT NULL DEFAULT 'MODEL';

CREATE INDEX "kiosk_customer_upload_sessions_kiosk_device_id_purpose_status_idx"
  ON "kiosk_customer_upload_sessions"("kiosk_device_id", "purpose", "status");
