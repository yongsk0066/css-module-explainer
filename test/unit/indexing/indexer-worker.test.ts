import { describe, it, expect, vi } from "vitest";
import type { FileTask } from "../../../server/src/core/indexing/indexer-worker";
import { IndexerWorker } from "../../../server/src/core/indexing/indexer-worker";

async function* tasks(items: FileTask[]): AsyncIterable<FileTask> {
  for (const item of items) {
    yield item;
  }
}

describe("IndexerWorker", () => {
  it("processes every task from the supplier via onScssFile", async () => {
    const onScssFile = vi.fn();
    const worker = new IndexerWorker({
      supplier: () => tasks([{ path: "/a.module.scss" }, { path: "/b.module.scss" }]),
      readFile: async (p) => `/* ${p} */`,
      onScssFile,
      logger: { info: () => {}, error: () => {} },
    });
    const startPromise = worker.start();
    await worker.ready;
    worker.stop();
    await startPromise;
    expect(onScssFile).toHaveBeenCalledTimes(2);
    expect(onScssFile).toHaveBeenNthCalledWith(1, "/a.module.scss", "/* /a.module.scss */");
    expect(onScssFile).toHaveBeenNthCalledWith(2, "/b.module.scss", "/* /b.module.scss */");
  });

  it("skips tasks whose readFile returns null", async () => {
    const onScssFile = vi.fn();
    const worker = new IndexerWorker({
      supplier: () => tasks([{ path: "/missing.module.scss" }]),
      readFile: async () => null,
      onScssFile,
      logger: { info: () => {}, error: () => {} },
    });
    const startPromise = worker.start();
    await worker.ready;
    worker.stop();
    await startPromise;
    expect(onScssFile).not.toHaveBeenCalled();
  });

  it("logs and skips when readFile throws", async () => {
    const onScssFile = vi.fn();
    const errors: string[] = [];
    const worker = new IndexerWorker({
      supplier: () => tasks([{ path: "/boom.module.scss" }]),
      readFile: async () => {
        throw new Error("disk error");
      },
      onScssFile,
      logger: { info: () => {}, error: (msg) => errors.push(msg) },
    });
    const startPromise = worker.start();
    await worker.ready;
    worker.stop();
    await startPromise;
    expect(onScssFile).not.toHaveBeenCalled();
    expect(errors.length).toBe(1);
    expect(errors[0]!).toContain("/boom.module.scss");
  });

  it("pushFile() queues an incremental task for the current run", async () => {
    const onScssFile = vi.fn();
    const worker = new IndexerWorker({
      supplier: () => tasks([]),
      readFile: async () => "",
      onScssFile,
      logger: { info: () => {}, error: () => {} },
    });
    worker.pushFile({ path: "/incremental.module.scss" });
    const startPromise = worker.start();
    await worker.ready;
    worker.stop();
    await startPromise;
    expect(onScssFile).toHaveBeenCalledWith("/incremental.module.scss", "");
  });

  it("ready resolves after initial supplier walk completes", async () => {
    const worker = new IndexerWorker({
      supplier: () => tasks([{ path: "/a.module.scss" }]),
      readFile: async () => "",
      onScssFile: () => {},
      logger: { info: () => {}, error: () => {} },
    });
    expect(worker.ready).toBeInstanceOf(Promise);
    const startPromise = worker.start();
    await worker.ready;
    worker.stop();
    await startPromise;
  });

  it("stop() prevents further tasks from being processed", async () => {
    const onScssFile = vi.fn();
    const worker = new IndexerWorker({
      supplier: () => tasks([{ path: "/a.module.scss" }, { path: "/b.module.scss" }]),
      readFile: async () => "",
      onScssFile,
      logger: { info: () => {}, error: () => {} },
    });
    worker.stop();
    await worker.start();
    expect(onScssFile).not.toHaveBeenCalled();
  });

  it("ready resolves even when stop() is called before supplier finishes", async () => {
    const worker = new IndexerWorker({
      supplier: () => tasks([{ path: "/a.module.scss" }, { path: "/b.module.scss" }]),
      readFile: async () => "",
      onScssFile: () => {},
      logger: { info: () => {}, error: () => {} },
    });
    worker.stop();
    const startPromise = worker.start();
    await worker.ready;
    await startPromise;
  });

  it("ready resolves only once even with multiple start/stop cycles", async () => {
    const worker = new IndexerWorker({
      supplier: () => tasks([]),
      readFile: async () => "",
      onScssFile: () => {},
      logger: { info: () => {}, error: () => {} },
    });
    const startPromise = worker.start();
    await worker.ready;
    worker.stop();
    await startPromise;
    await worker.ready; // Must not hang or throw.
  });
});

// IndexerWorker.pushFile lifecycle — ensures pushed tasks keep
// processing after the initial supplier drains. Each test
// encodes a lifecycle stage (post-exhaustion, concurrent push,
// ready barrier, repeat-push) that must remain green as the
// PushSignal wiring evolves.
describe("IndexerWorker pushFile lifecycle", () => {
  it("pushFile after supplier exhaustion processes the task", async () => {
    const onScssFile = vi.fn();
    const worker = new IndexerWorker({
      supplier: () => tasks([]),
      readFile: async (p) => `/* ${p} */`,
      onScssFile,
      logger: { info: () => {}, error: () => {} },
    });
    const startPromise = worker.start();
    await worker.ready;
    expect(onScssFile).not.toHaveBeenCalled();
    worker.pushFile({ path: "/x.module.scss" });
    // Allow the drain() wait phase + process() to run.
    await new Promise<void>((resolve) => setImmediate(resolve));
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(onScssFile).toHaveBeenCalledWith("/x.module.scss", "/* /x.module.scss */");
    worker.stop();
    await startPromise;
  });

  it("consecutive pushFile calls all get processed", async () => {
    const processed: string[] = [];
    const worker = new IndexerWorker({
      supplier: () => tasks([]),
      readFile: async (p) => `/* ${p} */`,
      onScssFile: (path) => {
        processed.push(path);
      },
      logger: { info: () => {}, error: () => {} },
    });
    const startPromise = worker.start();
    await worker.ready;
    worker.pushFile({ path: "/a.module.scss" });
    worker.pushFile({ path: "/b.module.scss" });
    worker.pushFile({ path: "/c.module.scss" });
    // Drain multiple macrotask turns so all three tasks process.
    // Chained (not a loop) to stay clear of `no-await-in-loop`.
    await new Promise<void>((resolve) => setImmediate(resolve))
      .then(() => new Promise<void>((resolve) => setImmediate(resolve)))
      .then(() => new Promise<void>((resolve) => setImmediate(resolve)))
      .then(() => new Promise<void>((resolve) => setImmediate(resolve)))
      .then(() => new Promise<void>((resolve) => setImmediate(resolve)))
      .then(() => new Promise<void>((resolve) => setImmediate(resolve)))
      .then(() => new Promise<void>((resolve) => setImmediate(resolve)))
      .then(() => new Promise<void>((resolve) => setImmediate(resolve)));
    expect(processed).toEqual(["/a.module.scss", "/b.module.scss", "/c.module.scss"]);
    worker.stop();
    await startPromise;
  });

  it("stop() during pushSignal wait exits cleanly", async () => {
    const worker = new IndexerWorker({
      supplier: () => tasks([]),
      readFile: async () => "",
      onScssFile: () => {},
      logger: { info: () => {}, error: () => {} },
    });
    const startPromise = worker.start();
    await worker.ready;
    // At this point drain() is parked in the pushSignal wait.
    worker.stop();
    // The start() promise must resolve without hanging.
    await expect(
      Promise.race([
        startPromise.then(() => "ok" as const),
        new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 100)),
      ]),
    ).resolves.toBe("ok");
  });

  it("ready promise resolves AT supplier exhaustion", async () => {
    let processedCount = 0;
    let readyResolvedAtCount = -1;
    const worker = new IndexerWorker({
      supplier: () =>
        tasks([{ path: "/a.module.scss" }, { path: "/b.module.scss" }, { path: "/c.module.scss" }]),
      readFile: async () => "",
      onScssFile: () => {
        processedCount += 1;
      },
      logger: { info: () => {}, error: () => {} },
    });
    void worker.ready.then(() => {
      readyResolvedAtCount = processedCount;
    });
    const startPromise = worker.start();
    await worker.ready;
    // ready must resolve AFTER all 3 supplier tasks processed.
    expect(readyResolvedAtCount).toBe(3);
    // And BEFORE any post-exhaustion pushFile processing.
    worker.pushFile({ path: "/post.module.scss" });
    // Ensure readyResolvedAtCount snapshot was not captured after the push.
    expect(readyResolvedAtCount).toBe(3);
    worker.stop();
    await startPromise;
  });
});
