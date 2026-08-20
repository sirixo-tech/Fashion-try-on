ALTER TABLE "kiosk_try_on_runs"
  ADD COLUMN "product_id" UUID;

ALTER TABLE "try_on_looks"
  ADD COLUMN "product_id" UUID;

CREATE INDEX "kiosk_try_on_runs_product_id_idx"
  ON "kiosk_try_on_runs"("product_id");

CREATE INDEX "try_on_looks_product_id_idx"
  ON "try_on_looks"("product_id");

ALTER TABLE "kiosk_try_on_runs"
  ADD CONSTRAINT "kiosk_try_on_runs_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "try_on_looks"
  ADD CONSTRAINT "try_on_looks_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
