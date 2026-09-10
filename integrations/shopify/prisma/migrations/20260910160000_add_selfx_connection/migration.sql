-- CreateTable
CREATE TABLE "SelfxConnection" (
    "shop" TEXT NOT NULL PRIMARY KEY,
    "shopifyAccountId" TEXT NOT NULL,
    "shopName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
    "pendingLinkTokenCiphertext" TEXT,
    "pendingLinkExpiresAt" DATETIME,
    "integrationTokenCiphertext" TEXT,
    "encryptionKeyVersion" TEXT,
    "selfxStoreId" TEXT,
    "selfxStoreName" TEXT,
    "selfxIntegrationId" TEXT,
    "selfxCredentialId" TEXT,
    "linkedAt" DATETIME,
    "syncStatus" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "lastSyncAt" DATETIME,
    "lastSyncProducts" INTEGER NOT NULL DEFAULT 0,
    "lastSyncVariants" INTEGER NOT NULL DEFAULT 0,
    "lastSyncCreated" INTEGER NOT NULL DEFAULT 0,
    "lastSyncUpdated" INTEGER NOT NULL DEFAULT 0,
    "lastSyncArchived" INTEGER NOT NULL DEFAULT 0,
    "lastErrorCode" TEXT,
    "lastErrorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "SelfxConnection_shopifyAccountId_key" ON "SelfxConnection"("shopifyAccountId");

-- CreateIndex
CREATE INDEX "SelfxConnection_status_updatedAt_idx" ON "SelfxConnection"("status", "updatedAt");
