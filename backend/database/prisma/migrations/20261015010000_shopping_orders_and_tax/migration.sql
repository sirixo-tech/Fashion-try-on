-- AlterTable
ALTER TABLE "product_stock_settings" ADD COLUMN     "tax_rate_basis_points" INTEGER;

-- CreateTable
CREATE TABLE "store_tax_settings" (
    "organization_id" UUID NOT NULL,
    "mode" VARCHAR(20) NOT NULL,
    "rate_basis_points" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "store_tax_settings_pkey" PRIMARY KEY ("organization_id")
);

-- CreateTable
CREATE TABLE "shopping_carts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "kiosk_device_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "shopping_carts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shopping_cart_items" (
    "cart_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "shopping_cart_items_pkey" PRIMARY KEY ("cart_id","variant_id")
);

-- CreateTable
CREATE TABLE "shopping_orders" (
    "id" UUID NOT NULL,
    "reference" VARCHAR(24) NOT NULL,
    "organization_id" UUID NOT NULL,
    "kiosk_device_id" UUID NOT NULL,
    "source_cart_id" UUID NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'AWAITING_PAYMENT',
    "currency" VARCHAR(3) NOT NULL,
    "tax_mode" VARCHAR(20) NOT NULL,
    "subtotal_cents" INTEGER NOT NULL,
    "tax_cents" INTEGER NOT NULL,
    "total_cents" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "cancelled_at" TIMESTAMPTZ(3),

    CONSTRAINT "shopping_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shopping_order_items" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "product_name" VARCHAR(180) NOT NULL,
    "size" VARCHAR(80),
    "color" VARCHAR(80),
    "quantity" INTEGER NOT NULL,
    "unit_price_cents" INTEGER NOT NULL,
    "tax_rate_basis_points" INTEGER NOT NULL,
    "subtotal_cents" INTEGER NOT NULL,
    "tax_cents" INTEGER NOT NULL,
    "total_cents" INTEGER NOT NULL,

    CONSTRAINT "shopping_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shopping_checkout_requests" (
    "kiosk_device_id" UUID NOT NULL,
    "key_digest" CHAR(64) NOT NULL,
    "fingerprint" CHAR(64) NOT NULL,
    "order_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "shopping_checkout_requests_pkey" PRIMARY KEY ("kiosk_device_id","key_digest")
);

-- CreateIndex
CREATE UNIQUE INDEX "shopping_carts_session_id_key" ON "shopping_carts"("session_id");

-- CreateIndex
CREATE INDEX "shopping_carts_organization_id_kiosk_device_id_idx" ON "shopping_carts"("organization_id", "kiosk_device_id");

-- CreateIndex
CREATE UNIQUE INDEX "shopping_carts_organization_id_kiosk_device_id_session_id_key" ON "shopping_carts"("organization_id", "kiosk_device_id", "session_id");

-- CreateIndex
CREATE UNIQUE INDEX "shopping_carts_organization_id_id_key" ON "shopping_carts"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "shopping_orders_reference_key" ON "shopping_orders"("reference");

-- CreateIndex
CREATE INDEX "shopping_orders_organization_id_created_at_id_idx" ON "shopping_orders"("organization_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "shopping_orders_source_cart_id_status_expires_at_idx" ON "shopping_orders"("source_cart_id", "status", "expires_at");

-- CreateIndex
CREATE INDEX "shopping_orders_status_expires_at_id_idx" ON "shopping_orders"("status", "expires_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "shopping_orders_organization_id_id_key" ON "shopping_orders"("organization_id", "id");

-- CreateIndex
CREATE INDEX "shopping_order_items_organization_id_variant_id_idx" ON "shopping_order_items"("organization_id", "variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "shopping_order_items_order_id_variant_id_key" ON "shopping_order_items"("order_id", "variant_id");

-- CreateIndex
CREATE INDEX "shopping_checkout_requests_expires_at_idx" ON "shopping_checkout_requests"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_organization_id_id_key" ON "product_variants"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_organization_id_product_id_id_key" ON "product_variants"("organization_id", "product_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "try_on_sessions_organization_id_kiosk_device_id_id_key" ON "try_on_sessions"("organization_id", "kiosk_device_id", "id");

-- AddForeignKey
ALTER TABLE "store_tax_settings" ADD CONSTRAINT "store_tax_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_carts" ADD CONSTRAINT "shopping_carts_organization_id_kiosk_device_id_session_id_fkey" FOREIGN KEY ("organization_id", "kiosk_device_id", "session_id") REFERENCES "try_on_sessions"("organization_id", "kiosk_device_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_cart_items" ADD CONSTRAINT "shopping_cart_items_organization_id_cart_id_fkey" FOREIGN KEY ("organization_id", "cart_id") REFERENCES "shopping_carts"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_cart_items" ADD CONSTRAINT "shopping_cart_items_organization_id_variant_id_fkey" FOREIGN KEY ("organization_id", "variant_id") REFERENCES "product_variants"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_orders" ADD CONSTRAINT "shopping_orders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_order_items" ADD CONSTRAINT "shopping_order_items_organization_id_order_id_fkey" FOREIGN KEY ("organization_id", "order_id") REFERENCES "shopping_orders"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_order_items" ADD CONSTRAINT "shopping_order_items_organization_id_product_id_variant_id_fkey" FOREIGN KEY ("organization_id", "product_id", "variant_id") REFERENCES "product_variants"("organization_id", "product_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_checkout_requests" ADD CONSTRAINT "shopping_checkout_requests_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "shopping_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Domain invariants remain enforced even for writes outside the application.
ALTER TABLE product_stock_settings ADD CONSTRAINT product_stock_tax_rate_check CHECK (tax_rate_basis_points BETWEEN 0 AND 10000);
ALTER TABLE store_tax_settings ADD CONSTRAINT store_tax_mode_check CHECK (mode IN ('OFF','INCLUSIVE','EXCLUSIVE')),
  ADD CONSTRAINT store_tax_rate_check CHECK (rate_basis_points BETWEEN 0 AND 10000),
  ADD CONSTRAINT store_tax_version_check CHECK (version > 0);
ALTER TABLE shopping_carts ADD CONSTRAINT shopping_cart_version_check CHECK (version > 0);
ALTER TABLE shopping_cart_items ADD CONSTRAINT shopping_cart_quantity_check CHECK (quantity BETWEEN 1 AND 1000000);
ALTER TABLE shopping_orders ADD CONSTRAINT shopping_order_status_check CHECK (status IN ('AWAITING_PAYMENT','CANCELLED','EXPIRED')),
  ADD CONSTRAINT shopping_order_tax_mode_check CHECK (tax_mode IN ('OFF','INCLUSIVE','EXCLUSIVE')),
  ADD CONSTRAINT shopping_order_money_check CHECK (subtotal_cents >= 0 AND tax_cents >= 0 AND total_cents::bigint = subtotal_cents::bigint + tax_cents::bigint AND total_cents <= 2000000000),
  ADD CONSTRAINT shopping_order_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT shopping_order_expiry_check CHECK (expires_at > created_at);
ALTER TABLE shopping_order_items ADD CONSTRAINT shopping_order_item_quantity_check CHECK (quantity BETWEEN 1 AND 1000000),
  ADD CONSTRAINT shopping_order_item_money_check CHECK (unit_price_cents BETWEEN 0 AND 100000000 AND subtotal_cents >= 0 AND tax_cents >= 0 AND total_cents::bigint = subtotal_cents::bigint + tax_cents::bigint),
  ADD CONSTRAINT shopping_order_item_tax_check CHECK (tax_rate_basis_points BETWEEN 0 AND 10000);
CREATE UNIQUE INDEX shopping_order_one_pending_per_cart ON shopping_orders(source_cart_id) WHERE status = 'AWAITING_PAYMENT';

