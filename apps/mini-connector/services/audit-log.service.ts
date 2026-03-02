import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export interface AuditEvent {
  action: string;
  resourceType?: string;
  resourceId?: string;
  details?: any;
  status: 'success' | 'failure';
  error?: string;
  timestamp?: string;
}

export class AuditLogService {
  private logPath: string;

  constructor() {
    const userDataPath = app.getPath('userData');
    this.logPath = path.join(userDataPath, 'audit.log');
    console.log('[AUDIT] Log path:', this.logPath);
  }

  async log(event: AuditEvent): Promise<void> {
    const logEntry = {
      ...event,
      timestamp: event.timestamp || new Date().toISOString(),
    };

    const line = JSON.stringify(logEntry) + '\n';

    try {
      await fs.promises.appendFile(this.logPath, line, 'utf8');
    } catch (err) {
      console.error('[AUDIT] Failed to write to log:', err);
    }
  }

  async getRecentLogs(limit = 100): Promise<AuditEvent[]> {
    try {
      if (!fs.existsSync(this.logPath)) {
        return [];
      }

      const content = await fs.promises.readFile(this.logPath, 'utf8');
      const lines = content.trim().split('\n');
      
      return lines
        .slice(-limit)
        .map(line => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter(Boolean)
        .reverse();
    } catch (err) {
      console.error('[AUDIT] Failed to read logs:', err);
      return [];
    }
  }
}
