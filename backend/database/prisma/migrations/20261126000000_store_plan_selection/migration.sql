ALTER TABLE "shopify_billing_agreements"
  ADD COLUMN "request_key" CHAR(64),
  ADD COLUMN "request_fingerprint" CHAR(64),
  ADD COLUMN "confirmation_url" VARCHAR(2048),
  ADD COLUMN "creation_started_at" TIMESTAMPTZ(3);

CREATE UNIQUE INDEX "shopify_billing_agreements_request_key_key"
  ON "shopify_billing_agreements"("request_key");

ALTER TABLE "store_billing_cycles" ADD COLUMN "billing_provider" VARCHAR(24);

CREATE TABLE "store_plan_purchases" (
  "id" UUID PRIMARY KEY,
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "pricing_plan_id" UUID NOT NULL REFERENCES "pricing_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "actor_user_id" UUID NOT NULL,
  "request_key" CHAR(64) UNIQUE,
  "request_fingerprint" CHAR(64) NOT NULL,
  "merchant_order_id" VARCHAR(63) NOT NULL UNIQUE,
  "provider_order_id" VARCHAR(100),
  "status" VARCHAR(24) NOT NULL DEFAULT 'INITIALIZING',
  "amount_minor" INTEGER NOT NULL CHECK ("amount_minor" >= 0),
  "currency" CHAR(3) NOT NULL,
  "pricing_snapshot" JSONB NOT NULL,
  "base_subscription" JSONB NOT NULL,
  "effective_after" TIMESTAMPTZ(3),
  "billing_cycle_id" UUID UNIQUE,
  "checkout_url" TEXT,
  "encrypted_payload" TEXT NOT NULL,
  "initialization_vector" VARCHAR(128) NOT NULL,
  "authentication_tag" VARCHAR(128) NOT NULL,
  "key_version" VARCHAR(80) NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "paid_at" TIMESTAMPTZ(3),
  "activated_at" TIMESTAMPTZ(3),
  "checked_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "store_plan_purchases_organization_id_billing_cycle_id_fkey" FOREIGN KEY ("organization_id", "billing_cycle_id") REFERENCES "store_billing_cycles"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "store_plan_purchases_organization_id_id_key" ON "store_plan_purchases"("organization_id", "id");
CREATE UNIQUE INDEX "store_plan_purchases_organization_id_billing_cycle_id_key" ON "store_plan_purchases"("organization_id", "billing_cycle_id");
CREATE INDEX "store_plan_purchases_organization_id_status_created_at_idx"
  ON "store_plan_purchases"("organization_id", "status", "created_at");
CREATE INDEX "store_plan_purchases_status_checked_at_idx"
  ON "store_plan_purchases"("status", "checked_at");
ALTER TABLE "store_billing_cycles" ADD COLUMN "phonepe_purchase_id" UUID;
ALTER TABLE "store_billing_cycles" ADD CONSTRAINT "store_billing_cycles_organization_id_phonepe_purchase_id_fkey" FOREIGN KEY ("organization_id", "phonepe_purchase_id") REFERENCES "store_plan_purchases"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Close admission before finalizing an invoice. Accepted runs must all finish
-- before the invoice is created, and no delayed admission can add another run.
CREATE FUNCTION selfx_protect_invoiced_cycle() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.billing_cycle_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.billing_cycle_id IS NOT DISTINCT FROM NEW.billing_cycle_id THEN RETURN NEW; END IF;
  PERFORM id FROM store_billing_cycles WHERE id = NEW.billing_cycle_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM store_plan_purchases WHERE billing_cycle_id = NEW.billing_cycle_id) THEN
    RAISE EXCEPTION 'This billing cycle has been finalized';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER selfx_protect_invoiced_cycle BEFORE INSERT OR UPDATE OF billing_cycle_id ON kiosk_try_on_runs
  FOR EACH ROW EXECUTE FUNCTION selfx_protect_invoiced_cycle();
