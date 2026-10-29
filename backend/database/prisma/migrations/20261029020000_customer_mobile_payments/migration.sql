CREATE TABLE "mobile_payment_connections" (
  "id" VARCHAR(32) PRIMARY KEY,
  "environment" VARCHAR(16) NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "encrypted_payload" TEXT NOT NULL,
  "initialization_vector" VARCHAR(128) NOT NULL,
  "authentication_tag" VARCHAR(128) NOT NULL,
  "key_version" VARCHAR(80) NOT NULL,
  "updated_at" TIMESTAMPTZ(3) NOT NULL
);

CREATE TABLE "customer_mobile_purchases" (
  "id" UUID PRIMARY KEY,
  "customer_id" UUID NOT NULL REFERENCES "customers"("id") ON DELETE RESTRICT,
  "plan_id" UUID NOT NULL REFERENCES "mobile_plans"("id") ON DELETE RESTRICT,
  "merchant_order_id" VARCHAR(63) NOT NULL UNIQUE,
  "request_key" VARCHAR(160) NOT NULL UNIQUE,
  "provider_order_id" VARCHAR(100),
  "status" VARCHAR(24) NOT NULL DEFAULT 'INITIALIZING',
  "environment" VARCHAR(16) NOT NULL,
  "amount_minor" INTEGER NOT NULL CHECK ("amount_minor" >= 100),
  "currency" CHAR(3) NOT NULL,
  "credits" INTEGER NOT NULL CHECK ("credits" > 0),
  "bonus_credits" INTEGER NOT NULL DEFAULT 0 CHECK ("bonus_credits" >= 0),
  "billing_period" "MobilePlanBillingPeriod" NOT NULL,
  "checkout_url" TEXT,
  "encrypted_payload" TEXT NOT NULL,
  "initialization_vector" VARCHAR(128) NOT NULL,
  "authentication_tag" VARCHAR(128) NOT NULL,
  "key_version" VARCHAR(80) NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "paid_at" TIMESTAMPTZ(3),
  "checked_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "customer_mobile_purchases_customer_id_created_at_idx" ON "customer_mobile_purchases"("customer_id", "created_at");
CREATE INDEX "customer_mobile_purchases_status_checked_at_idx" ON "customer_mobile_purchases"("status", "checked_at");

CREATE TABLE "customer_paid_credit_grants" (
  "id" UUID PRIMARY KEY,
  "customer_id" UUID NOT NULL REFERENCES "customers"("id") ON DELETE RESTRICT,
  "purchase_id" UUID NOT NULL UNIQUE REFERENCES "customer_mobile_purchases"("id") ON DELETE RESTRICT,
  "credits" INTEGER NOT NULL CHECK ("credits" > 0),
  "used_credits" INTEGER NOT NULL DEFAULT 0 CHECK ("used_credits" >= 0),
  "reserved_credits" INTEGER NOT NULL DEFAULT 0 CHECK ("reserved_credits" >= 0),
  "expires_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_paid_credit_grants_balance_check" CHECK ("used_credits" + "reserved_credits" <= "credits")
);
CREATE INDEX "customer_paid_credit_grants_customer_id_expires_at_idx" ON "customer_paid_credit_grants"("customer_id", "expires_at");
ALTER TABLE "kiosk_try_on_runs" ADD COLUMN "customer_paid_grant_id" UUID REFERENCES "customer_paid_credit_grants"("id") ON DELETE RESTRICT;
