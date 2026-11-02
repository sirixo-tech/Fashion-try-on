CREATE TYPE app_release_upload_status AS ENUM (
  'AWAITING_UPLOAD',
  'QUEUED',
  'PROCESSING',
  'COMPLETED',
  'FAILED'
);

CREATE TABLE app_release_uploads (
  id UUID PRIMARY KEY,
  created_by_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  app VARCHAR(16) NOT NULL CHECK (app IN ('KIOSK', 'CUSTOMER', 'CUSTOM')),
  companion_app_id UUID REFERENCES companion_apps(id) ON DELETE RESTRICT,
  app_name VARCHAR(120),
  app_description VARCHAR(500) NOT NULL DEFAULT '',
  filename VARCHAR(255) NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 209715200),
  release_notes VARCHAR(4000) NOT NULL DEFAULT '',
  object_key TEXT NOT NULL UNIQUE,
  status app_release_upload_status NOT NULL DEFAULT 'AWAITING_UPLOAD',
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lease_until TIMESTAMPTZ(3),
  expires_at TIMESTAMPTZ(3) NOT NULL,
  failure_code VARCHAR(80),
  release_id UUID REFERENCES app_releases(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    (app = 'CUSTOM' AND (companion_app_id IS NOT NULL OR app_name IS NOT NULL))
    OR (app <> 'CUSTOM' AND companion_app_id IS NULL AND app_name IS NULL)
  )
);

CREATE INDEX app_release_uploads_status_lease_created_idx
  ON app_release_uploads(status, available_at, lease_until, created_at);
CREATE INDEX app_release_uploads_created_by_status_created_idx
  ON app_release_uploads(created_by_id, status, created_at);


