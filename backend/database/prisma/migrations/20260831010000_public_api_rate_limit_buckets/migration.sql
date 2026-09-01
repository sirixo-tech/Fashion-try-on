CREATE TABLE "api_rate_limit_buckets" (
  "id" UUID NOT NULL,
  "api_key_id" UUID NOT NULL,
  "route_bucket" VARCHAR(80) NOT NULL,
  "window_seconds" INTEGER NOT NULL,
  "window_starts_at" TIMESTAMPTZ(3) NOT NULL,
  "request_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "api_rate_limit_buckets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "api_rate_limit_buckets_api_key_id_route_bucket_window_seconds_window_starts_at_key"
  ON "api_rate_limit_buckets"("api_key_id", "route_bucket", "window_seconds", "window_starts_at");

CREATE INDEX "api_rate_limit_buckets_api_key_id_route_bucket_window_starts_at_idx"
  ON "api_rate_limit_buckets"("api_key_id", "route_bucket", "window_starts_at");

CREATE INDEX "api_rate_limit_buckets_window_starts_at_idx"
  ON "api_rate_limit_buckets"("window_starts_at");

ALTER TABLE "api_rate_limit_buckets"
  ADD CONSTRAINT "api_rate_limit_buckets_api_key_id_fkey"
  FOREIGN KEY ("api_key_id") REFERENCES "api_keys"("id") ON DELETE CASCADE ON UPDATE CASCADE;
