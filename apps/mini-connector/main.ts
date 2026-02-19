// Only load dotenv in development mode
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}
console.log('[MAIN] File loading...');

import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } from 'electron';
console.log('[MAIN] electron imported');

import * as fs from 'fs';
console.log('[MAIN] fs imported');

import * as path from 'path';
console.log('[MAIN] path imported');

import * as os from 'os';
console.log('[MAIN] os imported');

import { WebSocketService } from './services/websocket-client.service';
console.log('[MAIN] WebSocketService imported');

import { CredentialVaultService } from './services/credential-vault.service';
console.log('[MAIN] CredentialVaultService imported');

import { QueryExecutorService } from './services/query-executor.service';
console.log('[MAIN] QueryExecutorService imported');

import { HeartbeatService } from './services/heartbeat.service';
console.log('[MAIN] HeartbeatService imported');

import { ApiKeyAuthService } from './services/api-key-auth.service';
console.log('[MAIN] ApiKeyAuthService imported');

import { SettingsService, AggregatorConfig } from './services/settings.service';
console.log('[MAIN] SettingsService imported');

import { OfflineQueueService } from './services/offline-queue.service';
console.log('[MAIN] OfflineQueueService imported');

import { CommandOrchestratorService } from './services/command-orchestrator.service';
console.log('[MAIN] CommandOrchestratorService imported');

import { AuditLogService } from './services/audit-log.service';
console.log('[MAIN] AuditLogService imported');

let mainWindow: BrowserWindow | null = null;
let webSocketService: WebSocketService | null = null;
let credentialVaultService: CredentialVaultService | null = null;
let queryExecutorService: QueryExecutorService | null = null;
let heartbeatService: HeartbeatService | null = null;
let apiKeyAuthService: ApiKeyAuthService | null = null;
let settingsService: SettingsService | null = null;
let offlineQueueService: OfflineQueueService | null = null;
let commandOrchestratorService: CommandOrchestratorService | null = null;
let auditLogService: AuditLogService | null = null;
let tray: Tray | null = null;
let isQuitting = false;

// Initialize services
async function initializeServices() {
  try {
    console.log('[MAIN] Initializing services...');
    auditLogService = new AuditLogService();
    await auditLogService.log({ action: 'app_start', status: 'success', details: { version: app.getVersion() } });

    credentialVaultService = new CredentialVaultService();
    queryExecutorService = new QueryExecutorService(credentialVaultService);
    apiKeyAuthService = new ApiKeyAuthService();
    webSocketService = new WebSocketService(apiKeyAuthService);
    heartbeatService = new HeartbeatService(webSocketService);
    settingsService = new SettingsService();
    offlineQueueService = new OfflineQueueService();
    commandOrchestratorService = new CommandOrchestratorService(
      webSocketService,
      queryExecutorService,
      offlineQueueService,
      settingsService,
      credentialVaultService
    );
    heartbeatService.setCommandOrchestrator(commandOrchestratorService);

    // Start/stop heartbeats based on connection lifecycle
    webSocketService.on('authenticated', () => {
      console.log('[MAIN] WebSocket authenticated');
      heartbeatService?.start();
      mainWindow?.webContents.send('websocket:connected');
    });
    webSocketService.on('disconnected', () => {
      console.log('[MAIN] WebSocket disconnected');
      heartbeatService?.stop();
      mainWindow?.webContents.send('websocket:disconnected');
    });
    webSocketService.on('error', (err) => {
      console.error('[MAIN] WebSocket error:', err);
      mainWindow?.webContents.send('websocket:error', err.message);
    });

    webSocketService.on('heartbeat_sent', () => {
      mainWindow?.webContents.send('heartbeat:sent', new Date());
    });

    // Forward command events to renderer
    commandOrchestratorService.on('command:start', (data) => {
      console.log('[MAIN] Command start:', data);
      mainWindow?.webContents.send('command:start', data);
    });
    commandOrchestratorService.on('command:success', (data) => {
      console.log('[MAIN] Command success:', data);
      mainWindow?.webContents.send('command:success', data);
    });
    commandOrchestratorService.on('command:error', (data) => {
      console.error('[MAIN] Command error:', data);
      mainWindow?.webContents.send('command:error', data);
    });

    // Register IPC handlers
    registerIpcHandlers();
    console.log('[MAIN] Services initialized successfully');

    // Auto-connect if an API key was saved previously
    const saved = settingsService.load();
    if (saved.apiKey) {
      console.log('[MAIN] Found saved API key, attempting auto-connect...');
      try {
        await webSocketService.connect(saved.apiKey);
      } catch (err) {
        console.warn('[MAIN] Auto-connect failed:', err);
      }
    }
  } catch (err) {
    console.error('[MAIN] Failed to initialize services:', err);
    throw err;
  }
}

function createTray() {
  const icon = nativeImage.createEmpty(); // Placeholder until we have assets
  tray = new Tray(icon);
  
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open Dashboard', click: () => mainWindow?.show() },
    { type: 'separator' },
    { label: 'Exit', click: () => {
      isQuitting = true;
      app.quit();
    }}
  ]);
  
  tray.setToolTip('Mini Connector');
  tray.setContextMenu(contextMenu);
  
  tray.on('click', () => {
    mainWindow?.isVisible() ? mainWindow.hide() : mainWindow?.show();
  });
}

function createWindow() {
  const preloadPath = path.join(__dirname, 'preload.js');
  console.log('[MAIN] preload path:', preloadPath);
  console.log('[MAIN] preload exists:', fs.existsSync(preloadPath));

  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Load the app - try Vite dev server first, fall back to file
  const viteUrl = 'http://localhost:5173';
  
  // Simple check: if we're in dev mode (NODE_ENV or --inspect flag), try Vite
  const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--inspect');
  
  if (isDev) {
    console.log('[MAIN] Loading from Vite dev server...');
    mainWindow.loadURL(viteUrl);
    mainWindow.webContents.openDevTools();
  } else {
    console.log('[MAIN] Loading from file...');
    mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));
  }

  // Add error handlers
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[MAIN] Renderer loaded successfully');
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('[MAIN] Failed to load:', errorCode, errorDescription);
  });

  mainWindow.webContents.on('console-message', (event, level, message) => {
    console.log(`[RENDERER-CONSOLE] ${message}`);
  });

  mainWindow.webContents.on('preload-error', (event, preloadPath, error) => {
    console.error('[MAIN] Preload error:', preloadPath, error);
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
      return false;
    }
    return true;
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function registerIpcHandlers() {
  // Setup wizard handlers
  ipcMain.handle('setup:validate-api-key', async (event, apiKey: string) => {
    if (!apiKeyAuthService) throw new Error('API Key service not initialized');
    console.log('[MAIN] Validating API key:', apiKey.substring(0, 20) + '...');
    const result = apiKeyAuthService.validateApiKeyDetailed(apiKey);
    console.log('[MAIN] Validation result:', result);
    return result;
  });

  ipcMain.handle('setup:connect-to-cloud', async (event, apiKey: string) => {
    if (!webSocketService) throw new Error('WebSocket service not initialized');
    const connected = await webSocketService.connect(apiKey);
    if (connected && settingsService) {
      settingsService.save({ apiKey });
    }
    return connected;
  });

  ipcMain.handle('setup:test-database', async (event, config: any) => {
    if (!queryExecutorService) throw new Error('Query executor service not initialized');
    return queryExecutorService.testConnection(config);
  });

  ipcMain.handle('setup:save-credentials', async (event, credentials: any) => {
    if (!credentialVaultService) throw new Error('Credential vault service not initialized');
    return credentialVaultService.storeCredentials(credentials);
  });

  ipcMain.handle('setup:discover-schema', async (event, config: any) => {
    if (!queryExecutorService) throw new Error('Query executor service not initialized');
    return queryExecutorService.discoverSchema(config);
  });

  ipcMain.handle('settings:reset', async () => {
    if (!settingsService || !credentialVaultService) throw new Error('Services not initialized');

    // Disconnect any active websocket/heartbeat
    if (webSocketService) {
      await webSocketService.disconnect();
    }
    heartbeatService?.stop();

    // Clear persisted settings and credentials
    settingsService.reset();
    credentialVaultService.clearVault();

    return { success: true };
  });

  // Status handlers
  ipcMain.handle('status:get-connection-state', async () => {
    if (!webSocketService) throw new Error('WebSocket service not initialized');
    return webSocketService.getConnectionState();
  });

  ipcMain.handle('status:get-system-info', async () => {
    const memoryUsage = process.memoryUsage();
    return {
      platform: os.platform(),
      arch: os.arch(),
      hostname: os.hostname(),
      cpus: os.cpus().length,
      totalMemory: Math.round(os.totalmem() / 1024 / 1024 / 1024),
      freeMemory: Math.round(os.freemem() / 1024 / 1024 / 1024),
      uptime: process.uptime(),
      processMemory: Math.round(memoryUsage.rss / 1024 / 1024),
      loadAverage: os.loadavg(),
      version: app.getVersion(),
    };
  });

  ipcMain.handle('setup:complete', async (event, data: { apiKey: string; dbConfig: any; schema: any }) => {
    if (!settingsService || !credentialVaultService || !webSocketService) throw new Error('Services not initialized');
    
    // Save API key
    settingsService.save({ apiKey: data.apiKey });
    
    // Store credentials for the initial database
    const credentialId = await credentialVaultService.storeCredentials({
      name: 'Primary Database',
      type: 'database',
      host: data.dbConfig.host,
      port: data.dbConfig.port,
      database: data.dbConfig.database,
      username: data.dbConfig.username,
      password: data.dbConfig.password,
    });
    
    // Create aggregator #1 from setup wizard database config
    const aggregator: AggregatorConfig = {
      id: `agg-${Date.now()}`,
      name: 'Primary Database',
      type: data.dbConfig.type,
      host: data.dbConfig.host,
      port: data.dbConfig.port,
      database: data.dbConfig.database,
      username: data.dbConfig.username,
      credentialId: credentialId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    settingsService.addAggregator(aggregator);
    console.log('[MAIN] Setup complete - saved aggregator #1:', aggregator.name);

    // Send schema to cloud
    if (data.schema) {
      console.log('[MAIN] Sending initial schema to cloud...');
      try {
        webSocketService.sendSchema(data.schema);
      } catch (e) {
        console.warn('[MAIN] Failed to send schema:', e);
      }
    }
    
    return { success: true, aggregator };
  });

  // Query execution handlers
  ipcMain.handle('query:execute', async (event, config: any, query: any) => {
    if (!queryExecutorService) throw new Error('Query executor service not initialized');
    return queryExecutorService.executeQuery(config, query);
  });

  // Aggregator management handlers
  ipcMain.handle('aggregators:list', async () => {
    if (!settingsService) throw new Error('Settings service not initialized');
    return settingsService.getAggregators();
  });

  ipcMain.handle('aggregators:add', async (event, data: { 
    name: string; 
    type: AggregatorConfig['type']; 
    host: string; 
    port: number; 
    database: string; 
    username: string; 
    password: string;
  }) => {
    if (!settingsService || !credentialVaultService) throw new Error('Services not initialized');
    
    // Store credentials
    const credentialId = await credentialVaultService.storeCredentials({
      name: data.name,
      type: 'database',
      host: data.host,
      port: data.port,
      database: data.database,
      username: data.username,
      password: data.password,
    });
    
    // Create aggregator config
    const aggregator: AggregatorConfig = {
      id: `agg-${Date.now()}`,
      name: data.name,
      type: data.type,
      host: data.host,
      port: data.port,
      database: data.database,
      username: data.username,
      credentialId: credentialId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    settingsService.addAggregator(aggregator);
    console.log('[MAIN] Added new aggregator:', aggregator.name);
    
    return { success: true, aggregator };
  });

  ipcMain.handle('aggregators:update', async (event, id: string, updates: Partial<AggregatorConfig>) => {
    if (!settingsService) throw new Error('Settings service not initialized');
    settingsService.updateAggregator(id, updates);
    return { success: true };
  });

  ipcMain.handle('aggregators:delete', async (event, id: string) => {
    if (!settingsService) throw new Error('Settings service not initialized');
    settingsService.deleteAggregator(id);
    return { success: true };
  });

  ipcMain.handle('aggregators:test', async (event, id: string) => {
    if (!settingsService || !credentialVaultService || !queryExecutorService) {
      throw new Error('Services not initialized');
    }
    
    const aggregator = settingsService.getAggregatorById(id);
    if (!aggregator) {
      return { success: false, error: 'Aggregator not found' };
    }
    
    const credentials = await credentialVaultService.retrieveCredentials(aggregator.credentialId);
    if (!credentials) {
      return { success: false, error: 'Credentials not found' };
    }
    
    return queryExecutorService.testConnection({
      type: aggregator.type as 'mysql' | 'postgresql' | 'mssql',
      host: aggregator.host,
      port: aggregator.port,
      database: aggregator.database,
      username: credentials.username!,
      password: (credentials as any).password!,
    });
  });

  ipcMain.handle('aggregators:discover-schema', async (event, id: string) => {
    if (!settingsService || !credentialVaultService || !queryExecutorService) {
      throw new Error('Services not initialized');
    }
    
    const aggregator = settingsService.getAggregatorById(id);
    if (!aggregator) {
      return { success: false, error: 'Aggregator not found' };
    }
    
    const credentials = await credentialVaultService.retrieveCredentials(aggregator.credentialId);
    if (!credentials) {
      return { success: false, error: 'Credentials not found' };
    }
    
    try {
        const schema = await queryExecutorService.discoverSchema({
          type: aggregator.type as 'mysql' | 'postgresql' | 'mssql',
          host: aggregator.host,
          port: aggregator.port,
          database: aggregator.database,
          username: credentials.username!,
          password: (credentials as any).password!,
        });
        
        auditLogService?.log({
            action: 'schema_discovery',
            status: 'success',
            resourceType: 'aggregator',
            resourceId: id,
            details: { tableCount: schema.tables.length }
        });
        return schema;
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        auditLogService?.log({
            action: 'schema_discovery',
            status: 'failure',
            resourceType: 'aggregator',
            resourceId: id,
            error: message
        });
        throw err;
    }
  });

  ipcMain.handle('aggregators:sync-schema', async (event, id: string, schema: any) => {
    if (!webSocketService) throw new Error('WebSocket service not initialized');
    try {
        // Enriched schema with aggregator ID if needed, or just send as is
        webSocketService.sendSchema({
            aggregatorId: id,
            ...schema
        });
        auditLogService?.log({
            action: 'schema_sync',
            status: 'success',
            resourceType: 'aggregator',
            resourceId: id
        });
        return { success: true };
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.error('Failed to sync schema:', e);
        auditLogService?.log({
            action: 'schema_sync',
            status: 'failure',
            resourceType: 'aggregator',
            resourceId: id,
            error: message
        });
        return { success: false, error: message };
    }
  });

  ipcMain.handle('aggregators:preview-table', async (event, id: string, tableName: string) => {
    if (!settingsService || !credentialVaultService || !queryExecutorService) {
      throw new Error('Services not initialized');
    }
    
    const aggregator = settingsService.getAggregatorById(id);
    if (!aggregator) {
      throw new Error('Aggregator not found');
    }
    
    const credentials = await credentialVaultService.retrieveCredentials(aggregator.credentialId);
    if (!credentials) {
      throw new Error('Credentials not found');
    }

    try {
        const result = await queryExecutorService.previewTable({
            type: aggregator.type as 'mysql' | 'postgresql' | 'mssql',
            host: aggregator.host,
            port: aggregator.port,
            database: aggregator.database,
            username: credentials.username!,
            password: (credentials as any).password!,
        }, tableName);

        auditLogService?.log({
            action: 'preview_table',
            status: 'success',
            resourceType: 'table',
            resourceId: tableName,
            details: { rowCount: result.rowCount }
        });
        return result;
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        auditLogService?.log({
            action: 'preview_table',
            status: 'failure',
            resourceType: 'table',
            resourceId: tableName,
            error: message
        });
        throw e;
    }
  });

  ipcMain.handle('aggregators:transfer-table', async (event, id: string, tableName: string) => {
    if (!settingsService || !credentialVaultService || !queryExecutorService || !webSocketService) {
      throw new Error('Services not initialized');
    }
    
    const aggregator = settingsService.getAggregatorById(id);
    if (!aggregator) throw new Error('Aggregator not found');
    
    const credentials = await credentialVaultService.retrieveCredentials(aggregator.credentialId);
    if (!credentials) throw new Error('Credentials not found');

    try {
        // Limit to 1000 rows for POC
        const result = await queryExecutorService.executeQuery({
            type: aggregator.type as 'mysql' | 'postgresql' | 'mssql',
            host: aggregator.host,
            port: aggregator.port,
            database: aggregator.database,
            username: credentials.username!,
            password: (credentials as any).password!,
        }, {
            table: tableName,
            columns: ['*'],
            limit: 1000
        });

        webSocketService.sendData({
            aggregatorId: id,
            table: tableName,
            rows: result.data,
            rowCount: result.rowCount
        });

        auditLogService?.log({
            action: 'transfer_table',
            status: 'success',
            resourceType: 'table',
            resourceId: tableName,
            details: { rowCount: result.rowCount }
        });
        return { success: true, count: result.rowCount };
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        auditLogService?.log({
            action: 'transfer_table',
            status: 'failure',
            resourceType: 'table',
            resourceId: tableName,
            error: message
        });
        throw e;
    }
  });

  // Audit Log Handlers
  ipcMain.handle('audit:log', async (event, data: any) => {
      if (!auditLogService) return;
      return auditLogService.log(data);
  });

  ipcMain.handle('audit:get-recent', async (event, limit: number) => {
      if (!auditLogService) return [];
      return auditLogService.getRecentLogs(limit);
  });
}

// App lifecycle
app.whenReady().then(async () => {
  try {
    console.log('[MAIN] App is ready, starting initialization...');
    await initializeServices();
    console.log('[MAIN] Creating window...');
    createWindow();
    createTray();
    console.log('[MAIN] Window created successfully');

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  } catch (err) {
    console.error('[MAIN] Fatal error during startup:', err);
    process.exit(1);
  }
}).catch((err) => {
  console.error('[MAIN] app.whenReady() rejected:', err);
  process.exit(1);
});

app.on('window-all-closed', () => {
  // Keep running in tray
});

app.on('before-quit', async () => {
  isQuitting = true;
  // Cleanup services
  if (webSocketService) {
    await webSocketService.disconnect();
  }
  if (heartbeatService) {
    heartbeatService.stop();
  }
});

// Error handling
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  if (mainWindow) {
    mainWindow.webContents.send('error:uncaught', error.message);
  }
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
  if (mainWindow) {
    mainWindow.webContents.send('error:unhandled', String(reason));
  }
});
