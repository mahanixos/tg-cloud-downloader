/**
 * Cloudflare R2 provider STUB (Phase 1).
 *
 * Defines constructor/config shape and throws "not implemented" at runtime.
 * Real implementation lands in Phase 6 using the S3-compatible API
 * (@aws-sdk/client-s3): multipart upload (5 TB max, 5 MB–5 GB parts, resumable),
 * delete, exists, metadata, and presigned GET URLs (zero egress, ADM-friendly).
 *
 * No R2 credentials are used in Phase 1.
 */

import { Readable } from 'node:stream';
import { createLogger, type Logger } from '../../utils/logger';
import type {
  StorageProvider,
  StoredFileMeta,
  UploadOptions,
  DownloadResult,
  UrlOptions,
} from '../storage.interface';
import type { AppConfig } from '../../config/env';

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicUrl: string;
}

export class CloudflareR2Provider implements StorageProvider {
  readonly name = 'r2' as const;
  private cfg: R2Config;
  private log: Logger;

  constructor(cfg: R2Config, log: Logger = createLogger('info')) {
    this.cfg = cfg;
    this.log = log;
  }

  static fromAppConfig(config: AppConfig, log?: Logger): CloudflareR2Provider {
    return new CloudflareR2Provider(
      {
        accountId: config.r2.accountId,
        accessKeyId: config.r2.accessKeyId,
        secretAccessKey: config.r2.secretAccessKey,
        bucketName: config.r2.bucketName,
        publicUrl: config.r2.publicUrl,
      },
      log,
    );
  }

  private notImplemented(): never {
    throw new Error(
      'CloudflareR2Provider is a Phase 6 stub. Real S3-compatible multipart ' +
        'implementation is not present in Phase 1.',
    );
  }

  async upload(_source: () => Promise<Readable>, _opts: UploadOptions): Promise<StoredFileMeta> {
    this.notImplemented();
  }
  async download(_key: string, _range?: { start: number; end: number }): Promise<DownloadResult> {
    this.notImplemented();
  }
  async delete(_key: string): Promise<void> {
    this.notImplemented();
  }
  async exists(_key: string): Promise<boolean> {
    this.notImplemented();
  }
  async getMetadata(_key: string): Promise<StoredFileMeta> {
    this.notImplemented();
  }
  async getDirectUrl(_key: string, _opts?: UrlOptions): Promise<string | null> {
    this.notImplemented();
  }
}
