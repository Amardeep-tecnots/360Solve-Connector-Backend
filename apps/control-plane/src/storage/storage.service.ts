import { Injectable, Logger } from '@nestjs/common';
import {
  BlobServiceClient,
  BlockBlobClient,
  StorageSharedKeyCredential,
} from '@azure/storage-blob';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly blobServiceClient: BlobServiceClient | null;
  private readonly containerName: string;
  private readonly accountName?: string;
  private readonly accountKey?: string;

  constructor() {
    const rawConn = (process.env.AZURE_STORAGE_CONNECTION_STRING || '').trim();
    const connectionString = rawConn.replace(/\r|\n|\t/g, '').replace(/\s+/g, '');
    this.containerName = process.env.AZURE_STORAGE_CONTAINER || 'vansales-connector';

    let blobServiceClient: BlobServiceClient | null = null;
    if (connectionString && connectionString.includes('AccountName=') && connectionString.includes('AccountKey=')) {
      try {
        blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
        this.logger.log(`Azure Blob client initialized via connection string for container: ${this.containerName}`);
      } catch (err) {
        this.logger.error(`Failed to init Azure Blob client from connection string: ${(err as Error).message}`);
      }
    } else {
      this.accountName = process.env.AZURE_STORAGE_ACCOUNT;
      this.accountKey = process.env.AZURE_STORAGE_ACCOUNT_KEY;
      if (this.accountName && this.accountKey) {
        try {
          const credential = new StorageSharedKeyCredential(this.accountName, this.accountKey);
          const url = process.env.AZURE_STORAGE_URL || `https://${this.accountName}.blob.core.windows.net`;
          blobServiceClient = new BlobServiceClient(url, credential);
          this.logger.log(`Azure Blob client initialized via account/key for container: ${this.containerName}`);
        } catch (err) {
          this.logger.error(`Failed to init Azure Blob client from account/key: ${(err as Error).message}`);
        }
      } else {
        this.logger.warn('Azure storage credentials not configured (connection string or account/key). Storage disabled.');
      }
    }

    this.blobServiceClient = blobServiceClient;
  }

  async upload(
    key: string,
    data: Buffer | string,
    contentType?: string
  ): Promise<{ success: boolean; url?: string; error?: string }> {
    try {
      const client = await this.getBlockBlobClient(key);
      if (!client) {
        return { success: false, error: 'Storage not configured' };
      }

      await client.uploadData(typeof data === 'string' ? Buffer.from(data) : data, {
        blobHTTPHeaders: { blobContentType: contentType || 'application/octet-stream' },
      });

      const url = client.url;
      this.logger.log(`Uploaded ${key} to storage`);

      return { success: true, url };
    } catch (error: any) {
      this.logger.error(`Upload failed for ${key}: ${error.message}`, error.stack);
      return { success: false, error: error.message };
    }
  }

  private getKey(keyOrUri: string): string {
    if (!keyOrUri) return keyOrUri;
    if (keyOrUri.startsWith('s3://')) {
      let key = keyOrUri.slice(5);
      if (key.startsWith('/')) key = key.slice(1);
      return key;
    }
    return keyOrUri;
  }

  async download(key: string): Promise<{ success: boolean; data?: Buffer; error?: string }> {
    try {
      const client = await this.getBlockBlobClient(key);
      if (!client) {
        return { success: false, error: 'Storage not configured' };
      }

      this.logger.log(`Downloading from storage, container: ${this.containerName}, key: ${key}`);
      const buffer = await this.streamToBuffer(client);

      this.logger.log(`Downloaded ${key} from storage`);
      return { success: true, data: buffer };
    } catch (error: any) {
      this.logger.error(`Download failed for ${key}: ${error.message}`, error.stack);
      return { success: false, error: error.message };
    }
  }

  async delete(key: string): Promise<{ success: boolean; error?: string }> {
    try {
      const client = await this.getBlockBlobClient(key);
      if (!client) {
        return { success: false, error: 'Storage not configured' };
      }

      await client.deleteIfExists();
      this.logger.log(`Deleted ${key} from storage`);
      return { success: true };
    } catch (error: any) {
      this.logger.error(`Delete failed for ${key}: ${error.message}`, error.stack);
      return { success: false, error: error.message };
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const client = await this.getBlockBlobClient(key);
      if (!client) return false;
      return await client.exists();
    } catch {
      return false;
    }
  }

  getPublicUrl(key: string): string {
    const normalizedKey = this.getKey(key);
    const base = process.env.AZURE_STORAGE_URL || this.blobServiceClient?.url || '';
    if (base) return `${base.replace(/\/$/, '')}/${this.containerName}/${normalizedKey}`;
    return normalizedKey;
  }

  /**
   * Convenience method for uploading file content
   */
  async uploadFile(key: string, content: string, contentType?: string): Promise<string> {
    const result = await this.upload(key, content, contentType);
    if (!result.success) {
      throw new Error(result.error || 'Upload failed');
    }
    return result.url || key;
  }

  /**
   * Convenience method for downloading file content as string
   */
  async downloadFile(key: string): Promise<string> {
    const result = await this.download(key);
    if (!result.success || !result.data) {
      throw new Error(result.error || 'Download failed');
    }
    return result.data.toString('utf-8');
  }

  /**
   * Create a BlockBlobClient for a given key
   */
  private async getBlockBlobClient(keyOrUri: string): Promise<BlockBlobClient | null> {
    if (!this.blobServiceClient) return null;
    const key = this.getKey(keyOrUri);
    const containerClient = this.blobServiceClient.getContainerClient(this.containerName);
    // Ensure container exists; avoid throwing if permissions prevent creation
    try {
      await containerClient.createIfNotExists();
    } catch (err) {
      this.logger.debug(`Container check/create skipped or failed: ${(err as Error).message}`);
    }
    return containerClient.getBlockBlobClient(key);
  }

  private async streamToBuffer(client: BlockBlobClient): Promise<Buffer> {
    const download = await client.download();
    const chunks: Buffer[] = [];
    const readable = download.readableStreamBody;
    if (!readable) return Buffer.alloc(0);
    for await (const chunk of readable) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
}
