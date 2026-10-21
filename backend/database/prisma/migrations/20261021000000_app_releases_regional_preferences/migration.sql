ALTER TABLE users
  ADD COLUMN regional_timezone VARCHAR(64),
  ADD COLUMN regional_date_format VARCHAR(16) NOT NULL DEFAULT 'AUTO',
  ADD COLUMN regional_time_format VARCHAR(8) NOT NULL DEFAULT 'AUTO',
  ADD CONSTRAINT users_regional_date_format_check CHECK (regional_date_format IN ('AUTO','DMY','MDY','YMD')),
  ADD CONSTRAINT users_regional_time_format_check CHECK (regional_time_format IN ('AUTO','H12','H24'));

CREATE TYPE "AppReleaseStatus" AS ENUM ('DRAFT','PUBLISHED','RETIRED');
CREATE TABLE app_releases (
  id UUID PRIMARY KEY,
  package_name VARCHAR(160) NOT NULL,
  version_name VARCHAR(120) NOT NULL,
  version_code INTEGER NOT NULL CHECK (version_code > 0),
  architecture VARCHAR(32) NOT NULL CHECK (architecture IN ('ARM32','ARM64','X86_64','UNIVERSAL')),
  min_sdk INTEGER NOT NULL CHECK (min_sdk > 0),
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  sha256 CHAR(64) NOT NULL UNIQUE,
  signer_sha256 CHAR(64) NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  filename VARCHAR(200) NOT NULL,
  release_notes VARCHAR(4000) NOT NULL DEFAULT '',
  status "AppReleaseStatus" NOT NULL DEFAULT 'DRAFT',
  recommended BOOLEAN NOT NULL DEFAULT false,
  revision INTEGER NOT NULL DEFAULT 0,
  uploaded_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ(3),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL,
  UNIQUE(package_name,version_code,architecture),
  CHECK (NOT recommended OR status='PUBLISHED')
);
CREATE INDEX app_releases_status_created_at_id_idx ON app_releases(status,created_at,id);
CREATE UNIQUE INDEX app_releases_one_recommended_per_arch ON app_releases(architecture) WHERE recommended;
