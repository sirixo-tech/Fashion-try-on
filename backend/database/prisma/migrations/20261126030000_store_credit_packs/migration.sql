-- Existing commercial records keep their original terms. New purchases have an explicit kind.
ALTER TABLE shopify_billing_agreements ADD COLUMN purchase_kind VARCHAR(24) NOT NULL DEFAULT 'LEGACY_SUBSCRIPTION';
ALTER TABLE store_plan_purchases ADD COLUMN purchase_kind VARCHAR(24) NOT NULL DEFAULT 'LEGACY_PLAN';
ALTER TABLE shopify_billing_agreements ADD CONSTRAINT shopify_purchase_kind_check CHECK (purchase_kind IN ('LEGACY_SUBSCRIPTION','PAYG','CREDIT_PACK'));
ALTER TABLE store_plan_purchases ADD CONSTRAINT store_purchase_kind_check CHECK (purchase_kind IN ('LEGACY_PLAN','PAYG','CREDIT_PACK'));

CREATE TABLE store_credit_reservations (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  request_key CHAR(64) NOT NULL UNIQUE,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  channel "CreditLedgerChannel" NOT NULL,
  state VARCHAR(16) NOT NULL DEFAULT 'RESERVED' CHECK (state IN ('RESERVED','CONFIRMED','RELEASED')),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (organization_id,id)
);
CREATE INDEX store_credit_reservations_organization_id_state_idx ON store_credit_reservations(organization_id,state);
ALTER TABLE kiosk_try_on_runs ADD COLUMN credit_reservation_id UUID UNIQUE;
CREATE UNIQUE INDEX kiosk_try_on_runs_organization_id_credit_reservation_id_key ON kiosk_try_on_runs(organization_id,credit_reservation_id);
ALTER TABLE kiosk_try_on_runs ADD CONSTRAINT kiosk_try_on_runs_credit_reservation_fkey
  FOREIGN KEY (organization_id,credit_reservation_id) REFERENCES store_credit_reservations(organization_id,id) ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION selfx_check_credit_reservation() RETURNS TRIGGER AS $$
DECLARE reserved_state TEXT;
BEGIN
  IF NEW.credit_reservation_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.credit_reservation_id IS NOT DISTINCT FROM NEW.credit_reservation_id THEN
    IF NEW.status = 'FAILED' THEN
      UPDATE store_credit_reservations SET state = 'RELEASED' WHERE id = NEW.credit_reservation_id AND state = 'RESERVED';
    END IF;
    RETURN NEW;
  END IF;
  SELECT state INTO reserved_state FROM store_credit_reservations WHERE id = NEW.credit_reservation_id AND organization_id = NEW.organization_id FOR UPDATE;
  IF reserved_state IS DISTINCT FROM 'RESERVED' OR NEW.billing_cycle_id IS NOT NULL OR NEW.shopify_reservation_id IS NOT NULL THEN
    RAISE EXCEPTION 'Invalid or mixed Store credit reservation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER selfx_check_credit_reservation BEFORE INSERT OR UPDATE OF credit_reservation_id,status ON kiosk_try_on_runs
  FOR EACH ROW EXECUTE FUNCTION selfx_check_credit_reservation();

-- Preserve the ledger exactly: do not mint, expire or reconstruct any historic credits.
-- Native recurring charges are retired only through authenticated Shopify reconciliation,
-- never by marking a local database row cancelled and assuming collection has stopped.
UPDATE store_subscriptions s SET
  current_period_end = NULL,
  metadata_json = COALESCE(s.metadata_json,'{}'::jsonb) || jsonb_build_object('creditBillingVersion',2,'billingProvider','CREDIT_BALANCE','paygEnabled',false)
    || COALESCE((SELECT jsonb_build_object('creditPackTerms',a.pricing_snapshot->'planTerms') FROM shopify_billing_agreements a
         WHERE a.id::text = s.metadata_json->>'shopifyAgreementId' AND a.pricing_snapshot->'planTerms' IS NOT NULL), '{}'::jsonb)
    || COALESCE((SELECT jsonb_build_object('creditPackTerms',p.pricing_snapshot) FROM store_plan_purchases p
         WHERE p.id::text = s.metadata_json->>'phonepePurchaseId'), '{}'::jsonb)
FROM pricing_plans p WHERE s.pricing_plan_id = p.id AND p.billing_mode = 'CREDIT_LIMITED'
  AND s.status IN ('ACTIVE','TRIALING');
