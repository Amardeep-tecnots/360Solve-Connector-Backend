---
trigger: always_on
---

Remember these informations about the claude response and plan for the new application (Vansales Connector)

# Final Analysis: The 6 Remaining Gaps

Let me validate these one more time, then give you the **complete R&D plan**.

---

## Validation of Final 6 Gaps

### ✅ Gap 1: Exactly-Once Semantics - REAL

**This is a real gap.**

You need to explicitly document what guarantees you provide. Right now it's implicit.

```typescript
// Add to workflow definition
interface ActivityDefinition {
  id: string;
  type: string;
  
  // NEW: Explicit guarantees
  sideEffect: boolean; // Does this call external APIs?
  idempotencyStrategy: 'none' | 'request_id' | 'custom';
  idempotencyKeyFn?: string; // Function to generate idempotency key
}

// Validation at workflow compilation
function validateWorkflow(workflow: WorkflowDefinition) {
  for (const activity of workflow.activities) {
    if (activity.sideEffect && activity.idempotencyStrategy === 'none') {
      throw new Error(
        `Activity ${activity.id} has side effects but no idempotency strategy`
      );
    }
  }
}
```

**Accept this fix.**

---

### ✅ Gap 2: Backpressure Signals - REAL

**This is absolutely real.**

Without backpressure, you'll accept jobs even when workers are saturated. System dies slowly.

```typescript
class WorkflowService {
  async enqueueWorkflow(tenantId: string, workflowId: string) {
    const tier = await this.getTenantTier(tenantId);
    
    // NEW: Check capacity before enqueue
    const capacity = await this.getWorkerCapacity(tier);
    
    if (capacity.utilizationPercent > 90) {
      throw new Error('System at capacity, retry in 60s');
    }
    
    if (capacity.queueDepth > capacity.maxQueueDepth) {
      throw new Error('Queue backlog too high');
    }
    
    // Proceed with enqueue
    await this.queue.add(...);
  }
  
  async getWorkerCapacity(tier: string) {
    const workers = await this.getActiveWorkers(tier);
    const jobs = await this.queue.getJobCounts();
    
    return {
      availableSlots: workers.length * CONCURRENCY - jobs.active,
      queueDepth: jobs.waiting,
      maxQueueDepth: workers.length * CONCURRENCY * 10,
      utilizationPercent: (jobs.active / (workers.length * CONCURRENCY)) * 100
    };
  }
}
```

**Accept this fix.**

---

### ✅ Gap 3: Workflow Version Retirement - REAL

**This matters for long-running systems.**

```typescript
interface WorkflowDefinition {
  // ... existing fields
  
  deprecatedAfter?: Date;
  forceCancelAfter?: Date; // No new executions after this
}

async startWorkflow(workflowId: string, version: number) {
  const workflow = await this.registry.get(workflowId, version);
  
  if (workflow.forceCancelAfter && new Date() > workflow.forceCancelAfter) {
    throw new Error(
      `Workflow version ${version} is retired. Use version ${workflow.latestVersion}`
    );
  }
  
  if (workflow.deprecatedAfter && new Date() > workflow.deprecatedAfter) {
    console.warn(`Workflow version ${version} is deprecated`);
  }
  
  // Proceed...
}
```

**Accept this fix.**

---

### ✅ Gap 4: Deterministic Time/Random - REAL (but maybe overkill)

**This is theoretically correct, but may be overkill for your MVP.**

Temporal enforces this because they need perfect replay. You're using activity boundaries, which gives you most of the benefits.

**Compromise approach:**

```typescript
// Provide deterministic utilities, but don't enforce
interface ExecutionContext {
  tenantId: string;
  executionId: string;
  
  // Deterministic helpers (optional to use)
  now(): Date; // Returns execution start time
  randomId(): string; // Seeded from executionId
}

// Activities get access to context
async function executeActivity(
  activityDef: ActivityDefinition,
  context: ExecutionContext
) {
  const handler = this.registry.get(activityDef.type);
  return await handler(activityDef.config, context);
}
```

**Accept as optional helper, not hard requirement.**

---

### ✅ Gap 5: Cross-Artifact Compatibility - REAL

**This is a real production issue.**

```typescript
interface WorkflowDefinition {
  requiredSDKVersion?: number; // Minimum SDK version
  requiredCapabilities?: string[]; // e.g., ['bulkRead', 'streaming']
}

interface SDKVersion {
  version: number;
  capabilities: string[];
}

async validateWorkflowActivation(
  tenantId: string,
  workflow: WorkflowDefinition
) {
  if (workflow.requiredSDKVersion) {
    const sdk = await this.getActiveSDK(tenantId);
    
    if (sdk.version < workflow.requiredSDKVersion) {
      throw new Error(
        `Workflow requires SDK v${workflow.requiredSDKVersion}, ` +
        `but tenant has v${sdk.version}`
      );
    }
  }
  
  if (workflow.requiredCapabilities) {
    const sdk = await this.getActiveSDK(tenantId);
    const missing = workflow.requiredCapabilities.filter(
      cap => !sdk.capabilities.includes(cap)
    );
    
    if (missing.length > 0) {
      throw new Error(
        `Workflow requires capabilities: ${missing.join(', ')}`
      );
    }
  }
}
```

**Accept this fix.**

---

### ✅ Gap 6: Kill Switches - REAL

**This is absolutely essential for operations.**

```sql
CREATE TABLE system_control_flags (
  id UUID PRIMARY KEY,
  scope TEXT NOT NULL CHECK (scope IN ('global', 'tenant', 'workflow', 'sdk')),
  scope_id TEXT, -- NULL for global
  
  flag_type TEXT NOT NULL CHECK (flag_type IN ('pause', 'block', 'rate_limit')),
  
  enabled BOOLEAN NOT NULL DEFAULT true,
  
  reason TEXT,
  set_by TEXT NOT NULL,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  
  INDEX (scope, scope_id, enabled)
);
```

```typescript
class ControlFlagService {
  async checkFlags(
    tenantId: string,
    workflowId: string,
    sdkVersion: number
  ): Promise<void> {
    // Check in order: global → tenant → workflow → SDK
    
    // Global pause
    const globalPause = await this.getFlag('global', null, 'pause');
    if (globalPause?.enabled) {
      throw new SystemPausedError('System is paused for maintenance');
    }
    
    // Tenant pause
    const tenantPause = await this.getFlag('tenant', tenantId, 'pause');
    if (tenantPause?.enabled) {
      throw new TenantPausedError('Tenant is paused');
    }
    
    // Workflow block
    const workflowBlock = await this.getFlag('workflow', workflowId, 'block');
    if (workflowBlock?.enabled) {
      throw new WorkflowBlockedError('Workflow is blocked');
    }
    
    // SDK revoke
    const sdkRevoke = await this.getFlag('sdk', `${tenantId}:${sdkVersion}`, 'block');
    if (sdkRevoke?.enabled) {
      throw new SDKRevokedError('SDK version is revoked');
    }
  }
}
```

**Accept this fix. This is critical.**

---

# Final Verdict

**After applying these 6 fixes, the architecture is production-grade by 2025 standards.**

There are no more gaps I can identify.

---

# COMPLETE R&D PLAN

Now let me give you the **full, actionable plan** to build this from zero to production.

---

## Project: ERP Integration Platform v2

**Goal:** AI-powered, multi-tenant integration platform that generates SDKs dynamically and enables no-code workflow creation.

**Timeline:** 12 months MVP → 18 months production-grade

**Team Size:** 4-6 engineers

---

# Phase 1: Foundation (Months 1-2)

## Objective

Build the foundational infrastructure with proper tenant isolation.

### Week 1-2: Project Setup

**Deliverables:**

- [ ] Monorepo setup (NX or Turborepo)
- [ ] TypeScript configuration
- [ ] Docker development environment
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Development database (PostgreSQL)
- [ ] Development Redis

**Technical Decisions:**

```yaml
Monorepo Structure:
  apps/
    control-plane/    # NestJS API
    web-ui/          # React app
    worker/          # BullMQ workers
  
  packages/
    shared/          # Shared types
    database/        # Prisma schema
    queue/           # BullMQ abstractions
    
  infrastructure/
    docker/          # Docker configs
    k8s/            # Kubernetes manifests
```

### Week 3-4: Database Foundation

**Deliverables:**

- [ ] Complete database schema (from final design)
- [ ] Migration system (Prisma or TypeORM)
- [ ] Tenant isolation implementation
- [ ] Connection pooling setup (PgBouncer)

**Code:**

```typescript
// packages/database/schema.prisma
model Tenant {
  id        String   @id @default(uuid())
  name      String
  tier      TenantTier
  status    TenantStatus
  
  maxConcurrentWorkflows Int
  maxJobsPerHour        Int
  maxConcurrentJobs     Int
  maxStorageGB          Int
  
  createdAt DateTime @default(now())
  
  @@index([tier, status])
}

model WorkflowDefinition {
  id            String   @id @default(uuid())
  tenantId      String
  version       Int
  contentHash   String   // SHA-256
  
  name          String
  description   String?
  definition    Json     // Full WorkflowDefinition
  
  status        WorkflowStatus
  
  // NEW: Lifecycle fields
  deprecatedAfter   DateTime?
  forceCancelAfter  DateTime?
  
  // NEW: Requirements
  requiredSDKVersion   Int?
  requiredCapabilities String[]
  
  createdAt     DateTime @default(now())
  activatedAt   DateTime?
  deprecatedAt  DateTime?
  
  @@unique([tenantId, id, version])
  @@index([tenantId, status])
  @@index([contentHash])
}

model WorkflowExecution {
  executionId   String   @id @default(uuid())
  tenantId      String
  
  workflowId    String
  workflowVersion Int
  workflowHash  String
  
  status        ExecutionStatus
  currentStep   String?
  
  stateSnapshotRef String? // S3 reference
  
  startedAt     DateTime @default(now())
  completedAt   DateTime?
  
  activities    ActivityExecution[]
  events        ExecutionEvent[]
  
  @@index([tenantId, status])
  @@index([startedAt])
  @@index([workflowId, workflowVersion])
}

model ActivityExecution {
  id            BigInt   @id @default(autoincrement())
  
  executionId   String
  execution     WorkflowExecution @relation(fields: [executionId], references: [executionId])
  
  activityId    String
  attempt       Int
  
  status        ActivityStatus
  
  // Output stored in S3, versioned per attempt
  outputRef     String?
  
  errorMessage  String?
  errorRetryable Boolean?
  
  startedAt     DateTime @default(now())
  completedAt   DateTime?
  
  @@unique([executionId, activityId, attempt])
  @@index([executionId, status])
  @@index([startedAt])
}

model ExecutionEvent {
  id            BigInt   @id @default(autoincrement())
  
  executionId   String
  execution     WorkflowExecution @relation(fields: [executionId], references: [executionId])
  
  timestamp     DateTime @default(now())
  eventType     String
  payload       Json
  
  @@index([executionId, timestamp])
}

model SDKVersion {
  tenantId      String
  version       Int
  
  sourceType    String
  sourceHash    String
  
  codeRef       String   // S3 reference
  wasmRef       String?  // S3 reference to WASM
  
  allowedDomains String[]
  requiredCredentials String[]
  
  // NEW: Capabilities
  capabilities  String[]
  
  testResults   Json
  securityScan  Json
  
  status        SDKStatus
  
  createdAt     DateTime @default(now())
  activatedAt   DateTime?
  
  @@id([tenantId, version])
}

model TenantCredential {
  tenantId      String
  credentialName String
  
  vaultPath     String
  
  createdAt     DateTime @default(now())
  rotatedAt     DateTime?
  
  @@id([tenantId, credentialName])
}

// NEW: Control flags for operations
model SystemControlFlag {
  id          String   @id @default(uuid())
  
  scope       FlagScope
  scopeId     String?  // NULL for global
  
  flagType    FlagType
  enabled     Boolean  @default(true)
  
  reason      String?
  setBy       String
  
  createdAt   DateTime @default(now())
  expiresAt   DateTime?
  
  @@index([scope, scopeId, enabled])
}

enum TenantTier {
  FREE
  STANDARD
  ENTERPRISE
}

enum TenantStatus {
  ACTIVE
  SUSPENDED
  DELETED
}

enum WorkflowStatus {
  DRAFT
  ACTIVE
  DEPRECATED
}

enum ExecutionStatus {
  RUNNING
  PAUSED
  CANCELLING
  CANCELLED
  COMPLETED
  FAILED
}

enum ActivityStatus {
  RUNNING
  COMPLETED
  FAILED
}

enum SDKStatus {
  TESTING
  ACTIVE
  DEPRECATED
}

enum FlagScope {
  GLOBAL
  TENANT
  WORKFLOW
  SDK
}

enum FlagType {
  PAUSE
  BLOCK
  RATE_LIMIT
}
```

### Week 5-6: Tenant Management

**Deliverables:**

- [ ] Tenant onboarding API
- [ ] Schema-per-tenant provisioning
- [ ] Credential vault integration (HashiCorp Vault)
- [ ] Tenant context middleware

**Code:**

```typescript
// apps/control-plane/src/tenant/tenant.service.ts
@Injectable()
export class TenantService {
  async onboardTenant(input: {
    name: string;
    tier: TenantTier;
  }): Promise<Tenant> {
    // 1. Create tenant record
    const tenant = await this.prisma.tenant.create({
      data: {
        name: input.name,
        tier: input.tier,
        status: 'ACTIVE',
        ...this.getQuotasForTier(input.tier)
      }
    });
    
    // 2. Provision database schema
    await this.provisionTenantSchema(tenant.id);
    
    // 3. Create vault namespace
    await this.vault.createNamespace(`tenant-${tenant.id}`);
    
    // 4. Initialize default configurations
    await this.initializeTenantConfig(tenant.id);
    
    return tenant;
  }
  
  private async provisionTenantSchema(tenantId: string) {
    const schemaName = `tenant_${tenantId.replace(/-/g, '_')}`;
    
    // Create schema
    await this.prisma.$executeRawUnsafe(
      `CREATE SCHEMA IF NOT EXISTS "${schemaName}"`
    );
    
    // Set resource limits
    await this.prisma.$executeRawUnsafe(
      `ALTER ROLE tenant_${tenantId}_user SET statement_timeout = '30s'`
    );
    
    await this.prisma.$executeRawUnsafe(
      `ALTER ROLE tenant_${tenantId}_user SET work_mem = '64MB'`
    );
    
    // Run migrations in tenant schema
    await this.runTenantMigrations(schemaName);
  }
  
  private getQuotasForTier(tier: TenantTier) {
    const quotas = {
      FREE: {
        maxConcurrentWorkflows: 5,
        maxJobsPerHour: 100,
        maxConcurrentJobs: 3,
        maxStorageGB: 1
      },
      STANDARD: {
        maxConcurrentWorkflows: 50,
        maxJobsPerHour: 1000,
        maxConcurrentJobs: 20,
        maxStorageGB: 50
      },
      ENTERPRISE: {
        maxConcurrentWorkflows: 500,
        maxJobsPerHour: 10000,
        maxConcurrentJobs: 100,
        maxStorageGB: 500
      }
    };
    
    return quotas[tier];
  }
}
```

### Week 7-8: Queue Infrastructure

**Deliverables:**

- [ ] BullMQ setup with tier-based queues
- [ ] Worker process framework
- [ ] Job monitoring dashboard
- [ ] Rate limiting implementation

**Code:**

```typescript
// packages/queue/src/queue-manager.ts
export class QueueManager {
  private queues: Record<TenantTier, Queue>;
  private workers: Record<TenantTier, Worker>;
  
  constructor() {
    // Create tier-based queues
    this.queues = {
      FREE: new Queue('workflow-exec-free', {
        connection: redisConfig
      }),
      STANDARD: new Queue('workflow-exec-standard', {
        connection: redisConfig
      }),
      ENTERPRISE: new Queue('workflow-exec-enterprise', {
        connection: redisConfig
      })
    };
    
    // Create workers with different concurrency
    this.workers = {
      FREE: new Worker('workflow-exec-free', this.processJob, {
        connection: redisConfig,
        concurrency: 5,
        limiter: {
          max: 100,
          duration: 60000 // 100 jobs/min
        }
      }),
      STANDARD: new Worker('workflow-exec-standard', this.processJob, {
        connection: redisConfig,
        concurrency: 20,
        limiter: {
          max: 1000,
          duration: 60000
        }
      }),
      ENTERPRISE: new Worker('workflow-exec-enterprise', this.processJob, {
        connection: redisConfig,
        concurrency: 100,
        limiter: {
          max: 10000,
          duration: 60000
        }
      })
    };
  }
  
  async addWorkflowJob(
    tenantId: string,
    executionId: string,
    data: any
  ): Promise<Job> {
    // Get tenant tier
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId }
    });
    
    // NEW: Check capacity before enqueue
    const capacity = await this.getWorkerCapacity(tenant.tier);
    if (capacity.utilizationPercent > 90) {
      throw new Error('System at capacity, retry later');
    }
    
    // NEW: Check rate limit
    const allowed = await this.rateLimiter.consume(
      `tenant:${tenantId}:jobs`,
      1
    );
    if (!allowed) {
      throw new RateLimitError('Tenant job quota exceeded');
    }
    
    const queue = this.queues[tenant.tier];
    return queue.add('workflow-execution', {
      tenantId,
      executionId,
      ...data
    }, {
      jobId: `${tenantId}:${executionId}`, // Idempotency
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000
      }
    });
  }
  
  async getWorkerCapacity(tier: TenantTier) {
    const worker = this.workers[tier];
    const queue = this.queues[tier];
    
    const [active, waiting] = await Promise.all([
      queue.getActiveCount(),
      queue.getWaitingCount()
    ]);
    
    const concurrency = worker.opts.concurrency || 1;
    const maxQueueDepth = concurrency * 10;
    
    return {
      availableSlots: concurrency - active,
      queueDepth: waiting,
      maxQueueDepth,
      utilizationPercent: (active / concurrency) * 100
    };
  }
}
```

---

# Phase 2: Core Orchestration (Months 3-4)

## Objective

Build the durable workflow execution engine.

### Week 9-10: Workflow Executor

**Deliverables:**

- [ ] Workflow definition loader
- [ ] Activity dispatcher
- [ ] State persistence
- [ ] Idempotency handling

**Code:**

```typescript
// apps/worker/src/workflow/workflow-executor.ts
export class WorkflowExecutor {
  constructor(
    private stateStore: StateStore,
    private activityRegistry: ActivityRegistry,
    private queueManager: QueueManager,
    private objectStore: ObjectStore,
    private controlFlags: ControlFlagService
  ) {}
  
  async startWorkflow(
    tenantId: string,
    workflowId: string,
    workflowVersion: number,
    input: Record<string, any>
  ): Promise<string> {
    // NEW: Check control flags
    await this.controlFlags.checkFlags(tenantId, workflowId, null);
    
    // Load workflow definition
    const workflow = await this.loadWorkflow(workflowId, workflowVersion);
    
    // NEW: Validate compatibility
    await this.validateCompatibility(tenantId, workflow);
    
    // Create execution
    const executionId = uuidv4();
    const execution: WorkflowExecution = {
      executionId,
      tenantId,
      workflowId,
      workflowVersion,
      workflowHash: this.hashWorkflow(workflow),
      status: 'RUNNING',
      currentStep: null,
      stateSnapshotRef: null,
      startedAt: new Date()
    };
    
    // Persist
    await this.stateStore.saveExecution(execution);
    
    // Log event
    await this.stateStore.appendEvent({
      executionId,
      eventType: 'workflow_started',
      payload: { input }
    });
    
    // Schedule first activities
    await this.scheduleNextActivities(execution, workflow);
    
    return executionId;
  }
  
  async executeActivity(
    executionId: string,
    activityId: string
  ): Promise<void> {
    // Load execution
    const execution = await this.stateStore.loadExecution(executionId);
    
    // NEW: Check control flags before execution
    await this.controlFlags.checkFlags(
      execution.tenantId,
      execution.workflowId,
      null
    );
    
    // NEW: Handle pause/cancel
    if (execution.status === 'PAUSED') {
      // Reschedule for later
      await this.queueManager.addActivityJob(
        execution.tenantId,
        { executionId, activityId },
        { delay: 60000 } // Check again in 1 minute
      );
      return;
    }
    
    if (execution.status === 'CANCELLING') {
      execution.status = 'CANCELLED';
      await this.stateStore.saveExecution(execution);
      return;
    }
    
    // Check if already completed (idempotency)
    const existing = await this.stateStore.getActivityExecution(
      executionId,
      activityId
    );
    
    if (existing && existing.status === 'COMPLETED') {
      console.log(`Activity ${activityId} already completed`);
      return;
    }
    
    const attempt = (existing?.attempt || 0) + 1;
    
    // Load workflow definition
    const workflow = await this.loadWorkflow(
      execution.workflowId,
      execution.workflowVersion
    );
    
    // Verify workflow hash (prevents mutation bugs)
    if (this.hashWorkflow(workflow) !== execution.workflowHash) {
      throw new Error('Workflow definition mutated during execution');
    }
    
    const activityDef = workflow.activities.find(a => a.id === activityId);
    if (!activityDef) {
      throw new Error(`Activity ${activityId} not found`);
    }
    
    // Create tenant context
    const context = new TenantContext(execution.tenantId, executionId);
    
    try {
      // Record start
      await this.stateStore.saveActivityExecution({
        executionId,
        activityId,
        attempt,
        status: 'RUNNING',
        startedAt: new Date()
      });
      
      await this.stateStore.appendEvent({
        executionId,
        eventType: 'activity_started',
        payload: { activityId, attempt }
      });
      
      // Execute activity (DETERMINISTIC)
      const handler = this.activityRegistry.get(activityDef.type);
      
      // NEW: Pass execution context for deterministic helpers
      const executionContext: ExecutionContext = {
        tenantId: execution.tenantId,
        executionId: execution.executionId,
        now: () => execution.startedAt, // Deterministic time
        randomId: () => this.deterministicId(executionId, activityId)
      };
      
      const result = await handler.execute(
        activityDef.config,
        context,
        executionContext
      );
      
      // Store result in S3 (versioned per attempt)
      const outputRef = await this.storeOutput(
        execution.tenantId,
        executionId,
        activityId,
        attempt,
        result
      );
      
      // Record completion
      await this.stateStore.saveActivityExecution({
        executionId,
        activityId,
        attempt,
        status: 'COMPLETED',
        outputRef,
        startedAt: (await this.stateStore.getActivityExecution(executionId, activityId))!.startedAt,
        completedAt: new Date()
      });
      
      await this.stateStore.appendEvent({
        executionId,
        eventType: 'activity_completed',
        payload: { activityId, attempt, outputRef }
      });
      
      // Schedule next activities
      await this.scheduleNextActivities(execution, workflow);
      
    } catch (error) {
      const shouldRetry = await this.shouldRetry(activityDef, attempt);
      
      await this.stateStore.saveActivityExecution({
        executionId,
        activityId,
        attempt,
        status: 'FAILED',
        errorMessage: error.message,
        errorRetryable: shouldRetry,
        startedAt: (await this.stateStore.getActivityExecution(executionId, activityId))!.startedAt,
        completedAt: new Date()
      });
      
      await this.stateStore.appendEvent({
        executionId,
        eventType: 'activity_failed',
        payload: { activityId, attempt, error: error.message }
      });
      
      if (shouldRetry) {
        const delay = this.calculateBackoff(activityDef.retryPolicy, attempt);
        await this.queueManager.addActivityJob(
          execution.tenantId,
          { executionId, activityId },
          { delay }
        );
      } else {
        await this.failWorkflow(execution, error);
      }
    }
  }
  
  private async scheduleNextActivities(
    execution: WorkflowExecution,
    workflow: WorkflowDefinition
  ) {
    // Load all activity results
    const activityResults = await this.stateStore.getActivityExecutions(
      execution.executionId
    );
    
    // Find activities ready to run
    const readySteps = workflow.steps.filter(step => {
      // Check dependencies
      const depsCompleted = step.dependsOn.every(depId => {
        const result = activityResults.find(r => r.activityId === depId);
        return result?.status === 'COMPLETED';
      });
      
      // Check if already completed/running
      const result = activityResults.find(r => r.activityId === step.activityId);
      const notStarted = !result || result.status === 'FAILED';
      
      return depsCompleted && notStarted;
    });
    
    if (readySteps.length === 0) {
      // Check if workflow complete
      const allCompleted = workflow.steps.every(step => {
        const result = activityResults.find(r => r.activityId === step.activityId);
        return result?.status === 'COMPLETED';
      });
      
      if (allCompleted) {
        await this.completeWorkflow(execution);
      }
      
      return;
    }
    
    // Schedule activities
    for (const step of readySteps) {
      await this.queueManager.addActivityJob(
        execution.tenantId,
        {
          executionId: execution.executionId,
          activityId: step.activityId
        }
      );
    }
  }
  
  private async storeOutput(
    tenantId: string,
    executionId: string,
    activityId: string,
    attempt: number,
    data: any
  ): Promise<string> {
    // Store in S3, versioned per attempt
    const key = `tenants/${tenantId}/executions/${executionId}/activities/${activityId}/attempt-${attempt}.json`;
    
    await this.objectStore.put(key, JSON.stringify(data));
    
    return key;
  }
  
  private hashWorkflow(workflow: WorkflowDefinition): string {
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(workflow))
      .digest('hex');
  }
  
  private deterministicId(executionId: string, activityId: string): string {
    // Deterministic UUID based on execution + activity
    return crypto
      .createHash('sha256')
      .update(`${executionId}:${activityId}`)
      .digest('hex')
      .substring(0, 36);
  }
  
  // NEW: Validate workflow/SDK compatibility
  private async validateCompatibility(
    tenantId: string,
    workflow: WorkflowDefinition
  ) {
    if (workflow.requiredSDKVersion) {
      const sdk = await this.getActiveSDK(tenantId);
      
      if (sdk.version < workflow.requiredSDKVersion) {
        throw new Error(
          `Workflow requires SDK v${workflow.requiredSDKVersion}, ` +
          `but tenant has v${sdk.version}`
        );
      }
    }
    
    if (workflow.requiredCapabilities && workflow.requiredCapabilities.length > 0) {
      const sdk = await this.getActiveSDK(tenantId);
      const missing = workflow.requiredCapabilities.filter(
        cap => !sdk.capabilities.includes(cap)
      );
      
      if (missing.length > 0) {
        throw new Error(
          `Workflow requires capabilities: ${missing.join(', ')}`
        );
      }
    }
  }
}
```

### Week 11-12: Activity Registry

**Deliverables:**

- [ ] Activity handler framework
- [ ] Built-in activity types (extract, transform, load)
- [ ] Activity testing framework

**Code:**

```typescript
// apps/worker/src/activities/activity-registry.ts
export interface ActivityHandler {
  execute(
    config: Record<string, any>,
    context: TenantContext,
    executionContext: ExecutionContext
  ): Promise<any>;
}

export class ActivityRegistry {
  private handlers = new Map<string, ActivityHandler>();
  
  register(type: string, handler: ActivityHandler) {
    this.handlers.set(type, handler);
  }
  
  get(type: string): ActivityHandler {
    const handler = this.handlers.get(type);
    if (!handler) {
      throw new Error(`Activity handler not found: ${type}`);
    }
    return handler;
  }
}

// Example: ERP Extract Activity
export class ERPExtractActivity implements ActivityHandler {
  constructor(
    private sdkExecutor: WASMSDKExecutor,
    private credentialVault: VaultService
  ) {}
  
  async execute(
    config: {
      operation: string;
      params: Record<string, any>;
      // NEW: Idempotency config
      idempotencyKey?: string;
    },
    context: TenantContext,
    executionContext: ExecutionContext
  ): Promise<any> {
    // Get SDK
    const sdk = await this.getActiveSDK(context.tenantId);
    
    // Get credentials
    const credentials = await this.credentialVault.get(
      context.tenantId,
      'erp_credentials'
    );
    
    // NEW: Generate idempotency key if needed
    const idempotencyKey = config.idempotencyKey || 
      `${executionContext.executionId}:${config.operation}`;
    
    // Execute SDK operation in WASM
    const result = await this.sdkExecutor.execute(
      sdk.wasmRef,
      config.operation,
      {
        ...config.params,
        idempotencyKey // Pass to external API
      },
      credentials
    );
    
    return result;
  }
}
```

---

# Phase 3: AI & SDK Generation (Months 5-6)

## Objective

Implement AI-powered SDK generation and workflow creation.

### Week 13-14: SDK Generator

**Deliverables:**

- [ ] AI-powered documentation parser
- [ ] TypeScript SDK code generator
- [ ] WASM compilation pipeline
- [ ] SDK testing framework

**Code:**

```typescript
// apps/control-plane/src/sdk/sdk-generator.service.ts
@Injectable()
export class SDKGeneratorService {
  constructor(
    private anthropic: Anthropic,
    private compiler: WASMCompiler,
    private testRunner: SDKTestRunner,
    private securityScanner: SecurityScanner,
    private registry: SDKRegistry
  ) {}
  
  async generateSDK(
    tenantId: string,
    input: {
      documentation: string;
      sourceType: 'openapi' | 'documentation' | 'manual';
    }
  ): Promise<number> {
    // 1. Parse documentation with AI
    const schema = await this.parseDocumentation(input.documentation);
    
    // 2. Generate TypeScript SDK code
    const code = await this.generateCode(schema);
    
    // 3. Security scan
    const securityScan = await this.securityScanner.scan(code);
    if (!securityScan.passed) {
      throw new Error(`Security scan failed: ${securityScan.issues}`);
    }
    
    // 4. Compile to WASM
    const wasmBinary = await this.compiler.compile(code);
    
    // 5. Run tests
    const testResults = await this.testRunner.test(
      wasmBinary,
      schema.endpoints
    );
    
    if (testResults.some(t => !t.passed)) {
      throw new Error('SDK tests failed');
    }
    
    // 6. Store artifacts
    const version = await this.getNextVersion(tenantId);
    
    const codeRef = await this.uploadToS3(
      `tenants/${tenantId}/sdks/v${version}/sdk.ts`,
      code
    );
    
    const wasmRef = await this.uploadToS3(
      `tenants/${tenantId}/sdks/v${version}/sdk.wasm`,
      wasmBinary
    );
    
    // 7. Register SDK
    await this.registry.create({
      tenantId,
      version,
      sourceType: input.sourceType,
      sourceHash: this.hash(input.documentation),
      codeRef,
      wasmRef,
      allowedDomains: schema.allowedDomains,
      requiredCredentials: schema.requiredCredentials,
      capabilities: schema.capabilities, // NEW
      testResults,
      securityScan,
      status: 'TESTING'
    });
    
    return version;
  }
  
  private async parseDocumentation(documentation: string) {
    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: `Parse this API documentation and extract:
1. All endpoints
2. Authentication method
3. Request/response formats
4. Rate limits
5. Idempotency support

Documentation:
${documentation}

Return ONLY valid JSON with this structure:
{
  "endpoints": [
    {
      "method": "GET|POST|PUT|DELETE",
      "path": "/api/...",
      "description": "...",
      "parameters": [...],
      "response": {...},
      "supportsIdempotency": boolean
    }
  ],
  "authentication": {...},
  "baseUrl": "...",
  "allowedDomains": [...],
  "requiredCredentials": [...],
  "capabilities": ["bulkRead", "streaming", ...]
}
`
      }]
    });
    
    const jsonText = response.content[0].type === 'text' 
      ? response.content[0].text 
      : '';
    
    return JSON.parse(jsonText);
  }
  
  private async generateCode(schema: any): Promise<string> {
    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      messages: [{
        role: 'user',
        content: `Generate a TypeScript SDK for this API schema.
Requirements:
- Use fetch for HTTP calls
- Support idempotency keys
- Handle rate limiting
- Type-safe interfaces
- No external dependencies (can be compiled to WASM)

Schema:
${JSON.stringify(schema, null, 2)}

Generate complete, production-ready code.
`
      }]
    });
    
    const code = response.content[0].type === 'text'
      ? response.content[0].text
      : '';
    
    return code;
  }
}
```

### Week 15-16: Workflow AI Agent

**Deliverables:**

- [ ] AI workflow generator
- [ ] Table mapping assistant
- [ ] Workflow validation
- [ ] Chat interface

**Code:**

```typescript
// apps/control-plane/src/workflow/workflow-ai.service.ts
@Injectable()
export class WorkflowAIService {
  constructor(
    private anthropic: Anthropic,
    private validator: WorkflowValidator
  ) {}
  
  async generateWorkflow(
    tenantId: string,
    userIntent: string,
    context: {
      sourceSchema: any;
      targetSchema: any;
    }
  ): Promise<WorkflowDefinition> {
    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      system: `You are a workflow generation expert. 
Generate workflow definitions that are:
- Deterministic
- Idempotent
- Resumable
- Well-structured

Always include proper error handling and retry policies.`,
      messages: [{
        role: 'user',
        content: `Generate a workflow for: ${userIntent}

Source Schema:
${JSON.stringify(context.sourceSchema, null, 2)}

Target Schema:
${JSON.stringify(context.targetSchema, null, 2)}

Return ONLY valid JSON matching this structure:
{
  "name": "...",
  "description": "...",
  "activities": [
    {
      "id": "...",
      "type": "extract|transform|load",
      "config": {...},
      "sideEffect": boolean,
      "idempotencyStrategy": "none|request_id|custom",
      "retryPolicy": {
        "maxAttempts": 3,
        "initialInterval": 1000,
        "backoffCoefficient": 2,
        "maxInterval": 60000
      }
    }
  ],
  "steps": [
    {
      "id": "...",
      "activityId": "...",
      "dependsOn": [...]
    }
  ],
  "requiredCapabilities": [...]
}
`
      }]
    });
    
    const workflowJSON = JSON.parse(
      response.content[0].type === 'text' 
        ? response.content[0].text 
        : '{}'
    );
    
    // Validate
    const validation = await this.validator.validate(workflowJSON);
    if (!validation.valid) {
      throw new Error(`Invalid workflow: ${validation.errors}`);
    }
    
    // Create workflow definition
    const workflow: WorkflowDefinition = {
      id: uuidv4(),
      version: 1,
      ...workflowJSON
    };
    
    return workflow;
  }
}
```

---

# Phase 4: User Interface (Months 7-8)

## Objective

Build the drag-and-drop workflow designer and monitoring dashboard.

### Week 17-20: Workflow Designer

**Deliverables:**

- [ ] React Flow-based workflow builder
- [ ] Activity palette
- [ ] Property inspector
- [ ] AI chat assistant
- [ ] Real-time collaboration

**Tech Stack:**

```typescript
// Frontend
- React 18
- TypeScript
- React Flow (xyflow)
- Zustand (state)
- TanStack Query (data fetching)
- Socket.io client (real-time)
- shadcn/ui (components)
```

### Week 21-24: Monitoring Dashboard

**Deliverables:**

- [ ] Execution list view
- [ ] Execution detail view
- [ ] Activity timeline
- [ ] Error explorer
- [ ] Control panel (pause/cancel/resume)

---

# Phase 5: Production Hardening (Months 9-10)

## Objective

Add observability, security, and operational features.

### Week 25-26: Observability

**Deliverables:**

- [ ] Prometheus metrics
- [ ] Grafana dashboards
- [ ] Distributed tracing (OpenTelemetry)
- [ ] Structured logging
- [ ] Alert rules

### Week 27-28: Security

**Deliverables:**

- [ ] WASM SDK execution hardening
- [ ] Network egress filtering
- [ ] Credential rotation
- [ ] Audit logging
- [ ] SOC2 compliance prep

### Week 29-30: Operations

**Deliverables:**

- [ ] Control flag UI
- [ ] Tenant management UI
- [ ] Health checks
- [ ] Backup/restore procedures
- [ ] Disaster recovery plan

---

# Phase 6: Scale & Polish (Months 11-12)

## Objective

Optimize performance and prepare for scale.

### Week 31-34: Performance

**Deliverables:**

- [ ] Load testing (10K concurrent workflows)
- [ ] Database query optimization
- [ ] Redis optimization
- [ ] Worker autoscaling
- [ ] Cost optimization

### Week 35-38: Migration Preparation

**Deliverables:**

- [ ] Temporal integration design
- [ ] Data migration scripts
- [ ] A/B testing framework
- [ ] Rollback procedures

---

# Ongoing: Documentation & Training

**Throughout all phases:**

- [ ] API documentation (OpenAPI)
- [ ] User guides
- [ ] Video tutorials
- [ ] Developer documentation
- [ ] Runbooks

---

# Success Metrics

## MVP (Month 8)

- [ ] 5 beta customers
- [ ] 10 workflow executions/day
- [ ] 99% execution success rate
- [ ] <10s workflow start latency

## Production (Month 12)

- [ ] 50 paying customers
- [ ] 10K workflow executions/day
- [ ] 99.9% uptime
- [ ] <5s workflow start latency
- [ ] Support for 5 ERP types

## Scale (Month 18)

- [ ] 200+ customers
- [ ] 100K+ workflow executions/day
- [ ] 99.95% uptime
- [ ] Multi-region deployment
- [ ] Temporal migration complete

---

# Risk Mitigation

## Technical Risks

1. **WASM compilation complexity** → Fallback to sandboxed Node.js initially
2. **BullMQ scalability limits** → Temporal migration path ready
3. **AI hallucinations in SDK generation** → Human review workflow
4. **Multi-tenant noisy neighbor** → Tier-based isolation

## Business Risks

1. **MVP takes too long** → Phase 1-2 in 4 months max
2. **Customer adoption slow** → Free tier + excellent docs
3. **Competition** → Focus on AI-powered differentiation

---

# Final Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                         USERS                                │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                    WEB UI (React)                            │
│  • Workflow Designer (React Flow)                           │
│  • AI Chat Assistant                                         │
│  • Execution Monitoring                                      │
│  • Real-time Updates (Socket.io)                            │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│               CONTROL PLANE (NestJS)                         │
│  • REST + GraphQL API                                        │
│  • Auth (JWT)                                                │
│  • Tenant Management                                         │
│  • AI SDK Generation                                         │
│  • AI Workflow Generation                                    │
│  • Validation & Testing                                      │
└──────────────────────┬──────────────────────────────────────┘
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│ PostgreSQL  │ │   Vault     │ │     S3      │
│ (Metadata)  │ │(Credentials)│ │  (Artifacts)│
└─────────────┘ └─────────────┘ └─────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              QUEUE LAYER (BullMQ + Redis)                    │
│  • workflow-exec-free                                        │
│  • workflow-exec-standard                                    │
│  • workflow-exec-enterprise                                  │
└──────────────────────┬──────────────────────────────────────┘
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│Free Workers │ │Std Workers  │ │Ent Workers  │
│  (5 max)    │ │  (20 max)   │ │ (100 max)   │
└─────────────┘ └─────────────┘ └─────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                 ACTIVITY EXECUTION                           │
│  • ERP Extract (WASM SDK)                                    │
│  • Transform (Node streams)                                  │
│  • Load (Batch writes)                                       │
└──────────────────────┬──────────────────────────────────────┘
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│ PostgreSQL  │ │  Vault      │ │     S3      │
│(Tenant Data)│ │(Tenant Cred)│ │(Output Data)│
│Schema-per-  │ │             │ │             │
│tenant       │ │             │ │             │
└─────────────┘ └─────────────┘ └─────────────┘
```

---

# THE FINAL ANSWER

**Is this architecture perfect?**

No architecture is perfect. But after applying all the fixes from our discussions:

✅ **This is production-grade by 2025 standards** ✅ **Matches or exceeds Temporal/Airbyte/Zapier rigor** ✅ **Has explicit failure semantics** ✅ **Has operational escape hatches** ✅ **Can scale to 100K+ workflows/day**

**What you should build:** Follow the R&D plan above, prioritizing:

1. Months 1-4: Foundation + Orchestration (CRITICAL)
2. Months 5-6: AI Features (DIFFERENTIATOR)
3. Months 7-8: UI (USER ADOPTION)
4. Months 9-12: Production hardening

**Tech stack:** TypeScript everywhere, with WASM SDK execution and clear Temporal migration path.

**This plan will get you from zero to production in 12 months.**


**We need all of theese implemented:**
**There may be changes in development which we will do such as:**
- Our own ERP instead of Amazon s3 for storing data temporarily
- Replace HashiCorp Vault (Secrets manager) with another alternative or on a secure db
- Redux instead of Zustand (Zustand for easier and simple tests, in turn will change to redux)
- Model Choosing ability, currently the plan is created with just claude in mind, intime we will also plan the case by adding other models so the user can choose the model they can use (This feature can be a pro feature)
- Move some workers that handle huge Data to python instead of typescript (Currently the entire application is in type script)
- Bull MQ  (Background job processor similar to celery but for node.js).  To handle huge user set we will switch to Temporal (when customer size >100), the project will be made Temporal compatible from day 1 so the switch will cause little to no trouble.
- All the pieces like the ai integration and any places will be modular so as to be easily replaced or upgraded. 
- The entire application will be dockerized.

