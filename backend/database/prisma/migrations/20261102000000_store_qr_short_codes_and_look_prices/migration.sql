ALTER TABLE "customer_store_qrs"
  ADD COLUMN "access_code_hash" CHAR(64),
  ADD COLUMN "access_code_ciphertext" TEXT,
  ADD COLUMN "access_code_iv" VARCHAR(32),
  ADD COLUMN "access_code_tag" VARCHAR(32);

CREATE UNIQUE INDEX "customer_store_qrs_access_code_hash_key"
  ON "customer_store_qrs"("access_code_hash");

ALTER TABLE "try_on_looks"
  ADD COLUMN "price_amount_cents" INTEGER,
  ADD COLUMN "price_maximum_amount_cents" INTEGER,
  ADD COLUMN "price_currency" VARCHAR(3);

ALTER TABLE "kiosk_try_on_runs"
  ADD COLUMN "product_price_amount_cents" INTEGER,
  ADD COLUMN "product_price_maximum_amount_cents" INTEGER,
  ADD COLUMN "product_price_currency" VARCHAR(3);
