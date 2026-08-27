import { describe, it, expect } from 'vitest';
import { MockStorageProvider } from '../src/storage/providers/mock.provider';
import { Readable } from 'node:stream';

function streamOf(buf: Buffer): () => Promise<Readable> {
  return () => Promise.resolve(Readable.from(buf));
}

describe('MockStorageProvider (storage interface contract)', () => {
  it('uploads a stream and reports correct metadata', async () => {
    const s = new MockStorageProvider();
    const data = Buffer.alloc(2048, 9);
    const meta = await s.upload(streamOf(data), {
      key: 'a/b.bin',
      name: 'b.bin',
      mimeType: 'application/octet-stream',
      size: data.length,
    });
    expect(meta.size).toBe(2048);
    expect(meta.key).toBe('a/b.bin');
    expect(meta.provider).toBe('mock');
  });

  it('exists() reflects stored state', async () => {
    const s = new MockStorageProvider();
    expect(await s.exists('x')).toBe(false);
    await s.upload(streamOf(Buffer.alloc(10)), { key: 'x', name: 'x' });
    expect(await s.exists('x')).toBe(true);
  });

  it('downloads full stream with correct size', async () => {
    const s = new MockStorageProvider();
    const data = Buffer.from('hello world');
    await s.upload(streamOf(data), { key: 'h', name: 'h' });
    const dl = await s.download('h');
    const got: Buffer[] = [];
    for await (const c of dl.stream) got.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
    expect(Buffer.concat(got).toString()).toBe('hello world');
    expect(dl.size).toBe(data.length);
  });

  it('downloads a byte range', async () => {
    const s = new MockStorageProvider();
    const data = Buffer.from('0123456789');
    await s.upload(streamOf(data), { key: 'r', name: 'r' });
    const dl = await s.download('r', { start: 2, end: 5 });
    const got: Buffer[] = [];
    for await (const c of dl.stream) got.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
    expect(Buffer.concat(got).toString()).toBe('2345');
    expect(dl.ranged).toBe(true);
  });

  it('deletes a stored file', async () => {
    const s = new MockStorageProvider();
    await s.upload(streamOf(Buffer.alloc(5)), { key: 'd', name: 'd' });
    await s.delete('d');
    expect(await s.exists('d')).toBe(false);
  });

  it('throws on missing key', async () => {
    const s = new MockStorageProvider();
    await expect(s.download('nope')).rejects.toThrow();
  });

  it('handles a multi-MB stream without error (streaming contract)', async () => {
    const s = new MockStorageProvider();
    const big = Buffer.alloc(5 * 1024 * 1024, 1); // 5 MiB
    const meta = await s.upload(streamOf(big), { key: 'big', name: 'big' });
    expect(meta.size).toBe(5 * 1024 * 1024);
  });
});
