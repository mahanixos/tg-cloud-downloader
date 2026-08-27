/**
 * Mock storage provider — used when USE_MOCKS=true or before real credentials
 * exist. Stores bytes in memory (bounded per key) so tests run without any
 * cloud account. This proves the streaming/interface contract end-to-end.
 */

import { Readable } from 'node:stream';
import { createLogger, type Logger } from '../../utils/logger';
import type { StorageProvider, StoredFileMeta, UploadOptions, DownloadResult } from '../storage.interface';

interface MockEntry {
  meta: StoredFileMeta;
  chunks: Buffer[];
  totalBytes: number;
}

export class MockStorageProvider implements StorageProvider {
  readonly name = 'mock' as const;
  private store = new Map<string, MockEntry>();
  private log: Logger;

  constructor(log: Logger = createLogger('info')) {
    this.log = log;
  }

  async upload(
    source: () => Promise<Readable>,
    opts: UploadOptions,
  ): Promise<StoredFileMeta> {
    const chunks: Buffer[] = [];
    let total = 0;
    const src = await source();
    for await (const chunk of src) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      chunks.push(buf);
      total += buf.length;
    }
    const meta: StoredFileMeta = {
      key: opts.key,
      name: opts.name,
      size: opts.size ?? total,
      mimeType: opts.mimeType ?? 'application/octet-stream',
      provider: 'mock',
      extra: opts.extra,
    };
    this.store.set(opts.key, { meta, chunks, totalBytes: total });
    this.log.info('mock: stored file', { key: opts.key, size: total });
    return meta;
  }

  async download(
    key: string,
    range?: { start: number; end: number },
  ): Promise<DownloadResult> {
    const entry = this.store.get(key);
    if (!entry) throw new Error(`Mock: key not found: ${key}`);
    const full = Buffer.concat(entry.chunks, entry.totalBytes);
    if (range) {
      const start = Math.max(0, range.start);
      const end = Math.min(full.length - 1, range.end);
      const slice = full.subarray(start, end + 1);
      return {
        stream: Readable.from(slice),
        size: full.length,
        mimeType: entry.meta.mimeType,
        ranged: true,
        range: { start, end, total: full.length },
      };
    }
    return {
      stream: Readable.from(full),
      size: entry.meta.size,
      mimeType: entry.meta.mimeType,
    };
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    return this.store.has(key);
  }

  async getMetadata(key: string): Promise<StoredFileMeta> {
    const entry = this.store.get(key);
    if (!entry) throw new Error(`Mock: key not found: ${key}`);
    return entry.meta;
  }

  async getDirectUrl(): Promise<string | null> {
    return null; // Mock has no public URL.
  }
}
