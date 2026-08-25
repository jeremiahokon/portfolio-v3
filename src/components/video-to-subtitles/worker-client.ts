import type { FromWorker, ToWorker } from '@/workers/protocol';

// Turns each worker message exchange into an awaitable, so a decode → VAD → plan → N×ASR
// pipeline reads as sequential code instead of one listener acting as a state machine.
// Out-of-band messages (download/stage progress) go to callbacks instead.

export interface WorkerClientHandlers {
  onDownload?: (file: string, loaded: number, total: number | null) => void;
  onProgress?: (ratio: number) => void;
}

export class WorkerError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'WorkerError';
    this.code = code;
  }
}

export class WorkerClient {
  #worker: Worker;
  #handlers: WorkerClientHandlers;
  /** Resolvers awaiting a specific message type, oldest first. */
  #pending: Array<{
    type: FromWorker['t'];
    resolve: (message: FromWorker) => void;
    reject: (error: Error) => void;
  }> = [];

  constructor(worker: Worker, handlers: WorkerClientHandlers = {}) {
    this.#worker = worker;
    this.#handlers = handlers;

    worker.addEventListener('message', this.#onMessage);
    worker.addEventListener('error', this.#onError);
  }

  #onMessage = (event: MessageEvent<FromWorker>): void => {
    const message = event.data;

    if (message.t === 'download') {
      this.#handlers.onDownload?.(message.file, message.loaded, message.total);

      return;
    }
    if (message.t === 'progress') {
      this.#handlers.onProgress?.(message.ratio);

      return;
    }

    if (message.t === 'error') {
      // Rejects every pending request, not just the first, so none is left unsettled once the worker gives up.
      const failures = this.#pending.splice(0);
      const error = new WorkerError(message.code, message.message);
      for (const entry of failures) entry.reject(error);

      return;
    }

    const index = this.#pending.findIndex((entry) => entry.type === message.t);
    if (index === -1) return;
    const [entry] = this.#pending.splice(index, 1);
    entry?.resolve(message);
  };

  #onError = (event: ErrorEvent): void => {
    // A worker crashing mid-module-evaluation fires an ErrorEvent with an empty `message`, so log every field.
    console.error('[worker] crashed', {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      error: event.error,
    });

    const failures = this.#pending.splice(0);
    const error = new WorkerError(
      'unknown',
      event.message || 'The worker crashed.'
    );
    for (const entry of failures) entry.reject(error);
  };

  /** Sends a message and resolves with the first reply of `expect`. */
  request<T extends FromWorker['t']>(
    message: ToWorker,
    expect: T,
    transfer: Transferable[] = []
  ): Promise<Extract<FromWorker, { t: T }>> {
    return new Promise((resolve, reject) => {
      this.#pending.push({
        type: expect,
        resolve: resolve as (message: FromWorker) => void,
        reject,
      });
      this.#worker.postMessage(message, transfer);
    });
  }

  /** Fire-and-forget, for `cancel`. */
  send(message: ToWorker): void {
    this.#worker.postMessage(message);
  }

  /** Terminates the worker and rejects anything still waiting: a live worker holds a model session and, on WebGPU, GPU buffers that outlive the page otherwise. */
  terminate(): void {
    this.#worker.removeEventListener('message', this.#onMessage);
    this.#worker.removeEventListener('error', this.#onError);
    const failures = this.#pending.splice(0);
    for (const entry of failures) {
      entry.reject(new WorkerError('cancelled', 'Worker terminated.'));
    }
    this.#worker.terminate();
  }
}
