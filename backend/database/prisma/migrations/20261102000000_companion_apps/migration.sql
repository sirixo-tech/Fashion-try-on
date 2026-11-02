CREATE TABLE companion_apps (
  id UUID PRIMARY KEY,
  slug VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  description VARCHAR(500) NOT NULL DEFAULT '',
  package_name VARCHAR(160) NOT NULL UNIQUE,
  signer_sha256 CHAR(64) NOT NULL,
  created_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL
);

CREATE INDEX companion_apps_created_at_id_idx
  ON companion_apps(created_at, id);

ALTER TABLE app_releases
  ADD COLUMN custom_app_id UUID REFERENCES companion_apps(id) ON DELETE RESTRICT;

CREATE INDEX app_releases_custom_app_id_created_at_id_idx
  ON app_releases(custom_app_id, created_at, id);
