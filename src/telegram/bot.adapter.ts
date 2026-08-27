/**
 * Telegram Bot API layer (Phase 2) — grammy adapter.
 *
 * Responsibilities:
 *   - respond to /start
 *   - detect incoming files (document / video / audio)
 *   - convert to library-independent TelegramFileMetadata
 *   - enforce the chat/user allowlist
 *
 * It does NOT download files, talk to storage, or build URLs. It emits a
 * TelegramFileMetadata to the application layer via onFile(). Phase 3 will add a
 * parallel MTProto adapter that emits the SAME metadata shape.
 *
 * The grammy Bot instance is created lazily so that importing/testing this
 * module never requires network or a real token.
 */

import type { Bot as GrammyBot } from 'grammy';
import { createLogger, type Logger } from '../utils/logger';
import type { TelegramFileMetadata, TelegramFileKind } from './telegram-file-metadata';
import { isAuthorized } from './telegram-file-metadata';
import type { AppConfig } from '../config/env';

export interface BotHandlers {
  onFile: (meta: TelegramFileMetadata) => Promise<void> | void;
  onStart?: (chatId: number) => Promise<void> | void;
  /** Called when an unauthorized user tries to interact. */
  onUnauthorized?: (chatId: number) => Promise<void> | void;
}

function kindOf(msg: { document?: unknown; video?: unknown; audio?: unknown }): TelegramFileKind {
  if (msg.document) return 'document';
  if (msg.video) return 'video';
  if (msg.audio) return 'audio';
  return 'unknown';
}

/** Convert a grammy message into our metadata shape (fields left undefined if absent). */
export function messageToMetadata(msg: any): TelegramFileMetadata | null {
  const kind = kindOf(msg);
  if (kind === 'unknown') return null;

  const fileObj: any =
    kind === 'document' ? msg.document
    : kind === 'video' ? msg.video
    : msg.audio;

  if (!fileObj) return null;

  return {
    source: 'bot-api',
    kind,
    fileId: fileObj.file_id,
    fileUniqueId: fileObj.file_unique_id,
    fileName: fileObj.file_name,
    fileSize: fileObj.file_size,
    mimeType: fileObj.mime_type,
    messageId: msg.message_id,
    chatId: msg.chat?.id,
    userId: msg.from?.id,
    receivedAt: (msg.date ? msg.date * 1000 : Date.now()),
  };
}

export class TelegramBotAdapter {
  private bot?: GrammyBot;
  private log: Logger;
  private cfg: AppConfig;
  private handlers: BotHandlers;
  private allowed: number[];

  constructor(cfg: AppConfig, handlers: BotHandlers, log: Logger = createLogger(cfg.logLevel)) {
    this.cfg = cfg;
    this.handlers = handlers;
    this.log = log;
    this.allowed = cfg.telegram.allowedChatIds.map((s) => Number(s)).filter((n) => Number.isFinite(n));
  }

  /** Build and wire the grammy bot. Requires a real token. */
  async start(): Promise<void> {
    const token = this.cfg.telegram.botToken;
    if (!token) throw new Error('TelegramBotAdapter.start requires TELEGRAM_BOT_TOKEN');

    // Imported here so tests without the dep still import the module cheaply.
    const { Bot } = await import('grammy');
    this.bot = new Bot(token);

    this.bot.command('start', (ctx) => this.handleStart(ctx));
    this.bot.on(['message:document', 'message:video', 'message:audio'], (ctx) => this.handleFile(ctx));
    this.bot.on('message', (ctx) => this.handleOther(ctx));

    this.log.info('telegram(bot): starting long-poll');
    await this.bot.start();
  }

  async stop(): Promise<void> {
    this.bot?.stop();
    this.log.info('telegram(bot): stopped');
  }

  private async handleStart(ctx: any): Promise<void> {
    const chatId = ctx.chat?.id;
    if (!this.checkAuth(chatId, ctx.from?.id)) {
      await ctx.reply('⛔ Unauthorized.');
      this.handlers.onUnauthorized?.(chatId);
      return;
    }
    await ctx.reply(
      '👋 Send me a file (document, video, or audio) and I will store it and give you a direct download link.\n\n' +
      'Large files are supported via MTProto transfer (coming online soon).',
    );
    await this.handlers.onStart?.(chatId);
  }

  private async handleFile(ctx: any): Promise<void> {
    const chatId = ctx.chat?.id;
    if (!this.checkAuth(chatId, ctx.from?.id)) {
      await ctx.reply('⛔ Unauthorized.');
      this.handlers.onUnauthorized?.(chatId);
      return;
    }
    const meta = messageToMetadata(ctx.message);
    if (!meta) {
      await ctx.reply('⚠️ Unsupported message type.');
      return;
    }
    this.log.info('telegram(bot): file detected', {
      kind: meta.kind, fileName: meta.fileName, fileSize: meta.fileSize, chatId,
    });
    await this.handlers.onFile(meta);
    // Phase 2 only acknowledges; actual upload happens in later phases.
    await ctx.reply(
      `✅ Received: ${meta.fileName ?? '(unnamed)'} (${meta.kind})\n` +
      `Size: ${meta.fileSize ? (meta.fileSize / 1024 / 1024).toFixed(1) + ' MB' : 'unknown'}\n` +
      `Queued for processing.`,
    );
  }

  private async handleOther(ctx: any): Promise<void> {
    const chatId = ctx.chat?.id;
    if (!this.checkAuth(chatId, ctx.from?.id)) return;
    await ctx.reply('Send me a file. Use /start for help.');
  }

  private checkAuth(chatId: number, userId?: number): boolean {
    return isAuthorized(chatId, userId, this.allowed);
  }
}

/** Factory: returns a bot adapter if a token is configured, else null (mock/test mode). */
export function buildBot(
  cfg: AppConfig,
  handlers: BotHandlers,
  log: Logger = createLogger(cfg.logLevel),
): TelegramBotAdapter | null {
  if (cfg.useMocks || !cfg.telegram.botToken) {
    log.info('telegram(bot): no token / USE_MOCKS=true — bot adapter inactive');
    return null;
  }
  return new TelegramBotAdapter(cfg, handlers, log);
}
