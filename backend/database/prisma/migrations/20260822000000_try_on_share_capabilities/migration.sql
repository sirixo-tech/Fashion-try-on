-- Temporary generated Look sharing capabilities for kiosk sessions.

CREATE TABLE "try_on_share_capabilities" (
    "id" UUID NOT NULL,
    "try_on_session_id" UUID NOT NULL,
    "capability_digest" TEXT NOT NULL,
    "assignment_scope" "KioskAssignmentScope" NOT NULL,
    "organization_id" UUID,
    "store_id" UUID,
    "kiosk_device_id" UUID,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "try_on_share_capabilities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "try_on_share_capabilities_try_on_session_id_key"
    ON "try_on_share_capabilities"("try_on_session_id");

CREATE UNIQUE INDEX "try_on_share_capabilities_capability_digest_key"
    ON "try_on_share_capabilities"("capability_digest");

CREATE INDEX "try_on_share_capabilities_kiosk_device_id_expires_at_idx"
    ON "try_on_share_capabilities"("kiosk_device_id", "expires_at");

CREATE INDEX "try_on_share_capabilities_organization_id_expires_at_idx"
    ON "try_on_share_capabilities"("organization_id", "expires_at");

CREATE INDEX "try_on_share_capabilities_store_id_expires_at_idx"
    ON "try_on_share_capabilities"("store_id", "expires_at");

CREATE INDEX "try_on_share_capabilities_expires_at_idx"
    ON "try_on_share_capabilities"("expires_at");

CREATE INDEX "try_on_share_capabilities_revoked_at_idx"
    ON "try_on_share_capabilities"("revoked_at");

ALTER TABLE "try_on_share_capabilities"
    ADD CONSTRAINT "try_on_share_capabilities_try_on_session_id_fkey"
    FOREIGN KEY ("try_on_session_id")
    REFERENCES "try_on_sessions"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;

ALTER TABLE "try_on_share_capabilities"
    ADD CONSTRAINT "try_on_share_capabilities_organization_id_fkey"
    FOREIGN KEY ("organization_id")
    REFERENCES "organizations"("id")
    ON DELETE RESTRICT
    ON UPDATE CASCADE;

ALTER TABLE "try_on_share_capabilities"
    ADD CONSTRAINT "try_on_share_capabilities_organization_id_store_id_fkey"
    FOREIGN KEY ("organization_id", "store_id")
    REFERENCES "stores"("organization_id", "id")
    ON DELETE RESTRICT
    ON UPDATE CASCADE;

ALTER TABLE "try_on_share_capabilities"
    ADD CONSTRAINT "try_on_share_capabilities_kiosk_device_id_fkey"
    FOREIGN KEY ("kiosk_device_id")
    REFERENCES "kiosk_devices"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
