import * as crypto from 'crypto';
import * as os from 'os';

// Removed machine-id due to import hang issues
// Using hostname-based identifier instead

export class ApiKeyAuthService {
  private readonly API_KEY_PREFIX = 'vmc_';
  private readonly API_KEY_VERSION = '1';
  private readonly CHECKSUM_LENGTH = 4;

  /**
   * Validate API key format
   * Format: vmc_<tenant>_<random>_<checksum>
   */
  validateApiKey(apiKey: string): boolean {
    if (!apiKey || typeof apiKey !== 'string') {
      return false;
    }

    apiKey = apiKey.replace(/\s+/g, '').trim();

    const parts = apiKey.split('_');

    // Check format: vmc_<tenant>_<random>_<checksum>
    if (parts.length !== 4 || parts[0] !== 'vmc') {
      return false;
    }

    const [prefix, tenantId, randomPart, checksum] = parts;

    // Validate tenant ID (UUID format)
    if (!this.isValidUUID(tenantId)) {
      return false;
    }

    // Validate random part (should be at least 16 chars)
    if (randomPart.length < 16) {
      return false;
    }

    // Validate checksum
    const expectedChecksum = this.generateChecksum(prefix, tenantId, randomPart);
    if (checksum !== expectedChecksum) {
      return false;
    }

    return true;
  }

  validateApiKeyDetailed(apiKey: string): { valid: boolean; reason?: string } {
    if (!apiKey || typeof apiKey !== 'string') {
      return { valid: false, reason: 'API key is empty' };
    }

    const normalized = apiKey.replace(/\s+/g, '').trim();
    const parts = normalized.split('_');

    if (parts.length !== 4 || parts[0] !== 'vmc') {
      return { valid: false, reason: 'API key must match vmc_<tenant>_<random>_<checksum>' };
    }

    const [prefix, tenantId, randomPart, checksum] = parts;

    if (!this.isValidUUID(tenantId)) {
      return { valid: false, reason: 'Tenant ID in API key is not a valid UUID' };
    }

    if (randomPart.length < 16) {
      return { valid: false, reason: 'Random part is too short' };
    }

    const expectedChecksum = this.generateChecksum(prefix, tenantId, randomPart);
    if (checksum !== expectedChecksum) {
      return { valid: false, reason: 'Checksum mismatch (API key may be mistyped)' };
    }

    return { valid: true };
  }

  /**
   * Extract tenant ID from API key
   */
  extractTenantId(apiKey: string): string | null {
    if (!this.validateApiKey(apiKey)) {
      return null;
    }

    const parts = apiKey.split('_');
    return parts[1];
  }

  /**
   * Generate checksum for API key validation
   */
  private generateChecksum(prefix: string, tenantId: string, randomPart: string): string {
    const data = `${prefix}:${tenantId}:${randomPart}`;
    const hash = crypto.createHash('sha256').update(data).digest('hex');
    return hash.substring(0, this.CHECKSUM_LENGTH);
  }

  /**
   * Validate UUID format
   */
  private isValidUUID(uuid: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }

  /**
   * Get machine-specific identifier for encryption
   */
  getMachineId(): string {
    // Use hostname as machine identifier (replaced machine-id due to import hang)
    return crypto.createHash('sha256').update(os.hostname()).digest('hex');
  }

  /**
   * Generate machine-specific encryption key
   */
  generateMachineKey(): Buffer {
    const machineId = this.getMachineId();
    const salt = 'VanSalesMiniConnector2024';
    return crypto.scryptSync(machineId, salt, 32);
  }

  /**
   * Encrypt data with machine-specific key
   */
  encrypt(data: string): { encrypted: string; iv: string } {
    const key = this.generateMachineKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return {
      encrypted: encrypted + ':' + authTag.toString('hex'),
      iv: iv.toString('hex'),
    };
  }

  /**
   * Decrypt data with machine-specific key
   */
  decrypt(encrypted: string, iv: string): string {
    const key = this.generateMachineKey();
    const ivBuffer = Buffer.from(iv, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, ivBuffer);

    const [encryptedData, authTag] = encrypted.split(':');
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));

    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
}
