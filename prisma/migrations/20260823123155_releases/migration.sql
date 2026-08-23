-- AlterTable
ALTER TABLE "Epic" ADD COLUMN     "releaseId" TEXT;

-- AlterTable
ALTER TABLE "Issue" ADD COLUMN     "releaseId" TEXT;

-- CreateTable
CREATE TABLE "Release" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "releasedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Release_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Release_projectId_idx" ON "Release"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Release_projectId_name_key" ON "Release"("projectId", "name");

-- AddForeignKey
ALTER TABLE "Epic" ADD CONSTRAINT "Epic_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "Release"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "Release"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Release" ADD CONSTRAINT "Release_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
