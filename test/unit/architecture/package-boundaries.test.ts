import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = process.cwd();
const CORE_ROOT = path.join(REPO_ROOT, "server/src/core");
const ENGINE_HOST_ROOT = path.join(REPO_ROOT, "server/engine-host-node/src");
const RUNTIME_ROOT = path.join(REPO_ROOT, "server/engine-host-node/src/runtime");
const PROVIDERS_ROOT = path.join(REPO_ROOT, "server/adapter-vscode/src/providers");
const CHECKER_HOST_ROOT = path.join(REPO_ROOT, "server/engine-host-node/src/checker-host");
const CHECKER_CLI_ROOT = path.join(REPO_ROOT, "server/checker-cli/src");
const CHECKER_SURFACE_ROOT = path.join(REPO_ROOT, "server/src/checker-surface");
const COMPOSITION_ROOT = path.join(REPO_ROOT, "server/adapter-vscode/src/composition-root.ts");
const HANDLER_ROOT = path.join(REPO_ROOT, "server/adapter-vscode/src/handler-registration.ts");

describe("package-ready boundaries", () => {
  it("core modules do not depend on provider or runtime modules", () => {
    for (const filePath of walkTsFiles(CORE_ROOT)) {
      const source = readFileSync(filePath, "utf8");
      expect(source, relativePath(filePath)).not.toMatch(/providers\//);
      expect(source, relativePath(filePath)).not.toMatch(/runtime\//);
      expect(source, relativePath(filePath)).not.toMatch(/vscode-languageserver/);
    }
  });

  it("runtime modules do not depend on provider deps contracts", () => {
    for (const filePath of walkTsFiles(RUNTIME_ROOT)) {
      const source = readFileSync(filePath, "utf8");
      expect(source, relativePath(filePath)).not.toMatch(/provider-deps/);
      expect(source, relativePath(filePath)).not.toMatch(/vscode-languageserver/);
    }
  });

  it("engine-host modules do not depend on adapter/provider implementation paths", () => {
    for (const filePath of walkTsFiles(ENGINE_HOST_ROOT)) {
      const source = readFileSync(filePath, "utf8");
      expect(source, relativePath(filePath)).not.toMatch(/src\/providers\//);
      expect(source, relativePath(filePath)).not.toMatch(/adapter-vscode\//);
      expect(source, relativePath(filePath)).not.toMatch(/vscode-languageserver/);
    }
  });

  it("checker-host modules stay host-facing and do not depend on providers", () => {
    for (const filePath of walkTsFiles(CHECKER_HOST_ROOT)) {
      const source = readFileSync(filePath, "utf8");
      expect(source, relativePath(filePath)).not.toMatch(/providers\//);
      expect(source, relativePath(filePath)).not.toMatch(/vscode-languageserver/);
    }
  });

  it("providers read query and rewrite through package-ready boundaries", () => {
    for (const filePath of walkTsFiles(PROVIDERS_ROOT)) {
      if (filePath.endsWith("provider-deps.ts")) continue;
      const source = readFileSync(filePath, "utf8");
      expect(source, relativePath(filePath)).not.toMatch(/core\/query\//);
      expect(source, relativePath(filePath)).not.toMatch(/core\/rewrite\//);
    }
  });

  it("checker-cli modules stay consumer-facing and do not depend on providers", () => {
    for (const filePath of walkTsFiles(CHECKER_CLI_ROOT)) {
      const source = readFileSync(filePath, "utf8");
      expect(source, relativePath(filePath)).not.toMatch(/providers\//);
      expect(source, relativePath(filePath)).not.toMatch(/vscode-languageserver/);
    }
  });

  it("checker-surface modules stay consumer-facing and avoid transport deps", () => {
    for (const filePath of walkTsFiles(CHECKER_SURFACE_ROOT)) {
      const source = readFileSync(filePath, "utf8");
      expect(source, relativePath(filePath)).not.toMatch(/providers\//);
      expect(source, relativePath(filePath)).not.toMatch(/runtime\//);
      expect(source, relativePath(filePath)).not.toMatch(/vscode-languageserver/);
    }
  });

  it("server wiring reads runtime and semantic layers through entrypoints", () => {
    const composition = readFileSync(COMPOSITION_ROOT, "utf8");
    const handler = readFileSync(HANDLER_ROOT, "utf8");

    expect(composition).not.toMatch(/runtime\/shared-runtime-caches/);
    expect(composition).not.toMatch(/runtime\/workspace-runtime/);
    expect(handler).not.toMatch(/runtime\/dependency-snapshot/);
    expect(handler).not.toMatch(/runtime\/invalidation-planner/);
    expect(handler).not.toMatch(/runtime\/watched-file-changes/);
  });
});

function walkTsFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkTsFiles(fullPath));
      continue;
    }
    if (entry.isFile() && fullPath.endsWith(".ts")) {
      files.push(fullPath);
    }
  }
  return files.toSorted();
}

function relativePath(filePath: string): string {
  return path.relative(REPO_ROOT, filePath).replaceAll(path.sep, "/");
}
