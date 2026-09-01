ALTER TABLE "kiosk_try_on_runs"
  ADD COLUMN "catalog_source" VARCHAR(40),
  ADD COLUMN "external_product_id" VARCHAR(160),
  ADD COLUMN "external_variant_id" VARCHAR(160),
  ADD COLUMN "external_sku" VARCHAR(160),
  ADD COLUMN "external_product_name" VARCHAR(240),
  ADD COLUMN "external_product_price" DECIMAL(12, 2),
  ADD COLUMN "external_currency" VARCHAR(3);

CREATE INDEX "kiosk_try_on_runs_organization_id_catalog_source_created_at_idx"
  ON "kiosk_try_on_runs"("organization_id", "catalog_source", "created_at");

CREATE INDEX "kiosk_try_on_runs_organization_id_external_product_id_idx"
  ON "kiosk_try_on_runs"("organization_id", "external_product_id");
