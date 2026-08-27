/**
 * Structured logger with built-in secret redaction.
 *
 * Per the master prompt: never log secrets (BOT_TOKEN, API_HASH, PASSWORD,
 * ACCESS_KEY, SECRET_KEY, OAuth secrets). Any value matching a known secret
 * field name is replaced with "[REDACTED]" before it leaves the process.
 */

import pino from 'pino';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const SECRET_KEYS = new Set([
  'api_hash',
  'apiid',
  'session',
  'bot_token',
  'client_secret',
  'refresh_token',
  'access_key_id',
  'secret_access_key',
  'account_id',
  'secret',
  'password',
  'token',
]);

function redactRecursive(value: unknown, depth = 0): unknown {
  if (depth > 8) return value;
  if (typeof value === 'string') return value;
  if (value === null || value === undefined || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((v) => redactRecursive(v, depth + 1));
  }
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value)) {
    const lower = key.toLowerCase();
    if (SECRET_KEYS.has(lower) || lower.includes('secret') || lower.includes('password')) {
      out[key] = '[REDACTED]';
    } else {
      out[key] = redactRecursive(val, depth + 1);
    }
  }
  return out;
}

export function createLogger(level: LogLevel = 'info') {
  const base = pino({
    level,
    // redact known secret paths defensively even if passed via objects
    redact: ['*.apiHash', '*.api_hash', '*.botToken', '*.bot_token', '*.session',
      '*.clientSecret', '*.client_secret', '*.refreshToken', '*.refresh_token',
      '*.accessKeyId', '*.access_key_id', '*.secretAccessKey', '*.secret_access_key',
      '*.secret', '*.password', '*.token'], // pino-native redaction
  });

  return {
    info: (msg: string, obj?: Record<string, unknown>) =>
      base.info(redactRecursive(obj) as object, msg),
    warn: (msg: string, obj?: Record<string, unknown>) =>
      base.warn(redactRecursive(obj) as object, msg),
    error: (msg: string, obj?: Record<string, unknown>) =>
      base.error(redactRecursive(obj) as object, msg),
    debug: (msg: string, obj?: Record<string, unknown>) =>
      base.debug(redactRecursive(obj) as object, msg),
  };
}

export type Logger = ReturnType<typeof createLogger>;
