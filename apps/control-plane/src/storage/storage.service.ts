import { Injectable, Logger } from '@nestjs/common';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3Client: S3Client;
  private readonly bucketName: string;

  constructor() {
    this.s3Client = new S3Client({
      endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY || 'minioadmin',
        secretAccessKey: process.env.S3_SECRET_KEY || 'minioadmin',
      },
      region: 'us-east-1',
      forcePathStyle: true,
    });

    this.bucketName = process.env.S3_BUCKET || 'vansales-connector';
  }

  async upload(
    key: string,
    data: Buffer | string,
    contentType?: string
  ): Promise<{ success: boolean; url?: string; error?: string }> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: data,
        ContentType: contentType || 'application/json',
      });

      await this.s3Client.send(command);

      const url = `${process.env.S3_ENDPOINT || 'http://localhost:9000'}/${this.bucketName}/${key}`;

      this.logger.log(`Uploaded ${key} to storage`);

      return {
        success: true,
        url,
      };

    } catch (error) {
      this.logger.error(`Upload failed for ${key}: ${error.message}`, error.stack);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Extract the object key from an S3 URI or use the key as-is
   */
  private parseKey(keyOrUri: string): string {
    // Handle s3://bucket/key format
    // We need to be careful not to remove actual path components that look like bucket names
    if (keyOrUri.startsWith('s3://')) {
      // Remove 's3://' prefix only
      let key = keyOrUri.slice(5);
      // If there's a leading slash issue, fix it
      if (key.startsWith('/')) {
        key = key.slice(1);
      }
      // Don't try to remove the "bucket" - just keep everything after s3://
      // The actual bucket is configured separately in this.service
      return key;
    }
    return keyOrUri;
  }

  async download(key: string): Promise<{ success: boolean; data?: Buffer; error?: string }> {
    try {
      // Parse the key - handle s3:// URI format
      const parsedKey = this.parseKey(key);
      
      this.logger.log(`Downloading from storage, bucket: ${this.bucketName}, key: ${parsedKey}, original: ${key}`);

      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: parsedKey,
      });

      const response = await this.s3Client.send(command);
      const data = await response.Body?.transformToByteArray();

      this.logger.log(`Downloaded ${key} from storage`);

      return {
        success: true,
        data: data ? Buffer.from(data) : undefined,
      };

    } catch (error) {
      this.logger.error(`Download failed for ${key}: ${error.message}`, error.stack);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async delete(key: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Parse the key - handle s3:// URI format
      const parsedKey = this.parseKey(key);

      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: parsedKey,
      });

      await this.s3Client.send(command);

      this.logger.log(`Deleted ${key} from storage`);

      return {
        success: true,
      };

    } catch (error) {
      this.logger.error(`Delete failed for ${key}: ${error.message}`, error.stack);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      // Parse the key - handle s3:// URI format
      const parsedKey = this.parseKey(key);

      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: parsedKey,
      });

      await this.s3Client.send(command);
      return true;

    } catch (error) {
      return false;
    }
  }

  getPublicUrl(key: string): string {
    return `${process.env.S3_ENDPOINT || 'http://localhost:9000'}/${this.bucketName}/${key}`;
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
}
