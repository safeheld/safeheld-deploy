import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'stream';
import fs from 'fs/promises';
import path from 'path';
import { config } from '../config';
import { logger } from './logger';

interface FileStorage {
  store(key: string, buffer: Buffer, contentType?: string): Promise<string>;
  get(storagePath: string): Promise<Buffer>;
  getSignedDownloadUrl(storagePath: string, expiresInSeconds?: number): Promise<string>;
  delete(storagePath: string): Promise<void>;
}

class S3FileStorage implements FileStorage {
  private client: S3Client;
  private defaultBucket: string;

  constructor() {
    this.client = new S3Client({
      region: config.S3_REGION,
      credentials: {
        accessKeyId: config.S3_ACCESS_KEY,
        secretAccessKey: config.S3_SECRET_KEY,
      },
      ...(config.S3_ENDPOINT ? { endpoint: config.S3_ENDPOINT } : {}),
      forcePathStyle: config.S3_FORCE_PATH_STYLE,
    });
    this.defaultBucket = config.S3_BUCKET;
  }

  private parsePath(storagePath: string): { bucket: string; key: string } {
    if (storagePath.startsWith('s3://')) {
      const withoutScheme = storagePath.substring(5);
      const slashIdx = withoutScheme.indexOf('/');
      return {
        bucket: withoutScheme.substring(0, slashIdx),
        key: withoutScheme.substring(slashIdx + 1),
      };
    }
    return { bucket: this.defaultBucket, key: storagePath };
  }

  async store(key: string, buffer: Buffer, contentType = 'application/octet-stream'): Promise<string> {
    const bucket = this.defaultBucket;
    await this.client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }));
    return `s3://${bucket}/${key}`;
  }

  async get(storagePath: string): Promise<Buffer> {
    const { bucket, key } = this.parsePath(storagePath);
    const response = await this.client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const stream = response.Body as Readable;
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  async getSignedDownloadUrl(storagePath: string, expiresInSeconds = 3600): Promise<string> {
    const { bucket, key } = this.parsePath(storagePath);
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  async delete(storagePath: string): Promise<void> {
    const { bucket, key } = this.parsePath(storagePath);
    await this.client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }
}

class LocalFileStorage implements FileStorage {
  private baseDir: string;

  constructor() {
    this.baseDir = path.join(process.cwd(), 'uploads');
  }

  async store(key: string, buffer: Buffer, _contentType?: string): Promise<string> {
    const fullPath = path.join(this.baseDir, key);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, buffer);
    return `local://${key}`;
  }

  async get(storagePath: string): Promise<Buffer> {
    const key = storagePath.startsWith('local://') ? storagePath.substring(8) : storagePath;
    const fullPath = path.join(this.baseDir, key);
    return fs.readFile(fullPath);
  }

  async getSignedDownloadUrl(storagePath: string, _expiresInSeconds?: number): Promise<string> {
    // For local storage, return the path directly (handled by static serving in dev)
    const key = storagePath.startsWith('local://') ? storagePath.substring(8) : storagePath;
    return `/uploads/${key}`;
  }

  async delete(storagePath: string): Promise<void> {
    const key = storagePath.startsWith('local://') ? storagePath.substring(8) : storagePath;
    const fullPath = path.join(this.baseDir, key);
    await fs.unlink(fullPath).catch(() => {});
  }
}

export const fileStorage: FileStorage = config.FILE_STORAGE_TYPE === 's3'
  ? new S3FileStorage()
  : new LocalFileStorage();

logger.info({ storageType: config.FILE_STORAGE_TYPE }, 'File storage initialised');
