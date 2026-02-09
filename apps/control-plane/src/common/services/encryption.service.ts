import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';

@Injectable()
export class EncryptionService {
  private key: Buffer | null = null;

  private getKey(): Buffer {
    if (this.key) {
      return this.key;
    }

    const keyHex = process.env.ENCRYPTION_KEY;
    if (!keyHex) {
      throw new Error('ENCRYPTION_KEY environment variable is required');
    }
    
    const key = Buffer.from(keyHex, 'hex');
    if (key.length !== 32) {
      throw new Error('ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
    }
    
    this.key = key;
    return this.key;
  }

  encrypt(plaintext: object): string {
    const iv = randomBytes(16);
    const cipher = createCipheriv(ALGORITHM, this.getKey(), iv);

    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(plaintext), 'utf8'),
      cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    // Store: iv:authTag:encrypted
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  decrypt(ciphertext: string): object {
    const [ivHex, authTagHex, encryptedHex] = ciphertext.split(':');

    if (!ivHex || !authTagHex || !encryptedHex) {
      throw new Error('Invalid encrypted data format');
    }

    const decipher = createDecipheriv(ALGORITHM, this.getKey(), Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedHex, 'hex')),
      decipher.final(),
    ]);

    return JSON.parse(decrypted.toString('utf8'));
  }
}
