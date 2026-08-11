-- Phase 3C: strengthen activation requirement/application tenant consistency.
-- Do not edit earlier applied migrations.

CREATE UNIQUE INDEX "organization_applications_id_organization_id_key"
  ON "organization_applications"("id", "organization_id");

ALTER TABLE "organization_activation_requirements"
  DROP CONSTRAINT "organization_activation_requirements_application_id_fkey";

ALTER TABLE "organization_activation_requirements"
  ADD CONSTRAINT "organization_activation_requirements_application_id_organization_id_fkey"
  FOREIGN KEY ("application_id", "organization_id")
  REFERENCES "organization_applications"("id", "organization_id")
  ON DELETE CASCADE ON UPDATE CASCADE;
