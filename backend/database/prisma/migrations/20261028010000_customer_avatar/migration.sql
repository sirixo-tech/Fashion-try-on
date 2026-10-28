ALTER TABLE "customers"
  ADD COLUMN "interests" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "avatar_setup_completed_at" TIMESTAMPTZ(3);
ALTER TABLE "customers" ADD CONSTRAINT "customers_interests_check"
  CHECK ("interests" <@ ARRAY['MEN', 'WOMEN', 'JEWELLERY']::TEXT[]);
ALTER TABLE "customer_profile_photos" ADD COLUMN "kind" VARCHAR(16) NOT NULL DEFAULT 'PROFILE';
ALTER TABLE "customer_profile_photos" ADD CONSTRAINT "customer_profile_photos_kind_check"
  CHECK ("kind" IN ('PROFILE', 'SELFIE', 'FULL_BODY'));
CREATE INDEX "customer_profile_photos_customer_id_kind_created_at_idx"
  ON "customer_profile_photos"("customer_id", "kind", "created_at");
