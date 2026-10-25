-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'DELETED');

-- CreateEnum
CREATE TYPE "CustomerIdentityProvider" AS ENUM ('EMAIL_PASSWORD', 'GOOGLE', 'APPLE');

-- CreateEnum
CREATE TYPE "CustomerActionPurpose" AS ENUM ('VERIFY_EMAIL', 'RESET_PASSWORD', 'APPLE_NONCE');

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "email" VARCHAR(320),
    "display_name" VARCHAR(160) NOT NULL,
    "status" "CustomerStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "security_version" INTEGER NOT NULL DEFAULT 0,
    "verification_proof_hash" CHAR(64),
    "terms_version" VARCHAR(40) NOT NULL,
    "terms_accepted_at" TIMESTAMPTZ(3) NOT NULL,
    "language" VARCHAR(12) NOT NULL DEFAULT 'en',
    "notifications" BOOLEAN NOT NULL DEFAULT false,
    "last_active_at" TIMESTAMPTZ(3),
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_identities" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "provider" "CustomerIdentityProvider" NOT NULL,
    "provider_subject" VARCHAR(320) NOT NULL,
    "email" VARCHAR(320),
    "password_hash" TEXT,
    "verified_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "customer_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_sessions" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "last_used_at" TIMESTAMPTZ(3),
    "device_name" VARCHAR(100),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_action_tokens" (
    "id" UUID NOT NULL,
    "customer_id" UUID,
    "purpose" "CustomerActionPurpose" NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "security_version" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_action_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customers_email_key" ON "customers"("email");

-- CreateIndex
CREATE INDEX "customer_identities_customer_id_idx" ON "customer_identities"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_identities_provider_provider_subject_key" ON "customer_identities"("provider", "provider_subject");

-- CreateIndex
CREATE UNIQUE INDEX "customer_identities_customer_id_provider_key" ON "customer_identities"("customer_id", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "customer_sessions_token_hash_key" ON "customer_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "customer_sessions_customer_id_revoked_at_idx" ON "customer_sessions"("customer_id", "revoked_at");

-- CreateIndex
CREATE INDEX "customer_sessions_family_id_idx" ON "customer_sessions"("family_id");

-- CreateIndex
CREATE INDEX "customer_sessions_expires_at_idx" ON "customer_sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "customer_action_tokens_token_hash_key" ON "customer_action_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "customer_action_tokens_customer_id_purpose_idx" ON "customer_action_tokens"("customer_id", "purpose");

-- CreateIndex
CREATE INDEX "customer_action_tokens_expires_at_idx" ON "customer_action_tokens"("expires_at");

-- AddForeignKey
ALTER TABLE "customer_identities" ADD CONSTRAINT "customer_identities_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_sessions" ADD CONSTRAINT "customer_sessions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_action_tokens" ADD CONSTRAINT "customer_action_tokens_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
