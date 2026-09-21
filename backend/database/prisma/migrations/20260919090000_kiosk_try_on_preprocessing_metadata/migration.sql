ALTER TABLE "kiosk_try_on_runs"
  ADD COLUMN "garment_preprocessing_enabled" BOOLEAN,
  ADD COLUMN "garment_preprocessing_status" VARCHAR(40),
  ADD COLUMN "garment_preprocessing_provider_input_image" VARCHAR(40),
  ADD COLUMN "garment_preprocessing_mask_generated" BOOLEAN,
  ADD COLUMN "garment_preprocessing_fallback_reason" VARCHAR(240);
