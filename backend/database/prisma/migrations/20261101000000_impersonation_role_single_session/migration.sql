ALTER TABLE "impersonation_sessions"
  ADD COLUMN "effective_role_code" VARCHAR(80) NOT NULL DEFAULT 'store-admin';

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY actor_user_id ORDER BY started_at DESC, id DESC
  ) AS position
  FROM "impersonation_sessions"
  WHERE status = 'ACTIVE' AND ended_at IS NULL AND actor_user_id IS NOT NULL
)
UPDATE "impersonation_sessions" AS session
SET status = 'ENDED', ended_at = NOW()
FROM ranked
WHERE session.id = ranked.id AND ranked.position > 1;

CREATE UNIQUE INDEX "impersonation_sessions_one_active_actor"
  ON "impersonation_sessions" ("actor_user_id")
  WHERE status = 'ACTIVE' AND ended_at IS NULL AND actor_user_id IS NOT NULL;
