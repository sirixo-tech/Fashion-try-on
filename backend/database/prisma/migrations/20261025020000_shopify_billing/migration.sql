CREATE TABLE "shopify_billing_agreements" (
  "id" UUID PRIMARY KEY, "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE RESTRICT,
  "integration_id" UUID NOT NULL REFERENCES "integrations"("id") ON DELETE RESTRICT,
  "pricing_plan_id" UUID NOT NULL REFERENCES "pricing_plans"("id") ON DELETE RESTRICT,
  "shop_domain" VARCHAR(180) NOT NULL, "status" VARCHAR(24) NOT NULL DEFAULT 'PENDING',
  "external_subscription_id" VARCHAR(180) UNIQUE, "usage_line_item_id" VARCHAR(220), "usage_cap_cents" INTEGER,
  "pricing_snapshot" JSONB NOT NULL, "period_start" TIMESTAMPTZ(3), "period_end" TIMESTAMPTZ(3),
  "approved_at" TIMESTAMPTZ(3), "effective_after" TIMESTAMPTZ(3), "checked_at" TIMESTAMPTZ(3), "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ("usage_cap_cents" IS NULL OR "usage_cap_cents" > 0)
);
CREATE INDEX "shopify_billing_agreements_integration_id_status_created_at_idx" ON "shopify_billing_agreements"("integration_id", "status", "created_at");
CREATE INDEX "shopify_billing_agreements_organization_id_status_idx" ON "shopify_billing_agreements"("organization_id", "status");
CREATE TABLE "shopify_usage_charges" (
  "id" UUID PRIMARY KEY, "agreement_id" UUID NOT NULL REFERENCES "shopify_billing_agreements"("id") ON DELETE RESTRICT,
  "billable_generation_id" UUID NOT NULL UNIQUE REFERENCES "billable_generations"("id") ON DELETE RESTRICT,
  "amount_cents" INTEGER NOT NULL CHECK ("amount_cents" > 0), "currency" CHAR(3) NOT NULL,
  "idempotency_key" CHAR(64) NOT NULL UNIQUE, "external_usage_record_id" VARCHAR(180),
  "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING', "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "shopify_usage_charges_agreement_id_status_created_at_idx" ON "shopify_usage_charges"("agreement_id", "status", "created_at");
CREATE TABLE "shopify_usage_reservations" (
  "id" UUID PRIMARY KEY, "agreement_id" UUID NOT NULL REFERENCES "shopify_billing_agreements"("id") ON DELETE RESTRICT,
  "request_digest" CHAR(64) NOT NULL UNIQUE, "amount_cents" INTEGER NOT NULL CHECK ("amount_cents" > 0),
  "period_end" TIMESTAMPTZ(3) NOT NULL, "state" VARCHAR(20) NOT NULL DEFAULT 'RESERVED',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "shopify_usage_reservations_agreement_id_period_end_state_idx" ON "shopify_usage_reservations"("agreement_id", "period_end", "state");
ALTER TABLE "kiosk_try_on_runs" ADD COLUMN "shopify_reservation_id" UUID UNIQUE REFERENCES "shopify_usage_reservations"("id") ON DELETE RESTRICT;
CREATE FUNCTION "selfx_require_shopify_reservation"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE reservation_state TEXT; reservation_end TIMESTAMPTZ;
BEGIN
  IF NEW."shopify_reservation_id" IS NOT NULL THEN
    SELECT "state", "period_end" INTO reservation_state, reservation_end FROM "shopify_usage_reservations" WHERE "id" = NEW."shopify_reservation_id" FOR UPDATE;
    IF reservation_state IS DISTINCT FROM 'RESERVED' OR reservation_end <= CURRENT_TIMESTAMP THEN
      RAISE EXCEPTION 'Shopify usage allowance is no longer reserved';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "selfx_require_shopify_reservation" BEFORE INSERT ON "kiosk_try_on_runs" FOR EACH ROW EXECUTE FUNCTION "selfx_require_shopify_reservation"();
