/**
 * Minimal concurrency-limited queue.
 *
 * Per Phase 0 (Upload Queue) + Phase 0 approval (keep it simple): sequential by
 * default, configurable concurrency, retry on failure, clear per-item state.
 * No Redis/BullMQ — in-memory is fine for a single-instance MVP. State is an
 * in-process map; a future phase can swap the backing store.
 */

export type QueueItemState =
  | 'waiting'
  | 'downloading'
  | 'uploading'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface QueueItem<T = unknown> {
  id: string;
  payload: T;
  state: QueueItemState;
  attempts: number;
  maxRetries: number;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export interface QueueOptions {
  concurrency: number;
  maxRetries: number;
  /** Called to process one item. Should throw on failure to trigger retry. */
  processor: (item: QueueItem) => Promise<void>;
  onState?: (item: QueueItem) => void;
}

export class UploadQueue<T = unknown> {
  private items = new Map<string, QueueItem<T>>();
  private running = 0;
  private opts: QueueOptions;

  constructor(opts: QueueOptions) {
    this.opts = opts;
  }

  add(id: string, payload: T, maxRetries = this.opts.maxRetries): QueueItem<T> {
    const item: QueueItem<T> = {
      id,
      payload,
      state: 'waiting',
      attempts: 0,
      maxRetries,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.items.set(id, item);
    this.opts.onState?.(item);
    this.pump();
    return item;
  }

  get(id: string): QueueItem<T> | undefined {
    return this.items.get(id);
  }

  list(): QueueItem<T>[] {
    return [...this.items.values()];
  }

  cancel(id: string): boolean {
    const item = this.items.get(id);
    if (!item) return false;
    if (item.state === 'completed' || item.state === 'failed') return false;
    this.setState(item, 'cancelled');
    return true;
  }

  private setState(item: QueueItem<T>, state: QueueItemState) {
    item.state = state;
    item.updatedAt = Date.now();
    this.opts.onState?.(item);
  }

  private pump() {
    if (this.running >= this.opts.concurrency) return;
    for (const item of this.items.values()) {
      if (item.state !== 'waiting') continue;
      this.running++;
      void this.run(item);
      if (this.running >= this.opts.concurrency) break;
    }
  }

  private async run(item: QueueItem<T>) {
    item.attempts++;
    try {
      this.setState(item, item.attempts === 1 ? 'downloading' : 'uploading');
      await this.opts.processor(item);
      this.setState(item, 'completed');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (item.attempts <= item.maxRetries) {
        // Re-queue for retry.
        item.error = message;
        item.state = 'waiting';
        item.updatedAt = Date.now();
        this.opts.onState?.(item);
      } else {
        this.setState(item, 'failed');
        item.error = message;
      }
    } finally {
      this.running--;
      this.pump();
    }
  }
}
