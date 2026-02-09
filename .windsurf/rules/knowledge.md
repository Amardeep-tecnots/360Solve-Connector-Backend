---
trigger: always_on
---


# COMPLETE SYSTEM KNOWLEDGE SUMMARY

## The Problem We're Solving

**Business Context:**

- Building v2 of an ERP integration platform that connects company ERP systems to cloud databases
- v1 had a critical bug: shared global state caused one user's connection change to disconnect all other users
- v1 was built in .NET with Electron (desktop app)
- v2 needs to be web-based with AI capabilities to dynamically generate SDKs for any company's ERP system

**Core Innovation:** Instead of manually rebuilding connectors for each company, use AI to:

1. Parse company documentation/JSON
2. Generate type-safe SDK code
3. Compile to WASM for secure execution
4. Enable users to build workflows via drag-and-drop UI
5. Use AI chat assistant to help map tables and create workflows

---

## Architectural Evolution Through Our Discussion

### Initial Understanding (Claude's First Response)

- Proposed TypeScript for Control Plane (AI/orchestration)
- Suggested either TypeScript or Python for Data Plane
- Introduced Control vs Data Plane separation
- Recommended BullMQ initially, Temporal later
- Multi-tenant isolation via schema-per-tenant

**Key insight:** This is NOT just an "agentic AI app" - it's a **multi-tenant integration platform** that happens to use AI.

### First Correction (ChatGPT Round 1)

**What was right:**

- The conceptual architecture was sound
- Control/Data plane separation was correct
- TypeScript for AI layer was justified

**What was missing:**

1. **Durable workflow engine** - BullMQ alone isn't enough without proper state management
2. **SDK execution security** - Sandboxing was understated
3. **Multi-tenant isolation completeness** - Schema-per-tenant alone doesn't prevent resource starvation
4. **AI's role** - Should generate artifacts, not control runtime execution

**Critical reframing:** Different parts of the system need different languages. This is Zapier + Segment + Temporal + AI, not Claude/Cursor.

### Second Refinement (Claude's Response to Corrections)

**Accepted improvements:**

1. **Three-layer architecture:** Control Plane → Artifact Registry → Data Plane (not two layers)
2. **Workflow determinism model:** Explicit activity boundaries, externalized side effects, cached results
3. **Temporal-compatible from day 1:** Design BullMQ implementation to allow seamless Temporal migration
4. **SDK execution in WASM:** Not just Node VM, actual isolation via WebAssembly
5. **Activity output versioning:** Store outputs per attempt: `attempt-1.json`, `attempt-2.json`, etc.

**Enhanced database design:**

```sql
-- Separate mutable state from append-only history
workflow_executions (snapshot, fast reads)
workflow_execution_events (append-only audit)
activity_executions (per-attempt versioning)
```

**Queue topology improvement:**

```
workflow-exec-free (low priority, 5 workers)
workflow-exec-standard (medium priority, 20 workers)  
workflow-exec-enterprise (high priority, 100 workers)
```

### Third Correction (ChatGPT Round 2)

**Critical flaws identified:**

1. **Workflow history too heavy** - Array of events in memory is dangerous
    
    - Fix: Separate snapshot table from event log table
    - State snapshot stored in S3, not inline JSON
2. **Activity output not versioned per attempt** - Overwrites break determinism
    
    - Fix: `tenants/{id}/executions/{id}/activities/{id}/attempt-{n}.json`
3. **BullMQ fairness insufficient** - One tenant can starve others
    
    - Fix: Tier-based queue sharding + pre-enqueue rate limiting
    - Separate worker pools per tier with hard concurrency limits
4. **SDK execution security gaps** - Node VM insufficient
    
    - Fix: WASM (best), Firecracker (enterprise), gVisor (acceptable)
    - Network egress restrictions, resource quotas, credential isolation
5. **Workflow definition mutation bug** - User edits version without incrementing
    
    - Fix: Store `workflowHash` on execution, verify on load
6. **Missing cancellation semantics** - Can't pause/cancel/resume
    
    - Fix: Add `paused`, `cancelling`, `cancelled` states, check before each activity

### Fourth Refinement (Claude's "Final" Response)

**Locked in the complete architecture:**

**System Architecture (3 Planes + Isolation Layer):**

```
Control Plane (TypeScript/NestJS)
  ├─ Web UI (React)
  ├─ AI Agent (Anthropic SDK)
  ├─ SDK Generator
  ├─ Tenant Management
  └─ Real-time WebSocket

Artifact Registry (PostgreSQL + S3)
  ├─ Workflow Definitions (versioned, hashed)
  ├─ SDK Code (WASM modules)
  ├─ Mapping Configs
  └─ Schemas

Orchestration Layer (BullMQ → Temporal)
  ├─ Queue Topology (tier-based)
  ├─ State Management (PostgreSQL)
  ├─ Activity Results (S3)
  └─ Event Log (append-only)

Data Plane (Isolated Workers)
  ├─ Worker Pools (by tier)
  ├─ Activity Handlers
  ├─ WASM SDK Executor
  └─ Transform Engine

Tenant Isolation Layer
  ├─ Schema-per-tenant (PostgreSQL)
  ├─ Credential Vault (HashiCorp Vault)
  ├─ Object Storage (S3, per-tenant)
  └─ Rate Limiters (per-tenant quotas)
```

**Complete Database Schema:**

```sql
-- Artifacts
workflow_definitions (id, tenant_id, version, content_hash, definition, status, 
                      deprecated_after, force_cancel_after, 
                      required_sdk_version, required_capabilities)
sdk_versions (tenant_id, version, code_ref, wasm_ref, capabilities, 
              allowed_domains, test_results, security_scan)

-- Execution State
workflow_executions (execution_id, tenant_id, workflow_id, workflow_version, 
                     workflow_hash, status, current_step, state_snapshot_ref)
activity_executions (id, execution_id, activity_id, attempt, status, 
                     output_ref, error_message, error_retryable)
workflow_execution_events (id, execution_id, timestamp, event_type, payload)

-- Tenant Management
tenants (tenant_id, name, tier, max_concurrent_workflows, max_jobs_per_hour, 
         max_concurrent_jobs, max_storage_gb)
tenant_credentials (tenant_id, credential_name, vault_path)

-- Operations
system_control_flags (id, scope, scope_id, flag_type, enabled, reason)
```

**Technology Stack (Final):**

```yaml
Control Plane:
  Language: TypeScript
  Runtime: Node.js 20 LTS
  Framework: NestJS
  API: REST + GraphQL
  WebSocket: Socket.io
  Auth: Passport.js + JWT
  AI: @anthropic-ai/sdk

Orchestration:
  Phase 1: BullMQ + Redis + PostgreSQL
  Phase 2: Temporal (migration ready)
  Queue: Redis 7+
  State: PostgreSQL 15+

Data Plane:
  Workers: Node.js (TypeScript)
  SDK Execution: WASM (@wasmer/wasi)
  Transform: Node streams
  Heavy Transform (optional): Python with Polars

Data Layer:
  Primary DB: PostgreSQL 15+ (schema-per-tenant, PgBouncer)
  Object Storage: S3-compatible
  Secrets: HashiCorp Vault
  Cache: Redis 7+

Frontend:
  Framework: React 18 + TypeScript
  Workflow UI: React Flow (xyflow)
  State: Zustand
  Data: TanStack Query
  Real-time: Socket.io client
  UI: shadcn/ui

Infrastructure:
  Containers: Docker
  Orchestration: Kubernetes or AWS ECS
  Monitoring: Prometheus + Grafana
  Logging: Loki or ELK
  Tracing: OpenTelemetry
```

### Final Correction Round (ChatGPT Round 3)

**The last 6 gaps for true production-grade:**

1. **Explicit exactly-once semantics**
    
    - Document guarantees clearly
    - Add `idempotencyStrategy` to activity definitions
    - Validate at workflow compilation time
    
    ```typescript
    interface ActivityDefinition {
      sideEffect: boolean;
      idempotencyStrategy: 'none' | 'request_id' | 'custom';
      idempotencyKeyFn?: string;
    }
    ```
    
2. **Backpressure from Data Plane → Control Plane**
    
    - Check worker capacity before enqueue
    - Monitor queue depth
    - Reject gracefully when at capacity
    
    ```typescript
    interface SystemCapacity {
      availableSlots: number;
      queueDepth: number;
      maxQueueDepth: number;
      utilizationPercent: number;
    }
    ```
    
3. **Workflow version retirement policy**
    
    - Add `deprecatedAfter` and `forceCancelAfter` timestamps
    - Prevent new executions on retired versions
    - Warn on deprecated versions
    
    ```typescript
    interface WorkflowDefinition {
      deprecatedAfter?: Date;
      forceCancelAfter?: Date;
    }
    ```
    
4. **Deterministic time & randomness control**
    
    - Provide ExecutionContext with deterministic helpers
    - Optional (not enforced) for MVP
    
    ```typescript
    interface ExecutionContext {
      now(): Date; // Returns execution start time
      randomId(): string; // Seeded from executionId
    }
    ```
    
5. **Cross-artifact compatibility validation**
    
    - Validate workflow + SDK version compatibility
    - Check capabilities at activation time
    
    ```typescript
    interface WorkflowDefinition {
      requiredSDKVersion?: number;
      requiredCapabilities?: string[];
    }
    interface SDKVersion {
      capabilities: string[];
    }
    ```
    
6. **Operator-level kill switches**
    
    - System control flags for emergency operations
    - Global/tenant/workflow/SDK level pauses
    - Checked before enqueue and execution
    
    ```sql
    system_control_flags (
      scope ENUM('global','tenant','workflow','sdk'),
      scope_id UUID,
      flag_type ENUM('pause','block','rate_limit'),
      enabled BOOLEAN
    )
    ```
    

---

## Critical Design Decisions & Rationale

### Why TypeScript Over Python/C#?

**For Control Plane (Non-negotiable):**

- AI SDK ecosystem is TypeScript-first (Anthropic, OpenAI)
- Single language with frontend reduces context switching
- Excellent async/await for real-time WebSocket
- Event-driven architecture naturally fits Node.js

**For Data Plane (Pragmatic choice):**

- Start with TypeScript for simplicity
- Node.js handles I/O-heavy ERP API calls well
- Can add Python workers later if CPU-heavy transforms appear
- Most bottleneck is network I/O, not computation

**Why NOT .NET (despite v1 using it):**

- v2 is web-first, not desktop
- AI ecosystem is weaker in .NET
- Harder to hire for modern .NET
- Can keep .NET for specific workers if team insists

### Why WASM for SDK Execution?

**Security requirements:**

- Dynamically generated code executing against live ERP systems
- Attack surface: prototype pollution, infinite loops, crypto mining, SSRF, memory bombs

**WASM advantages:**

- Near-perfect isolation
- Deterministic execution
- No escape vectors without explicit host functions
- Fast execution
- Portable

**Alternatives considered:**

- Node VM/vm2: ❌ Insufficient isolation
- Firecracker: ✅ Best but operational overhead
- gVisor: ✅ Good balance
- WASM: ✅ **Recommended for MVP**

### Why BullMQ Then Temporal?

**BullMQ advantages:**

- Simpler to start
- Lower operational overhead
- Good enough for 0-100 customers
- Fast iteration during MVP

**BullMQ limitations:**

- No native workflow history
- No deterministic replay built-in
- No workflow versioning
- Have to build durability patterns manually

**Temporal advantages:**

- Production-grade workflow engine
- Built-in durability, replay, versioning
- Battle-tested at scale
- But: Higher operational complexity

**Strategy:**

- Start with BullMQ (Months 1-8)
- Design BullMQ implementation to be Temporal-compatible
- Migrate when >100 customers or complex workflows appear (Months 9-12)

### Why Schema-Per-Tenant?

**Alternatives considered:**

1. **Shared schema with tenant_id column:**
    
    - ❌ Weak isolation
    - ❌ One SQL injection = all data leaked
    - ❌ Hard to enforce quotas
2. **Database-per-tenant:**
    
    - ✅ Strongest isolation
    - ❌ Connection pool explosion
    - ❌ Expensive backups/migrations
3. **Schema-per-tenant:** ✅ **Chosen approach**
    
    - ✅ Strong isolation
    - ✅ Shared connection pools work
    - ✅ Per-tenant quotas enforceable
    - ✅ Can shard later if needed

**Additional isolation needed:**

- Tier-based queue sharding (prevents queue starvation)
- CPU/memory quotas (prevents resource starvation)
- Rate limiting (prevents API abuse)
- Network egress filtering (security)

---

## Core Architectural Patterns

### 1. Temporal-Compatible Workflow Model

**Key principle:** Even using BullMQ, model workflows like Temporal does.

```typescript
interface WorkflowDefinition {
  id: string;
  version: number;
  contentHash: string; // Prevents mutation bugs
  
  activities: ActivityDefinition[];
  steps: WorkflowStep[];
  retryPolicy: RetryPolicy;
  
  // Lifecycle
  deprecatedAfter?: Date;
  forceCancelAfter?: Date;
  
  // Compatibility
  requiredSDKVersion?: number;
  requiredCapabilities?: string[];
}

interface ActivityDefinition {
  id: string;
  type: 'extract' | 'transform' | 'load';
  config: Record<string, any>;
  
  // Determinism
  sideEffect: boolean;
  idempotencyStrategy: 'none' | 'request_id' | 'custom';
  
  retryPolicy: RetryPolicy;
  startToCloseTimeout: number;
}

interface WorkflowStep {
  id: string;
  activityId: string;
  dependsOn: string[]; // Activity IDs
  parallelGroup?: string;
}
```

**Why this matters:**

- Can migrate to Temporal by mapping these structures
- Deterministic replay is possible
- Audit trail built-in
- Versioning explicit

### 2. Activity Execution Pattern (Idempotent & Resumable)

```typescript
async executeActivity(executionId: string, activityId: string) {
  // 1. Load execution state
  const execution = await this.stateStore.loadExecution(executionId);
  
  // 2. Check control flags (can pause/cancel)
  await this.controlFlags.check(execution.tenantId, execution.workflowId);
  
  // 3. Handle pause/cancel
  if (execution.status === 'PAUSED') {
    await this.reschedule(executionId, activityId, 60000);
    return;
  }
  
  // 4. Check idempotency (already completed?)
  const existing = await this.stateStore.getActivityExecution(executionId, activityId);
  if (existing?.status === 'COMPLETED') {
    console.log('Already completed, skipping');
    return;
  }
  
  // 5. Verify workflow hash (prevents mutation bugs)
  const workflow = await this.loadWorkflow(execution.workflowId, execution.workflowVersion);
  if (this.hash(workflow) !== execution.workflowHash) {
    throw new Error('Workflow definition mutated');
  }
  
  // 6. Execute with tenant isolation
  const context = new TenantContext(execution.tenantId, executionId);
  const result = await handler.execute(config, context);
  
  // 7. Store output (versioned per attempt)
  const outputRef = await this.storeOutput(
    execution.tenantId,
    executionId,
    activityId,
    attempt,
    result
  );
  // Output stored at: tenants/{id}/executions/{id}/activities/{id}/attempt-{n}.json
  
  // 8. Record completion
  await this.stateStore.saveActivityExecution({
    executionId,
    activityId,
    attempt,
    status: 'COMPLETED',
    outputRef
  });
  
  // 9. Schedule next activities (DAG traversal)
  await this.scheduleNextActivities(execution, workflow);
}
```

**Properties achieved:**

- ✅ Idempotent (can retry safely)
- ✅ Resumable (survives crashes)
- ✅ Deterministic (same inputs → same outputs)
- ✅ Auditable (all events logged)

### 3. Tenant Isolation Pattern

**Database isolation:**

```typescript
class TenantDatabaseManager {
  async getConnection(tenantId: string): Promise<Connection> {
    return await this.pool.connect({
      searchPath: `tenant_${tenantId}`,
      statementTimeout: 30000
    });
  }
  
  async onboardTenant(tenantId: string) {
    await db.query(`CREATE SCHEMA tenant_${tenantId}`);
    await this.runMigrations(`tenant_${tenantId}`);
    await db.query(`ALTER ROLE tenant_${tenantId}_user SET statement_timeout = '30s'`);
    await db.query(`ALTER ROLE tenant_${tenantId}_user SET work_mem = '64MB'`);
  }
}
```

**Queue isolation:**

```typescript
class TenantAwareQueue {
  async addJob(tenantId: string, data: any) {
    const tier = await this.getTenantTier(tenantId);
    
    // 1. Check capacity (backpressure)
    const capacity = await this.getWorkerCapacity(tier);
    if (capacity.utilizationPercent > 90) {
      throw new Error('System at capacity');
    }
    
    // 2. Check rate limit
    const allowed = await this.rateLimiter.consume(`tenant:${tenantId}:jobs`, 1);
    if (!allowed) {
      throw new RateLimitError('Quota exceeded');
    }
    
    // 3. Enqueue to tier-specific queue
    const queue = this.queues[tier]; // separate queue per tier
    return queue.add(data, {
      jobId: `${tenantId}:${data.id}`, // idempotency
      group: { id: tenantId, limit: tenant.maxConcurrentJobs }
    });
  }
}
```

**Resource quotas:**

```typescript
interface TenantQuotas {
  maxConcurrentWorkflows: number;
  maxJobsPerHour: number;
  maxConcurrentJobs: number;
  maxMemoryMB: number;
  maxStorageGB: number;
  maxAPICallsPerMinute: number;
}

// Quotas by tier
const QUOTAS = {
  FREE: { maxConcurrentWorkflows: 5, maxJobsPerHour: 100, ... },
  STANDARD: { maxConcurrentWorkflows: 50, maxJobsPerHour: 1000, ... },
  ENTERPRISE: { maxConcurrentWorkflows: 500, maxJobsPerHour: 10000, ... }
};
```

### 4. SDK Generation & Execution Pipeline

**Generation:**

```typescript
async generateSDK(tenantId: string, documentation: string) {
  // 1. Parse with AI
  const schema = await this.parseWithAI(documentation);
  
  // 2. Generate TypeScript code
  const code = await this.generateCode(schema);
  
  // 3. Security scan
  const scan = await this.securityScanner.scan(code);
  if (!scan.passed) throw new Error('Security scan failed');
  
  // 4. Compile to WASM
  const wasm = await this.compiler.compile(code);
  
  // 5. Test in sandbox
  const tests = await this.testRunner.test(wasm, schema.endpoints);
  if (tests.some(t => !t.passed)) throw new Error('Tests failed');
  
  // 6. Store artifacts
  const version = await this.getNextVersion(tenantId);
  const codeRef = await this.s3.put(`tenants/${tenantId}/sdks/v${version}/sdk.ts`, code);
  const wasmRef = await this.s3.put(`tenants/${tenantId}/sdks/v${version}/sdk.wasm`, wasm);
  
  // 7. Register
  await this.registry.create({
    tenantId, version, codeRef, wasmRef,
    capabilities: schema.capabilities,
    allowedDomains: schema.allowedDomains,
    status: 'TESTING'
  });
  
  return version;
}
```

**Execution (WASM):**

```typescript
class WASMSDKExecutor {
  async execute(
    wasmRef: string,
    operation: string,
    params: any,
    credentials: any
  ) {
    // Load WASM binary
    const wasmBinary = await this.s3.get(wasmRef);
    
    // Create WASI environment
    const wasi = new WASI({
      args: [operation, JSON.stringify(params)],
      env: { CREDENTIALS: JSON.stringify(credentials) },
      preopens: {}, // No filesystem access
      returnOnExit: true
    });
    
    // Create import object with explicit host functions
    const importObject = {
      wasi_snapshot_preview1: wasi.wasiImport,
      env: {
        // Only allowed HTTP to specific domains
        http_request: this.createHTTPHostFunction(allowedDomains)
      }
    };
    
    // Instantiate and run
    const { instance } = await WebAssembly.instantiate(wasmBinary, importObject);
    wasi.start(instance);
    
    return instance.exports.execute();
  }
  
  private createHTTPHostFunction(allowedDomains: string[]) {
    return (url: string, method: string, body: string) => {
      const domain = new URL(url).hostname;
      if (!allowedDomains.includes(domain)) {
        throw new Error(`Domain not allowed: ${domain}`);
      }
      // Proceed with HTTP call...
    };
  }
}
```

**Security properties:**

- ✅ Process isolation (WASM sandbox)
- ✅ Network egress filtering (explicit host functions)
- ✅ Resource limits (WASI)
- ✅ No filesystem access
- ✅ Deterministic execution

### 5. AI as Artifact Compiler Pattern

**Key principle:** AI generates artifacts that are validated, tested, and versioned. AI never executes production logic.

```typescript
class AIArtifactCompiler {
  async generateWorkflow(userIntent: string, context: any): Promise<WorkflowDefinition> {
    // 1. AI generates workflow definition
    const workflowJSON = await this.callAI(userIntent, context);
    
    // 2. Validate
    const validation = await this.validator.validate(workflowJSON);
    if (!validation.valid) throw new Error('Invalid workflow');
    
    // 3. Create versioned artifact
    const workflow: WorkflowDefinition = {
      id: uuidv4(),
      version: 1,
      contentHash: this.hash(workflowJSON),
      ...workflowJSON
    };
    
    // 4. Test in sandbox
    const testResult = await this.testWorkflow(workflow);
    if (!testResult.passed) throw new Error('Test failed');
    
    // 5. Store as DRAFT
    await this.registry.saveDraft(workflow);
    
    // 6. Activate (requires explicit user action)
    // await this.registry.activate(workflow.id, workflow.version);
    
    return workflow;
  }
}
```

**Execution uses artifacts, not AI:**

```typescript
async executeWorkflow(executionId: string) {
  // Load workflow DEFINITION (artifact), not AI
  const execution = await this.stateStore.loadExecution(executionId);
  const workflow = await this.artifactRegistry.get(
    execution.workflowId,
    execution.workflowVersion
  );
  
  // Verify hash (AI cannot mutate mid-execution)
  if (this.hash(workflow) !== execution.workflowHash) {
    throw new Error('Artifact mutated');
  }
  
  // Execute deterministically
  await this.executor.execute(workflow, execution);
}
```

**Property achieved:**

> If Anthropic is down for 48 hours, production continues unaffected.

### 6. Control Flags for Operations

```typescript
class ControlFlagService {
  async checkFlags(tenantId: string, workflowId: string, sdkVersion?: number) {
    // Check in order: global → tenant → workflow → SDK
    
    // Global pause (maintenance mode)
    const globalPause = await this.db.findOne({
      scope: 'global',
      scopeId: null,
      flagType: 'pause',
      enabled: true
    });
    if (globalPause) throw new SystemPausedError('Maintenance mode');
    
    // Tenant pause (customer requested pause)
    const tenantPause = await this.db.findOne({
      scope: 'tenant',
      scopeId: tenantId,
      flagType: 'pause',
      enabled: true
    });
    if (tenantPause) throw new TenantPausedError('Tenant paused');
    
    // Workflow block (bug discovered)
    const workflowBlock = await this.db.findOne({
      scope: 'workflow',
      scopeId: workflowId,
      flagType: 'block',
      enabled: true
    });
    if (workflowBlock) throw new WorkflowBlockedError('Workflow blocked');
    
    // SDK revoke (security issue)
    if (sdkVersion) {
      const sdkRevoke = await this.db.findOne({
        scope: 'sdk',
        scopeId: `${tenantId}:${sdkVersion}`,
        flagType: 'block',
        enabled: true
      });
      if (sdkRevoke) throw new SDKRevokedError('SDK revoked');
    }
  }
}
```

**Usage:**

```typescript
// Before enqueue
await controlFlags.checkFlags(tenantId, workflowId);

// Before activity execution
await controlFlags.checkFlags(execution.tenantId, execution.workflowId, sdkVersion);
```

---

## Complete R&D Timeline (12 Months)

### Phase 1: Foundation (Months 1-2)

**Goal:** Build core infrastructure with tenant isolation

**Week 1-2: Project Setup**

- Monorepo (NX/Turborepo)
- TypeScript config
- Docker dev environment
- CI/CD (GitHub Actions)

**Week 3-4: Database Foundation**

- Complete schema implementation
- Prisma/TypeORM migrations
- Schema-per-tenant provisioning
- PgBouncer connection pooling

**Week 5-6: Tenant Management**

- Onboarding API
- Vault integration (credentials)
- Tenant context middleware
- Quota system

**Week 7-8: Queue Infrastructure**

- BullMQ setup (tier-based queues)
- Worker process framework
- Rate limiting
- Monitoring dashboard

### Phase 2: Core Orchestration (Months 3-4)

**Goal:** Build durable workflow execution engine

**Week 9-10: Workflow Executor**

- Workflow definition loader
- Activity dispatcher
- State persistence (PostgreSQL + S3)
- Idempotency handling

**Week 11-12: Activity Registry**

- Activity handler framework
- Built-in activities (extract, transform, load)
- Testing framework
- Retry logic

### Phase 3: AI & SDK Generation (Months 5-6)

**Goal:** Implement AI-powered SDK generation

**Week 13-14: SDK Generator**

- AI documentation parser (Claude)
- TypeScript code generator
- WASM compilation pipeline
- Security scanner + test runner

**Week 15-16: Workflow AI Agent**

- AI workflow generator
- Table mapping assistant
- Workflow validation
- Chat interface backend

### Phase 4: User Interface (Months 7-8)

**Goal:** Build workflow designer and monitoring

**Week 17-20: Workflow Designer**

- React Flow-based builder
- Activity palette
- Property inspector
- AI chat UI
- Real-time collaboration (Socket.io)

**Week 21-24: Monitoring Dashboard**

- Execution list view
- Detail view with timeline
- Error explorer
- Control panel (pause/cancel/resume)

### Phase 5: Production Hardening (Months 9-10)

**Goal:** Add observability and security

**Week 25-26: Observability**

- Prometheus metrics
- Grafana dashboards
- OpenTelemetry tracing
- Structured logging (ELK/Loki)
- Alert rules

**Week 27-28: Security**

- WASM execution hardening
- Network egress filtering
- Credential rotation
- Audit logging
- SOC2 prep

**Week 29-30: Operations**

- Control flag UI
- Tenant management UI
- Health checks
- Backup/restore
- Disaster recovery plan

### Phase 6: Scale & Polish (Months 11-12)

**Goal:** Optimize and prepare for scale

**Week 31-34: Performance**

- Load testing (10K concurrent workflows)
- Database optimization
- Redis optimization
- Worker autoscaling
- Cost optimization

**Week 35-38: Temporal Migration Prep**

- Temporal integration design
- Data migration scripts
- A/B testing framework
- Rollback procedures

---

## Success Metrics

### MVP (Month 8)

- 5 beta customers
- 10 workflow executions/day
- 99% execution success rate
- <10s workflow start latency
- Basic monitoring

### Production (Month 12)

- 50 paying customers
- 10K workflow executions/day
- 99.9% uptime
- <5s workflow start latency
- Support 5+ ERP types
- Full observability

### Scale (Month 18)

- 200+ customers
- 100K+ workflow executions/day
- 99.95% uptime
- Multi-region deployment
- Temporal migration complete
- Support 20+ ERP types

---

## Key Technical Constraints & Trade-offs

### 1. BullMQ vs Temporal

**BullMQ (Months 0-8):**

- ✅ Simpler to start
- ✅ Lower overhead
- ✅ Fast MVP iteration
- ❌ No native workflow engine
- ❌ Manual durability patterns

**Temporal (Months 9+):**

- ✅ Production-grade workflows
- ✅ Built-in durability
- ✅ Battle-tested at scale
- ❌ Higher complexity
- ❌ Operational overhead

**Migration strategy:** Design BullMQ to be Temporal-compatible from day 1

### 2. TypeScript vs Python vs .NET

**TypeScript (chosen):**

- ✅ Single language across stack
- ✅ Best AI SDK support
- ✅ Great for I/O-heavy workloads
- ✅ Event-driven architecture
- ❌ Weaker for CPU-heavy transforms

**Python (add later if needed):**

- ✅ Better for heavy data processing
- ✅ Temporal Python SDK
- ✅ Pandas/Polars
- ❌ Two languages to maintain

**.NET (legacy choice):**

- ✅ Team familiarity
- ✅ Performance
- ❌ Weaker AI ecosystem
- ❌ Harder to hire for

**Decision:** Start TypeScript everywhere, add Python workers only if bottlenecks appear

### 3. WASM vs Firecracker vs Node VM

**WASM (chosen):**

- ✅ Near-perfect isolation
- ✅ Deterministic execution
- ✅ Portable
- ✅ Fast
- ❌ Need compilation step

**Firecracker:**

- ✅ Best isolation
- ❌ Operational overhead
- Use for enterprise tier later

**Node VM:**

- ❌ Insufficient isolation
- Don't use for production

### 4. Schema-per-tenant vs DB-per-tenant vs Shared

**Schema-per-tenant (chosen):**

- ✅ Strong isolation
- ✅ Manageable connection pools
- ✅ Per-tenant quotas
- ✅ Can shard later

**DB-per-tenant:**

- ✅ Strongest isolation
- ❌ Connection pool explosion
- ❌ Expensive operations

**Shared schema:**

- ❌ Weak isolation
- ❌ Security risks
- Don't use

---

## Critical Production Requirements Checklist

After all refinements, the system MUST have:

✅ **Crash-safe execution**

- Activity executions are idempotent
- State persisted after each step
- Can resume from last checkpoint

✅ **Tenant isolation**

- Schema-per-tenant database
- Tier-based queue sharding
- Resource quotas enforced
- Credential vaulting

✅ **Security**

- WASM SDK execution
- Network egress filtering
- Credential rotation support
- Audit logging

✅ **Determinism**

- Activity boundaries for side effects
- Results cached per execution
- Workflow hash verification
- Deterministic time/random helpers

✅ **Observability**

- Structured logging
- Distributed tracing
- Metrics (Prometheus)
- Dashboards (Grafana)

✅ **Operability**

- Pause/cancel/resume workflows
- Control flags (global/tenant/workflow/SDK)
- Health checks
- Rollback procedures

✅ **Scalability**

- Horizontal worker scaling
- Queue sharding by tier
- Database read replicas
- Object storage for large outputs

✅ **AI Safety**

- AI generates artifacts, not runtime code
- Artifacts validated before execution
- System works if AI is down
- Versioned and immutable artifacts

✅ **Migration Path**

- Temporal-compatible workflow model
- Can swap orchestration engines
- No artifact rewrite needed

✅ **Business Continuity**

- Exactly-once semantics documented
- Backpressure signals implemented
- Version retirement policies
- Cross-artifact compatibility validation

---

## What Makes This Architecture "Perfect" (By 2025 Standards)

After all corrections and refinements:

1. **Matches industry leaders:** Comparable to Temporal + Airbyte + Zapier design rigor
    
2. **Avoids distributed systems traps:**
    
    - No shared mutable state
    - No hidden global singletons
    - Explicit failure semantics
    - Tenant fairness enforced
3. **Has operational escape hatches:**
    
    - Control flags for emergency ops
    - Pause/cancel/resume support
    - Rollback mechanisms
    - Clear troubleshooting paths
4. **Provides explicit guarantees:**
    
    - Exactly-once semantics documented
    - Idempotency requirements enforced
    - SLA targets defined
5. **Enables safe evolution:**
    
    - Workflow versioning with retirement
    - SDK compatibility validation
    - Temporal migration path
    - Artifact immutability

**What this means:** After Phase 5 (Month 10), failures will be boring operational issues (bad integrations, user errors, business logic bugs), NOT platform failures.

---

## The One-Sentence Summary

**Build a TypeScript-based multi-tenant integration platform with AI-generated WASM SDKs, durable workflow execution, proper tenant isolation, and a clear Temporal migration path - treating AI as an artifact compiler, not a runtime controller.**

---

## Next Immediate Action

**Start with:** Phase 1, Week 1-2 (Project Setup)

- Set up monorepo
- Configure TypeScript + Docker
- Initialize PostgreSQL + Redis(docker exists)
- Set up CI/CD pipeline

**First milestone (Month 2):** Working tenant onboarding with schema-per-tenant isolation and basic BullMQ queue system.

**This knowledge summary contains everything needed to build a production-grade ERP integration platform that will survive real-world use at scale.**