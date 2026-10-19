-- Pending payment confirmation may outlive the QR. Keep expired tests available
-- for reconciliation without blocking fresh test transactions. New tests are
-- serialized by the shared Store-row/platform-advisory transaction lock.
DROP INDEX "payment_test_one_unresolved";
CREATE INDEX "payment_tests_scope_qr_deadline"
  ON "platform_payment_tests" ("scope_key", "provider", "connection_version", "expires_at");
