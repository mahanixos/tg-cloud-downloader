/**
 * Centralised configuration. Reads from process.env (or a loaded .env) and
 * validates it. No secret is ever logged; see utils/logger.ts for redaction.
 *
 * Phase 1: Only shapes + light validation. Real providers read their own
 * sub-config at construction time in later phases.
 */

export type StorageStrategy =
  | 'gdrive-only'
  | 'r2-only'
  | 'gdrive-primary-r2-cache'
  | 'gdrive-primary-r2-mirror';

export const STORAGE_STRATEGIES: StorageStrategy[] = [
  'gdrive-only',
  'r2-only',
  'gdrive-primary-r2-cache',
  'gdrive-primary-r2-mirror',
];

export interface AppConfig {
  nodeEnv: 'development' | 'production' | 'test';
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  useMocks: boolean;

  telegram: {
    apiId: string;
    apiHash: string;
    session: string;
    botToken: string;
    allowedChatIds: string[];
  };

  googleDrive: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
    folderId: string;
  };

  r2: {
    accountId: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucketName: string;
    publicUrl: string;
  };

  delivery: {
    baseUrl: string;
    secret: string;
    urlTtlSeconds: number;
  };

  storageStrategy: StorageStrategy;

  limits: {
    maxConcurrency: number;
    maxMemoryBuffer: number;
    chunkSize: number;
  };
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value.toLowerCase() === 'true' || value === '1';
}

function int(value: string | undefined, fallback: number): number {
  const n = value ? Number.parseInt(value, 10) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function parseChatIds(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseStrategy(raw: string | undefined): StorageStrategy {
  const value = (raw ?? 'gdrive-primary-r2-cache') as StorageStrategy;
  if (STORAGE_STRATEGIES.includes(value)) return value;
  throw new Error(
    `Invalid STORAGE_STRATEGY "${raw}". Allowed: ${STORAGE_STRATEGIES.join(', ')}`,
  );
}

/**
 * Build config from process.env. Throws on invalid enum values so misconfig is
 * caught at boot. Sensitive fields are returned as-is in memory but never
 * printed by the logger (see redact()).
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const strategy = parseStrategy(env.STORAGE_STRATEGY);

  return {
    nodeEnv: (env.NODE_ENV as AppConfig['nodeEnv']) ?? 'development',
    logLevel: (env.LOG_LEVEL as AppConfig['logLevel']) ?? 'info',
    useMocks: bool(env.USE_MOCKS, true),

    telegram: {
      apiId: env.TELEGRAM_API_ID ?? '',
      apiHash: env.TELEGRAM_API_HASH ?? '',
      session: env.TELEGRAM_SESSION ?? '',
      botToken: env.TELEGRAM_BOT_TOKEN ?? '',
      allowedChatIds: parseChatIds(env.ALLOWED_CHAT_IDS),
    },

    googleDrive: {
      clientId: env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: env.GOOGLE_CLIENT_SECRET ?? '',
      refreshToken: env.GOOGLE_REFRESH_TOKEN ?? '',
      folderId: env.GOOGLE_DRIVE_FOLDER_ID ?? '',
    },

    r2: {
      accountId: env.CLOUDFLARE_ACCOUNT_ID ?? '',
      accessKeyId: env.R2_ACCESS_KEY_ID ?? '',
      secretAccessKey: env.R2_SECRET_ACCESS_KEY ?? '',
      bucketName: env.R2_BUCKET_NAME ?? '',
      publicUrl: env.R2_PUBLIC_URL ?? '',
    },

    delivery: {
      baseUrl: env.DOWNLOAD_BASE_URL ?? 'http://localhost:8787',
      secret: env.DOWNLOAD_SECRET ?? 'change-me-to-a-long-random-secret',
      urlTtlSeconds: int(env.DOWNLOAD_URL_TTL, 3600),
    },

    storageStrategy: strategy,

    limits: {
      maxConcurrency: int(env.MAX_CONCURRENCY, 1),
      maxMemoryBuffer: int(env.MAX_MEMORY_BUFFER, 64 * 1024 * 1024),
      chunkSize: int(env.CHUNK_SIZE, 8 * 1024 * 1024),
    },
  };
}

/**
 * Returns which providers are required for the chosen strategy. Used in later
 * phases to decide what to initialise and whether credentials are mandatory.
 */
export function providersForStrategy(strategy: StorageStrategy): {
  storage: ('gdrive' | 'r2')[];
  delivery: ('gdrive' | 'r2')[];
} {
  switch (strategy) {
    case 'gdrive-only':
      return { storage: ['gdrive'], delivery: ['gdrive'] };
    case 'r2-only':
      return { storage: ['r2'], delivery: ['r2'] };
    case 'gdrive-primary-r2-cache':
      return { storage: ['gdrive'], delivery: ['r2'] };
    case 'gdrive-primary-r2-mirror':
      return { storage: ['gdrive', 'r2'], delivery: ['gdrive', 'r2'] };
  }
}
