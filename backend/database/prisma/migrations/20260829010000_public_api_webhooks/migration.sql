CREATE TABLE "webhook_endpoints" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "url" VARCHAR(2048) NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  "secret_reference" VARCHAR(160) NOT NULL DEFAULT 'derived:v1',
  "subscribed_events_json" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "webhook_endpoints_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "webhook_deliveries" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "webhook_endpoint_id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "event_type" VARCHAR(80) NOT NULL,
  "attempt_number" INTEGER NOT NULL DEFAULT 1,
  "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  "http_status" INTEGER,
  "error_message" TEXT,
  "next_retry_at" TIMESTAMPTZ(3),
  "delivered_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "webhook_endpoints_organization_id_idx" ON "webhook_endpoints"("organization_id");
CREATE INDEX "webhook_endpoints_organization_id_status_idx" ON "webhook_endpoints"("organization_id", "status");

CREATE UNIQUE INDEX "webhook_deliveries_webhook_endpoint_id_event_id_attempt_number_key"
  ON "webhook_deliveries"("webhook_endpoint_id", "event_id", "attempt_number");
CREATE INDEX "webhook_deliveries_organization_id_created_at_idx" ON "webhook_deliveries"("organization_id", "created_at");
CREATE INDEX "webhook_deliveries_webhook_endpoint_id_created_at_idx" ON "webhook_deliveries"("webhook_endpoint_id", "created_at");
CREATE INDEX "webhook_deliveries_event_id_idx" ON "webhook_deliveries"("event_id");
CREATE INDEX "webhook_deliveries_event_type_created_at_idx" ON "webhook_deliveries"("event_type", "created_at");
CREATE INDEX "webhook_deliveries_status_next_retry_at_idx" ON "webhook_deliveries"("status", "next_retry_at");

ALTER TABLE "webhook_endpoints"
  ADD CONSTRAINT "webhook_endpoints_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "webhook_deliveries"
  ADD CONSTRAINT "webhook_deliveries_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "webhook_deliveries"
  ADD CONSTRAINT "webhook_deliveries_webhook_endpoint_id_fkey"
  FOREIGN KEY ("webhook_endpoint_id") REFERENCES "webhook_endpoints"("id") ON DELETE CASCADE ON UPDATE CASCADE;
