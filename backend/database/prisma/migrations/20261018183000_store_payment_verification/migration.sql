-- Share durable probes, with a database-enforced Store/platform boundary.
ALTER TABLE store_payment_connections ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE store_payment_connections ADD CONSTRAINT store_payment_connection_version_positive CHECK (version > 0);
ALTER TABLE platform_payment_tests
  ADD COLUMN scope_key VARCHAR(80) NOT NULL DEFAULT 'PLATFORM_TEST',
  ADD COLUMN organization_id UUID;
ALTER TABLE platform_payment_tests ADD CONSTRAINT payment_tests_scope_matches_store
  CHECK ((organization_id IS NULL AND scope_key = 'PLATFORM_TEST') OR
         (organization_id IS NOT NULL AND scope_key = 'STORE:' || organization_id::text));
ALTER TABLE platform_payment_tests ADD CONSTRAINT payment_tests_store_fk
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE platform_payment_tests DROP CONSTRAINT platform_payment_tests_provider_created_by_id_key_digest_key;
DROP INDEX platform_payment_test_one_unresolved;
CREATE UNIQUE INDEX payment_test_one_unresolved ON platform_payment_tests(scope_key,provider,connection_version)
  WHERE status IN ('PREPARING','PENDING','UNKNOWN');
CREATE UNIQUE INDEX payment_tests_scope_actor_key
  ON platform_payment_tests(scope_key, provider, created_by_id, key_digest);
CREATE INDEX payment_tests_scope_history
  ON platform_payment_tests(scope_key, provider, created_at, id);
ALTER TABLE platform_payment_test_events DROP CONSTRAINT platform_payment_test_events_test_id_fkey;
ALTER TABLE platform_payment_test_events ADD CONSTRAINT platform_payment_test_events_test_id_fkey
  FOREIGN KEY (test_id) REFERENCES platform_payment_tests(id) ON DELETE CASCADE ON UPDATE CASCADE;
