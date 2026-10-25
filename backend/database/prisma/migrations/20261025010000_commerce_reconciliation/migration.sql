ALTER TABLE "integrations"
ADD COLUMN "catalog_sync_checkpoint" JSONB,
ADD COLUMN "catalog_sync_lease_token" VARCHAR(43),
ADD COLUMN "catalog_sync_lease_until" TIMESTAMPTZ(3),
ADD COLUMN "catalog_next_sync_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "catalog_sync_attempts" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "integrations_type_status_catalog_next_sync_at_idx" ON "integrations"("type", "status", "catalog_next_sync_at");
UPDATE "integrations" SET "metadata_json" = COALESCE("metadata_json", '{}'::jsonb) || '{"connectionMode":"SHOPIFY_OAUTH"}'::jsonb WHERE "type" = 'SHOPIFY' AND "metadata_json"->>'connectionMode' IS NULL;
