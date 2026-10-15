CREATE TABLE payment_gateway_policies (
  provider VARCHAR(30) PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT false,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT payment_gateway_provider CHECK (provider IN ('PHONEPE','RAZORPAY','STRIPE','PAYTM','PAYPAL'))
);

CREATE TABLE store_payment_connections (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  provider VARCHAR(30) NOT NULL,
  environment VARCHAR(20) NOT NULL CHECK (environment IN ('UNCONFIRMED','UAT','PRODUCTION')),
  encrypted_payload TEXT NOT NULL,
  initialization_vector VARCHAR(32) NOT NULL,
  authentication_tag VARCHAR(32) NOT NULL,
  key_version VARCHAR(40) NOT NULL,
  updated_at TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT store_payment_connections_organization_id_provider_key UNIQUE (organization_id, provider),
  CONSTRAINT store_connection_provider CHECK (provider IN ('PHONEPE','RAZORPAY','STRIPE','PAYTM','PAYPAL'))
);

CREATE TABLE store_payment_settings (
  organization_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE RESTRICT,
  selected_provider VARCHAR(30),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT store_payment_selection_same_tenant FOREIGN KEY (organization_id, selected_provider)
    REFERENCES store_payment_connections(organization_id, provider) ON DELETE RESTRICT
);
