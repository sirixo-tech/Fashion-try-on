CREATE TABLE "woocommerce_link_sessions" (
  "id" UUID NOT NULL,
  "token_hash" CHAR(64) NOT NULL,
  "redeem_secret_hash" CHAR(64) NOT NULL,
  "site_url" VARCHAR(500) NOT NULL,
  "admin_url" VARCHAR(500) NOT NULL,
  "organization_id" UUID,
  "approved_by_user_id" UUID,
  "integration_id" UUID,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "approved_at" TIMESTAMPTZ(3),
  "redeemed_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "woocommerce_link_sessions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "woocommerce_link_sessions_token_hash_key" ON "woocommerce_link_sessions"("token_hash");
CREATE INDEX "woocommerce_link_sessions_site_url_expires_at_idx" ON "woocommerce_link_sessions"("site_url", "expires_at");
CREATE INDEX "woocommerce_link_sessions_expires_at_redeemed_at_idx" ON "woocommerce_link_sessions"("expires_at", "redeemed_at");
CREATE INDEX "woocommerce_link_sessions_organization_id_created_at_idx" ON "woocommerce_link_sessions"("organization_id", "created_at");
ALTER TABLE "woocommerce_link_sessions" ADD CONSTRAINT "woocommerce_link_sessions_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "woocommerce_link_sessions" ADD CONSTRAINT "woocommerce_link_sessions_approved_by_user_id_fkey"
  FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "woocommerce_link_sessions" ADD CONSTRAINT "woocommerce_link_sessions_integration_id_fkey"
  FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
