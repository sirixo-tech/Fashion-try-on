-- Existing Shopify launches must bind on SelfX before accepting photos/runs.
ALTER TABLE "shopify_storefront_try_on_sessions"
ADD COLUMN "visitor_bound_at" TIMESTAMPTZ(3);
