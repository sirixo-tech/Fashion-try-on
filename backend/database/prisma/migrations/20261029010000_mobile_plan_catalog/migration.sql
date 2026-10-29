CREATE TYPE "MobilePlanBillingPeriod" AS ENUM ('MONTHLY', 'ONE_TIME');

CREATE TABLE "mobile_plans" (
    "id" UUID NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" VARCHAR(500) NOT NULL DEFAULT '',
    "status" "PricingPlanStatus" NOT NULL DEFAULT 'INACTIVE',
    "currency" CHAR(3) NOT NULL,
    "price_cents" INTEGER NOT NULL,
    "billing_period" "MobilePlanBillingPeriod" NOT NULL,
    "included_credits" INTEGER NOT NULL,
    "trial_credits" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "mobile_plans_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "mobile_plans_price_credits_check" CHECK ("price_cents" >= 0 AND "included_credits" >= 0 AND "trial_credits" >= 0)
);

CREATE UNIQUE INDEX "mobile_plans_code_key" ON "mobile_plans"("code");
CREATE INDEX "mobile_plans_status_price_cents_idx" ON "mobile_plans"("status", "price_cents");
