/**
 * Storage abstraction. Conceptually:
 *
 *   StorageProvider
 *     ├── GoogleDriveProvider   (Phase 5)
 *     ├── CloudflareR2Provider  (Phase 6)
 *     └── MockStorageProvider   (Phase 1 — runs without creds)
 *
 * The app talks ONLY to this interface. The concrete backend (Drive / R2) is
 * selected by config. Per the Phase 0 approval, STORAGE and DELIVERY are
 * decoupled: this interface stores bytes and returns metadata, but does NOT
 * decide how files are delivered to the user (see downloads/delivery.ts).
 *
 * All uploads/downloads are stream-based to avoid loading multi-GB files into
 * RAM (Phase 0 large-file rule).
 */

import { Readable } from 'node:stream';

export interface StoredFileMeta {
  /** Opaque provider-side identifier / path. Never expose raw to clients. */
  key: string;
  name: string;
  size: number;
  mimeType: string;
  provider: 'gdrive' | 'r2' | 'mock';
  /** Provider-specific id if needed (e.g. Drive file id). */
  providerId?: string;
  createdAt?: string;
  /** Free-form metadata (anime info, etc.), set later. */
  extra?: Record<string, string>;
}

export interface UploadOptions {
  key: string;
  name: string;
  mimeType?: string;
  size?: number;
  /** Optional source stream factory (so we can retry without re-acquiring). */
  source?: () => Promise<Readable>;
  extra?: Record<string, string>;
}

export interface DownloadResult {
  stream: Readable;
  size: number;
  mimeType: string;
  /** True if the returned stream already reflects a requested byte range. */
  ranged?: boolean;
  range?: { start: number; end: number; total: number };
}

export interface UrlOptions {
  /** Seconds until expiry. */
  expiresInSeconds?: number;
  /** Filename hint for Content-Disposition on the delivery side. */
  filename?: string;
}

export interface StorageProvider {
  readonly name: 'gdrive' | 'r2' | 'mock';

  /** Stream a source into storage. source() yields the bytes (retryable). */
  upload(source: () => Promise<Readable>, opts: UploadOptions): Promise<StoredFileMeta>;

  /** Open a download stream. If range is given, the stream covers [start,end]. */
  download(key: string, range?: { start: number; end: number }): Promise<DownloadResult>;

  delete(key: string): Promise<void>;

  exists(key: string): Promise<boolean>;

  getMetadata(key: string): Promise<StoredFileMeta>;

  /**
   * Provider-private access URL (e.g. R2 presigned GET). Note: this is NOT the
   * user-facing signed download URL — that is produced by the delivery layer.
   * Some providers (Drive) may not support public URLs; they return null.
   */
  getDirectUrl?(key: string, opts?: UrlOptions): Promise<string | null>;
}
