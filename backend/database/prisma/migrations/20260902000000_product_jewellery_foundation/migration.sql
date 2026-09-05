CREATE TYPE "ProductVertical" AS ENUM ('GARMENT', 'JEWELLERY');
CREATE TYPE "JewelleryType" AS ENUM ('RING', 'BRACELET', 'NECKLACE', 'EARRING');

ALTER TABLE "products"
  ADD COLUMN "product_vertical" "ProductVertical" NOT NULL DEFAULT 'GARMENT',
  ADD COLUMN "jewellery_type" "JewelleryType";

ALTER TABLE "products"
  ADD CONSTRAINT "products_vertical_configuration_check"
  CHECK (
    ("product_vertical" = 'GARMENT' AND "jewellery_type" IS NULL)
    OR
    ("product_vertical" = 'JEWELLERY' AND "jewellery_type" IS NOT NULL)
  );

CREATE INDEX "products_product_vertical_active_vto_enabled_sort_order_idx"
  ON "products"("product_vertical", "active", "vto_enabled", "sort_order");

CREATE INDEX "products_jewellery_type_idx"
  ON "products"("jewellery_type");
