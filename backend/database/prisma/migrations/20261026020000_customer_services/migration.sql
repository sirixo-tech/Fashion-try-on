-- CreateTable
CREATE TABLE "customer_push_devices" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "installation_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "token_cipher" JSONB NOT NULL,
    "platform" VARCHAR(16) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "customer_push_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_notifications" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "kind" VARCHAR(40) NOT NULL,
    "read_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_push_deliveries" (
    "id" UUID NOT NULL,
    "notification_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "state" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "available_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lease_until" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_push_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customer_push_devices_token_hash_key" ON "customer_push_devices"("token_hash");

-- CreateIndex
CREATE INDEX "customer_push_devices_session_id_idx" ON "customer_push_devices"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_push_devices_customer_id_installation_id_key" ON "customer_push_devices"("customer_id", "installation_id");

-- CreateIndex
CREATE INDEX "customer_notifications_customer_id_created_at_id_idx" ON "customer_notifications"("customer_id", "created_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_notifications_customer_id_run_id_kind_key" ON "customer_notifications"("customer_id", "run_id", "kind");

-- CreateIndex
CREATE INDEX "customer_push_deliveries_state_available_at_idx" ON "customer_push_deliveries"("state", "available_at");

-- CreateIndex
CREATE UNIQUE INDEX "customer_push_deliveries_notification_id_device_id_key" ON "customer_push_deliveries"("notification_id", "device_id");

-- AddForeignKey
ALTER TABLE "customer_push_devices" ADD CONSTRAINT "customer_push_devices_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_push_devices" ADD CONSTRAINT "customer_push_devices_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "customer_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_notifications" ADD CONSTRAINT "customer_notifications_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_push_deliveries" ADD CONSTRAINT "customer_push_deliveries_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "customer_notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_push_deliveries" ADD CONSTRAINT "customer_push_deliveries_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "customer_push_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
DROP INDEX app_releases_one_recommended_per_arch;
CREATE UNIQUE INDEX app_releases_one_recommended_per_app_arch ON app_releases(package_name, architecture) WHERE recommended;
