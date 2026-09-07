CREATE TABLE "integration_provider_credentials" (
  "id" UUID NOT NULL,
  "integration_id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "provider" "IntegrationType" NOT NULL,
  "encrypted_payload" TEXT NOT NULL,
  "initialization_vector" VARCHAR(64) NOT NULL,
  "authentication_tag" VARCHAR(64) NOT NULL,
  "key_version" VARCHAR(40) NOT NULL DEFAULT 'v1',
  "scopes_json" JSONB NOT NULL,
  "access_token_expires_at" TIMESTAMPTZ(3),
  "refresh_token_expires_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "integration_provider_credentials_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "integration_oauth_states" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "provider" "IntegrationType" NOT NULL,
  "shop_domain" VARCHAR(180) NOT NULL,
  "state_hash" CHAR(64) NOT NULL,
  "created_by_user_id" UUID NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "consumed_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "integration_oauth_states_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "integration_provider_credentials_integration_id_key"
  ON "integration_provider_credentials"("integration_id");
CREATE INDEX "integration_provider_credentials_organization_id_provider_idx"
  ON "integration_provider_credentials"("organization_id", "provider");
CREATE INDEX "integration_provider_credentials_access_token_expires_at_idx"
  ON "integration_provider_credentials"("access_token_expires_at");
CREATE UNIQUE INDEX "integration_oauth_states_state_hash_key"
  ON "integration_oauth_states"("state_hash");
CREATE INDEX "integration_oauth_states_organization_id_provider_expires_at_idx"
  ON "integration_oauth_states"("organization_id", "provider", "expires_at");
CREATE INDEX "integration_oauth_states_expires_at_consumed_at_idx"
  ON "integration_oauth_states"("expires_at", "consumed_at");

ALTER TABLE "integration_provider_credentials"
  ADD CONSTRAINT "integration_provider_credentials_integration_id_fkey"
  FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "integration_provider_credentials"
  ADD CONSTRAINT "integration_provider_credentials_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "integration_oauth_states"
  ADD CONSTRAINT "integration_oauth_states_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "integration_oauth_states"
  ADD CONSTRAINT "integration_oauth_states_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
