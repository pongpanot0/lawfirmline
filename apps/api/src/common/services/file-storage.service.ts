import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { createReadStream, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import * as path from 'path';
import { Readable } from 'stream';

@Injectable()
export class FileStorageService {
  private readonly logger = new Logger(FileStorageService.name);
  private readonly uploadDir: string;
  private readonly bucket?: string;
  private readonly s3?: S3Client;

  constructor(private readonly config: ConfigService) {
    this.uploadDir = this.config.get<string>('UPLOAD_DIR') ?? './uploads';
    this.bucket = this.config.get<string>('S3_BUCKET')?.trim() || undefined;
    if (this.bucket) {
      const region =
        this.config.get<string>('S3_REGION') ??
        this.config.get<string>('AWS_REGION') ??
        'ap-southeast-7';
      this.s3 = new S3Client({ region });
      this.logger.log(`File storage: S3 bucket=${this.bucket} region=${region}`);
    } else {
      this.logger.log(`File storage: local dir=${this.uploadDir}`);
    }
  }

  get isS3(): boolean {
    return Boolean(this.bucket && this.s3);
  }

  /**
   * Persist bytes and return the value to store in DB (`storagePath`).
   * With S3 this is an object key; locally it remains a filesystem path.
   */
  async put(relativeKey: string, body: Buffer, contentType?: string): Promise<string> {
    const key = this.normalizeKey(relativeKey);
    if (this.isS3) {
      await this.s3!.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
      return key;
    }

    const fullPath = path.join(this.uploadDir, key);
    mkdirSync(path.dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, body);
    return fullPath;
  }

  async getBuffer(storagePath: string): Promise<Buffer> {
    if (!storagePath) throw new NotFoundException('File not found');

    if (!this.isS3 || this.looksLikeLocalPath(storagePath)) {
      const localPath = this.toLocalPath(storagePath);
      if (existsSync(localPath)) {
        return readFileSync(localPath);
      }
      if (!this.isS3) {
        throw new NotFoundException('File not found');
      }
    }

    const key = this.toObjectKey(storagePath);
    try {
      const result = await this.s3!.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return Buffer.from(await result.Body!.transformToByteArray());
    } catch (error) {
      this.logger.warn(`S3 get failed for ${key}: ${String(error)}`);
      throw new NotFoundException('File not found');
    }
  }

  async openDownloadStream(storagePath: string): Promise<Readable> {
    if (!storagePath) throw new NotFoundException('File not found');

    if (!this.isS3 || this.looksLikeLocalPath(storagePath)) {
      const localPath = this.toLocalPath(storagePath);
      if (existsSync(localPath)) {
        return createReadStream(localPath);
      }
      if (!this.isS3) {
        throw new NotFoundException('File not found');
      }
    }

    const key = this.toObjectKey(storagePath);
    try {
      const result = await this.s3!.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      const body = result.Body;
      if (!body) throw new NotFoundException('File not found');
      return body as Readable;
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.warn(`S3 stream failed for ${key}: ${String(error)}`);
      throw new NotFoundException('File not found');
    }
  }

  async delete(storagePath: string): Promise<void> {
    if (!storagePath) return;

    if (!this.isS3 || this.looksLikeLocalPath(storagePath)) {
      const localPath = this.toLocalPath(storagePath);
      try {
        if (existsSync(localPath)) unlinkSync(localPath);
      } catch {
        // ignore missing local files
      }
      if (!this.isS3) return;
      // Also try S3 in case path was migrated / dual-written.
    }

    const key = this.toObjectKey(storagePath);
    try {
      await this.s3!.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch (error) {
      this.logger.warn(`S3 delete failed for ${key}: ${String(error)}`);
    }
  }

  private normalizeKey(relativeKey: string): string {
    return relativeKey.replace(/\\/g, '/').replace(/^\/+/, '');
  }

  private looksLikeLocalPath(storagePath: string): boolean {
    return (
      path.isAbsolute(storagePath) ||
      storagePath.startsWith('./') ||
      storagePath.startsWith('.\\') ||
      storagePath.includes(`${path.sep}uploads${path.sep}`) ||
      storagePath.includes('/uploads/') ||
      storagePath.startsWith(this.uploadDir)
    );
  }

  private toLocalPath(storagePath: string): string {
    if (path.isAbsolute(storagePath) || storagePath.startsWith(this.uploadDir)) {
      return storagePath;
    }
    if (storagePath.startsWith('./') || storagePath.startsWith('.\\')) {
      return storagePath;
    }
    return path.join(this.uploadDir, storagePath);
  }

  private toObjectKey(storagePath: string): string {
    const normalized = storagePath.replace(/\\/g, '/');
    const uploadDir = this.uploadDir.replace(/\\/g, '/').replace(/\/+$/, '');
    if (normalized.startsWith(uploadDir + '/')) {
      return normalized.slice(uploadDir.length + 1);
    }
    if (normalized.startsWith('./uploads/')) {
      return normalized.slice('./uploads/'.length);
    }
    if (normalized.startsWith('uploads/')) {
      return normalized.slice('uploads/'.length);
    }
    return this.normalizeKey(normalized);
  }
}
