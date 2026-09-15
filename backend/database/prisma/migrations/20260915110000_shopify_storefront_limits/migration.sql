ALTER TABLE "shopify_storefront_try_on_sessions"
ADD COLUMN "visitor_token_hash" CHAR(64),
ADD COLUMN "visitor_try_on_limit" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "visitor_limit_period" VARCHAR(16) NOT NULL DEFAULT 'DAY',
ADD COLUMN "monthly_store_try_on_limit" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "shopify_storefront_try_on_sessions_org_visitor_created_idx"
ON "shopify_storefront_try_on_sessions"("organization_id", "visitor_token_hash", "created_at");
