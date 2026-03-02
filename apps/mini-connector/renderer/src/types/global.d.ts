// Global type definitions for Electron API
export {};

declare global {
  interface Window {
    electronAPI: {
      setup: {
        validateApiKey: (apiKey: string) => Promise<{ valid: boolean; reason?: string }>;
        connectToCloud: (apiKey: string) => Promise<boolean>;
        testDatabase: (config: any) => Promise<{ success: boolean; error?: string }>;
        saveCredentials: (credentials: any) => Promise<string>;
        discoverSchema: (config: any) => Promise<any>;
        complete: (data: { apiKey: string; dbConfig: any; schema: any }) => Promise<{ success: boolean; aggregator: any }>;
      };
      aggregators: {
        list: () => Promise<any[]>;
        add: (data: any) => Promise<{ success: boolean; aggregator: any }>;
        update: (id: string, updates: any) => Promise<{ success: boolean }>;
        delete: (id: string) => Promise<{ success: boolean }>;
        test: (id: string) => Promise<{ success: boolean; error?: string }>;
        discoverSchema: (id: string) => Promise<any>;
        syncSchema: (id: string, schema: any) => Promise<{ success: boolean; error?: string }>;
        previewTable: (id: string, tableName: string) => Promise<any>;
        transferTable: (id: string, tableName: string) => Promise<{ success: boolean; count: number }>;
      };
      audit: {
        log: (data: any) => Promise<void>;
        getRecent: (limit: number) => Promise<any[]>;
      };
      status: {
        getConnectionState: () => Promise<{
          connected: boolean;
          authenticated: boolean;
          lastHeartbeat: Date | null;
        }>;
        getSystemInfo: () => Promise<{
          platform: string;
          arch: string;
          hostname: string;
          cpus: number;
          totalMemory: number;
          freeMemory: number;
          uptime: number;
          processMemory: number;
          loadAverage: number[];
          version: string;
        }>;
      };
      settings: {
        reset: () => Promise<{ success: boolean }>;
      };
      query: {
        execute: (config: any, query: any) => Promise<any>;
      };
      on: (channel: string, callback: (...args: any[]) => void) => void;
      removeListener: (channel: string, callback: (...args: any[]) => void) => void;
    };
  }
}
