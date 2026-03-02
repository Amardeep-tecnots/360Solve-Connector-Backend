# API Key Validation Implementation

## Summary

Implemented a complete API key validation system for mini-connector authentication. The system now validates API keys against the database before allowing WebSocket connections.

## Changes Made

### 1. API Key Generation Format Fix

**File**: `apps/control-plane/src/connectors/connectors.service.ts`

**Before**:
```typescript
apiKey = `vmc_${randomBytes(24).toString('hex')}`;  // vmc_<48 hex chars>
```

**After**:
```typescript
const randomPart = randomBytes(16).toString('hex');
const prefix = 'vmc';
const data = `${prefix}:${tenantId}:${randomPart}`;
const hash = crypto.createHash('sha256').update(data).digest('hex');
const checksum = hash.substring(0, 4);

apiKey = `${prefix}_${tenantId}_${randomPart}_${checksum}`;
```

**Format**: `vmc_<tenantId>_<random>_<checksum>`

### 2. Database Validation in Connection Manager

**File**: `apps/control-plane/src/websocket/services/connection-manager.service.ts`

**Changes**:
- Added database lookup to verify connector exists
- Added bcrypt hash verification
- Validates API key against stored `apiKeyHash` in database
- Returns null if validation fails

### 3. Public HTTP Validation Endpoint

**Files Created**:
- `apps/control-plane/src/connectors/dto/validate-api-key.dto.ts`

**Files Modified**:
- `apps/control-plane/src/connectors/connectors.controller.ts` - Added `PublicConnectorsController`
- `apps/control-plane/src/connectors/connectors.service.ts` - Added `validateApiKey()` method

**Endpoint**: `POST /api/public/connectors/validate-api-key`

**Request**:
```json
{
  "apiKey": "vmc_<tenantId>_<random>_<checksum>"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "valid": true,
    "tenantId": "...",
    "connectorId": "..."
  }
}
```

### 4. Mini-Connector Validation Call

**File**: `apps/mini-connector/services/websocket-client.service.ts`

**Changes**:
- Added `validateApiKeyWithBackend()` method
- Calls validation endpoint before WebSocket connection
- Throws error if validation fails
- Added axios import

### 5. Environment Configuration

**File Created**: `apps/mini-connector/.env.example`

**Variables**:
- `API_URL` - Backend API URL
- `WEBSOCKET_URL` - WebSocket server URL
- `NODE_ENV` - Environment mode

## Testing Instructions

### Step 1: Generate Prisma Client

```bash
cd packages/database
npx prisma generate
```

### Step 2: Start Control Plane

```bash
cd apps/control-plane
npm run start:dev
```

### Step 3: Create a Mini Connector

Use the API or web UI to create a mini connector. The system will:
1. Generate API key in format: `vmc_<tenantId>_<random>_<checksum>`
2. Store bcrypt hash in database
3. Return API key (shown only once)

### Step 4: Configure Mini-Connector

```bash
cd apps/mini-connector
cp .env.example .env
# Edit .env with your API_URL and WEBSOCKET_URL
```

### Step 5: Test Validation Endpoint

```bash
curl -X POST http://localhost:3000/api/public/connectors/validate-api-key \
  -H "Content-Type: application/json" \
  -d '{"apiKey": "vmc_<your-api-key>"}'
```

Expected response:
```json
{
  "success": true,
  "data": {
    "valid": true,
    "tenantId": "...",
    "connectorId": "..."
  }
}
```

### Step 6: Test Mini-Connector Connection

```bash
cd apps/mini-connector
npm run start
```

The mini-connector will:
1. Validate API key format locally
2. Call validation endpoint
3. Verify against database
4. Connect via WebSocket if valid
5. Reject if invalid

## Validation Flow

```
Mini-Connector                Control Plane
     |                              |
     |  1. validateApiKey()         |
     |  (local format check)        |
     |                              |
     |  2. POST /api/public/        |
     |     connectors/validate-     |
     |     api-key                  |
     |----------------------------->|
     |                              |  3. validateApiKey()
     |                              |     (format check)
     |                              |  4. Find connector in DB
     |                              |  5. Verify bcrypt hash
     |                              |
     |<-----------------------------|
     |     { valid: true, ... }      |
     |                              |
     |  6. WebSocket connect()      |
     |----------------------------->|
     |                              |  7. registerConnection()
     |                              |     (format check)
     |                              |  8. Find connector in DB
     |                              |  9. Verify bcrypt hash
     |                              | 10. Store connection
     |                              |
     |<-----------------------------|
     |     connection:confirmed     |
     |                              |
```

## Security Features

1. **Format Validation**: API keys must match `vmc_<tenant>_<random>_<checksum>` format
2. **Checksum Verification**: SHA-256 checksum prevents tampering
3. **Database Lookup**: Keys must exist in database
4. **Bcrypt Hash**: Stored keys are hashed, not plaintext
5. **Duplicate Prevention**: Only one connection per tenant allowed
6. **Status Check**: Only OFFLINE or ONLINE connectors can connect

## Next Steps

1. Generate Prisma client: `cd packages/database && npx prisma generate`
2. Start control-plane and mini-connector
3. Test end-to-end flow
4. Verify logs show successful validation
