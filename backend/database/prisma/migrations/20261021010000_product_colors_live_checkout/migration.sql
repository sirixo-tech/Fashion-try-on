ALTER TABLE product_stock_settings ADD COLUMN color_images JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE product_stock_settings ADD CONSTRAINT product_color_images_array CHECK (jsonb_typeof(color_images) = 'array' AND jsonb_array_length(color_images) <= 100);
ALTER TABLE shopping_payment_attempts DROP CONSTRAINT shopping_payment_attempts_environment_check;
ALTER TABLE shopping_payment_attempts ADD CONSTRAINT shopping_payment_attempts_environment_check CHECK (environment IN ('UAT','PRODUCTION'));
