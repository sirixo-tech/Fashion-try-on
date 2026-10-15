ALTER TABLE store_payment_connections ADD COLUMN dqr_access_confirmed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE shopping_orders ADD COLUMN paid_at TIMESTAMPTZ(3), ADD COLUMN stock_allocated_at TIMESTAMPTZ(3), ADD COLUMN payment_review_reason VARCHAR(50);
ALTER TABLE shopping_orders DROP CONSTRAINT shopping_order_status_check;
ALTER TABLE shopping_orders ADD CONSTRAINT shopping_order_status_check CHECK (status IN ('AWAITING_PAYMENT','PAYMENT_PENDING','PAID','PAID_REVIEW','CANCELLED','EXPIRED')),
  ADD CONSTRAINT shopping_order_paid_check CHECK ((paid_at IS NOT NULL) = (status IN ('PAID','PAID_REVIEW'))),
  ADD CONSTRAINT shopping_order_allocation_check CHECK (stock_allocated_at IS NULL OR paid_at IS NOT NULL);
DROP INDEX shopping_order_one_pending_per_cart;
CREATE UNIQUE INDEX shopping_order_one_pending_per_cart ON shopping_orders(source_cart_id) WHERE status IN ('AWAITING_PAYMENT','PAYMENT_PENDING');
CREATE TABLE shopping_payment_attempts (
  id UUID PRIMARY KEY, organization_id UUID NOT NULL, order_id UUID NOT NULL,
  provider VARCHAR(30) NOT NULL CHECK (provider = 'PHONEPE'),
  environment VARCHAR(20) NOT NULL CHECK (environment = 'UAT'),
  transaction_id VARCHAR(34) NOT NULL UNIQUE, key_digest CHAR(64) NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('PREPARING','PENDING','UNKNOWN','FAILED','SUCCEEDED')),
  amount_minor INTEGER NOT NULL CHECK (amount_minor BETWEEN 1 AND 2000000000), currency VARCHAR(3) NOT NULL CHECK (currency = 'INR'),
  encrypted_payload TEXT NOT NULL, initialization_vector VARCHAR(32) NOT NULL, authentication_tag VARCHAR(32) NOT NULL, key_version VARCHAR(40) NOT NULL,
  connection_id UUID NOT NULL, qr_string TEXT, provider_reference VARCHAR(128), failure_code VARCHAR(60),
  expires_at TIMESTAMPTZ(3) NOT NULL, paid_at TIMESTAMPTZ(3), next_check_at TIMESTAMPTZ(3), lease_until TIMESTAMPTZ(3), check_count INTEGER NOT NULL DEFAULT 0 CHECK (check_count >= 0),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ(3) NOT NULL,
  UNIQUE (organization_id, id), UNIQUE (order_id, key_digest),
  FOREIGN KEY (organization_id, order_id) REFERENCES shopping_orders(organization_id,id) ON DELETE RESTRICT,
  CHECK ((paid_at IS NOT NULL) = (status = 'SUCCEEDED'))
);
CREATE INDEX shopping_payment_attempts_status_next_check_at_idx ON shopping_payment_attempts(status,next_check_at);
CREATE UNIQUE INDEX shopping_payment_one_unresolved_per_order ON shopping_payment_attempts(order_id) WHERE status IN ('PREPARING','PENDING','UNKNOWN');
CREATE TABLE shopping_payment_events (
  id UUID PRIMARY KEY, organization_id UUID NOT NULL, attempt_id UUID NOT NULL, digest CHAR(64) NOT NULL,
  reported_status VARCHAR(20) NOT NULL CHECK (reported_status IN ('SUCCEEDED','FAILED','PENDING','UNKNOWN')),
  received_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (attempt_id,digest),
  FOREIGN KEY (organization_id,attempt_id) REFERENCES shopping_payment_attempts(organization_id,id) ON DELETE RESTRICT
);
