-- Existing runs retain NULL. New storefront requests are unique within their
-- capability/session without rewriting or deleting historical generation data.
ALTER TABLE kiosk_try_on_runs ADD COLUMN storefront_request_key CHAR(64);
CREATE UNIQUE INDEX kiosk_try_on_runs_storefront_request_key_key
  ON kiosk_try_on_runs(storefront_request_key);
