-- Allow multiple active Try-On share capabilities per session.

DROP INDEX "try_on_share_capabilities_try_on_session_id_key";

CREATE INDEX "try_on_share_capabilities_try_on_session_id_expires_at_idx"
    ON "try_on_share_capabilities"("try_on_session_id", "expires_at");
