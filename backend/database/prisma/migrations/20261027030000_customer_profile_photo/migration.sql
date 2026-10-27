CREATE TABLE "customer_profile_photos" (
  "id" UUID NOT NULL,
  "customer_id" UUID NOT NULL,
  "storage_key" VARCHAR(512) NOT NULL,
  "consent_version" VARCHAR(40) NOT NULL,
  "consent_statement" TEXT NOT NULL,
  "consent_language" VARCHAR(12) NOT NULL,
  "ready_at" TIMESTAMPTZ(3),
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "deleted_at" TIMESTAMPTZ(3),
  "storage_deleted_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_profile_photos_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "customer_profile_photos_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "customer_profile_photos_storage_key_key" ON "customer_profile_photos"("storage_key");
CREATE INDEX "customer_profile_photos_customer_id_created_at_idx" ON "customer_profile_photos"("customer_id", "created_at");
CREATE INDEX "customer_profile_photos_storage_deleted_at_expires_at_idx" ON "customer_profile_photos"("storage_deleted_at", "expires_at");
