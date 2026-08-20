CREATE TYPE "CatalogProductScope" AS ENUM ('PLATFORM_DEFAULT', 'STORE');

CREATE TABLE "product_categories" (
  "id" UUID NOT NULL,
  "catalog_key" VARCHAR(220) NOT NULL,
  "scope" "CatalogProductScope" NOT NULL,
  "organization_id" UUID,
  "name" VARCHAR(120) NOT NULL,
  "slug" VARCHAR(120) NOT NULL,
  "audience" VARCHAR(40),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "product_categories_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "product_categories_catalog_key_key"
  ON "product_categories"("catalog_key");
CREATE INDEX "product_categories_scope_active_sort_order_idx"
  ON "product_categories"("scope", "active", "sort_order");
CREATE INDEX "product_categories_organization_id_active_sort_order_idx"
  ON "product_categories"("organization_id", "active", "sort_order");
CREATE INDEX "product_categories_audience_slug_idx"
  ON "product_categories"("audience", "slug");

CREATE TABLE "products" (
  "id" UUID NOT NULL,
  "catalog_key" VARCHAR(260) NOT NULL,
  "scope" "CatalogProductScope" NOT NULL,
  "organization_id" UUID,
  "category_id" UUID NOT NULL,
  "name" VARCHAR(180) NOT NULL,
  "slug" VARCHAR(160) NOT NULL,
  "description" TEXT,
  "audience" VARCHAR(40) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "vto_enabled" BOOLEAN NOT NULL DEFAULT false,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "garment_intent" VARCHAR(40) NOT NULL,
  "garment_category" VARCHAR(40) NOT NULL,
  "garment_photo_type" VARCHAR(40) NOT NULL DEFAULT 'AUTO',
  "image_url" TEXT,
  "image_storage_key" VARCHAR(512),
  "image_content_type" VARCHAR(80),
  "image_width" INTEGER,
  "image_height" INTEGER,
  "product_url" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "products_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "products_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "products_category_id_fkey"
    FOREIGN KEY ("category_id") REFERENCES "product_categories"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "products_catalog_image_required_check"
    CHECK (
      ("image_url" IS NOT NULL AND length(btrim("image_url")) > 0)
      OR
      ("image_storage_key" IS NOT NULL AND length(btrim("image_storage_key")) > 0)
    )
);

CREATE UNIQUE INDEX "products_catalog_key_key"
  ON "products"("catalog_key");
CREATE INDEX "products_scope_active_vto_enabled_audience_sort_order_idx"
  ON "products"("scope", "active", "vto_enabled", "audience", "sort_order");
CREATE INDEX "products_organization_id_active_vto_enabled_audience_sort_order_idx"
  ON "products"("organization_id", "active", "vto_enabled", "audience", "sort_order");
CREATE INDEX "products_category_id_active_vto_enabled_sort_order_idx"
  ON "products"("category_id", "active", "vto_enabled", "sort_order");
CREATE INDEX "products_garment_intent_idx"
  ON "products"("garment_intent");
