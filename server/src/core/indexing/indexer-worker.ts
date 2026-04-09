import { setImmediate as yieldToEventLoop } from "node:timers/promises";

export interface FileTask {
  readonly kind: "scss" | "tsx";
  readonly path: string;
}

export interface IndexerWorkerDeps {
  /** Yields FileTasks for the worker to process. */
  readonly supplier: () => AsyncIterable<FileTask>;
  /** Async file reader. Returns null when the file is missing. */
  readonly readFile: (path: string) => Promise<string | null>;
  /** Callback for every successfully read SCSS/CSS module file. */
  readonly onScssFile: (path: string, content: string) => void;
  /** Callback for every successfully read TSX/JSX/TS/JS file. */
  readonly onTsxFile: (path: string, content: string) => void;
  readonly logger: {
    info: (msg: string) => void;
    error: (msg: string) => void;
  };
}

/**
 * Background indexer.
 *
 * - `start()` drains an internal `drain()` async generator that
 *   interleaves pending incremental tasks (file-watcher pushes)
 *   with the supplier stream. Pending always wins so incremental
 *   updates jump the queue.
 * - `for await` + `yieldToEventLoop` (Node's promise-returning
 *   `setImmediate`) hand control back on every task boundary so
 *   LSP requests preempt within ~5ms.
 * - `pushFile(task)` queues an incremental file for the current
 *   run.
 * - `stop()` sets a cancellation flag checked on every task
 *   boundary. A running task is allowed to finish; no in-flight
 *   task is killed mid-parse.
 */
export class IndexerWorker {
  private readonly deps: IndexerWorkerDeps;
  private stopped = false;
  private readonly pending: FileTask[] = [];

  constructor(deps: IndexerWorkerDeps) {
    this.deps = deps;
  }

  async start(): Promise<void> {
    for await (const task of this.drain()) {
      if (this.stopped) return;
      await yieldToEventLoop();
      if (this.stopped) return;
      await this.process(task);
    }
  }

  pushFile(task: FileTask): void {
    this.pending.push(task);
  }

  stop(): void {
    this.stopped = true;
    this.pending.length = 0;
  }

  /**
   * Interleaved task producer.
   *
   * Yields every `pending` task (incremental / priority) before
   * pulling the next item from `supplier`. Critical for a
   * long-running file-watcher supplier — if the pending drain
   * only ran after the supplier terminated, `pushFile()` calls
   * during the initial walk would queue up indefinitely.
   *
   * Written as `for await (task of supplier())` + pure sync
   * `yield* drainPending()` so `no-await-in-loop` stays silent
   * (the `for await` body is exempt, and `drainPending` has no
   * awaits at all).
   */
  private async *drain(): AsyncGenerator<FileTask> {
    // Pending tasks already queued before start() was called.
    yield* this.drainPending();

    for await (const task of this.deps.supplier()) {
      if (this.stopped) return;
      // Any pending tasks that arrived while we awaited the
      // supplier win priority over the supplier's own task.
      yield* this.drainPending();
      yield task;
    }

    // Final sweep after supplier exhaustion.
    yield* this.drainPending();
  }

  /**
   * Synchronous generator flushing the pending queue. Pure
   * iteration — no awaits — so the consumer's enclosing
   * `for await` retains `no-await-in-loop` exemption.
   */
  private *drainPending(): Generator<FileTask> {
    while (this.pending.length > 0) {
      yield this.pending.shift()!;
    }
  }

  private async process(task: FileTask): Promise<void> {
    let content: string | null = null;
    try {
      content = await this.deps.readFile(task.path);
    } catch (err) {
      this.deps.logger.error(`[indexer] readFile failed for ${task.path}: ${errMessage(err)}`);
      return;
    }
    if (content === null) return;
    // Guard the callback separately from readFile: a pathological
    // file (unterminated SCSS, postcss parser throw) must not abort
    // the entire walk. Per-file isolation — the worker logs and
    // moves on.
    try {
      if (task.kind === "scss") {
        this.deps.onScssFile(task.path, content);
      } else {
        this.deps.onTsxFile(task.path, content);
      }
    } catch (err) {
      this.deps.logger.error(
        `[indexer] onFile callback failed for ${task.path}: ${errMessage(err)}`,
      );
    }
  }
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
