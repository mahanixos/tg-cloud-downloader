import { describe, it, expect } from 'vitest';
import { DeliveryService, memoryResolver } from '../src/downloads/delivery';
import { MockStorageProvider } from '../src/storage/providers/mock.provider';
import { Readable } from 'node:stream';

function makeStorage() {
  const s = new MockStorageProvider();
  return s;
}

const deliveryCfg = {
  baseUrl: 'http://localhost:8787',
  secret: 'test-secret-1234567890',
  urlTtlSeconds: 3600,
};

async function seed(storage: MockStorageProvider, key: string, data: Buffer) {
  await storage.upload(
    () => Promise.resolve(Readable.from(data)),
    { key, name: key.split('/').pop()!, mimeType: 'video/x-matroska', size: data.length },
  );
}

describe('DeliveryService (storage/delivery decoupled + signed URLs)', () => {
  it('creates a signed URL and verifies the token', async () => {
    const d = new DeliveryService(deliveryCfg);
    const url = d.createDownloadUrl('anime/x.mkv', { filename: 'x.mkv' });
    const token = url.split('/files/')[1]!.split('?')[0]!;
    const claims = d.verifyToken(token);
    expect(claims.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('rejects a tampered token', async () => {
    const d = new DeliveryService(deliveryCfg);
    const token = d.createDownloadUrl('anime/x.mkv');
    const t = token.split('/files/')[1]!.split('?')[0]!;
    const decoded = JSON.parse(Buffer.from(t, 'base64url').toString('utf8'));
    decoded.exp += 1;
    const evil = Buffer.from(JSON.stringify(decoded)).toString('base64url');
    expect(() => d.verifyToken(evil)).toThrow();
  });

  it('rejects an expired token', async () => {
    const d = new DeliveryService({ ...deliveryCfg, urlTtlSeconds: -10 });
    const token = d.createDownloadUrl('anime/x.mkv').split('/files/')[1]!.split('?')[0]!;
    expect(() => d.verifyToken(token)).toThrow('expired');
  });

  it('serves 200 with full content and correct headers', async () => {
    const storage = makeStorage();
    const key = 'anime/S01E01.mkv';
    const data = Buffer.alloc(1000, 3);
    await seed(storage, key, data);
    const crypto = await import('node:crypto');
    const realId = crypto.createHash('sha256').update(`key:${key}`).digest('hex').slice(0, 32);
    const d = new DeliveryService(deliveryCfg);
    const token = d.createDownloadUrl(key).split('/files/')[1]!.split('?')[0]!;
    const resolver = memoryResolver(new Map([[realId, key]]));
    const res = await d.serve(token, storage, resolver, { filename: 'S01E01.mkv' });
    expect(res.status).toBe(200);
    expect(res.headers['Accept-Ranges']).toBe('bytes');
    expect(res.headers['Content-Length']).toBe('1000');
    expect(res.headers['Content-Disposition']).toContain('attachment');
  });

  it('serves 206 for a Range request (ADM resume support)', async () => {
    const storage = makeStorage();
    const key = 'anime/S01E02.mkv';
    const data = Buffer.alloc(1000, 5);
    await seed(storage, key, data);
    const d = new DeliveryService(deliveryCfg);
    const token = d.createDownloadUrl(key).split('/files/')[1]!.split('?')[0]!;
    const resolver = memoryResolver(new Map([['idXX', key]]));
    // Need id to match: derive id the same way delivery does (sha256 of key, 32 hex)
    const crypto = await import('node:crypto');
    const realId = crypto.createHash('sha256').update(`key:${key}`).digest('hex').slice(0, 32);
    const resolver2 = memoryResolver(new Map([[realId, key]]));
    void resolver;
    const res = await d.serve(token, storage, resolver2, { range: 'bytes=0-499', filename: 'S01E02.mkv' });
    expect(res.status).toBe(206);
    expect(res.headers['Content-Range']).toBe('bytes 0-499/1000');
    expect(res.headers['Content-Length']).toBe('500');
  });

  it('returns 416 for unsatisfiable range', async () => {
    const storage = makeStorage();
    const key = 'anime/S01E03.mkv';
    const data = Buffer.alloc(100, 5);
    await seed(storage, key, data);
    const d = new DeliveryService(deliveryCfg);
    const token = d.createDownloadUrl(key).split('/files/')[1]!.split('?')[0]!;
    const crypto = await import('node:crypto');
    const realId = crypto.createHash('sha256').update(`key:${key}`).digest('hex').slice(0, 32);
    const resolver = memoryResolver(new Map([[realId, key]]));
    const res = await d.serve(token, storage, resolver, { range: 'bytes=200-300' });
    expect(res.status).toBe(416);
  });
});
