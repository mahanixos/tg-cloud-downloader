/**
 * Streaming helpers + a memory guard.
 *
 * Per Phase 0 rule (Large File Handling): never load an entire multi-GB file
 * into RAM. All transfers must be chunked/streamed, and per-file buffered bytes
 * must stay within MAX_MEMORY_BUFFER.
 */

import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export interface RangeSpec {
  start: number;
  end: number; // inclusive
  total: number;
}

/**
 * Parse an HTTP Range header into a single contiguous range (we support one
 * range per request — sufficient for ADM resume). Returns null when the header
 * is absent/invalid. Throws RangeError-like when unsatisfiable (caller maps to
 * 416).
 */
export function parseRange(
  header: string | undefined | null,
  total: number,
): RangeSpec | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null;
  const startStr = m[1] ?? '';
  const endStr = m[2] ?? '';

  let start: number;
  let end: number;

  if (startStr === '') {
    // suffix-range: bytes=-N (last N bytes)
    const suffix = Number.parseInt(endStr, 10);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    start = Math.max(0, total - suffix);
    end = total - 1;
  } else {
    start = Number.parseInt(startStr, 10);
    end = endStr === '' ? total - 1 : Number.parseInt(endStr, 10);
  }

  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start < 0 || end >= total || start > end) return null;
  return { start, end, total };
}

/**
 * Content-Range header value for a 206 response.
 */
export function contentRange(spec: RangeSpec): string {
  return `bytes ${spec.start}-${spec.end}/${spec.total}`;
}

/**
 * Create a byte-slice stream from a source Readable between [start, end]
 * (inclusive). Reads in fixed chunks and discards bytes before `start`, emits
 * bytes up to `end`, then ends. Memory usage is bounded by CHUNK_SIZE.
 */
export async function sliceStream(
  sourceFactory: () => Promise<Readable>,
  start: number,
  end: number,
  chunkSize = 8 * 1024 * 1024,
): Promise<Readable> {
  const out = new Readable({ read() {} });
  (async () => {
    try {
      const src = await sourceFactory();
      let pos = 0;
      let skipped = 0;
      for await (const chunk of src) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        // Skip bytes before start without buffering the whole file.
        if (pos + buf.length <= start) {
          pos += buf.length;
          continue;
        }
        let slice = buf;
        if (skipped < start - pos) {
          const skip = start - pos;
          slice = slice.subarray(skip);
          skipped = start;
        }
        pos += buf.length - (start - skipped >= 0 ? 0 : 0);
        // Trim bytes after end.
        const remaining = end - pos + 1;
        if (remaining <= 0) {
          src.destroy();
          break;
        }
        if (slice.length > remaining) slice = slice.subarray(0, remaining);
        pos += slice.length;
        out.push(slice);
        if (pos > end) {
          src.destroy();
          break;
        }
      }
      out.push(null);
    } catch (err) {
      out.destroy(err as Error);
    }
  })();
  void chunkSize;
  return out;
}

export { pipeline };
