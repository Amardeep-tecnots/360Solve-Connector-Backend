import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';

export interface QueuedResult {
  id: number;
  commandId: string;
  executionId: string;
  activityId: string;
  result: any;
  timestamp: number;
  retryCount: number;
}

export class OfflineQueueService {
  private db: Database.Database;

  constructor() {
    const userDataPath = app.getPath('userData');
    const dbPath = path.join(userDataPath, 'offline-queue.db');
    
    // Ensure directory exists
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.initialize();
  }

  private initialize() {
    // Table for deduplication
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS executed_commands (
        command_id TEXT PRIMARY KEY,
        execution_id TEXT,
        timestamp INTEGER,
        result TEXT
      )
    `);

    // Table for queued results (failed uploads)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS queued_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        command_id TEXT,
        execution_id TEXT,
        activity_id TEXT,
        result TEXT,
        timestamp INTEGER,
        retry_count INTEGER DEFAULT 0
      )
    `);
  }

  // Deduplication
  hasExecuted(commandId: string): boolean {
    const row = this.db.prepare('SELECT command_id FROM executed_commands WHERE command_id = ?').get(commandId);
    return !!row;
  }

  recordExecution(commandId: string, executionId: string, result: any) {
    this.db.prepare(`
      INSERT OR REPLACE INTO executed_commands (command_id, execution_id, timestamp, result)
      VALUES (?, ?, ?, ?)
    `).run(commandId, executionId, Date.now(), JSON.stringify(result));
  }

  getCheckResult(commandId: string): any | null {
    const row = this.db.prepare('SELECT result FROM executed_commands WHERE command_id = ?').get(commandId) as any;
    if (row) {
      return JSON.parse(row.result);
    }
    return null;
  }

  // Result Queue
  enqueueResult(commandId: string, executionId: string, activityId: string, result: any) {
    this.db.prepare(`
      INSERT INTO queued_results (command_id, execution_id, activity_id, result, timestamp, retry_count)
      VALUES (?, ?, ?, ?, ?, 0)
    `).run(commandId, executionId, activityId, JSON.stringify(result), Date.now());
  }

  getQueuedResults(): QueuedResult[] {
    const rows = this.db.prepare('SELECT * FROM queued_results ORDER BY timestamp ASC').all() as any[];
    return rows.map(row => ({
      id: row.id,
      commandId: row.command_id,
      executionId: row.execution_id,
      activityId: row.activity_id,
      result: JSON.parse(row.result),
      timestamp: row.timestamp,
      retryCount: row.retry_count
    }));
  }

  removeResult(id: number) {
    this.db.prepare('DELETE FROM queued_results WHERE id = ?').run(id);
  }

  incrementRetry(id: number) {
    this.db.prepare('UPDATE queued_results SET retry_count = retry_count + 1 WHERE id = ?').run(id);
  }
}
