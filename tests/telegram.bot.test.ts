import { describe, it, expect } from 'vitest';
import { messageToMetadata } from '../src/telegram/bot.adapter';
import { isAuthorized, type TelegramFileMetadata } from '../src/telegram/telegram-file-metadata';

function docMsg(over: Record<string, unknown> = {}) {
  return {
    message_id: 10,
    chat: { id: 100 },
    from: { id: 200 },
    date: 1700000000,
    document: {
      file_id: 'FID1',
      file_unique_id: 'UID1',
      file_name: 'movie.mkv',
      file_size: 2_000_000_000,
      mime_type: 'video/x-matroska',
      ...over,
    },
  };
}

describe('messageToMetadata — file detection + extraction', () => {
  it('detects a document', () => {
    const m = messageToMetadata(docMsg())!;
    expect(m.kind).toBe('document');
    expect(m.fileId).toBe('FID1');
    expect(m.fileName).toBe('movie.mkv');
    expect(m.fileSize).toBe(2_000_000_000);
    expect(m.mimeType).toBe('video/x-matroska');
    expect(m.messageId).toBe(10);
    expect(m.chatId).toBe(100);
    expect(m.userId).toBe(200);
    expect(m.source).toBe('bot-api');
  });

  it('detects a video', () => {
    const m = messageToMetadata({
      message_id: 1, chat: { id: 1 }, from: { id: 1 }, video: { file_id: 'v', file_name: 'x.mp4', file_size: 10 },
    })!;
    expect(m.kind).toBe('video');
  });

  it('detects an audio', () => {
    const m = messageToMetadata({
      message_id: 1, chat: { id: 1 }, from: { id: 1 }, audio: { file_id: 'a', file_name: 'x.mp3', file_size: 5 },
    })!;
    expect(m.kind).toBe('audio');
  });

  it('returns null for unsupported messages', () => {
    const m = messageToMetadata({ message_id: 1, chat: { id: 1 }, text: 'hello' } as any);
    expect(m).toBeNull();
  });

  it('handles missing filename', () => {
    const m = messageToMetadata(docMsg({ file_name: undefined }))!;
    expect(m.fileName).toBeUndefined();
  });

  it('handles missing MIME type', () => {
    const m = messageToMetadata(docMsg({ mime_type: undefined }))!;
    expect(m.mimeType).toBeUndefined();
  });

  it('handles missing file size', () => {
    const m = messageToMetadata(docMsg({ file_size: undefined }))!;
    expect(m.fileSize).toBeUndefined();
  });

  it('handles a message with no from (no userId)', () => {
    const m = messageToMetadata({ ...docMsg(), from: undefined } as any)!;
    expect(m.userId).toBeUndefined();
  });
});

describe('isAuthorized — allowlist', () => {
  it('allows all when list empty (dev mode)', () => {
    expect(isAuthorized(999, 888, [])).toBe(true);
  });
  it('allows an allowed chat id', () => {
    expect(isAuthorized(100, 200, [100, 300])).toBe(true);
  });
  it('allows an allowed user id', () => {
    expect(isAuthorized(999, 200, [100, 200])).toBe(true);
  });
  it('rejects an unknown chat/user', () => {
    expect(isAuthorized(123, 456, [100, 200])).toBe(false);
  });
});

describe('metadata model — library independence', () => {
  it('produces a shape the app layer can consume without a Telegram type', () => {
    const m: TelegramFileMetadata = {
      source: 'bot-api', kind: 'document', messageId: 1, chatId: 1, receivedAt: Date.now(),
    };
    expect(m.source).toBe('bot-api');
    expect(m.kind).toBe('document');
  });
});

describe('mock receiver — compatibility', () => {
  it('starts and stops without credentials', async () => {
    const { MockTelegramReceiver } = await import('../src/telegram/telegram.interface');
    const receiver = new MockTelegramReceiver();
    let started = false;
    await receiver.start({ onStart: () => { started = true; }, onFile: () => undefined });
    expect(started).toBe(true);
    await receiver.stop();
  });
});

