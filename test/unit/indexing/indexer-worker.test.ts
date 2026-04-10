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
      supplier: () =>
        tasks([
          { kind: "scss", path: "/a.module.scss" },
          { kind: "scss", path: "/b.module.scss" },
        ]),
      readFile: async (p) => `/* ${p} */`,
      onScssFile,
      onTsxFile: () => {},
      logger: { info: () => {}, error: () => {} },
    });
    await worker.start();
    expect(onScssFile).toHaveBeenCalledTimes(2);
    expect(onScssFile).toHaveBeenNthCalledWith(1, "/a.module.scss", "/* /a.module.scss */");
    expect(onScssFile).toHaveBeenNthCalledWith(2, "/b.module.scss", "/* /b.module.scss */");
  });

  it("routes tsx tasks through onTsxFile", async () => {
    const onTsxFile = vi.fn();
    const worker = new IndexerWorker({
      supplier: () => tasks([{ kind: "tsx", path: "/a.tsx" }]),
      readFile: async () => "const x = 1;",
      onScssFile: () => {},
      onTsxFile,
      logger: { info: () => {}, error: () => {} },
    });
    await worker.start();
    expect(onTsxFile).toHaveBeenCalledWith("/a.tsx", "const x = 1;");
  });

  it("skips tasks whose readFile returns null", async () => {
    const onScssFile = vi.fn();
    const worker = new IndexerWorker({
      supplier: () => tasks([{ kind: "scss", path: "/missing.module.scss" }]),
      readFile: async () => null,
      onScssFile,
      onTsxFile: () => {},
      logger: { info: () => {}, error: () => {} },
    });
    await worker.start();
    expect(onScssFile).not.toHaveBeenCalled();
  });

  it("logs and skips when readFile throws", async () => {
    const onScssFile = vi.fn();
    const errors: string[] = [];
    const worker = new IndexerWorker({
      supplier: () => tasks([{ kind: "scss", path: "/boom.module.scss" }]),
      readFile: async () => {
        throw new Error("disk error");
      },
      onScssFile,
      onTsxFile: () => {},
      logger: { info: () => {}, error: (msg) => errors.push(msg) },
    });
    await worker.start();
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
      onTsxFile: () => {},
      logger: { info: () => {}, error: () => {} },
    });
    worker.pushFile({ kind: "scss", path: "/incremental.module.scss" });
    await worker.start();
    expect(onScssFile).toHaveBeenCalledWith("/incremental.module.scss", "");
  });

  it("ready resolves after start() completes", async () => {
    const worker = new IndexerWorker({
      supplier: () => tasks([{ kind: "scss", path: "/a.module.scss" }]),
      readFile: async () => "",
      onScssFile: () => {},
      onTsxFile: () => {},
      logger: { info: () => {}, error: () => {} },
    });
    expect(worker.ready).toBeInstanceOf(Promise);
    const startPromise = worker.start();
    await worker.ready;
    await startPromise;
  });

  it("stop() prevents further tasks from being processed", async () => {
    const onScssFile = vi.fn();
    const worker = new IndexerWorker({
      supplier: () =>
        tasks([
          { kind: "scss", path: "/a.module.scss" },
          { kind: "scss", path: "/b.module.scss" },
        ]),
      readFile: async () => "",
      onScssFile,
      onTsxFile: () => {},
      logger: { info: () => {}, error: () => {} },
    });
    worker.stop();
    await worker.start();
    expect(onScssFile).not.toHaveBeenCalled();
  });

  it("ready resolves even when stop() is called before supplier finishes", async () => {
    const worker = new IndexerWorker({
      supplier: () =>
        tasks([
          { kind: "scss", path: "/a.module.scss" },
          { kind: "scss", path: "/b.module.scss" },
        ]),
      readFile: async () => "",
      onScssFile: () => {},
      onTsxFile: () => {},
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
      onTsxFile: () => {},
      logger: { info: () => {}, error: () => {} },
    });
    await worker.start();
    await worker.ready;
    worker.stop();
    await worker.ready; // Must not hang or throw.
  });
});
