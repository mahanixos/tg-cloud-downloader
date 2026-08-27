/**
 * Google Drive provider STUB (Phase 1).
 *
 * This file defines the constructor/config shape and throws a clear "not
 * implemented" error at runtime. The real implementation lands in Phase 5 using
 * googleapis (drive v3) resumable uploads (max 5 TB/object, chunked, resumable).
 *
 * No Google credentials are read here in Phase 1 — the config is validated but
 * the client is not constructed until Phase 5.
 */

import { Readable } from 'node:stream';
import { createLogger, type Logger } from '../../utils/logger';
import type {
  StorageProvider,
  StoredFileMeta,
  UploadOptions,
  DownloadResult,
} from '../storage.interface';
import type { AppConfig } from '../../config/env';

export interface GoogleDriveConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  folderId: string;
}

export class GoogleDriveProvider implements StorageProvider {
  readonly name = 'gdrive' as const;
  private cfg: GoogleDriveConfig;
  private log: Logger;

  constructor(cfg: GoogleDriveConfig, log: Logger = createLogger('info')) {
    this.cfg = cfg;
    this.log = log;
  }

  /** Phase 5 will construct an authenticated OAuth2 client here. */
  static fromAppConfig(config: AppConfig, log?: Logger): GoogleDriveProvider {
    return new GoogleDriveProvider(
      {
        clientId: config.googleDrive.clientId,
        clientSecret: config.googleDrive.clientSecret,
        refreshToken: config.googleDrive.refreshToken,
        folderId: config.googleDrive.folderId,
      },
      log,
    );
  }

  private notImplemented(): never {
    throw new Error(
      'GoogleDriveProvider is a Phase 5 stub. Real resumable-upload ' +
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
  async getDirectUrl(): Promise<string | null> {
    // Drive's direct public download is NOT assumed ADM-safe (Phase 0 approval).
    // Delivery via R2/Worker or a signed Drive export URL is handled later.
    return null;
  }
}
