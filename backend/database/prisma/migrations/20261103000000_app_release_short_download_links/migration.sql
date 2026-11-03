ALTER TABLE app_releases
  ADD COLUMN download_token VARCHAR(16),
  ADD COLUMN download_token_expires_at TIMESTAMPTZ(3);

CREATE UNIQUE INDEX app_releases_download_token_key
  ON app_releases(download_token);
