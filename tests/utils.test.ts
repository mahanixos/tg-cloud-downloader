import { describe, it, expect } from 'vitest';
import { sanitizeFilename, buildSafeKey, isSafeUrlToken } from '../src/utils/sanitize';
import { parseRange, contentRange } from '../src/utils/stream';
import { UploadQueue } from '../src/queue/upload.queue';

describe('sanitize', () => {
  it('strips path separators and leading dots', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('_.._etc_passwd');
    expect(sanitizeFilename('/abs/path')).toBe('_abs_path');
    expect(sanitizeFilename('.hidden')).toBe('hidden');
  });

  it('keeps CJK and spaces for anime filenames', () => {
    const out = sanitizeFilename('ソロ・レベリング S01E03.mkv');
    expect(out).toContain('ソロ・レベリング');
    expect(out).toContain('S01E03.mkv');
  });

  it('blocks traversal in buildSafeKey', () => {
    expect(() => buildSafeKey(['..', '..', 'secret'])).toThrow();
    const key = buildSafeKey(['anime', 'Solo Leveling', 'S01E03.mkv']);
    expect(key).toBe('anime/Solo Leveling/S01E03.mkv');
  });

  it('rejects unsafe url tokens', () => {
    expect(isSafeUrlToken('abc/def')).toBe(false);
    expect(isSafeUrlToken('abc..def')).toBe(false);
    expect(isSafeUrlToken('abc123')).toBe(true);
  });
});

describe('range parsing', () => {
  it('parses start-end', () => {
    const r = parseRange('bytes=0-499', 1000);
    expect(r).toEqual({ start: 0, end: 499, total: 1000 });
  });
  it('parses suffix range', () => {
    const r = parseRange('bytes=-100', 1000);
    expect(r).toEqual({ start: 900, end: 999, total: 1000 });
  });
  it('returns null on invalid/no header', () => {
    expect(parseRange(undefined, 1000)).toBeNull();
    expect(parseRange('items=0-1', 1000)).toBeNull();
  });
  it('returns null for unsatisfiable range', () => {
    expect(parseRange('bytes=500-499', 1000)).toBeNull();
    expect(parseRange('bytes=0-1000', 1000)).toBeNull(); // end must be < total
  });
  it('contentRange format', () => {
    const r = parseRange('bytes=0-499', 1000)!;
    expect(contentRange(r)).toBe('bytes 0-499/1000');
  });
});

describe('UploadQueue', () => {
  it('processes items sequentially by default', async () => {
    const order: string[] = [];
    const q = new UploadQueue<string>({
      concurrency: 1,
      maxRetries: 0,
      processor: async (item) => {
        order.push(item.id);
        await new Promise((r) => setTimeout(r, 5));
      },
    });
    q.add('a', 'a');
    q.add('b', 'b');
    q.add('c', 'c');
    await new Promise((r) => setTimeout(r, 40));
    expect(order).toEqual(['a', 'b', 'c']);
    expect(q.get('c')!.state).toBe('completed');
  });

  it('retries transient failures then fails', async () => {
    let attempts = 0;
    const q = new UploadQueue<string>({
      concurrency: 1,
      maxRetries: 2,
      processor: async () => {
        attempts++;
        throw new Error('boom');
      },
    });
    q.add('x', 'x', 2);
    await new Promise((r) => setTimeout(r, 50));
    expect(attempts).toBe(3); // 1 initial + 2 retries
    expect(q.get('x')!.state).toBe('failed');
  });

  it('cancels waiting items', () => {
    const q = new UploadQueue<string>({
      concurrency: 1,
      maxRetries: 0,
      processor: async () => new Promise(() => {}), // never resolves
    });
    q.add('busy', 'busy');
    q.add('pending', 'pending');
    expect(q.cancel('pending')).toBe(true);
    expect(q.get('pending')!.state).toBe('cancelled');
  });
});
