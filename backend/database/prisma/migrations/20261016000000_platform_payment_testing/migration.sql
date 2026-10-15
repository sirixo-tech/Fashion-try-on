CREATE TABLE platform_payment_test_connections (
  provider VARCHAR(30) PRIMARY KEY CHECK (provider = 'PHONEPE'),
  environment VARCHAR(20) NOT NULL CHECK (environment = 'UAT'),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  encrypted_payload TEXT NOT NULL, initialization_vector VARCHAR(32) NOT NULL,
  authentication_tag VARCHAR(32) NOT NULL, key_version VARCHAR(40) NOT NULL,
  dqr_access_confirmed BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ(3) NOT NULL
);
CREATE TABLE platform_payment_tests (
  id UUID PRIMARY KEY, provider VARCHAR(30) NOT NULL CHECK (provider = 'PHONEPE'),
  environment VARCHAR(20) NOT NULL CHECK (environment = 'UAT'),
  connection_version INTEGER NOT NULL CHECK (connection_version > 0),
  created_by_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  transaction_id VARCHAR(34) NOT NULL UNIQUE, key_digest CHAR(64) NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('PREPARING','PENDING','UNKNOWN','FAILED','SUCCEEDED')),
  amount_minor INTEGER NOT NULL CHECK (amount_minor = 100), currency VARCHAR(3) NOT NULL CHECK (currency = 'INR'),
  encrypted_payload TEXT NOT NULL, initialization_vector VARCHAR(32) NOT NULL,
  authentication_tag VARCHAR(32) NOT NULL, key_version VARCHAR(40) NOT NULL,
  qr_string TEXT, provider_reference VARCHAR(128), failure_code VARCHAR(60),
  expires_at TIMESTAMPTZ(3) NOT NULL, confirmed_at TIMESTAMPTZ(3), checked_at TIMESTAMPTZ(3),
  next_check_at TIMESTAMPTZ(3), lease_until TIMESTAMPTZ(3),
  check_count INTEGER NOT NULL DEFAULT 0 CHECK (check_count >= 0),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ(3) NOT NULL,
  UNIQUE (provider,created_by_id,key_digest),
  CHECK ((confirmed_at IS NOT NULL) = (status = 'SUCCEEDED'))
);
CREATE INDEX platform_payment_tests_provider_created_at_id_idx ON platform_payment_tests(provider,created_at,id);
CREATE INDEX platform_payment_tests_status_next_check_at_idx ON platform_payment_tests(status,next_check_at);
CREATE UNIQUE INDEX platform_payment_test_one_unresolved ON platform_payment_tests(provider,connection_version) WHERE status IN ('PREPARING','PENDING','UNKNOWN');
CREATE TABLE platform_payment_test_events (
  id UUID PRIMARY KEY, test_id UUID NOT NULL REFERENCES platform_payment_tests(id) ON DELETE RESTRICT,
  digest CHAR(64) NOT NULL, reported_status VARCHAR(20) NOT NULL CHECK (reported_status IN ('SUCCEEDED','FAILED','PENDING','UNKNOWN')),
  received_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (test_id,digest)
);
