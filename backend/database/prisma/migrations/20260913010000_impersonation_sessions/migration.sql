CREATE TYPE "ImpersonationSessionStatus" AS ENUM ('ACTIVE', 'ENDED', 'EXPIRED');

CREATE TABLE "impersonation_sessions" (
  "id" UUID NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "target_store_id" UUID NOT NULL,
  "status" "ImpersonationSessionStatus" NOT NULL DEFAULT 'ACTIVE',
  "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "ended_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "impersonation_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "impersonation_sessions_actor_user_id_idx" ON "impersonation_sessions"("actor_user_id");
CREATE INDEX "impersonation_sessions_target_store_id_idx" ON "impersonation_sessions"("target_store_id");
CREATE INDEX "impersonation_sessions_expires_at_idx" ON "impersonation_sessions"("expires_at");
CREATE INDEX "impersonation_sessions_status_expires_at_idx" ON "impersonation_sessions"("status", "expires_at");

ALTER TABLE "impersonation_sessions"
  ADD CONSTRAINT "impersonation_sessions_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "impersonation_sessions"
  ADD CONSTRAINT "impersonation_sessions_target_store_id_fkey"
  FOREIGN KEY ("target_store_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
