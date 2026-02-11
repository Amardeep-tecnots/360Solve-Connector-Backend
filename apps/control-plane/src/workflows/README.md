# Workflows Module

## Overview

The Workflows module provides a complete CRUD API for workflow definitions with validation, versioning, and activity configuration support. This is the foundation for the workflow execution engine.

## Features

- **Workflow CRUD Operations**: Create, read, update, and delete workflow definitions
- **DAG Validation**: Detects circular dependencies in workflow steps
- **Aggregator Verification**: Validates that referenced aggregator instances exist and are accessible
- **Auto-Versioning**: Creates new versions when workflow definition changes
- **Hash Tracking**: SHA-256 hash for immutability tracking
- **Safety Checks**: Prevents deletion when executions are running
- **Schedule Validation**: Validates cron expression format

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/workflows` | List all workflows for tenant |
| GET | `/api/workflows/:id` | Get workflow by ID |
| POST | `/api/workflows` | Create new workflow |
| PUT | `/api/workflows/:id` | Update workflow (auto-versions on definition change) |
| DELETE | `/api/workflows/:id` | Delete workflow (fails if executions running) |
| POST | `/api/workflows/validate` | Validate workflow definition without saving |

## Architecture

```
workflows/
├── entities/
│   └── workflow-definition.types.ts    # TypeScript interfaces
├── dto/
│   ├── create-workflow.dto.ts          # POST request body
│   ├── update-workflow.dto.ts          # PUT request body
│   ├── workflow-definition.dto.ts       # Activity configurations
│   └── workflow-response.dto.ts        # API response wrappers
├── services/
│   ├── workflow-validation.service.ts  # DAG & config validation
│   └── workflow-validation.service.spec.ts  # Unit tests
├── workflows.controller.ts              # REST API endpoints
├── workflows.service.ts                # Business logic & CRUD
└── workflows.module.ts                 # Module configuration
```

## Workflow Definition Structure

```typescript
{
  version: "1.0",
  activities: [
    {
      id: "extract-customers",
      type: "extract",
      name: "Extract Customers",
      config: {
        aggregatorInstanceId: "ai-123",
        table: "customers",
        columns: ["id", "name", "email"]
      }
    },
    {
      id: "transform-data",
      type: "transform",
      name: "Transform Data",
      config: {
        code: "return data.map(r => ({ ...r, name: r.name.toUpperCase() }))"
      }
    },
    {
      id: "load-analytics",
      type: "load",
      name: "Load to Analytics",
      config: {
        aggregatorInstanceId: "ai-456",
        table: "dim_customers",
        mode: "upsert",
        conflictKey: "customer_id"
      }
    }
  ],
  steps: [
    { id: "step1", activityId: "extract-customers", dependsOn: [] },
    { id: "step2", activityId: "transform-data", dependsOn: ["step1"] },
    { id: "step3", activityId: "load-analytics", dependsOn: ["step2"] }
  ]
}
```

## Usage Examples

### Create a Workflow

```bash
POST /api/workflows
Authorization: Bearer <jwt_token>

{
  "name": "Sync Customers",
  "description": "Daily sync from production to analytics",
  "definition": {
    "version": "1.0",
    "activities": [...],
    "steps": [...]
  },
  "isActive": true,
  "schedule": "0 2 * * *"
}
```

### Validate a Workflow

```bash
POST /api/workflows/validate
Authorization: Bearer <jwt_token>

{
  "version": "1.0",
  "activities": [...],
  "steps": [...]
}
```

Response:
```json
{
  "success": true,
  "data": {
    "valid": true,
    "errors": [],
    "warnings": ["Aggregator 'MySQL' does not have 'write' capability"],
    "activitiesChecked": 3,
    "aggregatorsVerified": ["MySQL", "PostgreSQL"]
  }
}
```

## Important Notes

### Prisma Client Generation Required

The TypeScript errors you're seeing are expected because Prisma hasn't been regenerated yet. Run:

```bash
cd packages/database
npx prisma generate
```

This will generate the Prisma client with the `workflowDefinition`, `workflowExecution`, and `aggregatorInstance` models.

### Versioning Behavior

- Updating `name`, `description`, `isActive`, or `schedule` → Updates in place (no version bump)
- Updating `definition` → Creates new version (version increments, new hash)

### Dependencies

- Requires `AggregatorInstance` to exist and be accessible
- Requires `WorkflowExecution` model for safety checks
- Uses existing guards: `JwtAuthGuard`, `TenantMemberGuard`
- Uses existing decorator: `@TenantId()`

## Next Steps

After this module is complete and Prisma is regenerated:

1. **Workflow Execution Engine** - Trigger and track executions
2. **Activity Handlers** - Extract, Transform, Load implementations  
3. **Mini Connector WebSocket Gateway** - Real-time connector communication
4. **Scheduler Service** - Cron-based workflow triggering

## Testing

Run tests:
```bash
npm test -- workflow-validation.service.spec.ts
```

Test coverage includes:
- DAG cycle detection
- Aggregator instance verification
- Missing dependency detection
- Capability warnings
- Cron validation
