ALTER TABLE "SelfxConnection"
ADD COLUMN "syncCheckpoint" JSONB,
ADD COLUMN "syncLeaseToken" TEXT,
ADD COLUMN "syncLeaseUntil" TIMESTAMP(3),
ADD COLUMN "nextSyncAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "nextBillingCheckAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "syncAttempts" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "SelfxConnection_status_nextSyncAt_idx" ON "SelfxConnection"("status", "nextSyncAt");
CREATE INDEX "SelfxConnection_nextBillingCheckAt_shop_idx" ON "SelfxConnection"("nextBillingCheckAt", "shop");
