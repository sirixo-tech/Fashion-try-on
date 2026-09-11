CREATE TABLE "shopify_storefront_try_on_sessions" (
  "id" UUID NOT NULL,
  "token_hash" CHAR(64) NOT NULL,
  "try_on_session_id" UUID NOT NULL,
  "integration_id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "garment_asset_id" UUID NOT NULL,
  "shop_domain" VARCHAR(180) NOT NULL,
  "external_product_id" VARCHAR(180) NOT NULL,
  "product_handle" VARCHAR(220),
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "shopify_storefront_try_on_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "shopify_storefront_try_on_sessions_token_hash_key"
  ON "shopify_storefront_try_on_sessions"("token_hash");
CREATE UNIQUE INDEX "shopify_storefront_try_on_sessions_try_on_session_id_key"
  ON "shopify_storefront_try_on_sessions"("try_on_session_id");
CREATE INDEX "shopify_storefront_try_on_sessions_expires_at_idx"
  ON "shopify_storefront_try_on_sessions"("expires_at");
CREATE INDEX "shopify_storefront_try_on_sessions_organization_id_created_at_idx"
  ON "shopify_storefront_try_on_sessions"("organization_id", "created_at");
CREATE INDEX "shopify_storefront_try_on_sessions_integration_id_external_product_id_idx"
  ON "shopify_storefront_try_on_sessions"("integration_id", "external_product_id");
CREATE INDEX "shopify_storefront_try_on_sessions_product_id_idx"
  ON "shopify_storefront_try_on_sessions"("product_id");

ALTER TABLE "shopify_storefront_try_on_sessions"
  ADD CONSTRAINT "shopify_storefront_try_on_sessions_try_on_session_id_fkey"
  FOREIGN KEY ("try_on_session_id") REFERENCES "try_on_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shopify_storefront_try_on_sessions"
  ADD CONSTRAINT "shopify_storefront_try_on_sessions_integration_id_fkey"
  FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shopify_storefront_try_on_sessions"
  ADD CONSTRAINT "shopify_storefront_try_on_sessions_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "shopify_storefront_try_on_sessions"
  ADD CONSTRAINT "shopify_storefront_try_on_sessions_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "shopify_storefront_try_on_sessions"
  ADD CONSTRAINT "shopify_storefront_try_on_sessions_garment_asset_id_fkey"
  FOREIGN KEY ("garment_asset_id") REFERENCES "try_on_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
