# VanSales Connector v2 - Setup Guide

## Prerequisites

Before starting, ensure you have the following installed:

- Node.js 20 LTS or later
- npm or yarn
- PostgreSQL 15+ (or use Docker)
- Redis 7+ (or use Docker)
- MinIO or S3-compatible storage (or use Docker)

---

## Quick Start (Docker)

### 1. Start Infrastructure Services

```bash
# Start PostgreSQL, Redis, and MinIO
docker-compose up -d

# Verify services are running
docker-compose ps
```

### 2. Install Dependencies

```bash
# Install control-plane dependencies
cd apps/control-plane
npm install

# Install mini-connector dependencies
cd ../mini-connector
npm install
```

### 3. Setup Environment Variables

Create `.env` file in `apps/control-plane/`:

```env
# Database
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/vansales"

# Redis
REDIS_HOST="localhost"
REDIS_PORT="6379"

# S3/MinIO
S3_ENDPOINT="http://localhost:9000"
S3_ACCESS_KEY="minioadmin"
S3_SECRET_KEY="minioadmin"
S3_BUCKET="vansales-connector"

# WebSocket
WEBSOCKET_URL="http://localhost:3000"
```

Create `.env` file in `apps/mini-connector/`:

```env
# WebSocket Connection
WEBSOCKET_URL="ws://localhost:3000"

# Storage
VAULT_PATH=".vansales/mini-connector/vault.json"
```

### 4. Run Database Migrations

```bash
cd apps/control-plane
npx prisma migrate dev
npx prisma generate
```

### 5. Start Control Plane

```bash
cd apps/control-plane
npm run start:dev
```

The control plane will start on `http://localhost:3000`

### 6. Start Mini Connector

```bash
cd apps/mini-connector
npm run dev
```

The Mini Connector window will open automatically.

---

## Manual Setup (Without Docker)

### 1. Install PostgreSQL

```bash
# Windows
choco install postgresql

# macOS
brew install postgresql@15

# Linux
sudo apt-get install postgresql-15
```

### 2. Install Redis

```bash
# Windows
choco install redis-64

# macOS
brew install redis

# Linux
sudo apt-get install redis-server
```

### 3. Install MinIO

```bash
# Download MinIO server
wget https://dl.min.io/server/minio/release/windows-amd64/minio.exe

# Or use Docker
docker run -p 9000:9000 -p 9001:9001 \
  minio/minio server /data --console-address ":9001"
```

### 4. Start Services

```bash
# Start PostgreSQL
sudo service postgresql start

# Start Redis
redis-server

# Start MinIO
./minio.exe server /data --console-address ":9001"
```

---

## Testing the Mini Connector

### 1. Generate API Key

You'll need an API key in format: `vmc_<tenant>_<random>_<checksum>`

For testing, use: `vmc_test_tenant_x7f9k2p5w8q1_c4e2a`

### 2. Run Mini Connector Setup

1. Open the Mini Connector window
2. Enter API key when prompted
3. Click "Test Connection"
4. Enter database credentials:
   - Type: MySQL or PostgreSQL
   - Host: localhost
   - Port: 3306 (MySQL) or 5432 (PostgreSQL)
   - Database: test_db
   - Username: root or postgres
   - Password: your password
5. Click "Test Database"
6. Click "Discover Schema"
7. Click "Complete Setup"

### 3. Verify Connection

The Mini Connector should show:
- Connection Status: Connected
- Authentication: Authenticated
- Last Heartbeat: Recent timestamp

### 4. Test Workflow Execution

1. Open control plane at `http://localhost:3000`
2. Create a simple workflow:
   - Extract from database
   - Transform data
   - Load to destination
3. Execute the workflow
4. Verify execution in Mini Connector logs

---

## Troubleshooting

### TypeScript Errors

If you see TypeScript errors about missing modules:

```bash
# Install all dependencies
npm install

# Rebuild TypeScript
npm run build
```

### WebSocket Connection Failed

1. Verify control plane is running on port 3000
2. Check firewall settings
3. Verify API key format
4. Check Mini Connector logs in console

### Database Connection Failed

1. Verify database is running
2. Check connection parameters
3. Test with native tools:
   ```bash
   # MySQL
   mysql -h localhost -u root -p
   
   # PostgreSQL
   psql -h localhost -U postgres
   ```

### Port Already in Use

```bash
# Find process using port
netstat -ano | findstr :3000

# Kill process
taskkill /PID <pid> /F
```

---

## Development Workflow

### Running Tests

```bash
# Run control-plane tests
cd apps/control-plane
npm test

# Run mini-connector tests
cd apps/mini-connector
npm test
```

### Building for Production

```bash
# Build control-plane
cd apps/control-plane
npm run build

# Build mini-connector
cd apps/mini-connector
npm run build
npm run package
```

### Linting

```bash
# Lint control-plane
cd apps/control-plane
npm run lint

# Lint mini-connector
cd apps/mini-connector
npm run lint
```

---

## Environment Variables Reference

### Control Plane

```env
# Database
DATABASE_URL="postgresql://user:pass@host:port/database"

# Redis
REDIS_HOST="localhost"
REDIS_PORT="6379"

# S3/MinIO
S3_ENDPOINT="http://localhost:9000"
S3_ACCESS_KEY="minioadmin"
S3_SECRET_KEY="minioadmin"
S3_BUCKET="vansales-connector"

# WebSocket
WEBSOCKET_URL="http://localhost:3000"

# API
API_PORT="3000"
API_HOST="localhost"

# JWT
JWT_SECRET="your-secret-key"
JWT_EXPIRATION="7d"
```

### Mini Connector

```env
# WebSocket
WEBSOCKET_URL="ws://localhost:3000"

# Storage
VAULT_PATH=".vansales/mini-connector/vault.json"

# Logging
LOG_LEVEL="info"
```

---

## Common Issues

### "Cannot find module" Errors

**Solution:** Run `npm install` in the respective app directory

### "Port 3000 already in use"

**Solution:** Kill the process using port 3000 or change the port in `.env`

### "Database connection refused"

**Solution:** 
- Verify PostgreSQL is running
- Check connection string in `.env`
- Verify database exists

### "Mini Connector window doesn't open"

**Solution:**
- Check if Electron is installed
- Run `npm run dev` in mini-connector directory
- Check console for errors

---

## Production Deployment

### Control Plane

```bash
cd apps/control-plane
npm run build
npm start:prod
```

### Mini Connector

```bash
cd apps/mini-connector
npm run build
npm run package

# The executable will be in dist/ directory
```

### Docker Deployment

```bash
# Build Docker images
docker-compose build

# Run with Docker
docker-compose up -d
```

---

## Next Steps

After successful setup:

1. **Create Test Workflow** - Build a simple workflow in the control plane
2. **Execute Workflow** - Run the workflow and verify Mini Connector processes it
3. **Monitor Logs** - Check both control plane and Mini Connector logs
4. **Test Error Handling** - Intentionally break something to test error handling
5. **Scale Testing** - Test with multiple concurrent workflows

---

## Support

For issues or questions:
- Check logs in console
- Review IMPLEMENTATION_SUMMARY.md for architecture details
- Verify all environment variables are set correctly
- Ensure all services are running

---

**Last Updated:** February 13, 2026
