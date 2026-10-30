ALTER TABLE "mobile_plans"
ADD COLUMN "description_translations" JSONB NOT NULL DEFAULT '{}'::jsonb;
