/*
  Warnings:

  - You are about to drop the column `credentialRef` on the `tenant_aggregators` table. All the data in the column will be lost.
  - The `status` column on the `tenant_aggregators` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - A unique constraint covering the columns `[tenantId,aggregatorId,name]` on the table `tenant_aggregators` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "TenantAggregatorStatus" AS ENUM ('ACTIVE', 'ERROR', 'UNCONFIGURED', 'PAUSED');

-- CreateEnum
CREATE TYPE "AggregatorType" AS ENUM ('CLOUD', 'ON_PREMISE');

-- DropIndex
DROP INDEX "tenant_aggregators_tenantId_aggregatorId_key";

-- AlterTable
ALTER TABLE "aggregators" ADD COLUMN     "configSchema" JSONB,
ADD COLUMN     "type" "AggregatorType" NOT NULL DEFAULT 'CLOUD';

-- AlterTable
ALTER TABLE "tenant_aggregators" DROP COLUMN "credentialRef",
ADD COLUMN     "credentials" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "lastSyncAt" TIMESTAMP(3),
ADD COLUMN     "lastTestAt" TIMESTAMP(3),
ADD COLUMN     "lastTestError" TEXT,
ADD COLUMN     "lastTestStatus" TEXT,
ADD COLUMN     "miniConnectorId" TEXT,
DROP COLUMN "status",
ADD COLUMN     "status" "TenantAggregatorStatus" NOT NULL DEFAULT 'UNCONFIGURED',
ALTER COLUMN "config" SET DEFAULT '{}';

-- CreateIndex
CREATE INDEX "tenant_aggregators_tenantId_status_idx" ON "tenant_aggregators"("tenantId", "status");

-- CreateIndex
CREATE INDEX "tenant_aggregators_tenantId_aggregatorId_idx" ON "tenant_aggregators"("tenantId", "aggregatorId");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_aggregators_tenantId_aggregatorId_name_key" ON "tenant_aggregators"("tenantId", "aggregatorId", "name");
