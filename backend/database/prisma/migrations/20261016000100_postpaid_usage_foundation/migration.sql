-- CreateEnum
CREATE TYPE "PlanBillingMode" AS ENUM ('CREDIT_LIMITED', 'POSTPAID_PAYG');

-- CreateEnum
CREATE TYPE "GenerationBillingCoverage" AS ENUM ('UNBILLED', 'PREPAID', 'POSTPAID');

-- AlterTable
ALTER TABLE "kiosk_try_on_runs" ADD COLUMN     "billing_channel" "CreditLedgerChannel",
ADD COLUMN     "billing_cycle_id" UUID;

-- AlterTable
ALTER TABLE "pricing_plans" ADD COLUMN     "billing_mode" "PlanBillingMode" NOT NULL DEFAULT 'CREDIT_LIMITED',
ADD COLUMN     "credit_unit_price_cents" INTEGER;

-- AlterTable
ALTER TABLE "store_subscriptions" ADD COLUMN     "billing_anchor_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "pricing_plan_rates" (
    "id" UUID NOT NULL,
    "pricing_plan_id" UUID NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "credit_unit_price_cents" INTEGER NOT NULL,
    "effective_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "pricing_plan_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_billing_cycles" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "pricing_plan_id" UUID NOT NULL,
    "period_start" TIMESTAMPTZ(3) NOT NULL,
    "period_end" TIMESTAMPTZ(3) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "credit_unit_price_cents" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_billing_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billable_generations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "channel" "CreditLedgerChannel",
    "coverage" "GenerationBillingCoverage" NOT NULL DEFAULT 'UNBILLED',
    "billing_cycle_id" UUID,
    "completed_at" TIMESTAMPTZ(3) NOT NULL,
    "historical" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billable_generations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pricing_plan_rates_pricing_plan_id_effective_at_idx" ON "pricing_plan_rates"("pricing_plan_id", "effective_at");

-- CreateIndex
CREATE INDEX "store_billing_cycles_organization_id_period_end_idx" ON "store_billing_cycles"("organization_id", "period_end");

-- CreateIndex
CREATE UNIQUE INDEX "store_billing_cycles_organization_id_id_key" ON "store_billing_cycles"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "store_billing_cycles_subscription_id_period_start_key" ON "store_billing_cycles"("subscription_id", "period_start");

-- CreateIndex
CREATE UNIQUE INDEX "billable_generations_run_id_key" ON "billable_generations"("run_id");

-- CreateIndex
CREATE INDEX "billable_generations_organization_id_completed_at_idx" ON "billable_generations"("organization_id", "completed_at");

-- CreateIndex
CREATE INDEX "billable_generations_billing_cycle_id_coverage_idx" ON "billable_generations"("billing_cycle_id", "coverage");

-- CreateIndex
CREATE INDEX "kiosk_try_on_runs_billing_cycle_id_idx" ON "kiosk_try_on_runs"("billing_cycle_id");

-- CreateIndex
CREATE UNIQUE INDEX "store_subscriptions_organization_id_id_key" ON "store_subscriptions"("organization_id", "id");

-- AddForeignKey
ALTER TABLE "kiosk_try_on_runs" ADD CONSTRAINT "kiosk_try_on_runs_organization_id_billing_cycle_id_fkey" FOREIGN KEY ("organization_id", "billing_cycle_id") REFERENCES "store_billing_cycles"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_plan_rates" ADD CONSTRAINT "pricing_plan_rates_pricing_plan_id_fkey" FOREIGN KEY ("pricing_plan_id") REFERENCES "pricing_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_billing_cycles" ADD CONSTRAINT "store_billing_cycles_organization_id_subscription_id_fkey" FOREIGN KEY ("organization_id", "subscription_id") REFERENCES "store_subscriptions"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_billing_cycles" ADD CONSTRAINT "store_billing_cycles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billable_generations" ADD CONSTRAINT "billable_generations_organization_id_billing_cycle_id_fkey" FOREIGN KEY ("organization_id", "billing_cycle_id") REFERENCES "store_billing_cycles"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billable_generations" ADD CONSTRAINT "billable_generations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Financial invariants apply even to writes outside the API.
ALTER TABLE "pricing_plans" ADD CONSTRAINT "pricing_plans_billing_terms_check" CHECK (
  (billing_mode = 'CREDIT_LIMITED' AND credit_unit_price_cents IS NULL) OR
  (billing_mode = 'POSTPAID_PAYG' AND credit_unit_price_cents IS NOT NULL AND credit_unit_price_cents BETWEEN 1 AND 1000000000
    AND monthly_price_cents = 0 AND included_credits = 0 AND trial_credits = 0 AND extra_credit_price_cents IS NULL)
);
ALTER TABLE "pricing_plan_rates" ADD CONSTRAINT "pricing_plan_rates_positive_price_check"
  CHECK (credit_unit_price_cents BETWEEN 1 AND 1000000000);
ALTER TABLE "store_billing_cycles" ADD CONSTRAINT "store_billing_cycles_terms_check"
  CHECK (period_end > period_start AND credit_unit_price_cents BETWEEN 1 AND 1000000000);
ALTER TABLE "billable_generations" ADD CONSTRAINT "billable_generations_coverage_check"
  CHECK ((coverage = 'POSTPAID' AND billing_cycle_id IS NOT NULL) OR (coverage <> 'POSTPAID' AND billing_cycle_id IS NULL));
ALTER TABLE "kiosk_try_on_runs" ADD CONSTRAINT "kiosk_try_on_runs_billing_tenant_check"
  CHECK (billing_cycle_id IS NULL OR (organization_id IS NOT NULL AND assignment_scope <> 'PLATFORM'));

