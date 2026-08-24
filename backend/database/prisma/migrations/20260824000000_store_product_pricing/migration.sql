ALTER TABLE "products"
  ADD COLUMN "price_amount_cents" INTEGER,
  ADD COLUMN "price_currency" VARCHAR(3);

ALTER TABLE "products"
  ADD CONSTRAINT "products_price_amount_nonnegative_check"
  CHECK ("price_amount_cents" IS NULL OR "price_amount_cents" >= 0);

ALTER TABLE "products"
  ADD CONSTRAINT "products_price_currency_format_check"
  CHECK ("price_currency" IS NULL OR "price_currency" ~ '^[A-Z]{3}$');
