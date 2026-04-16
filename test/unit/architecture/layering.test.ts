import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = process.cwd();
const PROVIDERS_ROOT = path.join(REPO_ROOT, "server/adapter-vscode/src/providers");
const QUERY_ROOT = path.join(REPO_ROOT, "server/src/core/query");

describe("architecture layering invariants", () => {
  it("provider handlers do not import AST or legacy semantic helpers directly", () => {
    for (const filePath of walkTsFiles(PROVIDERS_ROOT)) {
      if (filePath.endsWith("provider-deps.ts")) continue;
      const source = readFileSync(filePath, "utf8");
      expect(source, relativePath(filePath)).not.toMatch(/from ["']typescript["']/);
      expect(source, relativePath(filePath)).not.toMatch(/from ["']postcss(?:[^"']*)["']/);
      expect(source, relativePath(filePath)).not.toMatch(
        /from ["']\.\.\/core\/cx\/call-resolver["']/,
      );
    }
  });

  it("query modules stay provider-neutral", () => {
    for (const filePath of walkTsFiles(QUERY_ROOT)) {
      const source = readFileSync(filePath, "utf8");
      expect(source, relativePath(filePath)).not.toMatch(/vscode-languageserver/);
      expect(source, relativePath(filePath)).not.toMatch(/from ["']\.\.\/cx\/call-resolver["']/);
    }
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
