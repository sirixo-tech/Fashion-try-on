-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "shopify_app";

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SelfxConnection" (
    "shop" TEXT NOT NULL,
    "shopifyAccountId" TEXT NOT NULL,
    "shopName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
    "pendingLinkTokenCiphertext" TEXT,
    "pendingLinkExpiresAt" TIMESTAMP(3),
    "integrationTokenCiphertext" TEXT,
    "encryptionKeyVersion" TEXT,
    "selfxStoreId" TEXT,
    "selfxStoreName" TEXT,
    "selfxIntegrationId" TEXT,
    "selfxCredentialId" TEXT,
    "linkedAt" TIMESTAMP(3),
    "syncStatus" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncProducts" INTEGER NOT NULL DEFAULT 0,
    "lastSyncVariants" INTEGER NOT NULL DEFAULT 0,
    "lastSyncCreated" INTEGER NOT NULL DEFAULT 0,
    "lastSyncUpdated" INTEGER NOT NULL DEFAULT 0,
    "lastSyncArchived" INTEGER NOT NULL DEFAULT 0,
    "lastErrorCode" TEXT,
    "lastErrorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SelfxConnection_pkey" PRIMARY KEY ("shop")
);

-- CreateIndex
CREATE UNIQUE INDEX "SelfxConnection_shopifyAccountId_key" ON "SelfxConnection"("shopifyAccountId");

-- CreateIndex
CREATE INDEX "SelfxConnection_status_updatedAt_idx" ON "SelfxConnection"("status", "updatedAt");
