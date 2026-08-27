/**
 * Storage service — selects and wires the configured provider(s).
 *
 * Honours STORAGE_STRATEGY so the backend can be swapped without rewriting
 * Telegram/storage code. Phase 1 wires the Mock provider when USE_MOCKS=true;
 * real providers (gdrive/r2) are instantiated in later phases (5/6) but their
 * constructors/config are validated here.
 */

import { createLogger, type Logger } from '../utils/logger';
import type { AppConfig } from '../config/env';
import type { StorageProvider } from './storage.interface';
import { MockStorageProvider } from './providers/mock.provider';
import { GoogleDriveProvider } from './providers/gdrive.provider';
import { CloudflareR2Provider } from './providers/r2.provider';
import { providersForStrategy } from '../config/env';

export interface StorageService {
  primary: StorageProvider;
  /** Optional mirror/cache provider (per strategy). */
  secondary?: StorageProvider;
  strategy: AppConfig['storageStrategy'];
}

export function buildStorageService(
  config: AppConfig,
  log: Logger = createLogger(config.logLevel),
): StorageService {
  const needed = providersForStrategy(config.storageStrategy);
  log.info('storage: strategy selected', { strategy: config.storageStrategy, needed });

  if (config.useMocks) {
    log.warn('storage: USE_MOCKS=true — using in-memory mock provider(s)');
    return { primary: new MockStorageProvider(log), strategy: config.storageStrategy };
  }

  // Real provider wiring (instantiates stubs; they throw if used before Phase 5/6).
  const providers: Record<'gdrive' | 'r2', StorageProvider> = {
    gdrive: GoogleDriveProvider.fromAppConfig(config, log),
    r2: CloudflareR2Provider.fromAppConfig(config, log),
  };

  const primaryKind = needed.storage[0]!;
  const secondaryKind = needed.storage[1];
  return {
    primary: providers[primaryKind],
    secondary: secondaryKind ? providers[secondaryKind] : undefined,
    strategy: config.storageStrategy,
  };
}
