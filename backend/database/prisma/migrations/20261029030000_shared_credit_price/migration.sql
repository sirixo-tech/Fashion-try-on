CREATE TABLE "shared_credit_prices" (
  "currency" CHAR(3) PRIMARY KEY,
  "unit_price_cents" INTEGER NOT NULL CHECK ("unit_price_cents" BETWEEN 100 AND 100000),
  "version" INTEGER NOT NULL DEFAULT 1,
  "updated_at" TIMESTAMPTZ(3) NOT NULL
);
ALTER TABLE "customer_mobile_purchases" ALTER COLUMN "plan_id" DROP NOT NULL;
