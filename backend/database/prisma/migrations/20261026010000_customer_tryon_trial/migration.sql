-- AlterEnum
ALTER TYPE "CreditLedgerChannel" ADD VALUE 'MOBILE';

-- AlterTable
ALTER TABLE "kiosk_try_on_runs" ADD COLUMN     "customer_credit_state" VARCHAR(20),
ADD COLUMN     "customer_id" UUID,
ADD COLUMN     "customer_request_fingerprint" CHAR(64);

-- AlterTable
ALTER TABLE "try_on_sessions" ADD COLUMN     "customer_consent_id" UUID,
ADD COLUMN     "customer_id" UUID,
ADD COLUMN     "customer_store_visit_id" UUID;

-- AlterTable
ALTER TABLE "try_on_assets" ADD COLUMN     "ready_at" TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "storage_deleted_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "customer_credit_accounts" (
    "customer_id" UUID NOT NULL,
    "trial_credits" INTEGER NOT NULL,
    "used_credits" INTEGER NOT NULL DEFAULT 0,
    "reserved_credits" INTEGER NOT NULL DEFAULT 0,
    "trial_granted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trial_plan_code" VARCHAR(80) NOT NULL,

    CONSTRAINT "customer_credit_accounts_pkey" PRIMARY KEY ("customer_id")
);

-- CreateTable
CREATE TABLE "customer_photo_consents" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "store_visit_id" UUID,
    "sponsoring_store_id" UUID,
    "version" VARCHAR(40) NOT NULL,
    "statement" TEXT NOT NULL,
    "input_retention_days" INTEGER NOT NULL DEFAULT 7,
    "result_retention_days" INTEGER NOT NULL DEFAULT 30,
    "merchant_result_access" BOOLEAN NOT NULL DEFAULT false,
    "accepted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawn_at" TIMESTAMPTZ(3),

    CONSTRAINT "customer_photo_consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_store_qrs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "label" VARCHAR(100) NOT NULL,
    "daily_customer_limit" INTEGER NOT NULL DEFAULT 5,
    "created_by_user_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "revoked_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_store_qrs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_store_visits" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "qr_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "ended_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_store_visits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customer_photo_consents_customer_id_accepted_at_idx" ON "customer_photo_consents"("customer_id", "accepted_at");

-- CreateIndex
CREATE UNIQUE INDEX "customer_photo_consents_customer_id_id_key" ON "customer_photo_consents"("customer_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_store_qrs_token_hash_key" ON "customer_store_qrs"("token_hash");

-- CreateIndex
CREATE INDEX "customer_store_qrs_organization_id_created_at_idx" ON "customer_store_qrs"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "customer_store_visits_customer_id_created_at_idx" ON "customer_store_visits"("customer_id", "created_at");

-- CreateIndex
CREATE INDEX "customer_store_visits_qr_id_idx" ON "customer_store_visits"("qr_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_store_visits_customer_id_id_key" ON "customer_store_visits"("customer_id", "id");

-- CreateIndex
CREATE INDEX "kiosk_try_on_runs_customer_id_created_at_idx" ON "kiosk_try_on_runs"("customer_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "kiosk_try_on_runs_customer_id_client_request_id_key" ON "kiosk_try_on_runs"("customer_id", "client_request_id");

-- CreateIndex
CREATE UNIQUE INDEX "try_on_sessions_customer_consent_id_key" ON "try_on_sessions"("customer_consent_id");

-- CreateIndex
CREATE INDEX "try_on_sessions_customer_id_created_at_idx" ON "try_on_sessions"("customer_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "try_on_sessions_customer_id_id_key" ON "try_on_sessions"("customer_id", "id");

-- AddForeignKey
ALTER TABLE "kiosk_try_on_runs" ADD CONSTRAINT "kiosk_try_on_runs_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "try_on_sessions" ADD CONSTRAINT "try_on_sessions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "try_on_sessions" ADD CONSTRAINT "try_on_sessions_customer_consent_id_fkey" FOREIGN KEY ("customer_consent_id") REFERENCES "customer_photo_consents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "try_on_sessions" ADD CONSTRAINT "try_on_sessions_customer_store_visit_id_fkey" FOREIGN KEY ("customer_store_visit_id") REFERENCES "customer_store_visits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_credit_accounts" ADD CONSTRAINT "customer_credit_accounts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_photo_consents" ADD CONSTRAINT "customer_photo_consents_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_photo_consents" ADD CONSTRAINT "customer_photo_consents_store_visit_id_fkey" FOREIGN KEY ("store_visit_id") REFERENCES "customer_store_visits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_store_qrs" ADD CONSTRAINT "customer_store_qrs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_store_visits" ADD CONSTRAINT "customer_store_visits_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_store_visits" ADD CONSTRAINT "customer_store_visits_qr_id_fkey" FOREIGN KEY ("qr_id") REFERENCES "customer_store_qrs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Customer ownership is enforced in the database as well as in API queries.
ALTER TABLE "try_on_sessions" ADD CONSTRAINT "customer_session_consent_owner_fkey"
  FOREIGN KEY ("customer_id", "customer_consent_id") REFERENCES "customer_photo_consents" ("customer_id", "id") ON DELETE RESTRICT;
ALTER TABLE "try_on_sessions" ADD CONSTRAINT "customer_session_visit_owner_fkey"
  FOREIGN KEY ("customer_id", "customer_store_visit_id") REFERENCES "customer_store_visits" ("customer_id", "id") ON DELETE RESTRICT;
ALTER TABLE "customer_photo_consents" ADD CONSTRAINT "customer_consent_visit_owner_fkey"
  FOREIGN KEY ("customer_id", "store_visit_id") REFERENCES "customer_store_visits" ("customer_id", "id") ON DELETE RESTRICT;
ALTER TABLE "kiosk_try_on_runs" ADD CONSTRAINT "customer_run_session_owner_fkey"
  FOREIGN KEY ("customer_id", "try_on_session_id") REFERENCES "try_on_sessions" ("customer_id", "id") ON DELETE RESTRICT;
ALTER TABLE "customer_credit_accounts" ADD CONSTRAINT "customer_credit_account_balance_check"
  CHECK ("trial_credits" >= 0 AND "used_credits" >= 0 AND "reserved_credits" >= 0 AND "used_credits" + "reserved_credits" <= "trial_credits");
ALTER TABLE "try_on_sessions" ADD CONSTRAINT "customer_session_consent_check"
  CHECK ("customer_id" IS NULL OR ("customer_consent_id" IS NOT NULL AND "kiosk_device_id" IS NULL));
ALTER TABLE "kiosk_try_on_runs" ADD CONSTRAINT "customer_run_identity_check"
  CHECK ("customer_id" IS NULL OR ("try_on_session_id" IS NOT NULL AND "customer_request_fingerprint" IS NOT NULL AND "billing_channel"::text = 'MOBILE' AND "kiosk_device_id" IS NULL AND "api_key_id" IS NULL));
ALTER TABLE "customer_photo_consents" ADD CONSTRAINT "customer_photo_consent_policy_check"
  CHECK ("input_retention_days" = 7 AND "result_retention_days" = 30 AND "merchant_result_access" = ("sponsoring_store_id" IS NOT NULL) AND ("store_visit_id" IS NULL OR "sponsoring_store_id" IS NOT NULL));
ALTER TABLE "customer_store_qrs" ADD CONSTRAINT "customer_store_qr_limit_check"
  CHECK ("daily_customer_limit" BETWEEN 1 AND 100 AND "expires_at" > "created_at");

-- Mobile here means Store-sponsored QR usage, not a personal paid mobile plan.
UPDATE "pricing_plans" SET "channels_json" = "channels_json" || '["MOBILE"]'::jsonb
  WHERE "code" = 'selfx-default-starter' AND jsonb_typeof("channels_json") = 'array' AND NOT ("channels_json" @> '["MOBILE"]'::jsonb);
UPDATE "store_subscriptions" SET "channels_json" = "channels_json" || '["MOBILE"]'::jsonb
  WHERE "status" = 'TRIALING' AND "pricing_plan_id" IN (SELECT "id" FROM "pricing_plans" WHERE "code" = 'selfx-default-starter')
  AND jsonb_typeof("channels_json") = 'array' AND NOT ("channels_json" @> '["MOBILE"]'::jsonb);
