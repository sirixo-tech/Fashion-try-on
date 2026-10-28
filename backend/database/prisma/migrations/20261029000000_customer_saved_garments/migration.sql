CREATE TABLE "customer_saved_garments" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "source" VARCHAR(8) NOT NULL,
    "source_item_id" VARCHAR(64) NOT NULL,
    "organization_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "customer_saved_garments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "customer_saved_garments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "customer_saved_garments_source_check" CHECK ("source" IN ('DEMO', 'STORE'))
);

CREATE UNIQUE INDEX "customer_saved_garments_customer_id_source_source_item_id_key" ON "customer_saved_garments"("customer_id", "source", "source_item_id");
CREATE INDEX "customer_saved_garments_customer_id_created_at_idx" ON "customer_saved_garments"("customer_id", "created_at");
