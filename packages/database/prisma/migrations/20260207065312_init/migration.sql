-- CreateEnum
CREATE TYPE "TenantTier" AS ENUM ('FREE', 'STANDARD', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "WorkflowStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ExecutionStatus" AS ENUM ('PENDING', 'RUNNING', 'PAUSED', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ActivityStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AggregatorStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ERROR');

-- CreateEnum
CREATE TYPE "ConnectorStatus" AS ENUM ('ONLINE', 'OFFLINE', 'UNKNOWN');

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tier" "TenantTier" NOT NULL DEFAULT 'FREE',
    "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE',
    "maxConcurrentWorkflows" INTEGER NOT NULL DEFAULT 5,
    "maxJobsPerHour" INTEGER NOT NULL DEFAULT 100,
    "maxConcurrentJobs" INTEGER NOT NULL DEFAULT 2,
    "maxStorageGB" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'ADMIN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_definitions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "definition" JSONB NOT NULL,
    "status" "WorkflowStatus" NOT NULL DEFAULT 'DRAFT',
    "deprecatedAfter" TIMESTAMP(3),
    "forceCancelAfter" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_executions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "workflowVersion" INTEGER NOT NULL,
    "workflowHash" TEXT NOT NULL,
    "status" "ExecutionStatus" NOT NULL DEFAULT 'PENDING',
    "currentStep" TEXT,
    "stateSnapshotRef" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "workflow_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_executions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "status" "ActivityStatus" NOT NULL DEFAULT 'PENDING',
    "outputRef" TEXT,
    "errorMessage" TEXT,
    "errorRetryable" BOOLEAN,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "activity_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aggregators" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "logoUrl" TEXT,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "capabilities" TEXT[],
    "authMethods" TEXT[],
    "documentationUrl" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "sdkRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "aggregators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_aggregators" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "aggregatorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "AggregatorStatus" NOT NULL DEFAULT 'ACTIVE',
    "config" JSONB NOT NULL,
    "credentialRef" TEXT,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_aggregators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mini_connectors" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "apiKeyHash" TEXT NOT NULL,
    "status" "ConnectorStatus" NOT NULL DEFAULT 'OFFLINE',
    "ipAddress" TEXT,
    "version" TEXT,
    "os" TEXT,
    "cpuUsage" INTEGER,
    "memoryUsage" INTEGER,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mini_connectors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tenants_tier_status_idx" ON "tenants"("tier", "status");

-- CreateIndex
CREATE INDEX "users_tenantId_idx" ON "users"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenantId_email_key" ON "users"("tenantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- CreateIndex
CREATE INDEX "workflow_definitions_tenantId_status_idx" ON "workflow_definitions"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_definitions_id_version_key" ON "workflow_definitions"("id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_definitions_tenantId_id_version_key" ON "workflow_definitions"("tenantId", "id", "version");

-- CreateIndex
CREATE INDEX "workflow_executions_tenantId_status_idx" ON "workflow_executions"("tenantId", "status");

-- CreateIndex
CREATE INDEX "workflow_executions_tenantId_startedAt_idx" ON "workflow_executions"("tenantId", "startedAt");

-- CreateIndex
CREATE INDEX "workflow_executions_workflowId_workflowVersion_idx" ON "workflow_executions"("workflowId", "workflowVersion");

-- CreateIndex
CREATE INDEX "activity_executions_executionId_status_idx" ON "activity_executions"("executionId", "status");

-- CreateIndex
CREATE INDEX "activity_executions_tenantId_startedAt_idx" ON "activity_executions"("tenantId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "activity_executions_executionId_activityId_attempt_key" ON "activity_executions"("executionId", "activityId", "attempt");

-- CreateIndex
CREATE INDEX "tenant_aggregators_tenantId_status_idx" ON "tenant_aggregators"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_aggregators_tenantId_aggregatorId_key" ON "tenant_aggregators"("tenantId", "aggregatorId");

-- CreateIndex
CREATE INDEX "mini_connectors_tenantId_status_idx" ON "mini_connectors"("tenantId", "status");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_definitions" ADD CONSTRAINT "workflow_definitions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_workflowId_workflowVersion_fkey" FOREIGN KEY ("workflowId", "workflowVersion") REFERENCES "workflow_definitions"("id", "version") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_executions" ADD CONSTRAINT "activity_executions_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "workflow_executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_aggregators" ADD CONSTRAINT "tenant_aggregators_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_aggregators" ADD CONSTRAINT "tenant_aggregators_aggregatorId_fkey" FOREIGN KEY ("aggregatorId") REFERENCES "aggregators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mini_connectors" ADD CONSTRAINT "mini_connectors_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
