-- Persistent profile photos are separate from time-limited Try-On inputs.
-- Existing time-limited uploads keep the retention recorded at consent.
ALTER TABLE "customer_profile_photos" ALTER COLUMN "expires_at" DROP NOT NULL;
