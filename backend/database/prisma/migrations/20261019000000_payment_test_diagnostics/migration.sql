-- Fixed, redacted diagnostic snapshots; no request/response bodies or credentials.
ALTER TABLE "platform_payment_tests"
  ADD COLUMN "initialization_diagnostic" JSONB,
  ADD COLUMN "status_diagnostic" JSONB;
