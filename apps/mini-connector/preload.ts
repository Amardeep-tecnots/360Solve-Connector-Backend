import { contextBridge, ipcRenderer } from 'electron';

console.log('[PRELOAD] preload.ts loaded');

async function safeInvoke<T>(channel: string, ...args: any[]): Promise<T> {
  try {
    return (await ipcRenderer.invoke(channel, ...args)) as T;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[PRELOAD] ipc invoke failed: ${channel}`, message);
    throw err;
  }
}

// Expose safe APIs to renderer
contextBridge.exposeInMainWorld('electronAPI', {
  // Setup wizard
  setup: {
    validateApiKey: (apiKey: string) =>
      safeInvoke('setup:validate-api-key', apiKey),
    connectToCloud: (apiKey: string) => safeInvoke('setup:connect-to-cloud', apiKey),
    testDatabase: (config: any) => safeInvoke('setup:test-database', config),
    saveCredentials: (credentials: any) => safeInvoke('setup:save-credentials', credentials),
    discoverSchema: (config: any) => safeInvoke('setup:discover-schema', config),
    complete: (data: { apiKey: string; dbConfig: any; schema: any }) => 
      safeInvoke('setup:complete', data),
  },

  // Aggregator management
  aggregators: {
    list: () => safeInvoke('aggregators:list'),
    add: (data: any) => safeInvoke('aggregators:add', data),
    update: (id: string, updates: any) => safeInvoke('aggregators:update', id, updates),
    delete: (id: string) => safeInvoke('aggregators:delete', id),
    test: (id: string) => safeInvoke('aggregators:test', id),
    discoverSchema: (id: string) => safeInvoke('aggregators:discover-schema', id),
    syncSchema: (id: string, schema: any) => safeInvoke('aggregators:sync-schema', id, schema),
    previewTable: (id: string, tableName: string) => safeInvoke('aggregators:preview-table', id, tableName),
    transferTable: (id: string, tableName: string) => safeInvoke('aggregators:transfer-table', id, tableName),
  },

  // Audit Log
  audit: {
    log: (data: any) => safeInvoke('audit:log', data),
    getRecent: (limit: number) => safeInvoke('audit:get-recent', limit),
  },

  // Status
  status: {
    getConnectionState: () => safeInvoke('status:get-connection-state'),
    getSystemInfo: () => safeInvoke('status:get-system-info'),
  },

  // Settings
  settings: {
    reset: () => safeInvoke('settings:reset'),
  },

  // Query execution
  query: {
    execute: (query: any) => safeInvoke('query:execute', query),
  },

  // Events
  on: (channel: string, callback: (...args: any[]) => void) => {
    const validChannels = [
      'websocket:connected',
      'websocket:disconnected',
      'websocket:error',
      'command:received',
      'command:start',
      'command:success',
      'command:error',
      'heartbeat:sent',
      'error:uncaught',
    ];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (event, ...args) => callback(...args));
    }
  },

  removeListener: (channel: string, callback: (...args: any[]) => void) => {
    ipcRenderer.removeListener(channel, callback as any);
  },
});

console.log('[PRELOAD] window.electronAPI exposed');
