/**
 * Library-independent Telegram file metadata.
 *
 * Both the Bot API adapter (grammy, Phase 2) and the MTProto adapter (GramJS,
 * Phase 3) convert their native objects into this shape. Downstream code
 * (application layer, queue, storage) never imports a Telegram library type.
 */

export type TelegramFileKind = 'document' | 'video' | 'audio' | 'unknown';

export interface TelegramFileMetadata {
  /** Native provider that produced this (for tracing only). */
  source: 'bot-api' | 'mtproto';
  kind: TelegramFileKind;
  /** Telegram file id (Bot API) — usable to re-download via Bot API. */
  fileId?: string;
  /** Stable unique id (Bot API). */
  fileUniqueId?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  messageId: number;
  chatId: number;
  userId?: number;
  /** Provider-specific location blob for MTProto chunked fetch (Phase 3). */
  inputLocation?: unknown;
  /** When the message was received (epoch ms). */
  receivedAt: number;
}

export function isAuthorized(
  chatId: number,
  userId: number | undefined,
  allowed: number[],
): boolean {
  if (allowed.length === 0) return true; // dev mode: allow all
  if (allowed.includes(chatId)) return true;
  if (userId !== undefined && allowed.includes(userId)) return true;
  return false;
}
