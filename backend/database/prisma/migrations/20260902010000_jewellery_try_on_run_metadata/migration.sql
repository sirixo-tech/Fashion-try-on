ALTER TABLE "kiosk_try_on_runs"
  ADD COLUMN "try_on_vertical" "ProductVertical" NOT NULL DEFAULT 'GARMENT',
  ADD COLUMN "jewellery_type" "JewelleryType";

ALTER TABLE "kiosk_try_on_runs"
  ADD CONSTRAINT "kiosk_try_on_runs_jewellery_type_check"
  CHECK (
    ("try_on_vertical" = 'GARMENT' AND "jewellery_type" IS NULL)
    OR
    ("try_on_vertical" = 'JEWELLERY' AND "jewellery_type" IS NOT NULL)
  );

CREATE INDEX "kiosk_try_on_runs_organization_id_try_on_vertical_created_at_idx"
  ON "kiosk_try_on_runs"("organization_id", "try_on_vertical", "created_at");

CREATE INDEX "kiosk_try_on_runs_organization_id_jewellery_type_created_at_idx"
  ON "kiosk_try_on_runs"("organization_id", "jewellery_type", "created_at");
