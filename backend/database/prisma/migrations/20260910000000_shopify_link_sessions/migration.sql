DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "integrations"
    WHERE "external_account_id" IS NOT NULL
    GROUP BY "type", "external_account_id"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce one Store per external account: duplicate integration links exist';
  END IF;
END $$;

CREATE UNIQUE INDEX "integrations_type_external_account_id_key"
  ON "integrations"("type", "external_account_id");

CREATE TABLE "shopify_link_sessions" (
  "id" UUID NOT NULL,
  "token_hash" CHAR(64) NOT NULL,
  "shop_domain" VARCHAR(180) NOT NULL,
  "external_account_id" VARCHAR(180) NOT NULL,
  "external_account_name" VARCHAR(240),
  "organization_id" UUID,
  "approved_by_user_id" UUID,
  "integration_id" UUID,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "approved_at" TIMESTAMPTZ(3),
  "redeemed_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "shopify_link_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "shopify_link_sessions_token_hash_key"
  ON "shopify_link_sessions"("token_hash");
CREATE INDEX "shopify_link_sessions_shop_domain_expires_at_idx"
  ON "shopify_link_sessions"("shop_domain", "expires_at");
CREATE INDEX "shopify_link_sessions_expires_at_redeemed_at_idx"
  ON "shopify_link_sessions"("expires_at", "redeemed_at");
CREATE INDEX "shopify_link_sessions_organization_id_created_at_idx"
  ON "shopify_link_sessions"("organization_id", "created_at");

ALTER TABLE "shopify_link_sessions"
  ADD CONSTRAINT "shopify_link_sessions_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "shopify_link_sessions"
  ADD CONSTRAINT "shopify_link_sessions_approved_by_user_id_fkey"
  FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "shopify_link_sessions"
  ADD CONSTRAINT "shopify_link_sessions_integration_id_fkey"
  FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
