# VanSales Mini Connector

On-premise agent for connecting local databases to the VanSales cloud platform.

## Features

- **Secure Credential Storage**: Machine-specific encryption using AES-256-GCM
- **Firewall-Friendly**: Outbound WebSocket connections (no inbound ports needed)
- **Multi-Database Support**: MySQL, PostgreSQL, SQL Server
- **Real-Time Sync**: Heartbeat every 30 seconds
- **Easy Setup**: 5-minute guided setup wizard

## Installation

### Prerequisites

- Node.js 20+ LTS
- npm or yarn

### Development Setup

```bash
cd apps/mini-connector
npm install
```

### Running in Development

```bash
npm run dev
```

This starts:
- Vite dev server for React renderer (http://localhost:5173)
- Electron app with hot reload

### Building for Production

```bash
npm run build
npm run package
```

## Architecture

```
apps/mini-connector/
├── main.ts                    # Electron main process
├── preload.ts                 # Secure IPC bridge
├── services/
│   ├── websocket-client.service.ts    # WebSocket client
│   ├── api-key-auth.service.ts         # API key validation
│   ├── credential-vault.service.ts     # Secure storage
│   ├── query-executor.service.ts        # Database queries
│   └── heartbeat.service.ts            # Keep-alive
└── renderer/                   # React UI
    ├── src/
    │   ├── main.tsx
    │   ├── App.tsx
    │   ├── components/
    │   │   ├── SetupWizard.tsx
    │   │   └── ConnectionStatus.tsx
    │   └── index.css
    └── index.html
```

## API Key Format

Format: `vmc_<tenant>_<random>_<checksum>`

Example: `vmc_abc123_x7f9k2p5w8q1_c4e2a`

## Security

- Credentials never leave the machine
- Machine-specific encryption
- READ-ONLY enforcement at multiple layers
- No inbound firewall rules needed

## Development

### File Structure

- **main.ts**: Electron main process, window management, IPC handlers
- **preload.ts**: Secure bridge between main and renderer processes
- **services/**: Backend services (WebSocket, auth, credentials, queries)
- **renderer/**: React UI with setup wizard

### Key Services

1. **WebSocketService**: Manages connection to cloud console
2. **ApiKeyAuthService**: Validates and generates API keys
3. **CredentialVaultService**: Encrypted credential storage
4. **QueryExecutorService**: Database query execution with READ-ONLY enforcement
5. **HeartbeatService**: Periodic keep-alive signals

## Next Steps

After completing Phase 1 (Mini Connector):

1. **Phase 2**: Activity Handlers (extract, transform, load, filter, join)
2. **Phase 3**: WebSocket Gateway in control plane
3. **Phase 4**: BullMQ queue system
4. **Phase 5**: AI SDK Generator
5. **Phase 6**: S3/MinIO integration

## Troubleshooting

### TypeScript Errors

TypeScript errors about missing modules are expected until `npm install` is run. These will resolve after installing dependencies.

### Connection Issues

- Ensure WebSocket URL is correct in environment variables
- Check API key format
- Verify firewall allows outbound connections

### Database Connection

- Test credentials using native tools first
- Ensure database allows connections from localhost
- Check if database is running

## License

MIT
