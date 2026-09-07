ALTER TABLE "external_product_mappings"
  ADD COLUMN "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "external_product_mappings_integration_id_last_seen_at_idx"
  ON "external_product_mappings"("integration_id", "last_seen_at");
