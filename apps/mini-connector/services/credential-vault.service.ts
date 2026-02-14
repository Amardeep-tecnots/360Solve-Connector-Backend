import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ApiKeyAuthService } from './api-key-auth.service';

interface StoredCredentials {
  id: string;
  name: string;
  type: 'database' | 'api' | 'oauth';
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  encryptedPassword?: string;
  encryptedToken?: string;
  iv?: string;
  createdAt: string;
  lastUsedAt?: string;
}

export class CredentialVaultService {
  private readonly vaultPath: string;
  private readonly apiKeyAuthService: ApiKeyAuthService;

  constructor() {
    this.apiKeyAuthService = new ApiKeyAuthService();
    // Store vault in user data directory
    this.vaultPath = path.join(os.homedir(), '.vansales', 'mini-connector', 'vault.json');
    this.ensureVaultDirectory();
  }

  private ensureVaultDirectory() {
    const dir = path.dirname(this.vaultPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
  }

  /**
   * Store credentials securely
   */
  async storeCredentials(credentials: {
    name: string;
    type: 'database' | 'api' | 'oauth';
    host?: string;
    port?: number;
    database?: string;
    username?: string;
    password?: string;
    token?: string;
  }): Promise<string> {
    const id = crypto.randomUUID();

    const stored: StoredCredentials = {
      id,
      name: credentials.name,
      type: credentials.type,
      host: credentials.host,
      port: credentials.port,
      database: credentials.database,
      username: credentials.username,
      createdAt: new Date().toISOString(),
    };

    // Encrypt sensitive data
    if (credentials.password) {
      const { encrypted, iv } = this.apiKeyAuthService.encrypt(credentials.password);
      stored.encryptedPassword = encrypted;
      stored.iv = iv;
    }

    if (credentials.token) {
      const { encrypted, iv } = this.apiKeyAuthService.encrypt(credentials.token);
      stored.encryptedToken = encrypted;
      stored.iv = iv;
    }

    // Load existing vault
    const vault = this.loadVault();
    vault.credentials[id] = stored;

    // Save vault
    this.saveVault(vault);

    return id;
  }

  /**
   * Retrieve credentials by ID
   */
  async retrieveCredentials(id: string): Promise<StoredCredentials | null> {
    const vault = this.loadVault();
    const credentials = vault.credentials[id];

    if (!credentials) {
      return null;
    }

    // Update last used timestamp
    credentials.lastUsedAt = new Date().toISOString();
    this.saveVault(vault);

    // Return credentials with decrypted values
    const result: StoredCredentials & { password?: string; token?: string } = { ...credentials };

    // Decrypt sensitive data
    if (credentials.encryptedPassword && credentials.iv) {
      result.password = this.apiKeyAuthService.decrypt(
        credentials.encryptedPassword,
        credentials.iv
      );
    }

    if (credentials.encryptedToken && credentials.iv) {
      result.token = this.apiKeyAuthService.decrypt(
        credentials.encryptedToken,
        credentials.iv
      );
    }

    return result;
  }

  /**
   * List all stored credentials
   */
  listCredentials(): Array<{ id: string; name: string; type: string; createdAt: string }> {
    const vault = this.loadVault();
    return Object.values(vault.credentials).map((cred: StoredCredentials) => ({
      id: cred.id,
      name: cred.name,
      type: cred.type,
      createdAt: cred.createdAt,
    }));
  }

  /**
   * Delete credentials
   */
  deleteCredentials(id: string): boolean {
    const vault = this.loadVault();

    if (!vault.credentials[id]) {
      return false;
    }

    delete vault.credentials[id];
    this.saveVault(vault);
    return true;
  }

  /**
   * Load vault from disk
   */
  private loadVault(): { credentials: Record<string, StoredCredentials>; version: string } {
    try {
      if (!fs.existsSync(this.vaultPath)) {
        return { credentials: {}, version: '1.0' };
      }

      const data = fs.readFileSync(this.vaultPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Failed to load vault:', error);
      return { credentials: {}, version: '1.0' };
    }
  }

  /**
   * Save vault to disk
   */
  private saveVault(vault: { credentials: Record<string, StoredCredentials>; version: string }): void {
    try {
      fs.writeFileSync(this.vaultPath, JSON.stringify(vault, null, 2), { mode: 0o600 });
    } catch (error) {
      console.error('Failed to save vault:', error);
      throw new Error('Failed to save credentials vault');
    }
  }

  /**
   * Clear all credentials (for testing/reset)
   */
  clearVault(): void {
    this.saveVault({ credentials: {}, version: '1.0' });
  }
}
