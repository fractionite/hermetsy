-- Create extension needed for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateTable
CREATE TABLE "Shop" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "etsyShopId" BIGINT,
    "etsyUserId" BIGINT,
    "shopName" TEXT,
    "accessLevel" TEXT NOT NULL DEFAULT 'personal',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Shop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthToken" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "shopId" TEXT NOT NULL,
    "accessTokenEncrypted" TEXT NOT NULL,
    "refreshTokenEncrypted" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "refreshExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OAuthToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingCache" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "shopId" TEXT NOT NULL,
    "etsyListingId" BIGINT NOT NULL,
    "state" TEXT,
    "title" TEXT,
    "description" TEXT,
    "tags" JSONB,
    "lastModifiedTimestamp" BIGINT,
    "rawPayload" JSONB,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ListingCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingSnapshot" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "shopId" TEXT NOT NULL,
    "operationId" TEXT,
    "etsyListingId" BIGINT NOT NULL,
    "snapshotType" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "tags" JSONB,
    "state" TEXT,
    "lastModifiedTimestamp" BIGINT,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ListingSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BulkOperation" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "shopId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "settings" JSONB,
    "totalItems" INTEGER NOT NULL DEFAULT 0,
    "approvedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BulkOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationItem" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "operationId" TEXT NOT NULL,
    "etsyListingId" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "oldTitle" TEXT,
    "newTitle" TEXT,
    "oldDescription" TEXT,
    "newDescription" TEXT,
    "validationErrors" JSONB,
    "etsyResponse" JSONB,
    "errorMessage" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OperationItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "shopId" TEXT NOT NULL,
    "operationId" TEXT,
    "etsyListingId" BIGINT,
    "eventType" TEXT NOT NULL,
    "message" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Shop_etsyShopId_key" ON "Shop"("etsyShopId");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthToken_shopId_key" ON "OAuthToken"("shopId");

-- CreateIndex
CREATE UNIQUE INDEX "ListingCache_shopId_etsyListingId_key" ON "ListingCache"("shopId", "etsyListingId");

-- CreateIndex
CREATE INDEX "ListingCache_shopId_idx" ON "ListingCache"("shopId");

-- CreateIndex
CREATE INDEX "ListingCache_etsyListingId_idx" ON "ListingCache"("etsyListingId");

-- CreateIndex
CREATE INDEX "ListingSnapshot_shopId_idx" ON "ListingSnapshot"("shopId");

-- CreateIndex
CREATE INDEX "ListingSnapshot_operationId_idx" ON "ListingSnapshot"("operationId");

-- CreateIndex
CREATE INDEX "ListingSnapshot_etsyListingId_idx" ON "ListingSnapshot"("etsyListingId");

-- CreateIndex
CREATE INDEX "BulkOperation_shopId_idx" ON "BulkOperation"("shopId");

-- CreateIndex
CREATE INDEX "BulkOperation_status_idx" ON "BulkOperation"("status");

-- CreateIndex
CREATE INDEX "OperationItem_operationId_idx" ON "OperationItem"("operationId");

-- CreateIndex
CREATE INDEX "OperationItem_etsyListingId_idx" ON "OperationItem"("etsyListingId");

-- CreateIndex
CREATE INDEX "OperationItem_status_idx" ON "OperationItem"("status");

-- CreateIndex
CREATE INDEX "AuditEvent_shopId_idx" ON "AuditEvent"("shopId");

-- CreateIndex
CREATE INDEX "AuditEvent_operationId_idx" ON "AuditEvent"("operationId");

-- CreateIndex
CREATE INDEX "AuditEvent_etsyListingId_idx" ON "AuditEvent"("etsyListingId");

-- AddForeignKey
ALTER TABLE "OAuthToken" ADD CONSTRAINT "OAuthToken_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingCache" ADD CONSTRAINT "ListingCache_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingSnapshot" ADD CONSTRAINT "ListingSnapshot_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingSnapshot" ADD CONSTRAINT "ListingSnapshot_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "BulkOperation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BulkOperation" ADD CONSTRAINT "BulkOperation_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationItem" ADD CONSTRAINT "OperationItem_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "BulkOperation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "BulkOperation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
