/**
 * Telegram integration interfaces + STUBS (Phase 1).
 *
 * Two distinct concerns, kept separate per the Phase 0 approval:
 *   1. MTProtoReceiver — large-file receiver (GramJS). Receives multi-GB files
 *      via chunked upload.getFile. Real impl in Phase 3.
 *   2. BotApi — command/status layer (grammy / node-telegram-bot-api) for
 *      /start and returning download links. Real impl in Phase 2.
 *
 * Phase 1 only defines the metadata shape and interface so downstream code can
 * be written and tested against a MockTelegram.
 */

import { createLogger, type Logger } from '../utils/logger';

/** Metadata captured when a file arrives from Telegram. */
export interface IncomingFileMeta {
  fileName: string;
  fileSize: number;
  mimeType?: string;
  telegramFileId: string;
  messageId: number;
  chatId: number;
  /** For MTProto, the input location needed to fetch chunks. */
  inputLocation?: unknown;
}

export interface ReceiveHandlers {
  onFile: (meta: IncomingFileMeta) => Promise<void> | void;
  onStart?: () => Promise<void> | void;
}

export interface TelegramReceiver {
  start(handlers: ReceiveHandlers): Promise<void>;
  stop(): Promise<void>;
}

/** Mock implementation so the app boots and tests run without a Telegram session. */
export class MockTelegramReceiver implements TelegramReceiver {
  private log: Logger;
  private running = false;
  constructor(log: Logger = createLogger('info')) {
    this.log = log;
  }
  async start(handlers: ReceiveHandlers): Promise<void> {
    this.running = true;
    this.log.info('telegram(mock): receiver started (no live session)');
    await handlers.onStart?.();
  }
  async stop(): Promise<void> {
    this.running = false;
    this.log.info('telegram(mock): receiver stopped');
  }
}

/** Factory that picks the real receiver (Phase 3) or the mock. */
export function buildReceiver(
  useMocks: boolean,
  log: Logger = createLogger('info'),
): TelegramReceiver {
  if (useMocks) return new MockTelegramReceiver(log);
  // Real GramJS receiver is constructed in Phase 3. For Phase 1 we refuse to
  // run a live session without the MTProto implementation present.
  throw new Error(
    'Live Telegram receiver requires the Phase 3 GramJS implementation, not present in Phase 1.',
  );
}
