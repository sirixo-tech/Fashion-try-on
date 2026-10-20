ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

CREATE TABLE user_external_identities (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider varchar(32) NOT NULL CHECK (provider = 'GOOGLE'),
  subject varchar(255) NOT NULL,
  email_at_link varchar(320) NOT NULL,
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT user_external_identities_provider_subject_key UNIQUE (provider, subject),
  CONSTRAINT user_external_identities_user_id_provider_key UNIQUE (user_id, provider)
);
CREATE TABLE user_oauth_requests (
  id uuid PRIMARY KEY,
  state_hash char(64) NOT NULL UNIQUE,
  browser_hash char(64) NOT NULL,
  nonce varchar(64) NOT NULL,
  code_verifier varchar(128) NOT NULL,
  mode varchar(16) NOT NULL CHECK (mode IN ('login', 'signup')),
  return_path varchar(2048) NOT NULL,
  expires_at timestamptz(3) NOT NULL,
  consumed_at timestamptz(3),
  link_user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  link_subject varchar(255),
  link_email varchar(320),
  link_credentials_version integer,
  linked_at timestamptz(3),
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX user_oauth_requests_expires_at_idx ON user_oauth_requests(expires_at);
CREATE INDEX user_oauth_requests_link_user_id_idx ON user_oauth_requests(link_user_id);
