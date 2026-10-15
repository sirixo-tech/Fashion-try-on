-- SHOPPING-1: one stock pool per product Store, never per kiosk/location.
CREATE UNIQUE INDEX "products_organization_id_id_key" ON "products"("organization_id", "id");

CREATE TABLE "product_stock_settings" (
  "product_id" UUID NOT NULL PRIMARY KEY,
  "organization_id" UUID NOT NULL,
  "option_mode" VARCHAR(20) NOT NULL,
  "pricing_mode" VARCHAR(20) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "product_stock_settings_option_mode_check" CHECK ("option_mode" IN ('SINGLE', 'SIZE', 'COLOR', 'SIZE_COLOR')),
  CONSTRAINT "product_stock_settings_pricing_mode_check" CHECK ("pricing_mode" IN ('CONSTANT', 'VARIANT')),
  CONSTRAINT "product_stock_settings_version_check" CHECK ("version" > 0),
  CONSTRAINT "product_stock_settings_organization_id_product_id_fkey" FOREIGN KEY ("organization_id", "product_id")
    REFERENCES "products"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "product_stock_settings_organization_id_product_id_key" ON "product_stock_settings"("organization_id", "product_id");

CREATE TABLE "product_variants" (
  "id" UUID NOT NULL PRIMARY KEY,
  "organization_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "option_key" TEXT NOT NULL,
  "size" VARCHAR(80),
  "color" VARCHAR(80),
  "stock_quantity" INTEGER NOT NULL,
  "price_override_amount_cents" INTEGER,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "product_variants_stock_quantity_check" CHECK ("stock_quantity" BETWEEN 0 AND 1000000),
  CONSTRAINT "product_variants_price_check" CHECK ("price_override_amount_cents" IS NULL OR "price_override_amount_cents" BETWEEN 0 AND 100000000),
  CONSTRAINT "product_variants_size_check" CHECK ("size" IS NULL OR length(trim("size")) > 0),
  CONSTRAINT "product_variants_color_check" CHECK ("color" IS NULL OR length(trim("color")) > 0),
  CONSTRAINT "product_variants_organization_id_product_id_fkey" FOREIGN KEY ("organization_id", "product_id")
    REFERENCES "product_stock_settings"("organization_id", "product_id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "product_variants_product_id_option_key_key" ON "product_variants"("product_id", "option_key");
CREATE INDEX "product_variants_organization_id_product_id_active_idx" ON "product_variants"("organization_id", "product_id", "active");
