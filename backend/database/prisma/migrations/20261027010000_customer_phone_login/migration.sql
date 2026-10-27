ALTER TYPE "CustomerIdentityProvider" ADD VALUE 'FIREBASE_PHONE';
ALTER TYPE "CustomerActionPurpose" ADD VALUE 'EMAIL_LOGIN';
ALTER TABLE "customers" ADD COLUMN "phone_number" VARCHAR(16),
  ADD COLUMN "pending_phone_number" VARCHAR(16),
  ADD COLUMN "phone_verified_at" TIMESTAMPTZ(3);
CREATE UNIQUE INDEX "customers_phone_number_key" ON "customers"("phone_number");
ALTER TABLE "customer_sessions" ADD COLUMN "authenticated_at" TIMESTAMPTZ(3);
-- Historical refresh sessions do not prove a recent original sign-in.
-- Require fresh authentication for linking while keeping those sessions usable.
UPDATE "customer_sessions" SET "authenticated_at" = LEAST("created_at", CURRENT_TIMESTAMP - INTERVAL '11 minutes');
ALTER TABLE "customer_sessions" ALTER COLUMN "authenticated_at" SET NOT NULL,
  ALTER COLUMN "authenticated_at" SET DEFAULT CURRENT_TIMESTAMP;
-- Request a fresh six-digit code after upgrading rather than accepting old codes.
UPDATE "customer_action_tokens" SET "used_at" = CURRENT_TIMESTAMP
 WHERE "purpose" IN ('VERIFY_EMAIL', 'RESET_PASSWORD') AND "used_at" IS NULL;
