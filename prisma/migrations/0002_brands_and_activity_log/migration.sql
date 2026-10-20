-- CreateEnum
CREATE TYPE "ActivityEvent" AS ENUM ('BRAND_CREATED', 'BRAND_UPDATED');

-- CreateTable
CREATE TABLE "Brand" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "websiteUrl" TEXT,
    "industry" TEXT,
    "audience" TEXT,
    "voice" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLogEntry" (
    "id" SERIAL NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "event" "ActivityEvent" NOT NULL,
    "brandId" TEXT,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Brand_workspaceId_idx" ON "Brand"("workspaceId");

-- CreateIndex
CREATE INDEX "ActivityLogEntry_workspaceId_id_idx" ON "ActivityLogEntry"("workspaceId", "id");

-- AddForeignKey
ALTER TABLE "Brand" ADD CONSTRAINT "Brand_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLogEntry" ADD CONSTRAINT "ActivityLogEntry_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLogEntry" ADD CONSTRAINT "ActivityLogEntry_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLogEntry" ADD CONSTRAINT "ActivityLogEntry_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
