BEGIN;
ALTER TABLE users ADD COLUMN deleted_at TIMESTAMPTZ(3);
CREATE TABLE deleted_store_objects (storage_key VARCHAR(512) PRIMARY KEY, attempts INTEGER NOT NULL DEFAULT 0, available_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
ALTER TABLE users ADD CONSTRAINT users_deleted_disabled CHECK (deleted_at IS NULL OR status = 'DISABLED');
ALTER TABLE organization_memberships ADD COLUMN deleted_at TIMESTAMPTZ(3);
ALTER TABLE organization_memberships ADD CONSTRAINT memberships_deleted_revoked CHECK (deleted_at IS NULL OR status = 'REVOKED');
ALTER TABLE audit_logs ADD COLUMN actor_snapshot JSONB;

ALTER TABLE impersonation_sessions ADD COLUMN actor_snapshot JSONB;
ALTER TABLE impersonation_sessions ALTER COLUMN actor_user_id DROP NOT NULL;
ALTER TABLE impersonation_sessions DROP CONSTRAINT impersonation_sessions_actor_user_id_fkey;
ALTER TABLE impersonation_sessions ADD CONSTRAINT impersonation_sessions_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE organization_applications ADD COLUMN submitted_by_snapshot JSONB;
ALTER TABLE organization_applications ALTER COLUMN submitted_by_user_id DROP NOT NULL;
ALTER TABLE organization_applications DROP CONSTRAINT organization_applications_submitted_by_user_id_fkey;
ALTER TABLE organization_applications ADD CONSTRAINT organization_applications_submitted_by_user_id_fkey FOREIGN KEY (submitted_by_user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE platform_payment_tests ADD COLUMN created_by_snapshot JSONB;
ALTER TABLE platform_payment_tests ALTER COLUMN created_by_id DROP NOT NULL;
ALTER TABLE platform_payment_tests DROP CONSTRAINT platform_payment_tests_created_by_id_fkey;
ALTER TABLE platform_payment_tests ADD CONSTRAINT platform_payment_tests_created_by_id_fkey FOREIGN KEY (created_by_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE integration_credentials ADD COLUMN created_by_snapshot JSONB;
ALTER TABLE integration_credentials ALTER COLUMN created_by_user_id DROP NOT NULL;
ALTER TABLE integration_credentials DROP CONSTRAINT integration_credentials_created_by_user_id_fkey;
ALTER TABLE integration_credentials ADD CONSTRAINT integration_credentials_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE api_keys ADD COLUMN created_by_snapshot JSONB;
ALTER TABLE api_keys ALTER COLUMN created_by_user_id DROP NOT NULL;
ALTER TABLE api_keys DROP CONSTRAINT api_keys_created_by_user_id_fkey;
ALTER TABLE api_keys ADD CONSTRAINT api_keys_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE;
COMMIT;
