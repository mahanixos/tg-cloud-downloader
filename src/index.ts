/**
 * Application entry point (Phase 1 bootstrap).
 *
 * Boots config + storage + delivery + telegram, runs a built-in smoke check
 * when USE_MOCKS=true, and reports status. The full Telegram -> Storage ->
 * Download pipeline is wired in later phases; this file only proves the pieces
 * compose and that the storage/delivery interfaces work end-to-end with mocks.
 */

import { loadConfig } from './config/env';
import { createLogger } from './utils/logger';
import { buildStorageService } from './storage/storage.service';
import crypto from 'node:crypto';
import { DeliveryService } from './downloads/delivery';
import { buildReceiver } from './telegram/telegram.interface';
import { MockStorageProvider } from './storage/providers/mock.provider';
import { Readable } from 'node:stream';

async function smokeCheck(logger: ReturnType<typeof createLogger>) {
  // Exercise the storage + delivery contract with the mock provider.
  const storage = new MockStorageProvider(logger);
  const key = 'anime/Solo.Leveling/S01E03.mkv';
  // The delivery layer maps a key -> opaque id via sha256(key) (Phase 1 stand-in
  // for a DB). Build the resolver accordingly.
  const id = crypto.createHash('sha256').update(`key:${key}`).digest('hex').slice(0, 32);
  const idToKey = new Map<string, string>([[id, key]]);
  const resolver = async (lookupId: string) => idToKey.get(lookupId);

  const data = Buffer.alloc(1024 * 1024, 7); // 1 MiB
  await storage.upload(() => Promise.resolve(Readable.from(data)), {
    key,
    name: 'S01E03.mkv',
    mimeType: 'video/x-matroska',
    size: data.length,
  });

  const meta = await storage.getMetadata(key);
  if (meta.size !== data.length) throw new Error('mock metadata size mismatch');

  const delivery = new DeliveryService({
    baseUrl: 'http://localhost:8787',
    secret: 'test-secret-1234567890',
    urlTtlSeconds: 3600,
  });
  const url = delivery.createDownloadUrl(key, { filename: 'S01E03.mkv' });
  const token = url.split('/files/')[1]!.split('?')[0]!;
  const served = await delivery.serve(token, storage, resolver, {
    range: 'bytes=0-1023',
    filename: 'S01E03.mkv',
  });
  if (served.status !== 206) throw new Error(`expected 206, got ${served.status}`);
  logger.info('smoke: storage+delivery contract OK', { status: served.status, url });
}

export async function main() {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);
  logger.info('boot: tg-cloud-downloader', {
    nodeEnv: config.nodeEnv,
    useMocks: config.useMocks,
    strategy: config.storageStrategy,
  });

  const storage = buildStorageService(config, logger);
  const delivery = new DeliveryService({
    baseUrl: config.delivery.baseUrl,
    secret: config.delivery.secret,
    urlTtlSeconds: config.delivery.urlTtlSeconds,
  });
  const receiver = buildReceiver(config.useMocks, logger);

  await receiver.start({
    onStart: () => logger.info('telegram: ready ( Phase 2/3 will handle files )'),
    onFile: () => undefined,
  });

  if (config.useMocks) {
    await smokeCheck(logger);
  }

  logger.info('boot: Phase 1 bootstrap complete (interfaces only; full pipeline in later phases)');
  // Keep process alive only when not in test env.
  if (process.env.NODE_ENV !== 'test') {
    // In a real run the receiver would block here; for Phase 1 we exit cleanly.
    await receiver.stop();
  }
}

// Run when invoked directly (not when imported by tests).
if (require.main === module) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Fatal:', err);
    process.exit(1);
  });
}
