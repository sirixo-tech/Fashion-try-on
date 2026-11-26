CREATE TABLE "customer_outfit_schedules" (
  "id" UUID NOT NULL,
  "customer_id" UUID NOT NULL,
  "scheduled_date" DATE NOT NULL,
  "occasion" VARCHAR(80),
  "notes" VARCHAR(500),
  "create_fingerprint" CHAR(64) NOT NULL,
  "current_fingerprint" CHAR(64) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "deleted_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "customer_outfit_schedules_pkey" PRIMARY KEY("id"),
  CONSTRAINT "customer_outfit_schedules_customer_id_fkey" FOREIGN KEY("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "customer_outfit_schedule_owner_date_idx" ON "customer_outfit_schedules"("customer_id","deleted_at","scheduled_date","created_at","id");
CREATE TABLE "customer_outfit_schedule_pieces" (
  "id" UUID NOT NULL,
  "schedule_id" UUID NOT NULL,
  "wardrobe_item_id" UUID,
  "position" INTEGER NOT NULL,
  CONSTRAINT "customer_outfit_schedule_pieces_pkey" PRIMARY KEY("id"),
  CONSTRAINT "customer_outfit_schedule_pieces_schedule_id_fkey" FOREIGN KEY("schedule_id") REFERENCES "customer_outfit_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "customer_outfit_schedule_pieces_wardrobe_item_id_fkey" FOREIGN KEY("wardrobe_item_id") REFERENCES "customer_wardrobe_items"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "customer_outfit_schedule_pieces_schedule_id_position_key" ON "customer_outfit_schedule_pieces"("schedule_id","position");
CREATE INDEX "customer_outfit_schedule_pieces_wardrobe_item_id_idx" ON "customer_outfit_schedule_pieces"("wardrobe_item_id");
