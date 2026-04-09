# Plan 01 — Repo Scaffolding (Phase 0)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the empty `css-module-explainer` pnpm workspace with a minimal LSP client + server that responds to `initialize`, builds via rolldown, and passes `pnpm lint` / `pnpm typecheck` / `pnpm test`.

**Architecture:** pnpm workspace with three packages — `client` (LanguageClient bootstrap), `server` (LSP server with empty capabilities), `shared` (type-only module). TypeScript project references for incremental builds. Rolldown bundles client + server independently. Vitest for unit tests, oxlint + oxfmt for static checks. No business logic in this plan — just the scaffold that lets every subsequent plan start with a green build.

**Tech Stack:** pnpm@10.30.3 · typescript@^6.0.2 · rolldown@1.0.0-rc15 · vitest@^4.1.3 · oxlint@^1.59.0 · oxfmt@^0.44.0 · @vscode/vsce@^3.7.1 · vscode-languageclient@^9.0.1 · vscode-languageserver@^9.0.1 · vscode-languageserver-textdocument@^1.0.12 · @types/node@^25.5.0 · @types/vscode@^1.115.0

---

## Spec References

- Spec sections: 2.1 (process model), 2.2 (layering), 6.1 (manifest), 6.2 (LSP handshake)
- Phase plan: section 9.3 — Phase 0
- Toolchain pinning: spec "Context" header

## End State (definition of done)

After all tasks pass:
- `/Users/yongseok/dev/css-module-explainer/` is a pnpm workspace with `client/`, `server/`, `shared/` packages.
- `pnpm install` succeeds.
- `pnpm build` produces `dist/client/extension.js` and `dist/server/server.js` via rolldown.
- `pnpm typecheck` passes (project references resolve).
- `pnpm lint` passes (oxlint, no warnings).
- `pnpm format:check` passes (oxfmt clean).
- `pnpm test` passes (zero tests, no errors).
- The extension can be loaded in an Extension Development Host (F5) and starts the LSP server, which responds to `initialize` with empty `capabilities: {}` and reports `serverInfo.name === 'css-module-explainer'`.
- A basic `.github/workflows/ci.yml` exists and lists the four checks.
- Commits follow `<type>: <subject>` format (e.g. `chore: …`, `build: …`, `feat: …`).

---

## File Structure

Files this plan creates (relative to `/Users/yongseok/dev/css-module-explainer/`):

```
.gitignore                              # Standard Node + VS Code ignores
.oxlintrc.json                          # oxlint configuration
oxfmt.toml                              # oxfmt configuration
.github/workflows/ci.yml                # PR gate (lint + typecheck + test + build)
package.json                            # Root manifest, vsce package entry, scripts
pnpm-workspace.yaml                     # pnpm workspace declaration
tsconfig.base.json                      # Shared TS compiler options
tsconfig.json                           # Root project references aggregator
rolldown.config.ts                      # Bundle config: client + server
vitest.config.ts                        # Vitest base config
README.md                               # Empty placeholder (filled in Plan 12)
CHANGELOG.md                            # Empty placeholder
LICENSE                                 # MIT
shared/
  package.json                          # @css-module-explainer/shared
  tsconfig.json
  src/
    types.ts                            # Position, Range types only (Phase 0 minimal)
    index.ts                            # Re-export from types
server/
  package.json                          # @css-module-explainer/server, runtime deps
  tsconfig.json
  src/
    server.ts                           # LSP server bootstrap, onInitialize → empty caps
client/
  package.json                          # @css-module-explainer/client
  tsconfig.json
  src/
    extension.ts                        # activate() → LanguageClient.start()
test/
  unit/
    .gitkeep                            # Empty dir for vitest to discover later
```

**Files that already exist (do NOT recreate):**
- `docs/code-philosophy.md` — yongsk0066 personal manifesto (committed)
- `docs/superpowers/specs/2026-04-09-css-module-explainer-design.md` — approved spec (committed)
- `docs/superpowers/plans/2026-04-09-plan-01-scaffolding.md` — this plan (committed when added)
- `.git/` — already initialized with one commit

**Checked-in files NOT touched by this plan:** the `docs/` tree and any `.git/` state. Phase 0 strictly adds workspace tooling on top of the existing commit.

---

## Working Directory

All commands run from `/Users/yongseok/dev/css-module-explainer/` unless noted otherwise. Set this as the shell cwd for the entire plan execution.

---

## Task 0.1: Root workspace manifest + .gitignore

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `.gitignore`

- [ ] **Step 1: Write `package.json`**

Create `/Users/yongseok/dev/css-module-explainer/package.json` with the following exact contents:

```json
{
  "name": "css-module-explainer",
  "displayName": "CSS Module Explainer",
  "description": "Go to Definition, Hover, Autocomplete and Diagnostics for classnames/bind cx() patterns with CSS Modules.",
  "version": "0.0.1",
  "private": true,
  "packageManager": "pnpm@10.30.3",
  "license": "MIT",
  "publisher": "yongsk0066",
  "repository": {
    "type": "git",
    "url": "https://github.com/yongsk0066/css-module-explainer"
  },
  "engines": {
    "vscode": "^1.115.0"
  },
  "categories": [
    "Linters",
    "Programming Languages",
    "Visualization"
  ],
  "main": "./dist/client/extension.js",
  "activationEvents": [
    "onLanguage:typescriptreact",
    "onLanguage:javascriptreact",
    "onLanguage:typescript",
    "onLanguage:javascript",
    "onLanguage:scss",
    "onLanguage:css"
  ],
  "contributes": {},
  "scripts": {
    "clean": "rm -rf dist",
    "build": "pnpm clean && rolldown -c rolldown.config.ts",
    "watch": "rolldown -c rolldown.config.ts --watch",
    "typecheck": "tsc -b",
    "test": "vitest run",
    "test:unit": "vitest run test/unit",
    "test:unit:watch": "vitest test/unit",
    "lint": "oxlint .",
    "lint:fix": "oxlint . --fix",
    "format": "oxfmt --write .",
    "format:check": "oxfmt --check .",
    "check": "pnpm lint && pnpm format:check && pnpm typecheck",
    "package": "vsce package --no-dependencies"
  },
  "devDependencies": {
    "@types/node": "^25.5.0",
    "@types/vscode": "^1.115.0",
    "@vscode/vsce": "^3.7.1",
    "oxfmt": "^0.44.0",
    "oxlint": "^1.59.0",
    "rolldown": "1.0.0-rc15",
    "typescript": "^6.0.2",
    "vitest": "^4.1.3"
  }
}
```

- [ ] **Step 2: Write `pnpm-workspace.yaml`**

Create `/Users/yongseok/dev/css-module-explainer/pnpm-workspace.yaml`:

```yaml
packages:
  - 'client'
  - 'server'
  - 'shared'
```

- [ ] **Step 3: Write `.gitignore`**

Create `/Users/yongseok/dev/css-module-explainer/.gitignore`:

```gitignore
# Dependencies
node_modules/
.pnpm-store/

# Build output
dist/
*.vsix
*.tsbuildinfo

# Test output
coverage/
.vitest-cache/

# Editor / OS
.DS_Store
.vscode/
!.vscode/launch.json
!.vscode/tasks.json
!.vscode/extensions.json
*.swp
*~

# Logs
*.log
npm-debug.log*
pnpm-debug.log*
```

- [ ] **Step 4: Verify the files were created with the expected names**

Run from the project root:

```bash
ls -la package.json pnpm-workspace.yaml .gitignore
```

Expected output: three lines listing the three files with non-zero sizes. If any file is missing or empty, recreate it.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-workspace.yaml .gitignore
git commit -m "$(cat <<'EOF'
chore: scaffold root workspace manifest

Add the root package.json with pinned toolchain (pnpm 10.30.3,
TypeScript 6, rolldown rc15, vitest 4.1.3, oxlint 1.59, oxfmt 0.44),
the pnpm workspace declaration listing client/server/shared, and
a .gitignore covering Node, build, test, and editor artifacts.
EOF
)"
```

---

## Task 0.2: TypeScript base config + project references

**Files:**
- Create: `tsconfig.base.json`
- Create: `tsconfig.json`

- [ ] **Step 1: Write `tsconfig.base.json`**

Create `/Users/yongseok/dev/css-module-explainer/tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "strict": true,
    "noImplicitAny": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": true,
    "useUnknownInCatchVariables": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "composite": true,
    "incremental": true
  }
}
```

- [ ] **Step 2: Write the root `tsconfig.json` (project references aggregator)**

Create `/Users/yongseok/dev/css-module-explainer/tsconfig.json`:

```json
{
  "files": [],
  "references": [
    { "path": "./shared" },
    { "path": "./server" },
    { "path": "./client" }
  ]
}
```

- [ ] **Step 3: Verify the files were created**

```bash
ls -la tsconfig.base.json tsconfig.json
```

Expected: both files listed with non-zero size. The root `tsconfig.json` will fail to typecheck right now because `./shared`, `./server`, `./client` don't exist yet — that's fine, those are added in Tasks 0.3–0.5.

- [ ] **Step 4: Commit**

```bash
git add tsconfig.base.json tsconfig.json
git commit -m "$(cat <<'EOF'
build: add TypeScript base config and project-reference aggregator

tsconfig.base.json holds shared compiler options (strict mode,
NodeNext module resolution, composite for project references).
The root tsconfig.json is a references-only aggregator that will
resolve once shared/server/client packages are added.
EOF
)"
```

---

## Task 0.3: `shared/` package — types-only module

**Files:**
- Create: `shared/package.json`
- Create: `shared/tsconfig.json`
- Create: `shared/src/types.ts`
- Create: `shared/src/index.ts`

- [ ] **Step 1: Write `shared/package.json`**

Create `/Users/yongseok/dev/css-module-explainer/shared/package.json`:

```json
{
  "name": "@css-module-explainer/shared",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "scripts": {
    "clean": "rm -rf dist *.tsbuildinfo"
  }
}
```

- [ ] **Step 2: Write `shared/tsconfig.json`**

Create `/Users/yongseok/dev/css-module-explainer/shared/tsconfig.json`:

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "tsBuildInfoFile": "./dist/.tsbuildinfo"
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Write `shared/src/types.ts` (Phase 0 minimal — only Position and Range)**

Create `/Users/yongseok/dev/css-module-explainer/shared/src/types.ts`:

```ts
/** 0-based line and character position in a text document. */
export interface Position {
  readonly line: number;
  readonly character: number;
}

/** 0-based range with inclusive `start` and exclusive `end`. */
export interface Range {
  readonly start: Position;
  readonly end: Position;
}
```

- [ ] **Step 4: Write `shared/src/index.ts`**

Create `/Users/yongseok/dev/css-module-explainer/shared/src/index.ts`:

```ts
export type { Position, Range } from './types.js';
```

- [ ] **Step 5: Verify file structure**

```bash
ls -la shared/ shared/src/
```

Expected: `package.json`, `tsconfig.json`, `src/` directory under `shared/`; `types.ts`, `index.ts` under `shared/src/`.

- [ ] **Step 6: Commit**

```bash
git add shared/
git commit -m "$(cat <<'EOF'
feat(shared): add types-only shared package with Position and Range

Phase 0 ships only the minimal Position/Range types used everywhere.
Subsequent plans extend shared/src/types.ts with CxBinding, CxCallInfo,
SelectorInfo, ScssClassMap, StyleLang, ResolvedType, and CallSite.

The package is type-only (no runtime, no dependencies) per the
architecture's Layer 3 rule: shared types must not import anything
from server or client.
EOF
)"
```

---

## Task 0.4: `server/` package — minimal LSP server bootstrap

**Files:**
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `server/src/server.ts`

- [ ] **Step 1: Write `server/package.json`**

Create `/Users/yongseok/dev/css-module-explainer/server/package.json`:

```json
{
  "name": "@css-module-explainer/server",
  "version": "0.0.1",
  "private": true,
  "main": "./dist/server.js",
  "scripts": {
    "clean": "rm -rf dist *.tsbuildinfo"
  },
  "dependencies": {
    "@css-module-explainer/shared": "workspace:*",
    "vscode-languageserver": "^9.0.1",
    "vscode-languageserver-textdocument": "^1.0.12"
  }
}
```

- [ ] **Step 2: Write `server/tsconfig.json`**

Create `/Users/yongseok/dev/css-module-explainer/server/tsconfig.json`:

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "tsBuildInfoFile": "./dist/.tsbuildinfo",
    "module": "CommonJS",
    "moduleResolution": "Node"
  },
  "include": ["src/**/*.ts"],
  "references": [
    { "path": "../shared" }
  ]
}
```

> **Why CommonJS for server only:** rolldown bundles the server as `cjs` (so `vscode-languageserver/node` and `child_process.fork` work), and `vscode-languageserver` itself is published as CommonJS. The shared package stays NodeNext/ESM since rolldown converts it during bundling.

- [ ] **Step 3: Write `server/src/server.ts` (minimal initialize-only server)**

Create `/Users/yongseok/dev/css-module-explainer/server/src/server.ts`:

```ts
import {
  createConnection,
  ProposedFeatures,
  TextDocuments,
  TextDocumentSyncKind,
  type InitializeParams,
  type InitializeResult,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

const SERVER_NAME = 'css-module-explainer';
const SERVER_VERSION = '0.0.1';

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments<TextDocument>(TextDocument);

connection.onInitialize((_params: InitializeParams): InitializeResult => {
  connection.console.info(`[${SERVER_NAME}] initialize received`);
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
    },
    serverInfo: {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
  };
});

connection.onInitialized(() => {
  connection.console.info(`[${SERVER_NAME}] initialized`);
});

documents.listen(connection);
connection.listen();
```

- [ ] **Step 4: Verify file structure**

```bash
ls -la server/ server/src/
```

Expected: `package.json`, `tsconfig.json`, `src/` under `server/`; `server.ts` under `server/src/`.

- [ ] **Step 5: Commit**

```bash
git add server/
git commit -m "$(cat <<'EOF'
feat(server): add minimal LSP server bootstrap

server.ts creates a vscode-languageserver connection with
ProposedFeatures.all, registers a TextDocuments instance, and
responds to initialize with TextDocumentSyncKind.Incremental and
empty business-logic capabilities. serverInfo identifies this
extension to clients.

This is the bare scaffold; provider handlers (definition, hover,
completion, diagnostics) land in Plan 02+.
EOF
)"
```

---

## Task 0.5: `client/` package — LanguageClient bootstrap

**Files:**
- Create: `client/package.json`
- Create: `client/tsconfig.json`
- Create: `client/src/extension.ts`

- [ ] **Step 1: Write `client/package.json`**

Create `/Users/yongseok/dev/css-module-explainer/client/package.json`:

```json
{
  "name": "@css-module-explainer/client",
  "version": "0.0.1",
  "private": true,
  "main": "./dist/extension.js",
  "scripts": {
    "clean": "rm -rf dist *.tsbuildinfo"
  },
  "dependencies": {
    "vscode-languageclient": "^9.0.1"
  }
}
```

- [ ] **Step 2: Write `client/tsconfig.json`**

Create `/Users/yongseok/dev/css-module-explainer/client/tsconfig.json`:

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "tsBuildInfoFile": "./dist/.tsbuildinfo",
    "module": "CommonJS",
    "moduleResolution": "Node",
    "types": ["node", "vscode"]
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Write `client/src/extension.ts` (LanguageClient bootstrap)**

Create `/Users/yongseok/dev/css-module-explainer/client/src/extension.ts`:

```ts
import * as path from 'node:path';
import * as vscode from 'vscode';
import {
  LanguageClient,
  TransportKind,
  type LanguageClientOptions,
  type ServerOptions,
} from 'vscode-languageclient/node';

let client: LanguageClient | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const serverModule = context.asAbsolutePath(
    path.join('dist', 'server', 'server.js'),
  );

  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: { module: serverModule, transport: TransportKind.ipc },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      { scheme: 'file', language: 'typescriptreact' },
      { scheme: 'file', language: 'javascriptreact' },
      { scheme: 'file', language: 'typescript' },
      { scheme: 'file', language: 'javascript' },
      { scheme: 'file', language: 'scss' },
      { scheme: 'file', language: 'css' },
    ],
    synchronize: {
      configurationSection: 'cssModuleExplainer',
    },
    outputChannelName: 'CSS Module Explainer',
    progressOnInitialization: true,
  };

  try {
    client = new LanguageClient(
      'cssModuleExplainer',
      'CSS Module Explainer',
      serverOptions,
      clientOptions,
    );
  } catch {
    void vscode.window.showErrorMessage(
      "CSS Module Explainer couldn't be started.",
    );
    return;
  }

  void client.start();

  context.subscriptions.push({
    dispose: () => {
      void client?.stop();
    },
  });
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop();
}
```

- [ ] **Step 4: Verify file structure**

```bash
ls -la client/ client/src/
```

Expected: `package.json`, `tsconfig.json`, `src/` under `client/`; `extension.ts` under `client/src/`.

- [ ] **Step 5: Commit**

```bash
git add client/
git commit -m "$(cat <<'EOF'
feat(client): add LanguageClient bootstrap

extension.ts forks the bundled server module via TransportKind.ipc,
registers a document selector covering tsx/jsx/ts/js/scss/css with
file: scheme only, syncs the cssModuleExplainer.* configuration
section, and registers the dispose callback so the server stops
cleanly on extension deactivation.
EOF
)"
```

---

## Task 0.6: Rolldown bundle config

**Files:**
- Create: `rolldown.config.ts`

- [ ] **Step 1: Write `rolldown.config.ts`**

Create `/Users/yongseok/dev/css-module-explainer/rolldown.config.ts`:

```ts
import { defineConfig } from 'rolldown';

export default defineConfig([
  {
    input: { extension: 'client/src/extension.ts' },
    output: {
      dir: 'dist/client',
      format: 'cjs',
      sourcemap: 'hidden',
      entryFileNames: '[name].js',
    },
    external: ['vscode'],
    platform: 'node',
  },
  {
    input: { server: 'server/src/server.ts' },
    output: {
      dir: 'dist/server',
      format: 'cjs',
      sourcemap: 'hidden',
      entryFileNames: '[name].js',
    },
    platform: 'node',
  },
]);
```

> **Notes for the implementer:**
> - The client config marks `vscode` as external because the API is provided by the host at runtime, not bundled.
> - The server config does NOT mark `vscode-languageserver` as external — rolldown bundles it into `dist/server/server.js`.
> - `format: 'cjs'` matches what `child_process.fork` and `vscode-languageserver/node` expect.
> - `sourcemap: 'hidden'` produces source maps that aren't referenced from the output (smaller files, better stack traces during dev).

- [ ] **Step 2: Verify the config file exists**

```bash
ls -la rolldown.config.ts
```

Expected: file listed with non-zero size.

- [ ] **Step 3: Commit**

```bash
git add rolldown.config.ts
git commit -m "$(cat <<'EOF'
build: add rolldown bundle config for client and server

Two independent bundles:
- dist/client/extension.js — externals 'vscode' (host-provided)
- dist/server/server.js — bundles vscode-languageserver

Both are CommonJS for VS Code extension host compatibility.
Hidden source maps for cleaner output.
EOF
)"
```

---

## Task 0.7: Vitest base config + empty test directory

**Files:**
- Create: `vitest.config.ts`
- Create: `test/unit/.gitkeep`

- [ ] **Step 1: Write `vitest.config.ts`**

Create `/Users/yongseok/dev/css-module-explainer/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/unit/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    environment: 'node',
    globals: false,
    clearMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: [
        'shared/src/**',
        'server/src/**',
        'client/src/**',
      ],
      exclude: [
        '**/dist/**',
        '**/*.d.ts',
        '**/node_modules/**',
      ],
    },
  },
});
```

- [ ] **Step 2: Create the empty test directory**

```bash
mkdir -p test/unit
touch test/unit/.gitkeep
```

- [ ] **Step 3: Verify both files exist**

```bash
ls -la vitest.config.ts test/unit/.gitkeep
```

Expected: both listed.

- [ ] **Step 4: Commit**

```bash
git add vitest.config.ts test/unit/.gitkeep
git commit -m "$(cat <<'EOF'
test: add vitest base config

vitest.config.ts targets test/unit/**/*.test.ts with the v8
coverage provider reporting against shared/server/client src.
test/unit/.gitkeep keeps the empty discovery target tracked.

Tier 2 (test/protocol/) and Tier 3 (test/e2e/) directories are
added by Plan 06+ when their respective harnesses arrive.
EOF
)"
```

---

## Task 0.8: oxlint + oxfmt configs

**Files:**
- Create: `.oxlintrc.json`
- Create: `oxfmt.toml`

- [ ] **Step 1: Write `.oxlintrc.json`**

Create `/Users/yongseok/dev/css-module-explainer/.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "categories": {
    "correctness": "error",
    "perf": "warn",
    "suspicious": "warn"
  },
  "rules": {
    "no-console": "off",
    "no-unused-vars": "error",
    "no-undef": "error"
  },
  "ignorePatterns": [
    "dist/**",
    "node_modules/**",
    "coverage/**",
    "**/*.d.ts"
  ]
}
```

- [ ] **Step 2: Write `oxfmt.toml`**

Create `/Users/yongseok/dev/css-module-explainer/oxfmt.toml`:

```toml
# oxfmt configuration
# https://github.com/oxc-project/oxc/tree/main/crates/oxc_formatter

# Use the formatter defaults; project-specific overrides go here.
```

> The empty TOML is intentional — oxfmt's defaults match the project's preferred style. Override knobs only when a real disagreement appears.

- [ ] **Step 3: Verify both files exist**

```bash
ls -la .oxlintrc.json oxfmt.toml
```

Expected: both listed.

- [ ] **Step 4: Commit**

```bash
git add .oxlintrc.json oxfmt.toml
git commit -m "$(cat <<'EOF'
build: add oxlint and oxfmt configurations

oxlint enables correctness/perf/suspicious categories at error or
warn level, ignores generated dist/, node_modules/, coverage/, and
.d.ts files.

oxfmt uses defaults for now; overrides land when a concrete style
disagreement surfaces.
EOF
)"
```

---

## Task 0.9: Empty README + CHANGELOG + LICENSE

**Files:**
- Create: `README.md`
- Create: `CHANGELOG.md`
- Create: `LICENSE`

- [ ] **Step 1: Write `README.md` (placeholder; full content lands in Plan 12)**

Create `/Users/yongseok/dev/css-module-explainer/README.md`:

```markdown
# CSS Module Explainer

> Go to Definition, Hover, Autocomplete and Diagnostics for `classnames/bind` `cx()` patterns with CSS Modules.

**Status:** Pre-release. Full README arrives with the 1.0.0 publish.

See `docs/superpowers/specs/2026-04-09-css-module-explainer-design.md` for the design spec.
```

- [ ] **Step 2: Write `CHANGELOG.md` (placeholder)**

Create `/Users/yongseok/dev/css-module-explainer/CHANGELOG.md`:

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Repository scaffolding (Plan 01).
```

- [ ] **Step 3: Write `LICENSE` (MIT, owner yongsk0066, year 2026)**

Create `/Users/yongseok/dev/css-module-explainer/LICENSE`:

```text
MIT License

Copyright (c) 2026 yongsk0066

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 4: Verify all three files exist**

```bash
ls -la README.md CHANGELOG.md LICENSE
```

Expected: three lines.

- [ ] **Step 5: Commit**

```bash
git add README.md CHANGELOG.md LICENSE
git commit -m "$(cat <<'EOF'
docs: add placeholder README, CHANGELOG, and MIT LICENSE

README and CHANGELOG are skeletons; both are filled in by Plan 12
during the 1.0.0 release prep. LICENSE is the standard MIT text
attributed to yongsk0066 (2026).
EOF
)"
```

---

## Task 0.10: GitHub Actions CI workflow skeleton

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create the workflows directory**

```bash
mkdir -p .github/workflows
```

- [ ] **Step 2: Write `.github/workflows/ci.yml`**

Create `/Users/yongseok/dev/css-module-explainer/.github/workflows/ci.yml`:

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main, master]

jobs:
  lint-typecheck:
    name: Lint, Format, Typecheck
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10.30.3
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm format:check
      - run: pnpm typecheck

  unit-tests:
    name: Tier 1 — Unit Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10.30.3
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm test:unit

  build:
    name: Build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10.30.3
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - name: Verify bundle output
        run: |
          test -f dist/client/extension.js
          test -f dist/server/server.js
```

> **Why three jobs in parallel:** lint/typecheck failures should report independently from test failures and from build failures. Faster iteration during PR review.

- [ ] **Step 3: Verify the workflow file exists**

```bash
ls -la .github/workflows/ci.yml
```

Expected: file listed.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "$(cat <<'EOF'
ci: add GitHub Actions workflow with lint, test, and build jobs

Three parallel jobs target the PR gate:
- lint-typecheck (oxlint + oxfmt + tsc)
- unit-tests (vitest tier 1)
- build (rolldown bundles client + server, verify outputs)

Tier 2 (protocol) and Tier 3 (E2E) jobs land in later plans
(Plan 06 and Plan 12 respectively).
EOF
)"
```

---

## Task 0.11: Install dependencies and verify

**Files:**
- Create: `pnpm-lock.yaml` (generated)

- [ ] **Step 1: Run pnpm install**

```bash
pnpm install
```

Expected: pnpm resolves all workspaces, downloads `typescript`, `rolldown`, `vitest`, `oxlint`, `oxfmt`, `@vscode/vsce`, `vscode-languageserver`, `vscode-languageclient`, `vscode-languageserver-textdocument`, plus their transitive deps. Generates `pnpm-lock.yaml` and `node_modules/`.

If pnpm reports a peer dependency warning, note it but do not fail this step. If it reports an actual error (e.g., a package not found), stop and investigate before proceeding.

- [ ] **Step 2: Verify `pnpm-lock.yaml` was created**

```bash
ls -la pnpm-lock.yaml node_modules/.modules.yaml
```

Expected: both files present. `pnpm-lock.yaml` should be > 1 KB.

- [ ] **Step 3: Verify the workspace links resolve**

```bash
ls -la node_modules/@css-module-explainer/
```

Expected: three symlinks (`shared`, `server`, `client`) pointing to the workspace package directories.

- [ ] **Step 4: Run typecheck and confirm a clean pass**

```bash
pnpm typecheck
```

Expected: `tsc -b` exits 0, prints nothing (or only build progress on first run). If TypeScript reports errors, read the message — common causes at this stage are typos in tsconfig.json `references`, missing `node_modules`, or mismatched module/moduleResolution settings.

- [ ] **Step 5: Run lint and confirm clean**

```bash
pnpm lint
```

Expected: `oxlint .` exits 0 with `Found 0 warnings and 0 errors` (or similar phrasing). The codebase is small enough that any reported issue should be addressed inline.

- [ ] **Step 6: Run format check and confirm clean**

```bash
pnpm format:check
```

Expected: `oxfmt --check .` exits 0 with no files needing formatting. If files are reported as needing formatting, run `pnpm format` (which runs `oxfmt --write .`), then re-run `pnpm format:check`.

- [ ] **Step 7: Run test and confirm an empty-suite pass**

```bash
pnpm test
```

Expected: vitest exits 0. Output mentions zero test files found OR `0 tests` — either is acceptable for Phase 0. If vitest crashes (not "no tests"), stop and investigate.

- [ ] **Step 8: Run build and verify bundle outputs exist**

```bash
pnpm build
ls -la dist/client/extension.js dist/server/server.js
```

Expected: rolldown completes without errors; both bundle files exist with non-zero size. Source maps (`*.js.map`) are NOT referenced from the bundles (`sourcemap: 'hidden'`) but should still exist on disk.

> **If the build fails:** the most likely issue is rolldown rc15 incompatibility with the current `vscode-languageserver` package shape. Read the error carefully. Acceptable fallback: pin `rolldown` to `1.0.0-rc.12` in `package.json` (the version validated in react-compiler-lens), re-run `pnpm install`, then retry the build. Document the fallback decision in the commit message in Step 9.

- [ ] **Step 9: Commit the lockfile**

```bash
git add pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
chore: add pnpm-lock.yaml from initial install

Pinned dependency tree for the Phase 0 toolchain. Lockfile is
committed so CI installs are deterministic across runs.
EOF
)"
```

---

## Task 0.12: Add a placeholder unit test to prove vitest discovery

**Files:**
- Create: `test/unit/_smoke.test.ts`

- [ ] **Step 1: Write a trivial smoke test**

Create `/Users/yongseok/dev/css-module-explainer/test/unit/_smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { Position, Range } from '@css-module-explainer/shared';

describe('scaffolding smoke test', () => {
  it('imports shared types without runtime cost', () => {
    const pos: Position = { line: 0, character: 0 };
    const range: Range = { start: pos, end: pos };
    expect(range.start).toBe(pos);
  });

  it('confirms vitest discovery is wired', () => {
    expect(1 + 1).toBe(2);
  });
});
```

> **Why this test exists:** confirms three things at once — vitest finds the test file, the workspace alias `@css-module-explainer/shared` resolves at type level, and shared types compile without `dist/` (because `pnpm typecheck` already built shared into `dist/`). The test deletes itself in Plan 02 once real tests arrive.

- [ ] **Step 2: Run the test**

```bash
pnpm test
```

Expected: vitest finds 1 file with 2 tests, both pass. Output ends with `Test Files  1 passed (1)` and `Tests       2 passed (2)`.

If the import fails with `Cannot find module '@css-module-explainer/shared'`, the most likely cause is that `shared/dist/` doesn't exist yet — run `pnpm typecheck` first (which triggers the composite build), then re-run `pnpm test`.

- [ ] **Step 3: Run the full check pipeline to confirm everything stays green**

```bash
pnpm check && pnpm test && pnpm build
```

Expected: all four commands (`lint`, `format:check`, `typecheck`, plus the explicit `test` and `build`) pass. If any fail, fix the underlying cause before committing.

- [ ] **Step 4: Commit**

```bash
git add test/unit/_smoke.test.ts
git commit -m "$(cat <<'EOF'
test: add vitest discovery smoke test

Two trivial assertions confirm that vitest discovers test files
under test/unit/, that the @css-module-explainer/shared workspace
import resolves, and that the shared Position/Range types compile.

This file is removed in Plan 02 once real tests for scss/lang-registry
land at test/unit/scss/lang-registry.test.ts.
EOF
)"
```

---

## Task 0.13: Add VS Code launch config for F5 debugging

**Files:**
- Create: `.vscode/launch.json`
- Create: `.vscode/tasks.json`
- Create: `.vscode/extensions.json`

> The `.gitignore` from Task 0.1 ignores `.vscode/` by default but explicitly un-ignores `launch.json`, `tasks.json`, and `extensions.json`. Confirm this rule before committing — if `git add` complains about ignored files, the un-ignore lines in `.gitignore` need verification.

- [ ] **Step 1: Create the `.vscode/` directory**

```bash
mkdir -p .vscode
```

- [ ] **Step 2: Write `.vscode/launch.json`**

Create `/Users/yongseok/dev/css-module-explainer/.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Launch Extension",
      "type": "extensionHost",
      "request": "launch",
      "runtimeExecutable": "${execPath}",
      "args": [
        "--extensionDevelopmentPath=${workspaceFolder}",
        "--disable-extensions"
      ],
      "outFiles": [
        "${workspaceFolder}/dist/**/*.js"
      ],
      "preLaunchTask": "npm: build",
      "sourceMaps": true
    },
    {
      "name": "Attach to Server",
      "type": "node",
      "request": "attach",
      "port": 6009,
      "restart": true,
      "outFiles": [
        "${workspaceFolder}/dist/server/**/*.js"
      ]
    }
  ]
}
```

- [ ] **Step 3: Write `.vscode/tasks.json`**

Create `/Users/yongseok/dev/css-module-explainer/.vscode/tasks.json`:

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "type": "npm",
      "script": "build",
      "group": {
        "kind": "build",
        "isDefault": true
      },
      "presentation": {
        "reveal": "silent",
        "panel": "dedicated"
      },
      "problemMatcher": []
    },
    {
      "type": "npm",
      "script": "watch",
      "isBackground": true,
      "presentation": {
        "reveal": "silent",
        "panel": "dedicated"
      },
      "problemMatcher": []
    }
  ]
}
```

- [ ] **Step 4: Write `.vscode/extensions.json`**

Create `/Users/yongseok/dev/css-module-explainer/.vscode/extensions.json`:

```json
{
  "recommendations": [
    "oxc.oxc-vscode"
  ]
}
```

- [ ] **Step 5: Verify the files were created**

```bash
ls -la .vscode/
```

Expected: `launch.json`, `tasks.json`, `extensions.json`.

- [ ] **Step 6: Confirm git tracks them despite the ignore rules**

```bash
git status .vscode/
```

Expected: all three files appear under "untracked" or "to be committed". If git reports them as ignored, edit `.gitignore` to ensure these three filenames have `!` un-ignore lines before the wildcard `.vscode/` rule (the file from Task 0.1 already has this — verify it's correct).

- [ ] **Step 7: Commit**

```bash
git add .vscode/launch.json .vscode/tasks.json .vscode/extensions.json
git commit -m "$(cat <<'EOF'
chore: add VS Code launch config for extension dev host

launch.json provides:
- "Launch Extension" — runs the extension in a fresh extension host
  with --disable-extensions, pre-built via the npm: build task
- "Attach to Server" — debug attach to the LSP server child process
  on port 6009 (used when --inspect is added later)

tasks.json registers the build and watch scripts as VS Code tasks.
extensions.json recommends the oxc VS Code extension for in-editor
oxlint feedback.
EOF
)"
```

---

## Task 0.14: Manual smoke test in Extension Development Host

> This is a manual verification task — no code, just confirmation that the scaffold actually loads in VS Code. The implementer must perform this themselves.

- [ ] **Step 1: Open the project in VS Code**

```bash
code /Users/yongseok/dev/css-module-explainer
```

- [ ] **Step 2: Press F5 to launch the extension development host**

VS Code's Run and Debug panel should show "Launch Extension" pre-selected (from `.vscode/launch.json`). Pressing F5 triggers `npm: build` first, then opens a new VS Code window with `[Extension Development Host]` in the title bar.

- [ ] **Step 3: Open the Output panel in the new window**

In the Extension Development Host window:
- View → Output (or Cmd+Shift+U)
- From the dropdown on the right, select "CSS Module Explainer"

Expected output (one or more lines):
```
[css-module-explainer] initialize received
[css-module-explainer] initialized
```

These come from `connection.console.info()` in `server/src/server.ts`.

If you see no output or an error like "Cannot find module dist/server/server.js":
- Confirm `pnpm build` was run (Task 0.11 Step 8) — the `preLaunchTask` should handle this but may have failed silently.
- Check the original VS Code window's "Debug Console" for build errors.

- [ ] **Step 4: Open any TSX file in the dev host window to confirm the document selector activates**

Create a temporary file in the dev host (no need to save):
- File → New File → save as `test.tsx` somewhere
- Type any TSX content, e.g.:
  ```tsx
  const x = <div />;
  ```

Expected: the language server stays alive (no crash). The Output panel may not show new entries because we don't have any document handlers yet — that's correct for Phase 0.

- [ ] **Step 5: Stop the debug session**

In the original VS Code window: click the red square Stop button in the debug toolbar, or press Shift+F5.

- [ ] **Step 6: No commit for this task**

This is a manual verification step. If everything worked, proceed to Task 0.15. If anything failed, fix the underlying issue and re-run from Step 2.

---

## Task 0.15: Final verification — full pipeline green

**Files:** none

- [ ] **Step 1: Re-run the full check + test + build pipeline**

```bash
pnpm check && pnpm test && pnpm build
```

Expected: all five sub-commands (lint, format:check, typecheck, test, build) exit 0. If any step fails, stop the plan execution and address the failure before proceeding.

- [ ] **Step 2: Verify git status is clean**

```bash
git status
```

Expected: `nothing to commit, working tree clean`. If there are any uncommitted changes from earlier tasks, this is the moment to identify them — every prior task should have ended with a commit.

- [ ] **Step 3: Verify the commit history matches the plan**

```bash
git log --oneline
```

Expected: at least 14 commits (1 initial spec commit + 13 commits from Tasks 0.1 through 0.13). Commit messages should follow the conventional commit format used in the plan templates.

- [ ] **Step 4: Verify the dist/ outputs are present**

```bash
ls -la dist/client/extension.js dist/server/server.js
```

Expected: both files exist with non-zero size. (`dist/` is gitignored, so it won't show in git status.)

- [ ] **Step 5: Confirm the workspace is ready for Plan 02**

Run `cat package.json | grep version` and confirm `"version": "0.0.1"`. This is the baseline version that subsequent plans build on; no version bump in Phase 0.

- [ ] **Step 6: No commit for this task**

This is verification only — Phase 0 is complete when this task's checks all pass.

---

## Phase 0 Completion Checklist

Before declaring Plan 01 done, confirm every item below:

- [ ] `pnpm install` succeeds, `pnpm-lock.yaml` is committed.
- [ ] `pnpm typecheck` exits 0 against `shared`, `server`, `client`.
- [ ] `pnpm lint` exits 0 with zero warnings.
- [ ] `pnpm format:check` exits 0.
- [ ] `pnpm test` runs the smoke test and reports 2 passing assertions.
- [ ] `pnpm build` produces `dist/client/extension.js` and `dist/server/server.js`.
- [ ] F5 from VS Code launches the Extension Development Host and the Output channel `CSS Module Explainer` shows `initialize received` + `initialized`.
- [ ] `.github/workflows/ci.yml` defines `lint-typecheck`, `unit-tests`, `build` jobs.
- [ ] `git status` is clean; `git log --oneline` shows ~14 commits with conventional messages.
- [ ] `docs/code-philosophy.md`, `docs/superpowers/specs/2026-04-09-css-module-explainer-design.md`, `docs/superpowers/plans/2026-04-09-plan-01-scaffolding.md` are present and committed.

When every box above is checked, Plan 01 is complete. Proceed to **Plan 02 — SCSS Indexing (Phase 1)** for the next layer.

---

## Risks & Fallbacks

**R1. rolldown rc15 fails to bundle the server.**
Symptom: `pnpm build` errors during Task 0.11 Step 8 with messages about CommonJS interop, missing externals, or "cannot resolve module".
Fallback: edit `package.json` and pin `"rolldown": "1.0.0-rc.12"` (the version validated in react-compiler-lens). Run `pnpm install`, then retry `pnpm build`. Document the downgrade in the next available commit message.

**R2. `vscode-languageserver/node` import path resolution under NodeNext.**
Symptom: `pnpm typecheck` reports "Cannot find module 'vscode-languageserver/node' or its corresponding type declarations" in `server/src/server.ts`.
Fallback: in `server/tsconfig.json`, ensure `"module": "CommonJS"` and `"moduleResolution": "Node"` (NOT NodeNext) — this matches how vscode-languageserver publishes its types. The plan already sets these values; if the error appears, double-check that `server/tsconfig.json` overrides the base config correctly.

**R3. pnpm workspace symlinks not resolving to `@css-module-explainer/shared`.**
Symptom: `pnpm typecheck` reports "Cannot find module '@css-module-explainer/shared'" in `server/src/server.ts` (Plan 02+; Phase 0 doesn't import from shared in server.ts).
Fallback: confirm `pnpm-workspace.yaml` lists all three packages and `pnpm install` was run from the workspace root. `ls -la node_modules/@css-module-explainer/` should show three symlinks; if it doesn't, delete `node_modules/` + `pnpm-lock.yaml` and re-run `pnpm install`.

**R4. F5 launches VS Code but the dev host shows no Output channel for "CSS Module Explainer".**
Symptom: Task 0.14 Step 3 finds no Output entries.
Diagnosis: open the original VS Code window's Debug Console (View → Debug Console). It should show server boot logs. If it shows `Cannot find module 'dist/server/server.js'`, the build didn't run — re-run `pnpm build` manually and try F5 again. If it shows the server starting but the dev host's Output dropdown doesn't list "CSS Module Explainer", wait 2-3 seconds for the language client to register the channel, then re-check the dropdown.

---

## What Plan 02 Will Add

For context (do not implement here):
- `server/src/core/scss/lang-registry.ts` + tests
- `server/src/core/scss/scss-index.ts` with Q6 B edge cases + tests
- `shared/src/types.ts` extended with `StyleLang`, `SelectorInfo`, `ScssClassMap`
- `server/package.json` adds `postcss@^8.5.9` and `postcss-scss@^4.0.9`
- `test/fixtures/basic-scss/`, `test/fixtures/global-local-selectors/`, etc.
- The `_smoke.test.ts` from Task 0.12 is removed (replaced by real tests).

Plan 02 starts with `pnpm test:unit` already green (the smoke test) and ends with the same command running real `lang-registry` and `scss-index` tests.
