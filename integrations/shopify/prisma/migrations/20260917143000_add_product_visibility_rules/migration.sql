ALTER TABLE "SelfxConnection"
ADD COLUMN "productVisibilityRules" JSONB NOT NULL DEFAULT '{}'::jsonb;
