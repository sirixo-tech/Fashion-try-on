-- Platform testing stays UAT-only. Store account verification may use a
-- production snapshot; amount remains fixed at INR 1.00 by existing checks.
ALTER TABLE "platform_payment_tests"
  DROP CONSTRAINT "platform_payment_tests_environment_check";
ALTER TABLE "platform_payment_tests"
  ADD CONSTRAINT "platform_payment_tests_environment_check"
  CHECK (environment = 'UAT' OR (environment = 'PRODUCTION' AND organization_id IS NOT NULL));
