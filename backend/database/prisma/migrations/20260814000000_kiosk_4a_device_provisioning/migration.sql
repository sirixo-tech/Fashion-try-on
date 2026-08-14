-- KIOSK-4A: kiosk device provisioning, pairing sessions and device sessions.

CREATE TYPE "KioskAssignmentScope" AS ENUM ('PLATFORM', 'ORGANIZATION', 'STORE');

CREATE TYPE "KioskDeviceStatus" AS ENUM ('ACTIVE', 'REVOKED');

CREATE TYPE "KioskPairingSessionStatus" AS ENUM ('PENDING', 'CLAIMED', 'EXPIRED', 'CANCELLED');

CREATE TABLE "kiosk_devices" (
  "id" UUID NOT NULL,
  "display_name" VARCHAR(160) NOT NULL,
  "status" "KioskDeviceStatus" NOT NULL DEFAULT 'ACTIVE',
  "assignment_scope" "KioskAssignmentScope" NOT NULL DEFAULT 'PLATFORM',
  "organization_id" UUID,
  "store_id" UUID,
  "platform" VARCHAR(80),
  "app_version" VARCHAR(80),
  "installation_id" VARCHAR(160),
  "paired_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_seen_at" TIMESTAMPTZ(3),
  "revoked_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "kiosk_devices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "kiosk_pairing_sessions" (
  "id" UUID NOT NULL,
  "code_digest" TEXT NOT NULL,
  "provisioning_secret_hash" TEXT NOT NULL,
  "provisioning_grant_hash" TEXT,
  "status" "KioskPairingSessionStatus" NOT NULL DEFAULT 'PENDING',
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "claimed_at" TIMESTAMPTZ(3),
  "claimed_by_user_id" UUID,
  "kiosk_device_id" UUID,
  "grant_issued_at" TIMESTAMPTZ(3),
  "grant_consumed_at" TIMESTAMPTZ(3),
  "installation_id" VARCHAR(160),
  "platform" VARCHAR(80),
  "app_version" VARCHAR(80),

  CONSTRAINT "kiosk_pairing_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "kiosk_device_sessions" (
  "id" UUID NOT NULL,
  "kiosk_device_id" UUID NOT NULL,
  "refresh_token_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "revoked_at" TIMESTAMPTZ(3),
  "rotated_at" TIMESTAMPTZ(3),
  "last_used_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "kiosk_device_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "kiosk_devices_status_idx" ON "kiosk_devices"("status");
CREATE INDEX "kiosk_devices_assignment_scope_idx" ON "kiosk_devices"("assignment_scope");
CREATE INDEX "kiosk_devices_organization_id_idx" ON "kiosk_devices"("organization_id");
CREATE INDEX "kiosk_devices_store_id_idx" ON "kiosk_devices"("store_id");
CREATE INDEX "kiosk_devices_organization_id_store_id_idx" ON "kiosk_devices"("organization_id", "store_id");
CREATE INDEX "kiosk_devices_last_seen_at_idx" ON "kiosk_devices"("last_seen_at");

CREATE INDEX "kiosk_pairing_sessions_code_digest_idx" ON "kiosk_pairing_sessions"("code_digest");
CREATE INDEX "kiosk_pairing_sessions_status_expires_at_idx" ON "kiosk_pairing_sessions"("status", "expires_at");
CREATE INDEX "kiosk_pairing_sessions_claimed_by_user_id_idx" ON "kiosk_pairing_sessions"("claimed_by_user_id");
CREATE INDEX "kiosk_pairing_sessions_kiosk_device_id_idx" ON "kiosk_pairing_sessions"("kiosk_device_id");
CREATE INDEX "kiosk_pairing_sessions_installation_id_idx" ON "kiosk_pairing_sessions"("installation_id");

CREATE INDEX "kiosk_device_sessions_kiosk_device_id_idx" ON "kiosk_device_sessions"("kiosk_device_id");
CREATE INDEX "kiosk_device_sessions_refresh_token_hash_idx" ON "kiosk_device_sessions"("refresh_token_hash");
CREATE INDEX "kiosk_device_sessions_expires_at_idx" ON "kiosk_device_sessions"("expires_at");
CREATE INDEX "kiosk_device_sessions_revoked_at_idx" ON "kiosk_device_sessions"("revoked_at");

ALTER TABLE "kiosk_devices"
  ADD CONSTRAINT "kiosk_devices_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "kiosk_devices"
  ADD CONSTRAINT "kiosk_devices_organization_id_store_id_fkey"
  FOREIGN KEY ("organization_id", "store_id") REFERENCES "stores"("organization_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "kiosk_pairing_sessions"
  ADD CONSTRAINT "kiosk_pairing_sessions_claimed_by_user_id_fkey"
  FOREIGN KEY ("claimed_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "kiosk_pairing_sessions"
  ADD CONSTRAINT "kiosk_pairing_sessions_kiosk_device_id_fkey"
  FOREIGN KEY ("kiosk_device_id") REFERENCES "kiosk_devices"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "kiosk_device_sessions"
  ADD CONSTRAINT "kiosk_device_sessions_kiosk_device_id_fkey"
  FOREIGN KEY ("kiosk_device_id") REFERENCES "kiosk_devices"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
