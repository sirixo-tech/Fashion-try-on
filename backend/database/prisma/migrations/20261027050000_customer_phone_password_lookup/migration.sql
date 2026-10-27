-- Pending contact is only a password-login alias; it never proves ownership.
CREATE INDEX "customers_pending_phone_number_idx" ON "customers"("pending_phone_number");
