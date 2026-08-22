-- CreateEnum
CREATE TYPE "StorageKind" AS ENUM ('LOCAL', 'S3');

-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "storage" "StorageKind" NOT NULL DEFAULT 'LOCAL';

-- CreateTable
CREATE TABLE "StorageConfig" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "provider" "StorageKind" NOT NULL DEFAULT 'LOCAL',
    "bucket" TEXT,
    "region" TEXT,
    "endpoint" TEXT,
    "forcePathStyle" BOOLEAN NOT NULL DEFAULT false,
    "prefix" TEXT,
    "accessKeyId" TEXT,
    "secretAccessKey" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorageConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StorageConfig_orgId_key" ON "StorageConfig"("orgId");

-- AddForeignKey
ALTER TABLE "StorageConfig" ADD CONSTRAINT "StorageConfig_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
