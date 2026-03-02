import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

interface AggregatorConfig {
  id: string;
  name: string;
  type: 'mysql' | 'postgresql' | 'mssql' | 'sqlite' | 'oracle';
  host: string;
  port: number;
  database: string;
  username: string;
  credentialId: string;
  createdAt: string;
  updatedAt: string;
}

interface Settings {
  apiKey?: string;
  aggregators?: AggregatorConfig[];
}

export class SettingsService {
  private readonly filePath: string;

  constructor() {
    this.filePath = path.join(app.getPath('userData'), 'settings.json');
  }

  load(): Settings {
    try {
      if (!fs.existsSync(this.filePath)) return {};
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      return JSON.parse(raw) as Settings;
    } catch (err) {
      console.warn('[SettingsService] Failed to load settings:', err);
      return {};
    }
  }

  save(settings: Settings): void {
    try {
      const merged = { ...this.load(), ...settings };
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(merged, null, 2), 'utf-8');
    } catch (err) {
      console.warn('[SettingsService] Failed to save settings:', err);
    }
  }

  reset(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        fs.unlinkSync(this.filePath);
      }
    } catch (err) {
      console.warn('[SettingsService] Failed to reset settings:', err);
    }
  }

  // Aggregator management methods
  getAggregators(): AggregatorConfig[] {
    const current = this.load();
    return current.aggregators || [];
  }

  saveAggregators(aggregators: AggregatorConfig[]): void {
    this.save({ aggregators });
  }

  addAggregator(aggregator: AggregatorConfig): void {
    const current = this.load();
    const aggregators = [...(current.aggregators || []), aggregator];
    this.saveAggregators(aggregators);
  }

  updateAggregator(id: string, updates: Partial<AggregatorConfig>): void {
    const current = this.load();
    const aggregators = (current.aggregators || []).map((a) =>
      a.id === id ? { ...a, ...updates, updatedAt: new Date().toISOString() } : a,
    );
    this.saveAggregators(aggregators);
  }

  deleteAggregator(id: string): void {
    const current = this.load();
    const aggregators = (current.aggregators || []).filter((a) => a.id !== id);
    this.saveAggregators(aggregators);
  }

  getAggregatorById(id: string): AggregatorConfig | undefined {
    const current = this.load();
    return (current.aggregators || []).find((a) => a.id === id);
  }
}

export type { AggregatorConfig, Settings };
