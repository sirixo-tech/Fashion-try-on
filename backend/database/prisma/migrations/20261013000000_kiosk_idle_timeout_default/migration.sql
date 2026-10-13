-- Use two minutes for new kiosk configurations; preserve saved timeout choices.
ALTER TABLE "kiosk_device_configurations"
  ALTER COLUMN "session_idle_timeout_seconds" SET DEFAULT 120;
