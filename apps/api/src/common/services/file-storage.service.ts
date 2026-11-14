import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
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
import { PlanQuotaService } from './plan-quota.service';

/** Whose storage the bytes count against. `enforce: false` for automatic copies (mail sync) that must not be dropped. */
export type StorageOwner = { firmId: string; enforce?: boolean };

@Injectable()
export class FileStorageService {
  private readonly logger = new Logger(FileStorageService.name);
  private readonly uploadDir: string;
  private readonly bucket?: string;
  private readonly s3?: S3Client;

  constructor(
    private readonly config: ConfigService,
    @Optional() private readonly quota?: PlanQuotaService,
  ) {
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
   * Always an object key / relative key (e.g. `intake/<id>/documents/<file>`),
   * never a doubled `uploads/uploads/...` filesystem path.
   */
  async put(relativeKey: string, body: Buffer, contentType?: string, owner?: StorageOwner): Promise<string> {
    const key = this.normalizeKey(relativeKey);
    if (owner && owner.enforce !== false) await this.assertRoom(owner.firmId, body.length);
    await this.write(key, body, contentType);
    if (owner) {
      // Accounting never fails an upload that already landed.
      await this.quota?.recordStored(key, owner.firmId, body.length).catch((err) => this.logger.warn(`StoredObject record failed for ${key}: ${err}`));
    }
    return key;
  }

  /** Throws PLAN_LIMIT_STORAGE when `bytes` more would pass the firm's plan. Call before creating DB rows for the file. */
  async assertRoom(firmId: string, bytes: number): Promise<void> {
    await this.quota?.assertStorageAvailable(firmId, bytes);
  }

  private async write(key: string, body: Buffer, contentType?: string): Promise<void> {
    if (this.isS3) {
      await this.s3!.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          ServerSideEncryption: 'AES256',
        }),
      );
      return;
    }

    const fullPath = this.toLocalPath(key);
    mkdirSync(path.dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, body);
  }

  async getBuffer(storagePath: string): Promise<Buffer> {
    if (!storagePath) throw new NotFoundException('File not found');

    if (!this.isS3 || this.looksLikeLocalPath(storagePath)) {
      const localPath = this.toLocalPath(storagePath);
      if (existsSync(localPath)) {
        return readFileSync(localPath);
      }
      if (!this.isS3) {
        this.logger.warn(`Local file missing: ${localPath} (stored as ${storagePath})`);
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
    await this.quota?.forgetStored(this.toObjectKey(storagePath)).catch(() => undefined);

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

  /** Exported for unit tests — resolve a stored path to a local filesystem path. */
  resolveLocalPath(storagePath: string): string {
    return this.toLocalPath(storagePath);
  }

  private normalizeKey(relativeKey: string): string {
    const key = relativeKey.replace(/\\/g, '/').replace(/^\/+/, '');
    // Keys can carry user/sender-chosen names (e.g. email attachment filenames); a `..` segment must never climb out.
    if (key.split('/').includes('..')) throw new Error(`Refusing storage key with a '..' segment: ${relativeKey}`);
    return key;
  }

  private uploadDirPrefixes(): string[] {
    const raw = this.uploadDir.replace(/\\/g, '/').replace(/\/+$/, '');
    const withoutDot = raw.replace(/^\.\//, '');
    return [...new Set([raw, withoutDot, './uploads', 'uploads'].filter(Boolean))];
  }

  /**
   * If `storagePath` already includes the upload-dir prefix (legacy rows stored
   * `uploads/intake/...` or `./uploads/...`), return the key after that prefix.
   * Otherwise null.
   */
  private stripUploadDirPrefix(storagePath: string): string | null {
    const normalized = storagePath.replace(/\\/g, '/');
    for (const prefix of this.uploadDirPrefixes()) {
      if (normalized === prefix) return '';
      if (normalized.startsWith(`${prefix}/`)) {
        return normalized.slice(prefix.length + 1);
      }
    }
    return null;
  }

  private looksLikeLocalPath(storagePath: string): boolean {
    return (
      path.isAbsolute(storagePath) ||
      storagePath.startsWith('./') ||
      storagePath.startsWith('.\\') ||
      this.stripUploadDirPrefix(storagePath) !== null ||
      storagePath.includes(`${path.sep}uploads${path.sep}`) ||
      storagePath.includes('/uploads/')
    );
  }

  private toLocalPath(storagePath: string): string {
    if (path.isAbsolute(storagePath)) {
      return storagePath;
    }

    const stripped = this.stripUploadDirPrefix(storagePath);
    if (stripped !== null) {
      return path.join(this.uploadDir, stripped);
    }

    if (storagePath.startsWith('./') || storagePath.startsWith('.\\')) {
      return storagePath;
    }

    return path.join(this.uploadDir, storagePath);
  }

  private toObjectKey(storagePath: string): string {
    const stripped = this.stripUploadDirPrefix(storagePath);
    if (stripped !== null) return stripped;
    return this.normalizeKey(storagePath);
  }
}
