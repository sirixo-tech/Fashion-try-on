CREATE TYPE "ContentReportReason" AS ENUM ('SEXUAL_CONTENT', 'CHILD_SAFETY', 'VIOLENCE', 'HATE_HARASSMENT', 'PRIVACY_NON_CONSENSUAL', 'OTHER');
CREATE TYPE "ContentReportStatus" AS ENUM ('NEW', 'IN_REVIEW', 'RESOLVED', 'DISMISSED');

CREATE TABLE "content_reports" (
  "id" UUID NOT NULL,
  "customer_id" UUID NOT NULL,
  "run_id" UUID NOT NULL,
  "result_asset_id" UUID NOT NULL,
  "reason" "ContentReportReason" NOT NULL,
  "comment" VARCHAR(2000),
  "request_fingerprint" CHAR(64) NOT NULL,
  "status" "ContentReportStatus" NOT NULL DEFAULT 'NEW',
  "review_notes" VARCHAR(4000),
  "reviewed_by_user_id" UUID,
  "reviewed_at" TIMESTAMPTZ(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "content_reports_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "content_reports_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "content_reports_version_check" CHECK ("version" > 0)
);

CREATE UNIQUE INDEX "content_reports_customer_id_result_asset_id_key" ON "content_reports"("customer_id", "result_asset_id");
CREATE INDEX "content_reports_status_created_at_id_idx" ON "content_reports"("status", "created_at", "id");
CREATE INDEX "content_reports_reason_created_at_id_idx" ON "content_reports"("reason", "created_at", "id");
CREATE INDEX "content_reports_created_at_id_idx" ON "content_reports"("created_at", "id");
