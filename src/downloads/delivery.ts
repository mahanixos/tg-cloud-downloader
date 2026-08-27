/**
 * Delivery layer — DECIPLED from storage (Phase 0 approval rule 3 & 9).
 *
 * The delivery layer is responsible for turning an internal storage reference
 * into a user-facing, signed download URL and for serving bytes to the client
 * (ADM / browser) with full HTTP range support (206 / 416).
 *
 * It does NOT know which cloud backend holds the bytes; it is given a
 * StorageProvider + key at request time. This means we can later swap the
 * delivery backend (Node server vs Cloudflare Worker vs R2 native) without
 * touching Telegram or storage code.
 *
 * Security (Phase 0 approval rule 7): the URL contains a signed token (HMAC)
 * wrapping an OPAQUE file id. The raw storage key is never user-controlled and
 * cannot be manipulated through URL params to access arbitrary files.
 */

import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { parseRange, contentRange, sliceStream } from '../utils/stream';
import { isSafeUrlToken } from '../utils/sanitize';
import type { StorageProvider } from '../storage/storage.interface';

export interface DeliveryConfig {
  baseUrl: string;
  secret: string;
  urlTtlSeconds: number;
}

export interface SignedToken {
  id: string; // opaque file id (NOT the raw storage key)
  exp: number; // expiry epoch seconds
  sig: string; // HMAC-SHA256
}

export interface ServeOptions {
  /** Incoming Range header value. */
  range?: string | null;
  /** Filename for Content-Disposition. */
  filename?: string;
}

export interface ServeResult {
  status: 200 | 206 | 416;
  headers: Record<string, string>;
  body?: Readable;
  /** When 416, the Content-Range header to send. */
  contentRange?: string;
}

export class DeliveryService {
  private cfg: DeliveryConfig;

  constructor(cfg: DeliveryConfig) {
    if (!cfg.secret || cfg.secret.length < 16) {
      throw new Error('DeliveryService requires a DOWNLOAD_SECRET of >= 16 chars');
    }
    this.cfg = cfg;
  }

  /**
   * Map an internal storage key to an opaque id. In a later phase this id would
   * be persisted in a DB; for Phase 1 we hash the key deterministically so the
   * mock flow works without a database.
   */
  private keyToId(key: string): string {
    return crypto.createHash('sha256').update(`key:${key}`).digest('hex').slice(0, 32);
  }
  private idToKey(id: string, known: Map<string, string>): string | undefined {
    // Phase 1: reverse lookup via provided map. Phase 16 will use a DB.
    return known.get(id);
  }

  private sign(id: string, exp: number): string {
    return crypto
      .createHmac('sha256', this.cfg.secret)
      .update(`${id}.${exp}`)
      .digest('hex');
  }

  /** Generate a signed download URL for an internal storage key. */
  createDownloadUrl(key: string, opts?: { expiresInSeconds?: number; filename?: string }): string {
    const id = this.keyToId(key);
    const exp = Math.floor(Date.now() / 1000) + (opts?.expiresInSeconds ?? this.cfg.urlTtlSeconds);
    const sig = this.sign(id, exp);
    const token = Buffer.from(JSON.stringify({ id, exp, sig } satisfies SignedToken)).toString('base64url');
    const u = new URL(this.cfg.baseUrl);
    u.pathname = '/files/' + token;
    const fn = opts?.filename;
    if (fn) u.searchParams.set('name', fn);
    return u.toString();
  }

  /** Verify + decode a signed token. Throws on tamper/expiry. */
  verifyToken(token: string): SignedToken {
    let parsed: SignedToken;
    try {
      parsed = JSON.parse(Buffer.from(token, 'base64url').toString('utf8')) as SignedToken;
    } catch {
      throw new Error('malformed token');
    }
    if (!isSafeUrlToken(parsed.id)) throw new Error('unsafe token id');
    const expected = this.sign(parsed.id, parsed.exp);
    const a = Buffer.from(expected);
    const b = Buffer.from(parsed.sig);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      throw new Error('token signature mismatch');
    }
    if (parsed.exp * 1000 < Date.now()) throw new Error('token expired');
    return parsed;
  }

  /**
   * Serve a file to the client with full range support. `keyResolver` maps the
   * opaque id back to a storage key (DB in later phases). Returns the HTTP
   * status/headers/body — the caller (Worker or Node server) writes it.
   */
  async serve(
    token: string,
    storage: StorageProvider,
    keyResolver: (id: string) => Promise<string | undefined>,
    opts?: ServeOptions,
  ): Promise<ServeResult> {
    const claims = this.verifyToken(token);
    const key = await keyResolver(claims.id);
    if (!key) return { status: 416, headers: {}, contentRange: 'bytes */0' };

    const meta = await storage.getMetadata(key);
    const total = meta.size;
    const range = parseRange(opts?.range, total);

    if (range) {
      const dl = await storage.download(key, { start: range.start, end: range.end });
      return {
        status: 206,
        headers: {
          'Content-Range': contentRange(range),
          'Accept-Ranges': 'bytes',
          'Content-Length': String(range.end - range.start + 1),
          'Content-Type': dl.mimeType,
          'Content-Disposition': `attachment; filename="${opts?.filename ?? meta.name}"`,
        },
        body: dl.stream,
      };
    }

    // Unsatisfiable range request -> 416.
    if (opts?.range) {
      return { status: 416, headers: {}, contentRange: `bytes */${total}` };
    }

    const dl = await storage.download(key);
    return {
      status: 200,
      headers: {
        'Accept-Ranges': 'bytes',
        'Content-Length': String(total),
        'Content-Type': dl.mimeType,
        'Content-Disposition': `attachment; filename="${opts?.filename ?? meta.name}"`,
      },
      body: dl.stream,
    };
  }

  /** For Phase 1 tests: resolve a key without a real DB. */
  static memoryResolver(map: Map<string, string>) {
    return memoryResolver(map);
  }
}

// re-export for convenience
export { sliceStream };

/**
 * Build a key resolver backed by an in-memory id->key map (Phase 1, no DB).
 * Phase 16 will replace this with a database lookup.
 */
export function memoryResolver(map: Map<string, string>): (id: string) => Promise<string | undefined> {
  // map is id -> key
  return async (id: string) => map.get(id);
}
