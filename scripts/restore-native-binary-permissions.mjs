#!/usr/bin/env node
import { chmodSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const binRoot = path.join(repoRoot, "dist", "bin");
const executableNames = new Set(["engine-shadow-runner", "omena-lsp-server", "tsgo"]);

let restored = 0;

if (existsSync(binRoot)) {
  for (const targetDir of readdirSync(binRoot, { withFileTypes: true })) {
    if (!targetDir.isDirectory()) continue;
    if (targetDir.name.startsWith("win32-")) continue;

    const targetPath = path.join(binRoot, targetDir.name);
    for (const entry of readdirSync(targetPath, { withFileTypes: true })) {
      if (!entry.isFile() || !executableNames.has(entry.name)) continue;
      const binaryPath = path.join(targetPath, entry.name);
      const mode = statSync(binaryPath).mode;
      if ((mode & 0o111) === 0o111) continue;
      chmodSync(binaryPath, 0o755);
      restored += 1;
    }
  }
}

console.log(`Native binary executable permissions restored: ${restored}`);
