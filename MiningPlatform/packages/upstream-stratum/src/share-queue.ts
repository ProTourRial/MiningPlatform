/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

export class ShareQueueFullError extends Error {
  constructor(readonly capacity: number) {
    super(`Upstream share queue capacity ${capacity} has been reached`);
    this.name = 'ShareQueueFullError';
  }
}

export class ShareQueueClosedError extends Error {
  constructor() {
    super('Upstream share queue is closed');
    this.name = 'ShareQueueClosedError';
  }
}

interface QueuedTask<T> {
  execute: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  expiresAt: number;
}

/** Bounded FIFO queue used to serialize upstream submissions and apply backpressure. */
export class BoundedShareQueue {
  private readonly queue: QueuedTask<unknown>[] = [];
  private active = 0;
  private closed = false;

  constructor(
    readonly capacity = 256,
    readonly concurrency = 1,
    private readonly defaultQueueTimeoutMs = 10_000,
  ) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new Error('Share queue capacity must be positive');
    if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error('Share queue concurrency must be positive');
  }

  get depth(): number {
    return this.queue.length;
  }

  get inFlight(): number {
    return this.active;
  }

  enqueue<T>(execute: () => Promise<T>, timeoutMs = this.defaultQueueTimeoutMs): Promise<T> {
    if (this.closed) return Promise.reject(new ShareQueueClosedError());
    if (this.queue.length + this.active >= this.capacity) return Promise.reject(new ShareQueueFullError(this.capacity));
    if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) return Promise.reject(new Error('Queue timeout must be positive'));
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ execute, resolve, reject, expiresAt: Date.now() + timeoutMs } as QueuedTask<unknown>);
      this.drain();
    });
  }

  rejectPending(reason: Error): void {
    for (const task of this.queue.splice(0)) task.reject(reason);
  }

  close(reason = new ShareQueueClosedError()): void {
    this.closed = true;
    this.rejectPending(reason);
  }

  private drain(): void {
    while (!this.closed && this.active < this.concurrency && this.queue.length > 0) {
      const task = this.queue.shift()!;
      if (task.expiresAt <= Date.now()) {
        task.reject(new Error('Upstream share expired while waiting in queue'));
        continue;
      }
      this.active += 1;
      void task.execute()
        .then(task.resolve)
        .catch((error) => task.reject(error instanceof Error ? error : new Error(String(error))))
        .finally(() => {
          this.active -= 1;
          this.drain();
        });
    }
  }
}
