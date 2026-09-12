CREATE TYPE "PricingPlanStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

CREATE TYPE "StoreSubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED');

CREATE TYPE "CreditLedgerEntryType" AS ENUM (
  'TRIAL_GRANTED',
  'PLAN_GRANTED',
  'CREDIT_PACK_PURCHASED',
  'CREDIT_CONSUMED',
  'CREDIT_REFUNDED',
  'MANUAL_ADJUSTMENT'
);

CREATE TYPE "CreditLedgerChannel" AS ENUM ('SHOPIFY', 'KIOSK', 'PUBLIC_API', 'ADMIN');

CREATE TABLE "pricing_plans" (
  "id" UUID NOT NULL,
  "code" VARCHAR(80) NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "status" "PricingPlanStatus" NOT NULL DEFAULT 'ACTIVE',
  "channels_json" JSONB NOT NULL,
  "currency" CHAR(3) NOT NULL DEFAULT 'USD',
  "monthly_price_cents" INTEGER NOT NULL DEFAULT 0,
  "included_credits" INTEGER NOT NULL DEFAULT 0,
  "trial_credits" INTEGER NOT NULL DEFAULT 10,
  "extra_credit_price_cents" INTEGER,
  "kiosk_monthly_rent_cents" INTEGER,
  "kiosk_device_limit" INTEGER,
  "metadata_json" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "pricing_plans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "store_subscriptions" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "pricing_plan_id" UUID,
  "status" "StoreSubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
  "channels_json" JSONB NOT NULL,
  "included_credits" INTEGER NOT NULL DEFAULT 0,
  "trial_credits" INTEGER NOT NULL DEFAULT 10,
  "current_period_start" TIMESTAMPTZ(3),
  "current_period_end" TIMESTAMPTZ(3),
  "trial_started_at" TIMESTAMPTZ(3),
  "trial_ends_at" TIMESTAMPTZ(3),
  "cancelled_at" TIMESTAMPTZ(3),
  "metadata_json" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "store_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "credit_ledger_entries" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "subscription_id" UUID,
  "pricing_plan_id" UUID,
  "entry_type" "CreditLedgerEntryType" NOT NULL,
  "channel" "CreditLedgerChannel",
  "quantity" INTEGER NOT NULL,
  "balance_after" INTEGER,
  "idempotency_key" VARCHAR(180) NOT NULL,
  "reason" VARCHAR(240),
  "try_on_session_id" UUID,
  "kiosk_try_on_run_id" UUID,
  "product_id" UUID,
  "integration_id" UUID,
  "metadata_json" JSONB,
  "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "credit_ledger_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pricing_plans_code_key"
  ON "pricing_plans"("code");
CREATE INDEX "pricing_plans_status_idx"
  ON "pricing_plans"("status");

CREATE UNIQUE INDEX "store_subscriptions_organization_id_key"
  ON "store_subscriptions"("organization_id");
CREATE INDEX "store_subscriptions_status_idx"
  ON "store_subscriptions"("status");
CREATE INDEX "store_subscriptions_pricing_plan_id_idx"
  ON "store_subscriptions"("pricing_plan_id");
CREATE INDEX "store_subscriptions_current_period_end_idx"
  ON "store_subscriptions"("current_period_end");

CREATE UNIQUE INDEX "credit_ledger_entries_idempotency_key_key"
  ON "credit_ledger_entries"("idempotency_key");
CREATE INDEX "credit_ledger_entries_organization_id_occurred_at_idx"
  ON "credit_ledger_entries"("organization_id", "occurred_at");
CREATE INDEX "credit_ledger_entries_organization_id_channel_occurred_at_idx"
  ON "credit_ledger_entries"("organization_id", "channel", "occurred_at");
CREATE INDEX "credit_ledger_entries_organization_id_entry_type_occurred_at_idx"
  ON "credit_ledger_entries"("organization_id", "entry_type", "occurred_at");
CREATE INDEX "credit_ledger_entries_subscription_id_occurred_at_idx"
  ON "credit_ledger_entries"("subscription_id", "occurred_at");
CREATE INDEX "credit_ledger_entries_pricing_plan_id_idx"
  ON "credit_ledger_entries"("pricing_plan_id");
CREATE INDEX "credit_ledger_entries_try_on_session_id_idx"
  ON "credit_ledger_entries"("try_on_session_id");
CREATE INDEX "credit_ledger_entries_kiosk_try_on_run_id_idx"
  ON "credit_ledger_entries"("kiosk_try_on_run_id");
CREATE INDEX "credit_ledger_entries_product_id_idx"
  ON "credit_ledger_entries"("product_id");
CREATE INDEX "credit_ledger_entries_integration_id_idx"
  ON "credit_ledger_entries"("integration_id");

ALTER TABLE "store_subscriptions"
  ADD CONSTRAINT "store_subscriptions_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "store_subscriptions"
  ADD CONSTRAINT "store_subscriptions_pricing_plan_id_fkey"
  FOREIGN KEY ("pricing_plan_id") REFERENCES "pricing_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "credit_ledger_entries"
  ADD CONSTRAINT "credit_ledger_entries_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "credit_ledger_entries"
  ADD CONSTRAINT "credit_ledger_entries_subscription_id_fkey"
  FOREIGN KEY ("subscription_id") REFERENCES "store_subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "credit_ledger_entries"
  ADD CONSTRAINT "credit_ledger_entries_pricing_plan_id_fkey"
  FOREIGN KEY ("pricing_plan_id") REFERENCES "pricing_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
