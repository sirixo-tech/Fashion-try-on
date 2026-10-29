CREATE TYPE "CustomCreditChannel" AS ENUM ('STORE', 'MOBILE');

CREATE TABLE "custom_credit_plans" (
  "id" UUID NOT NULL PRIMARY KEY,
  "channel" "CustomCreditChannel" NOT NULL UNIQUE,
  "name" VARCHAR(160) NOT NULL,
  "status" "PricingPlanStatus" NOT NULL DEFAULT 'INACTIVE',
  "currency" CHAR(3) NOT NULL,
  "unit_price_cents" INTEGER NOT NULL CHECK ("unit_price_cents" BETWEEN 1 AND 2000000),
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL
);

ALTER TABLE "customer_mobile_purchases" ADD COLUMN "custom_credit_plan_id" UUID;
ALTER TABLE "customer_mobile_purchases" ADD CONSTRAINT "customer_mobile_purchases_custom_credit_plan_id_fkey"
  FOREIGN KEY ("custom_credit_plan_id") REFERENCES "custom_credit_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
