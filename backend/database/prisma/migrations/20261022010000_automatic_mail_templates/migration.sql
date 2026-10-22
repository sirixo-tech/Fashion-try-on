ALTER TABLE mail_jobs
  ADD COLUMN event_key CHAR(64),
  ADD COLUMN template_code VARCHAR(64),
  ADD COLUMN recipient_mask VARCHAR(320);
CREATE UNIQUE INDEX mail_jobs_event_key_key ON mail_jobs(event_key);
