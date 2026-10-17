ALTER TABLE "users" ADD COLUMN "credentials_version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "password_changed_at" TIMESTAMPTZ(3);
ALTER TABLE "user_sessions" ADD COLUMN "credentials_version" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE "password_reset_tokens" (
  "id" UUID NOT NULL PRIMARY KEY,
  "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "token_hash" CHAR(64) NOT NULL UNIQUE,
  "credentials_version" INTEGER NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "used_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");
CREATE INDEX "password_reset_tokens_expires_at_idx" ON "password_reset_tokens"("expires_at");
CREATE TABLE "mail_jobs" (
  "id" UUID NOT NULL PRIMARY KEY,
  "kind" VARCHAR(32) NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  "payload" JSONB,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "available_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lease_until" TIMESTAMPTZ(3),
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "failure_code" VARCHAR(80),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL
);
CREATE INDEX "mail_jobs_status_available_at_idx" ON "mail_jobs"("status", "available_at");
CREATE INDEX "mail_jobs_expires_at_idx" ON "mail_jobs"("expires_at");
CREATE TABLE "password_recovery_rate_buckets" (
  "key" CHAR(64) NOT NULL PRIMARY KEY,
  "count" INTEGER NOT NULL DEFAULT 1,
  "expires_at" TIMESTAMPTZ(3) NOT NULL
);
CREATE INDEX "password_recovery_rate_buckets_expires_at_idx" ON "password_recovery_rate_buckets"("expires_at");
