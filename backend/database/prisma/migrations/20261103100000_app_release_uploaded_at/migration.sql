ALTER TABLE app_releases
  ADD COLUMN uploaded_at TIMESTAMPTZ(3);

UPDATE app_releases
SET uploaded_at = created_at
WHERE uploaded_at IS NULL;

ALTER TABLE app_releases
  ALTER COLUMN uploaded_at SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN uploaded_at SET NOT NULL;
