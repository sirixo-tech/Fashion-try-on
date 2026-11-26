CREATE TABLE "customer_wardrobe_items" (
  "id" UUID NOT NULL,
  "customer_id" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "category" VARCHAR(24) NOT NULL,
  "colour" VARCHAR(40),
  "notes" VARCHAR(500),
  "storage_key" TEXT NOT NULL,
  "request_hash" CHAR(64) NOT NULL,
  "content_hash" CHAR(64),
  "terms_version" VARCHAR(40) NOT NULL,
  "terms_accepted_at" TIMESTAMPTZ(3) NOT NULL,
  "retention_version" VARCHAR(40) NOT NULL,
  "retention_statement" TEXT NOT NULL,
  "ready_at" TIMESTAMPTZ(3),
  "deleted_at" TIMESTAMPTZ(3),
  "storage_deleted_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "customer_wardrobe_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "customer_wardrobe_items_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "customer_wardrobe_items_category_check" CHECK ("category" IN ('TOPS', 'JACKETS', 'BOTTOMS', 'DRESSES', 'INDIAN_WEAR', 'OTHER'))
);
CREATE UNIQUE INDEX "customer_wardrobe_items_storage_key_key" ON "customer_wardrobe_items"("storage_key");
CREATE INDEX "customer_wardrobe_owner_created_idx" ON "customer_wardrobe_items"("customer_id", "deleted_at", "created_at", "id");
CREATE INDEX "customer_wardrobe_items_storage_deleted_at_deleted_at_idx" ON "customer_wardrobe_items"("storage_deleted_at", "deleted_at");
