# Plan 06 — Definition Provider + Tier 2 Harness (Phase 6)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the first real LSP request handler — `textDocument/definition` — and stand up the Tier 2 in-process protocol test harness that every subsequent provider (Plans 07–09.5) will reuse.

**Architecture:** Four new pieces land together. `server/src/providers/definition.ts` is a thin handler that dispatches through `withCxCallAtCursor` and maps each resolved `SelectorInfo` to an LSP `LocationLink`. `server/src/composition-root.ts` extracts the "build a live LSP server from streams + deps" responsibility out of `server.ts` so (1) tests can spin up an in-process server over a pair of `PassThrough` streams, and (2) production wiring has a single place to configure overrides. `test/protocol/_harness/in-process-server.ts` wraps the composition root with an `LspTestClient` that exposes `initialize`, `didOpen`, `definition`, and `shutdown` — each test gets a fresh server instance. `test/protocol/lifecycle.test.ts` + `test/protocol/definition.test.ts` are the first two Tier 2 files. Plan 05's `handleDefinition` is the only LSP capability wired this phase; the definition provider unit tests (Tier 1) exercise `handleDefinition` directly with mock deps, and the Tier 2 tests exercise it through the real LSP pipeline.

No new core modules. No change to provider-utils or the analysis cache. This is strictly a "presentation layer + protocol plumbing" plan.

**Tech Stack:** typescript@^6.0.2 · vitest@^4.1.3 · vscode-languageserver@^9.0.1 · vscode-languageserver-protocol@^3.17.5 · vscode-jsonrpc@^8.2.0 · @css-module-explainer/shared

---

## Spec References

- Spec section 2.3 — composition root pattern
- Spec section 4.2 — `definition.ts` (LocationLink shape)
- Spec section 4.8 — capability registration
- Spec section 5.2 — `cx(size)` Go-to-Definition data flow
- Spec section 8.3 — Tier 2 protocol test harness
- Handoff `docs/superpowers/handoff/2026-04-10-session-handoff.md` §4.3 — reverse index seam must stay live in every provider
- Handoff §4.4 — `CxCallContext` is spec-locked at 4 fields

## End State

- `server/src/providers/definition.ts` exports `handleDefinition(params: CursorParams, deps: ProviderDeps): LocationLink[] | null`.
- `server/src/composition-root.ts` exports `createServer(options: CreateServerOptions): CreatedServer` — builds the connection + deps + handlers, does NOT call `.listen()`.
- `server/src/server.ts` becomes a thin entrypoint: builds a `CreateServerOptions` for stdin/stdout and calls `createServer({...}).connection.listen()`.
- `textDocument/definition` is registered in the initialize response (`definitionProvider: true`).
- The server wires `WorkspaceTypeResolver`, `NullReverseIndex`, `SourceFileCache`, `StyleIndexCache`, `DocumentAnalysisCache` together and builds a `ProviderDeps` bag scoped to the workspace root received in the `initialize` params.
- `test/protocol/_harness/in-process-server.ts` exports `createInProcessServer(overrides?)` returning an `LspTestClient` with `initialize`, `didOpen`, `didChange`, `definition`, `shutdown`, and `dispose`.
- `test/protocol/lifecycle.test.ts` covers: initialize returns capabilities, shutdown completes cleanly, double shutdown is safe.
- `test/protocol/definition.test.ts` covers: static match, template prefix match (multi-result), variable union match (FakeTypeResolver), miss → null, pre-import fast-path → null.
- `test/unit/providers/definition.test.ts` covers: transform shape, LocationLink ordering, unresolvable → null, exception inside resolver → null (never crash).
- Root `package.json` has `"test:protocol": "vitest run test/protocol"`, `"test:unit"` stays scoped to unit, `"test"` runs both.
- Root `devDependencies` add `vscode-languageserver-protocol` + `vscode-jsonrpc` (explicit — pnpm strict).
- `pnpm check && pnpm test && pnpm build` all green.

**Layer rule:** `providers/definition.ts` imports from `core/cx/call-resolver` (pure function), `core/util/text-utils` (pathToFileUrl), and `providers/provider-utils` only. It must NOT import `WorkspaceTypeResolver` concretely — it uses the `TypeResolver` interface through `deps.typeResolver`. It must NOT import `DocumentAnalysisCache` directly — it goes through `withCxCallAtCursor`.

**Invariant preserved:** `withCxCallAtCursor` calls `reverseIndex.record()` on every provider call (handoff §4.3). Plan 06 does NOT move this call yet; that is deferred to Phase Final per the TODO in `provider-utils.ts`.

---

## File Structure

```
server/src/
  composition-root.ts                 # NEW — createServer({reader, writer, overrides})
  server.ts                           # MOD — thin entrypoint calling createServer(process.stdin, process.stdout)
  providers/
    definition.ts                     # NEW — handleDefinition
test/unit/providers/
  definition.test.ts                  # NEW — 5 tests, mock deps
test/protocol/
  _harness/
    in-process-server.ts              # NEW — LspTestClient + createInProcessServer
  lifecycle.test.ts                   # NEW — 3 tests
  definition.test.ts                  # NEW — 5 tests (static, template, variable, miss, no-import)
package.json                          # MOD — add test:protocol script + protocol devDeps
```

---

## Working Directory

All commands run from `/Users/yongseok/dev/css-module-explainer/`.

---

## Task 6.1: Definition provider — unit tests first (TDD)

**Files:**
- Create: `server/src/providers/definition.ts`
- Create: `test/unit/providers/definition.test.ts`

This is the pure, Tier 1 version of the provider. It takes `CursorParams + ProviderDeps`, runs through `withCxCallAtCursor`, maps each resolved `SelectorInfo` to a `LocationLink`, and returns `null` on miss or exception. No LSP transport involvement.

- [ ] **Step 1: Write the failing test**

Create `test/unit/providers/definition.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import type ts from "typescript";
import type {
  CxBinding,
  CxCallInfo,
  ResolvedType,
  ScssClassMap,
  SelectorInfo,
} from "@css-module-explainer/shared";
import { SourceFileCache } from "../../../server/src/core/ts/source-file-cache.js";
import { DocumentAnalysisCache } from "../../../server/src/core/indexing/document-analysis-cache.js";
import { NullReverseIndex } from "../../../server/src/core/indexing/reverse-index.js";
import type { TypeResolver } from "../../../server/src/core/ts/type-resolver.js";
import type { ProviderDeps } from "../../../server/src/providers/provider-utils.js";
import { handleDefinition } from "../../../server/src/providers/definition.js";

const TSX = `
import classNames from 'classnames/bind';
import styles from './Button.module.scss';
const cx = classNames.bind(styles);
const el = cx('indicator');
`;

function info(name: string, startChar = 0): SelectorInfo {
  return {
    name,
    range: {
      start: { line: 11, character: startChar },
      end: { line: 11, character: startChar + name.length },
    },
    fullSelector: `.${name}`,
    declarations: "color: red",
    ruleRange: {
      start: { line: 10, character: 0 },
      end: { line: 13, character: 1 },
    },
  };
}

class FakeTypeResolver implements TypeResolver {
  resolve(): ResolvedType {
    return { kind: "unresolvable", values: [] };
  }
  invalidate(): void {}
  clear(): void {}
}

const detectCxBindings = (sourceFile: ts.SourceFile): CxBinding[] => [
  {
    cxVarName: "cx",
    stylesVarName: "styles",
    scssModulePath: "/fake/src/Button.module.scss",
    classNamesImportName: "classNames",
    scope: {
      startLine: 0,
      endLine: sourceFile.getLineAndCharacterOfPosition(sourceFile.getEnd()).line,
    },
  },
];

const parseCxCalls = (_sf: ts.SourceFile, binding: CxBinding): CxCallInfo[] => [
  {
    kind: "static",
    className: "indicator",
    originRange: {
      start: { line: 4, character: 15 },
      end: { line: 4, character: 24 },
    },
    binding,
  },
];

function makeDeps(overrides: Partial<ProviderDeps> = {}): ProviderDeps {
  const sourceFileCache = new SourceFileCache({ max: 10 });
  const analysisCache = new DocumentAnalysisCache({
    sourceFileCache,
    detectCxBindings,
    parseCxCalls,
    max: 10,
  });
  return {
    analysisCache,
    scssClassMapFor: () => new Map([["indicator", info("indicator", 2)]]) as ScssClassMap,
    typeResolver: new FakeTypeResolver(),
    reverseIndex: new NullReverseIndex(),
    workspaceRoot: "/fake",
    ...overrides,
  };
}

describe("handleDefinition", () => {
  const baseParams = {
    documentUri: "file:///fake/src/Button.tsx",
    content: TSX,
    filePath: "/fake/src/Button.tsx",
    line: 4,
    character: 18, // middle of 'indicator'
    version: 1,
  };

  it("returns a LocationLink pointing at the SCSS rule for a static call", () => {
    const deps = makeDeps();
    const result = handleDefinition(baseParams, deps);
    expect(result).not.toBeNull();
    expect(result).toHaveLength(1);
    const link = result![0]!;
    expect(link.targetUri).toMatch(/Button\.module\.scss$/);
    expect(link.targetUri.startsWith("file://")).toBe(true);
    expect(link.originSelectionRange).toEqual({
      start: { line: 4, character: 15 },
      end: { line: 4, character: 24 },
    });
    expect(link.targetRange).toEqual({
      start: { line: 10, character: 0 },
      end: { line: 13, character: 1 },
    });
    expect(link.targetSelectionRange).toEqual({
      start: { line: 11, character: 2 },
      end: { line: 11, character: 11 },
    });
  });

  it("returns null when the cursor is not on a cx call", () => {
    const deps = makeDeps();
    const result = handleDefinition({ ...baseParams, line: 1, character: 0 }, deps);
    expect(result).toBeNull();
  });

  it("returns null when classMap has no match for the class name", () => {
    const deps = makeDeps({
      scssClassMapFor: () => new Map() as ScssClassMap,
    });
    const result = handleDefinition(baseParams, deps);
    expect(result).toBeNull();
  });

  it("returns all LocationLinks for a template-literal prefix match", () => {
    const deps = makeDeps({
      scssClassMapFor: () =>
        new Map([
          ["btn", info("btn", 2)],
          ["btn-primary", info("btn-primary", 2)],
          ["btn-secondary", info("btn-secondary", 2)],
          ["indicator", info("indicator", 2)],
        ]) as ScssClassMap,
    });
    // Override parseCxCalls on this specific cache: replace static call
    // with a template call whose staticPrefix is 'btn-'.
    const sourceFileCache = new SourceFileCache({ max: 10 });
    const analysisCache = new DocumentAnalysisCache({
      sourceFileCache,
      detectCxBindings,
      parseCxCalls: (_sf, binding) => [
        {
          kind: "template",
          rawTemplate: "btn-${variant}",
          staticPrefix: "btn-",
          originRange: {
            start: { line: 4, character: 15 },
            end: { line: 4, character: 28 },
          },
          binding,
        },
      ],
      max: 10,
    });
    const depsWithTemplate: ProviderDeps = { ...deps, analysisCache };
    const result = handleDefinition(baseParams, depsWithTemplate);
    expect(result).not.toBeNull();
    // btn-primary + btn-secondary — 'btn' does not match 'btn-' prefix
    expect(result).toHaveLength(2);
    expect(result!.every((l) => l.targetUri.startsWith("file://"))).toBe(true);
  });

  it("never throws when the underlying transform raises", () => {
    const deps = makeDeps({
      scssClassMapFor: () => {
        throw new Error("boom");
      },
    });
    expect(() => handleDefinition(baseParams, deps)).not.toThrow();
    expect(handleDefinition(baseParams, deps)).toBeNull();
  });
});
```

- [ ] **Step 2: Run → fail**

```bash
pnpm test test/unit/providers/definition.test.ts
```

Expected: red. The module does not exist yet.

- [ ] **Step 3: Implement `handleDefinition`**

Create `server/src/providers/definition.ts`:

```ts
import type { LocationLink, Range as LspRange } from "vscode-languageserver/node";
import type { Range, SelectorInfo } from "@css-module-explainer/shared";
import { resolveCxCallToSelectorInfos } from "../core/cx/call-resolver.js";
import { pathToFileUrl } from "../core/util/text-utils.js";
import {
  withCxCallAtCursor,
  type CursorParams,
  type CxCallContext,
  type ProviderDeps,
} from "./provider-utils.js";

/**
 * Handle `textDocument/definition` for a `cx()` call.
 *
 * Dispatches through `withCxCallAtCursor` (the "one parse per
 * file" front stage), then maps each resolved `SelectorInfo` to a
 * VS Code `LocationLink`:
 *
 *   - `originSelectionRange` — the class token in source (drives
 *     the underline on the click target)
 *   - `targetUri`            — `file://` URL of the SCSS module
 *   - `targetRange`          — full `{ ... }` rule block (peek preview)
 *   - `targetSelectionRange` — class token range (caret placement)
 *
 * Multi-match (template prefix, variable union) returns every
 * link; VS Code opens an auto-picker. Empty match returns `null`,
 * not `[]`, so other providers can still attempt.
 *
 * Top-level try/catch ensures a single handler bug never crashes
 * the server. On exception we log (TODO: wire a logger) and
 * return `null`.
 */
export function handleDefinition(
  params: CursorParams,
  deps: ProviderDeps,
): LocationLink[] | null {
  try {
    return withCxCallAtCursor(params, deps, (ctx) => buildLinks(ctx, params, deps));
  } catch {
    // Never crash the server. Silent-return-null is the spec
    // contract for every provider (section 2.8 error isolation).
    return null;
  }
}

function buildLinks(
  ctx: CxCallContext,
  params: CursorParams,
  deps: ProviderDeps,
): LocationLink[] | null {
  const infos = resolveCxCallToSelectorInfos({
    call: ctx.call,
    classMap: ctx.classMap,
    typeResolver: deps.typeResolver,
    filePath: params.filePath,
    workspaceRoot: deps.workspaceRoot,
  });
  if (infos.length === 0) return null;
  const targetUri = pathToFileUrl(ctx.binding.scssModulePath);
  return infos.map<LocationLink>((info) => toLocationLink(ctx.call.originRange, targetUri, info));
}

function toLocationLink(
  originRange: Range,
  targetUri: string,
  info: SelectorInfo,
): LocationLink {
  return {
    originSelectionRange: toLspRange(originRange),
    targetUri,
    targetRange: toLspRange(info.ruleRange),
    targetSelectionRange: toLspRange(info.range),
  };
}

/**
 * Shallow-copy a shared `Range` into an LSP `Range`.
 *
 * Necessary because shared ranges have `readonly` fields and the
 * LSP type does not — TS variance rules reject the direct assignment
 * even though the shapes match. Single call site, no allocation
 * concerns (one per resolved SelectorInfo).
 */
function toLspRange(r: Range): LspRange {
  return {
    start: { line: r.start.line, character: r.start.character },
    end: { line: r.end.line, character: r.end.character },
  };
}
```

- [ ] **Step 4: Run → pass**

```bash
pnpm format && pnpm check && pnpm test test/unit/providers/definition.test.ts
```

Expected: 5 tests pass, lint clean, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add server/src/providers/definition.ts test/unit/providers/definition.test.ts
git commit -m "$(cat <<'EOF'
feat(providers): handleDefinition — first LSP request handler

handleDefinition dispatches through withCxCallAtCursor (the
single-parse front stage from Plan 05) and maps each resolved
SelectorInfo to an LSP LocationLink:

  - originSelectionRange → the class token in source
  - targetUri            → file:// URL of the .module.scss
  - targetRange          → full rule block (peek preview)
  - targetSelectionRange → class token range (caret placement)

Multi-match (template prefix, union variable) returns every
link; VS Code opens a picker. Empty match returns null so other
providers can still attempt.

Top-level try/catch is a hard requirement from spec section 2.8:
a single handler bug must never crash the server. Unit tests
cover the transform-throws path.

toLspRange is a small shallow-copy helper — the shared Range
type is readonly but LSP Range is not, and TS variance rules
reject direct assignment.
EOF
)"
```

---

## Task 6.2: Composition root — `createServer({reader, writer, overrides})`

**Files:**
- Create: `server/src/composition-root.ts`
- Modify: `server/src/server.ts`

The composition root builds every dependency — caches, resolvers, the analysis hub, the reverse index, the provider deps bag — and wires the LSP handlers onto a connection. It takes `reader` and `writer` streams as arguments so Tier 2 tests can inject `PassThrough` streams, and production passes `process.stdin` / `process.stdout`.

The `createServer` function does NOT call `.listen()` — that's the caller's job. This lets tests inspect the connection state before starting the event loop.

**Overrides for tests** (all optional):
- `typeResolver` — swap `WorkspaceTypeResolver` for `FakeTypeResolver`
- `readStyleFile` — swap `fs.readFileSync` for an in-memory map
- `createProgram` — passed through to `WorkspaceTypeResolver` when no explicit resolver is given

- [ ] **Step 1: Design note (no code yet)**

Read this block twice before implementing:

- `ProviderDeps` is built **inside `onInitialize`**, not at module load. That's because `workspaceRoot` comes from `params.rootUri`. Tests that skip initialize (lifecycle-only) therefore never touch the deps bag.
- The `scssClassMapFor` closure reads a style file from disk, computes its hash, and asks `StyleIndexCache`. In tests, the override bypasses disk entirely.
- The reverse index is `NullReverseIndex` by default. Phase Final swaps this.
- `TextDocuments<TextDocument>` is a singleton per connection — we build it before handlers register.

- [ ] **Step 2: Write composition root**

Create `server/src/composition-root.ts`:

```ts
import { readFileSync } from "node:fs";
import type { MessageReader, MessageWriter } from "vscode-languageserver/node";
import {
  createConnection,
  ProposedFeatures,
  TextDocuments,
  TextDocumentSyncKind,
  type Connection,
  type InitializeParams,
  type InitializeResult,
  type TextDocumentPositionParams,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import ts from "typescript";
import type { CxBinding, ScssClassMap } from "@css-module-explainer/shared";
import { findLangForPath } from "./core/scss/lang-registry.js";
import { parseStyleModule, StyleIndexCache } from "./core/scss/scss-index.js";
import { detectCxBindings } from "./core/cx/binding-detector.js";
import { parseCxCalls } from "./core/cx/call-parser.js";
import { SourceFileCache } from "./core/ts/source-file-cache.js";
import {
  WorkspaceTypeResolver,
  type TypeResolver,
} from "./core/ts/type-resolver.js";
import { DocumentAnalysisCache } from "./core/indexing/document-analysis-cache.js";
import { NullReverseIndex } from "./core/indexing/reverse-index.js";
import { fileUrlToPath } from "./core/util/text-utils.js";
import { handleDefinition } from "./providers/definition.js";
import type {
  CursorParams,
  ProviderDeps,
} from "./providers/provider-utils.js";

const SERVER_NAME = "css-module-explainer";
const SERVER_VERSION = "0.0.1";

export interface CreateServerOptions {
  readonly reader: MessageReader | NodeJS.ReadableStream;
  readonly writer: MessageWriter | NodeJS.WritableStream;
  /** Override the workspace TypeResolver (tests pass a Fake). */
  readonly typeResolver?: TypeResolver;
  /** Override disk read for SCSS files (tests pass an in-memory map). */
  readonly readStyleFile?: (path: string) => string | null;
  /** Override ts.Program creation (test injection for the real resolver). */
  readonly createProgram?: (workspaceRoot: string) => ts.Program;
}

export interface CreatedServer {
  readonly connection: Connection;
  readonly documents: TextDocuments<TextDocument>;
}

/**
 * Build an LSP server instance from a pair of streams plus
 * optional dependency overrides.
 *
 * Does NOT call `connection.listen()` — the caller decides when
 * the event loop starts. Production wiring calls it immediately;
 * the Tier 2 harness calls it after attaching its client side.
 */
export function createServer(options: CreateServerOptions): CreatedServer {
  // `createConnection` accepts raw Node streams or pre-wrapped
  // readers/writers. vscode-languageserver 9.x handles both.
  const connection = createConnection(
    ProposedFeatures.all,
    options.reader as MessageReader,
    options.writer as MessageWriter,
  );
  const documents = new TextDocuments<TextDocument>(TextDocument);

  // Deps are built on initialize — workspaceRoot comes from the client.
  let deps: ProviderDeps | null = null;

  connection.onInitialize((params: InitializeParams): InitializeResult => {
    connection.console.info(`[${SERVER_NAME}] initialize received`);
    const workspaceRoot = resolveWorkspaceRoot(params);
    deps = buildDeps(workspaceRoot, options);
    return {
      capabilities: {
        textDocumentSync: TextDocumentSyncKind.Incremental,
        definitionProvider: true,
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

  connection.onDefinition((p: TextDocumentPositionParams) => {
    if (!deps) return null;
    const cursor = toCursorParams(p, documents);
    if (!cursor) return null;
    return handleDefinition(cursor, deps);
  });

  connection.onShutdown(() => {
    deps = null;
  });

  documents.listen(connection);
  return { connection, documents };
}

function resolveWorkspaceRoot(params: InitializeParams): string {
  const folder = params.workspaceFolders?.[0];
  if (folder) return fileUrlToPath(folder.uri);
  if (params.rootUri) return fileUrlToPath(params.rootUri);
  if (params.rootPath) return params.rootPath;
  return process.cwd();
}

function buildDeps(
  workspaceRoot: string,
  options: CreateServerOptions,
): ProviderDeps {
  const sourceFileCache = new SourceFileCache({ max: 200 });
  const styleIndexCache = new StyleIndexCache({ max: 500 });
  const analysisCache = new DocumentAnalysisCache({
    sourceFileCache,
    detectCxBindings,
    parseCxCalls,
    max: 200,
  });

  const typeResolver: TypeResolver =
    options.typeResolver ??
    new WorkspaceTypeResolver({
      createProgram: options.createProgram ?? createDefaultProgram,
    });

  const readStyleFile = options.readStyleFile ?? defaultReadStyleFile;
  const scssClassMapFor = (binding: CxBinding): ScssClassMap | null => {
    const lang = findLangForPath(binding.scssModulePath);
    if (!lang) return null;
    const content = readStyleFile(binding.scssModulePath);
    if (content === null) return null;
    return styleIndexCache.get(binding.scssModulePath, content);
  };

  return {
    analysisCache,
    scssClassMapFor,
    typeResolver,
    reverseIndex: new NullReverseIndex(),
    workspaceRoot,
  };
}

function defaultReadStyleFile(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function createDefaultProgram(workspaceRoot: string): ts.Program {
  // Minimal program creation for Phase 6: parse tsconfig.json
  // relative to the workspace root, fall back to a default config
  // when missing. Phase 10 will refine this (cached host, watch mode).
  const configPath = ts.findConfigFile(workspaceRoot, ts.sys.fileExists, "tsconfig.json");
  if (!configPath) {
    return ts.createProgram({
      rootNames: [],
      options: { allowJs: true, jsx: ts.JsxEmit.Preserve },
    });
  }
  const parsed = ts.getParsedCommandLineOfConfigFile(
    configPath,
    /*optionsToExtend*/ undefined,
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: () => {},
    },
  );
  if (!parsed) {
    return ts.createProgram({ rootNames: [], options: {} });
  }
  return ts.createProgram({
    rootNames: parsed.fileNames,
    options: parsed.options,
  });
}

function toCursorParams(
  p: TextDocumentPositionParams,
  documents: TextDocuments<TextDocument>,
): CursorParams | null {
  const doc = documents.get(p.textDocument.uri);
  if (!doc) return null;
  return {
    documentUri: p.textDocument.uri,
    content: doc.getText(),
    filePath: fileUrlToPath(p.textDocument.uri),
    line: p.position.line,
    character: p.position.character,
    version: doc.version,
  };
}
```

- [ ] **Step 3: Rewrite `server.ts` as a thin entrypoint**

Replace the entire contents of `server/src/server.ts`:

```ts
import { createServer } from "./composition-root.js";

const { connection } = createServer({
  reader: process.stdin,
  writer: process.stdout,
});

connection.listen();
```

- [ ] **Step 4: Run the pipeline**

```bash
pnpm format && pnpm check && pnpm test && pnpm build
```

Expected: 175 tests pass (170 existing + 5 new from Task 6.1), typecheck clean, build produces `dist/server/server.js` that imports the composition root.

If the bundle contains the composition root's content (it should — rolldown inlines), the extension host will still work.

- [ ] **Step 5: Commit**

```bash
git add server/src/composition-root.ts server/src/server.ts
git commit -m "$(cat <<'EOF'
feat(server): composition root — createServer({reader, writer, overrides})

Extract the deps-wiring + handler-registration responsibility
out of server.ts into a reusable factory. server.ts becomes a
three-line entrypoint that passes process.stdin/stdout.

createServer is the hook the Tier 2 protocol test harness uses
to spin up an in-process LSP server over a pair of PassThrough
streams. Overrides are:

  - typeResolver     — swap WorkspaceTypeResolver for Fake
  - readStyleFile    — swap fs.readFileSync for in-memory
  - createProgram    — test injection for the real resolver

Deps are built inside onInitialize because workspaceRoot comes
from the client's initialize params — tests that only exercise
lifecycle never touch the deps bag.

definitionProvider: true is registered in the initialize result.
onDefinition dispatches through handleDefinition using a local
toCursorParams adapter that reads live document state from the
TextDocuments registry.
EOF
)"
```

---

## Task 6.3: Tier 2 harness — `in-process-server.ts`

**Files:**
- Modify: `package.json` (devDependencies)
- Create: `test/protocol/_harness/in-process-server.ts`

The harness wires two `PassThrough` streams back-to-back — one for server→client traffic, one for client→server traffic — and gives the server side to `createServer` while creating a `ProtocolConnection` on the client side. Each test gets a fresh pair of streams and a fresh server.

- [ ] **Step 1: Add the explicit devDependencies**

pnpm strict mode forbids phantom imports of transitive deps. Add to root `package.json` under `devDependencies`:

```json
"vscode-jsonrpc": "^8.2.0",
"vscode-languageserver-protocol": "^3.17.5",
```

Then install:

```bash
pnpm install
```

- [ ] **Step 2: Write the harness**

Create `test/protocol/_harness/in-process-server.ts`:

```ts
import { PassThrough } from "node:stream";
import {
  createProtocolConnection,
  DefinitionRequest,
  DidOpenTextDocumentNotification,
  DidChangeTextDocumentNotification,
  InitializeRequest,
  InitializedNotification,
  ShutdownRequest,
  ExitNotification,
  type DefinitionParams,
  type DidChangeTextDocumentParams,
  type DidOpenTextDocumentParams,
  type InitializeParams,
  type InitializeResult,
  type LocationLink,
  type Location,
  type ProtocolConnection,
} from "vscode-languageserver-protocol/node";
import { StreamMessageReader, StreamMessageWriter } from "vscode-jsonrpc/node";
import {
  createServer,
  type CreateServerOptions,
} from "../../../server/src/composition-root.js";

export interface InProcessServerOptions
  extends Omit<CreateServerOptions, "reader" | "writer"> {
  readonly workspaceRoot?: string;
}

export interface LspTestClient {
  initialize(overrides?: Partial<InitializeParams>): Promise<InitializeResult>;
  initialized(): void;
  didOpen(params: DidOpenTextDocumentParams): void;
  didChange(params: DidChangeTextDocumentParams): void;
  definition(params: DefinitionParams): Promise<LocationLink[] | Location[] | null>;
  shutdown(): Promise<void>;
  exit(): void;
  dispose(): void;
}

/**
 * Build an in-process LSP server wired to an in-process client.
 *
 * Two PassThrough streams form a full-duplex pair:
 *   serverOut ──► clientIn  (server → client)
 *   clientOut ──► serverIn  (client → server)
 *
 * The server is started immediately. The returned client exposes
 * typed request helpers for the handful of LSP methods Plan 06–09
 * exercise; additional helpers can be added as plans land.
 *
 * `dispose()` ends both streams and disposes the client connection.
 * Tests MUST call it in afterEach to avoid resource leaks.
 */
export function createInProcessServer(
  options: InProcessServerOptions = {},
): LspTestClient {
  const serverToClient = new PassThrough();
  const clientToServer = new PassThrough();

  const { connection: serverConnection } = createServer({
    reader: clientToServer,
    writer: serverToClient,
    ...options,
  });
  serverConnection.listen();

  const client: ProtocolConnection = createProtocolConnection(
    new StreamMessageReader(serverToClient),
    new StreamMessageWriter(clientToServer),
  );
  client.listen();

  return {
    async initialize(overrides) {
      const base: InitializeParams = {
        processId: process.pid,
        rootUri: "file:///fake/workspace",
        capabilities: {},
        workspaceFolders: [{ uri: "file:///fake/workspace", name: "fake" }],
      };
      return client.sendRequest(InitializeRequest.type, { ...base, ...overrides });
    },
    initialized() {
      client.sendNotification(InitializedNotification.type, {});
    },
    didOpen(params) {
      client.sendNotification(DidOpenTextDocumentNotification.type, params);
    },
    didChange(params) {
      client.sendNotification(DidChangeTextDocumentNotification.type, params);
    },
    async definition(params) {
      return client.sendRequest(DefinitionRequest.type, params);
    },
    async shutdown() {
      await client.sendRequest(ShutdownRequest.type, undefined);
    },
    exit() {
      client.sendNotification(ExitNotification.type);
    },
    dispose() {
      client.dispose();
      serverConnection.dispose();
      clientToServer.end();
      serverToClient.end();
    },
  };
}
```

- [ ] **Step 3: Verify the harness compiles**

```bash
pnpm typecheck
```

Expected: clean. No runtime test yet — the harness is exercised by Tasks 6.4 and 6.5.

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml test/protocol/_harness/in-process-server.ts
git commit -m "$(cat <<'EOF'
test(protocol): Tier 2 harness — in-process LSP server over PassThrough

createInProcessServer wires a full-duplex pair of PassThrough
streams to createServer (the Plan 06 composition root) on one
side and a ProtocolConnection client on the other. Each test
spins up a fresh server instance and disposes it in afterEach.

LspTestClient exposes typed helpers for the handful of methods
Plans 06–09 exercise (initialize, didOpen, didChange, definition,
shutdown, exit). Additional helpers will land alongside the
providers that need them.

pnpm strict mode requires explicit deps on the transitive
vscode-languageserver-protocol and vscode-jsonrpc packages;
both are added to root devDependencies.

No tests run against the harness yet — that's Task 6.4 (lifecycle)
and Task 6.5 (definition).
EOF
)"
```

---

## Task 6.4: Lifecycle protocol tests

**Files:**
- Create: `test/protocol/lifecycle.test.ts`

The first Tier 2 file. Exercises initialize → initialized → shutdown → exit without touching any document. Verifies the server advertises `definitionProvider: true`.

- [ ] **Step 1: Write the failing test**

Create `test/protocol/lifecycle.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import { createInProcessServer, type LspTestClient } from "./_harness/in-process-server.js";

describe("lifecycle", () => {
  let client: LspTestClient | null = null;

  afterEach(() => {
    client?.dispose();
    client = null;
  });

  it("returns capabilities including definitionProvider on initialize", async () => {
    client = createInProcessServer();
    const result = await client.initialize();
    expect(result.capabilities.definitionProvider).toBe(true);
    expect(result.serverInfo?.name).toBe("css-module-explainer");
  });

  it("completes the initialize → initialized → shutdown handshake cleanly", async () => {
    client = createInProcessServer();
    await client.initialize();
    client.initialized();
    await client.shutdown();
    client.exit();
    // If nothing threw, we're good. Resource cleanup is in afterEach.
  });

  it("handles definition requests before initialize as null (deps not built yet)", async () => {
    client = createInProcessServer();
    const result = await client.definition({
      textDocument: { uri: "file:///never/opened.tsx" },
      position: { line: 0, character: 0 },
    });
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run → should pass immediately** (the harness + composition root are already in place)

```bash
pnpm test test/protocol/lifecycle.test.ts
```

Expected: 3 tests pass. If a test hangs, the most likely cause is a forgotten `dispose()` — verify afterEach runs.

- [ ] **Step 3: Commit**

```bash
git add test/protocol/lifecycle.test.ts
git commit -m "$(cat <<'EOF'
test(protocol): lifecycle — first Tier 2 tests

Exercises the LSP initialize → initialized → shutdown → exit
handshake through the in-process harness. Verifies that the
server advertises definitionProvider: true in the initialize
response (spec section 4.8) and that definition requests
arriving before deps are built return null instead of crashing.
EOF
)"
```

---

## Task 6.5: Definition protocol tests

**Files:**
- Create: `test/protocol/definition.test.ts`

The payoff. Opens a real TSX document through `didOpen`, calls `definition` at the cursor, and verifies the `LocationLink[]` contains the expected SCSS target. Uses the composition root's `readStyleFile` override to supply in-memory SCSS without touching disk.

- [ ] **Step 1: Write the failing test**

Create `test/protocol/definition.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import type { ResolvedType } from "@css-module-explainer/shared";
import type { TypeResolver } from "../../server/src/core/ts/type-resolver.js";
import { createInProcessServer, type LspTestClient } from "./_harness/in-process-server.js";

const BUTTON_TSX = `import classNames from 'classnames/bind';
import styles from './Button.module.scss';
const cx = classNames.bind(styles);
export function Button() {
  return <div className={cx('indicator')}>hi</div>;
}
`;

const BUTTON_SCSS = `
.indicator {
  color: red;
}

.active {
  color: blue;
}
`;

class FakeTypeResolver implements TypeResolver {
  private readonly values: readonly string[];
  constructor(values: readonly string[] = []) {
    this.values = values;
  }
  resolve(): ResolvedType {
    return this.values.length > 0
      ? { kind: "union", values: this.values }
      : { kind: "unresolvable", values: [] };
  }
  invalidate(): void {}
  clear(): void {}
}

function openButton(client: LspTestClient): void {
  client.didOpen({
    textDocument: {
      uri: "file:///fake/workspace/src/Button.tsx",
      languageId: "typescriptreact",
      version: 1,
      text: BUTTON_TSX,
    },
  });
}

describe("definition protocol", () => {
  let client: LspTestClient | null = null;

  afterEach(() => {
    client?.dispose();
    client = null;
  });

  it("returns a LocationLink for cx('indicator')", async () => {
    client = createInProcessServer({
      readStyleFile: (path) =>
        path.endsWith("Button.module.scss") ? BUTTON_SCSS : null,
      typeResolver: new FakeTypeResolver(),
    });
    await client.initialize();
    client.initialized();
    openButton(client);
    // Cursor is inside the 'indicator' literal on line 4 (0-based).
    //   "  return <div className={cx('indicator')}>hi</div>;"
    //                              ↑ column 30 is inside 'indicator'
    const result = await client.definition({
      textDocument: { uri: "file:///fake/workspace/src/Button.tsx" },
      position: { line: 4, character: 34 },
    });
    expect(result).not.toBeNull();
    expect(Array.isArray(result)).toBe(true);
    const links = result as Array<{ targetUri: string; originSelectionRange: unknown }>;
    expect(links.length).toBeGreaterThanOrEqual(1);
    expect(links[0]!.targetUri).toMatch(/Button\.module\.scss$/);
    expect(links[0]!.originSelectionRange).toBeDefined();
  });

  it("returns null when the cursor is outside any cx call", async () => {
    client = createInProcessServer({
      readStyleFile: () => BUTTON_SCSS,
      typeResolver: new FakeTypeResolver(),
    });
    await client.initialize();
    client.initialized();
    openButton(client);
    // Line 0 = the import statement. No cx call can span it.
    const result = await client.definition({
      textDocument: { uri: "file:///fake/workspace/src/Button.tsx" },
      position: { line: 0, character: 5 },
    });
    expect(result).toBeNull();
  });

  it("returns null for an unknown class name", async () => {
    client = createInProcessServer({
      readStyleFile: () => ".other { color: red; }",
      typeResolver: new FakeTypeResolver(),
    });
    await client.initialize();
    client.initialized();
    openButton(client);
    const result = await client.definition({
      textDocument: { uri: "file:///fake/workspace/src/Button.tsx" },
      position: { line: 4, character: 34 },
    });
    expect(result).toBeNull();
  });

  it("returns null for a file that does not import classnames/bind", async () => {
    client = createInProcessServer({
      readStyleFile: () => BUTTON_SCSS,
      typeResolver: new FakeTypeResolver(),
    });
    await client.initialize();
    client.initialized();
    client.didOpen({
      textDocument: {
        uri: "file:///fake/workspace/src/Plain.tsx",
        languageId: "typescriptreact",
        version: 1,
        text: "const x = 1;\n",
      },
    });
    const result = await client.definition({
      textDocument: { uri: "file:///fake/workspace/src/Plain.tsx" },
      position: { line: 0, character: 5 },
    });
    expect(result).toBeNull();
  });

  it("returns multiple LocationLinks for a union-typed cx(variable) call", async () => {
    const SIZED_TSX = `import classNames from 'classnames/bind';
import styles from './Sized.module.scss';
const cx = classNames.bind(styles);
export function Sized({ size }: { size: 'small' | 'medium' }) {
  return <div className={cx(size)}>hi</div>;
}
`;
    const SIZED_SCSS = `
.small { font-size: 12px; }
.medium { font-size: 16px; }
.large { font-size: 20px; }
`;
    client = createInProcessServer({
      readStyleFile: (path) =>
        path.endsWith("Sized.module.scss") ? SIZED_SCSS : null,
      typeResolver: new FakeTypeResolver(["small", "medium"]),
    });
    await client.initialize();
    client.initialized();
    client.didOpen({
      textDocument: {
        uri: "file:///fake/workspace/src/Sized.tsx",
        languageId: "typescriptreact",
        version: 1,
        text: SIZED_TSX,
      },
    });
    // cursor in `size` inside cx(size) on line 4, column ~28
    const result = await client.definition({
      textDocument: { uri: "file:///fake/workspace/src/Sized.tsx" },
      position: { line: 4, character: 29 },
    });
    expect(result).not.toBeNull();
    const links = result as Array<{ targetUri: string }>;
    expect(links).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run → should mostly pass, tune cursor columns if needed**

```bash
pnpm test test/protocol/definition.test.ts
```

**Expected failures and how to diagnose:**
- If `cx('indicator')` test returns `null`: the cursor column is wrong. Count characters in `"  return <div className={cx('indicator')}>hi</div>;"` — the `i` in `'indicator'` sits at column 32. Adjust to 32.
- If the union test returns only 1 link: the FakeTypeResolver constructor receives an empty array. Verify the test passes `["small", "medium"]`.
- If the harness hangs: a didOpen without initialize. Verify order.

- [ ] **Step 3: Commit once green**

```bash
git add test/protocol/definition.test.ts
git commit -m "$(cat <<'EOF'
test(protocol): definition — Tier 2 end-to-end scenarios

Five protocol tests exercise handleDefinition through the full
LSP pipeline using the Plan 06 in-process harness:

  1. Static class 'indicator' — single LocationLink
  2. Cursor on import line — null
  3. Unknown class name — null
  4. File with no classnames/bind import — null (fast path)
  5. Union variable size: 'small' | 'medium' — 2 LocationLinks
     via FakeTypeResolver injection

The harness's readStyleFile override supplies in-memory SCSS,
avoiding any disk I/O. FakeTypeResolver is a local test double
per spec section 8.3 ("Real ts.Program is opt-in").
EOF
)"
```

---

## Task 6.6: Scope the test scripts

**Files:**
- Modify: `package.json`

`pnpm test` currently runs `vitest run` which picks up both `test/unit/**` and (after this plan) `test/protocol/**`. That's fine. But we want a scoped `test:protocol` script for focused runs and (later) CI job splitting.

- [ ] **Step 1: Update scripts**

Edit `package.json`:

```json
"test": "vitest run",
"test:unit": "vitest run test/unit",
"test:unit:watch": "vitest test/unit",
"test:protocol": "vitest run test/protocol",
"test:protocol:watch": "vitest test/protocol",
```

- [ ] **Step 2: Verify both scoped scripts run cleanly**

```bash
pnpm test:unit
pnpm test:protocol
pnpm test
```

Expected: unit runs pass (~175), protocol runs pass (~8 — 3 lifecycle + 5 definition), full `pnpm test` runs both.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "$(cat <<'EOF'
build(test): add test:protocol script for scoped Tier 2 runs

pnpm test still runs both tiers (default, simplest for CI).
test:unit and test:protocol are scoped shortcuts for focused
iteration, and test:protocol:watch covers the iterative case.
EOF
)"
```

---

## Task 6.7: Pipeline + sanity check

- [ ] **Step 1: Full pipeline**

```bash
pnpm format && pnpm check && pnpm test && pnpm build
```

Expected: lint clean, typecheck clean, ~183 tests pass (170 existing + 5 unit + 3 lifecycle + 5 definition), build succeeds.

- [ ] **Step 2: Spot-check the bundle**

```bash
ls -la dist/server/ && head -20 dist/server/server.js 2>/dev/null || ls dist/server/
```

Expected: `server.js` exists and is a rolldown-bundled CJS (`Object.defineProperty` at top, etc.). No test code bundled.

- [ ] **Step 3: Manual client dry-run (optional, no commit)**

If time permits, launch the VS Code extension host (F5 from `.vscode/launch.json`) and verify Go-to-Definition works on a trivial fixture. If not, Tier 2 coverage is sufficient for Plan 06 acceptance — the full E2E pass lands in Plan 10.5.

---

## 3-Agent Review Cycle

After Task 6.7 is green and committed, run the mandatory 3-agent review cycle per the handoff §5 procedure. The review criterion is `docs/code-philosophy.md`.

**Agent A** — code-philosophy 1차 리뷰. Reads:
- `server/src/composition-root.ts`
- `server/src/server.ts`
- `server/src/providers/definition.ts`
- `test/unit/providers/definition.test.ts`
- `test/protocol/_harness/in-process-server.ts`
- `test/protocol/lifecycle.test.ts`
- `test/protocol/definition.test.ts`

Answer these specific questions with file+line+severity:

1. **Cognitive Flow** — Is `composition-root.ts` reading top-to-bottom without mental backtracking? Count the `const`s and indirection layers.
2. **Abstraction-as-Wall** — Does `handleDefinition` leak LSP types into the provider-utils layer?
3. **Contextual Locality** — Is `toCursorParams` in the right file?
4. **Declarative by Default** — Is `buildDeps` imperative-but-unavoidable, or are there smells?
5. **3-File Rule** — Can someone understand "how does definition work end-to-end" by reading ≤ 3 files?
6. **Narration Test** — Read `handleDefinition` aloud. Does it narrate cleanly, or are there filler expressions?
7. **Grep Friendliness** — Are capability registration strings (`definitionProvider`) greppable in one place?
8. **Test quality** — Are Tier 1 and Tier 2 tests exercising different things, or redundantly testing the same path?
9. **Layer rules** — Does `definition.ts` import only what the End State contract allows?
10. **Error isolation** — Does the try/catch actually buy anything, or is it cargo-culted?

**Agent B** — meta-reviewer. Verify A's factual claims, identify overreach, catch missed issues. Produce a severity-recalibrated verdict (VALID / VALID-WITH-CAVEATS / INVALID).

**Agent C** — third-level meta-evaluator. Verify B's claims especially for new blockers. Produce the final synthesized change list with FAIR / FAIR-WITH-OVERREACH / UNFAIR verdict on Agent B.

**Apply** the final change list: blockers + must-fix always, nice-to-have case-by-case, rejected not touched.

**Commit** as:
```bash
git commit -m "refactor(phase-6): apply 3-agent review findings"
```

---

## Done Checklist

- [ ] `handleDefinition` unit tests pass (Task 6.1)
- [ ] `createServer` composition root built, `server.ts` slimmed (Task 6.2)
- [ ] Tier 2 harness created, devDeps added (Task 6.3)
- [ ] Lifecycle protocol tests pass (Task 6.4)
- [ ] Definition protocol tests pass (Task 6.5)
- [ ] Test scripts scoped (Task 6.6)
- [ ] `pnpm check && pnpm test && pnpm build` green (Task 6.7)
- [ ] 3-agent review cycle complete, findings applied
- [ ] Handoff doc §2 updated to mark Phase 6 ✅ and §7 to point at Plan 07

---

**Expected test count after Plan 06:** 170 (Plan 05 end) + 13 new = **183 tests passing** across unit + protocol tiers. Protocol tests run in a second Tier 2 file directory; `pnpm test:protocol` is the scoped shortcut.
