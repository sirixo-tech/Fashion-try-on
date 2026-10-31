ALTER TABLE "impersonation_sessions"
  ADD COLUMN "actor_user_session_id" UUID;

ALTER TABLE "impersonation_sessions"
  ADD CONSTRAINT "impersonation_sessions_actor_user_session_id_fkey"
  FOREIGN KEY ("actor_user_session_id") REFERENCES "user_sessions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "impersonation_sessions_actor_user_session_id_idx"
  ON "impersonation_sessions"("actor_user_session_id");

-- Existing impersonations were time-limited and are not bound to an auth
-- session. Close them during rollout so the new session checks fail closed.
UPDATE "impersonation_sessions"
SET status = 'EXPIRED'
WHERE status = 'ACTIVE' AND ended_at IS NULL;
