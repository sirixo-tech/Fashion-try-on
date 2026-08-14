-- KIOSK-4C: Secure customer mobile QR photo upload sessions.

CREATE TYPE "KioskCustomerUploadSessionStatus" AS ENUM (
    'WAITING',
    'UPLOADING',
    'VALIDATING',
    'READY',
    'REJECTED',
    'EXPIRED',
    'CONSUMED',
    'CANCELLED'
);

CREATE TABLE "kiosk_customer_upload_sessions" (
    "id" UUID NOT NULL,
    "kiosk_device_id" UUID NOT NULL,
    "status" "KioskCustomerUploadSessionStatus" NOT NULL DEFAULT 'WAITING',
    "capability_digest" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "upload_started_at" TIMESTAMPTZ(3),
    "ready_at" TIMESTAMPTZ(3),
    "consumed_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "asset_key" VARCHAR(512),
    "content_type" VARCHAR(80),
    "size_bytes" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "rejection_code" VARCHAR(120),

    CONSTRAINT "kiosk_customer_upload_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "kiosk_customer_upload_sessions_capability_digest_key"
    ON "kiosk_customer_upload_sessions"("capability_digest");

CREATE INDEX "kiosk_customer_upload_sessions_kiosk_device_id_created_at_idx"
    ON "kiosk_customer_upload_sessions"("kiosk_device_id", "created_at");

CREATE INDEX "kiosk_customer_upload_sessions_kiosk_device_id_status_idx"
    ON "kiosk_customer_upload_sessions"("kiosk_device_id", "status");

CREATE INDEX "kiosk_customer_upload_sessions_status_expires_at_idx"
    ON "kiosk_customer_upload_sessions"("status", "expires_at");

CREATE INDEX "kiosk_customer_upload_sessions_expires_at_idx"
    ON "kiosk_customer_upload_sessions"("expires_at");

ALTER TABLE "kiosk_customer_upload_sessions"
    ADD CONSTRAINT "kiosk_customer_upload_sessions_kiosk_device_id_fkey"
    FOREIGN KEY ("kiosk_device_id")
    REFERENCES "kiosk_devices"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;
