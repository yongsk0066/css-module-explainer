export interface FileTask {
  readonly kind: "scss" | "tsx";
  readonly path: string;
}

export interface IndexerWorkerDeps {
  /**
   * Background file supplier. Phase 5 ships no real supplier;
   * Phase 10 injects one that walks `**\/\*.module.{scss,css}`.
   * Phase Final extends it with tsx walking.
   */
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
 * Background indexer skeleton.
 *
 * Phase 5 ships this with no real supplier — Phase 10 adds the
 * scssFileSupplier that walks the workspace, and Phase Final
 * extends it with a tsx walker for reverse-index population.
 * Provider wiring in Plans 06–09 can depend on IndexerWorker
 * today; flipping the supplier later is a one-line change.
 *
 * Design notes:
 * - `start()` yields to the event loop (`setImmediate`) between
 *   every file so LSP requests preempt naturally. With a 5ms
 *   parse per file, the worst-case request latency added by the
 *   worker is 5ms.
 * - `pushFile(task)` queues an incremental file for the current
 *   run — Phase 10's file watcher feeds this.
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
    // Interleaved queue drain: `pending` (incremental / priority) is
    // always processed before pulling the next item from `supplier`.
    // This matters for Phase 10's long-running file-watcher
    // supplier — if the pending drain only ran after the supplier
    // terminated, pushFile() calls during the initial walk would
    // queue up indefinitely.
    //
    // Sequential by design: each task yields to the event loop so
    // LSP requests preempt, and tasks are processed one at a time
    // to bound memory pressure. Disabling no-await-in-loop because
    // this is the intended concurrency model, not an accidental
    // serialization of independent work.
    const iterator = this.deps.supplier()[Symbol.asyncIterator]();
    let supplierDone = false;

    while (!this.stopped) {
      // Priority drain: process every queued pending task before
      // touching the supplier again.
      if (this.pending.length > 0) {
        const task = this.pending.shift()!;
        // eslint-disable-next-line no-await-in-loop
        await this.yieldToEventLoop();
        // eslint-disable-next-line no-await-in-loop
        await this.process(task);
        continue;
      }

      // Pending is empty; if the supplier is also exhausted, we're done.
      if (supplierDone) return;

      // Pull the next task from the supplier.
      // eslint-disable-next-line no-await-in-loop
      const next = await iterator.next();
      if (next.done) {
        supplierDone = true;
        continue;
      }
      if (this.stopped) return;
      // eslint-disable-next-line no-await-in-loop
      await this.yieldToEventLoop();
      // eslint-disable-next-line no-await-in-loop
      await this.process(next.value);
    }
  }

  pushFile(task: FileTask): void {
    this.pending.push(task);
  }

  stop(): void {
    this.stopped = true;
    this.pending.length = 0;
  }

  private async process(task: FileTask): Promise<void> {
    let content: string | null = null;
    try {
      content = await this.deps.readFile(task.path);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.deps.logger.error(`[indexer] readFile failed for ${task.path}: ${message}`);
      return;
    }
    if (content === null) return;
    if (task.kind === "scss") {
      this.deps.onScssFile(task.path, content);
    } else {
      this.deps.onTsxFile(task.path, content);
    }
  }

  private yieldToEventLoop(): Promise<void> {
    return new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
  }
}
