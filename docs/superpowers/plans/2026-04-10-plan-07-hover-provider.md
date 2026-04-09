# Plan 07 — Hover Provider (Phase 7)

**Goal:** `textDocument/hover` returns markdown with `.className`, source location, and the SCSS rule declarations. Single-match and multi-match layouts per spec §4.3.

**Architecture:** `providers/hover.ts` dispatches through `withCxCallAtCursor`; `providers/hover-renderer.ts` is a pure markdown builder (no LSP types, easy to Tier-1 test). The composition root wires `hoverProvider: true` and `onHover`. This plan also does the deferred cleanup from Plan 06 review: extract `toLspRange` into `providers/lsp-adapters.ts` (now with a second caller).

## End State
- `server/src/providers/hover.ts` — `handleHover(params, deps): Hover | null`
- `server/src/providers/hover-renderer.ts` — `renderHover(call, infos, binding, workspaceRoot): string`
- `server/src/providers/lsp-adapters.ts` — shared `toLspRange` (extracted from definition.ts)
- `server/src/composition-root.ts` — wire `onHover`, register `hoverProvider: true`
- Tier 1 unit tests for `hover-renderer` (pure markdown strings) and `handleHover` (mock deps)
- Tier 2 `test/protocol/hover.test.ts` (static, template, unresolvable)

## Tasks

### 7.1 lsp-adapters extraction (deferred from Plan 06)

Create `server/src/providers/lsp-adapters.ts`:
```ts
import type { Range as LspRange } from "vscode-languageserver/node";
import type { Range } from "@css-module-explainer/shared";

/**
 * Shallow-copy a shared `Range` into an LSP `Range`.
 *
 * Shared ranges carry `readonly` markers; LSP ranges do not. TS
 * variance rejects direct assignment even though the shapes match.
 * Single source of truth for every provider that returns LSP
 * Range-bearing types (LocationLink, Hover, Diagnostic).
 */
export function toLspRange(r: Range): LspRange {
  return {
    start: { line: r.start.line, character: r.start.character },
    end: { line: r.end.line, character: r.end.character },
  };
}
```

Update `definition.ts` to import from `./lsp-adapters.js` instead of defining `toLspRange` locally. Delete the local copy.

### 7.2 hover-renderer (pure markdown)

Create `server/src/providers/hover-renderer.ts`:
```ts
import type { CxBinding, CxCallInfo, SelectorInfo } from "@css-module-explainer/shared";
import { relative } from "node:path";

const MAX_CANDIDATES = 10;

export interface RenderArgs {
  readonly call: CxCallInfo;
  readonly binding: CxBinding;
  readonly infos: readonly SelectorInfo[];
  readonly workspaceRoot: string;
}

/**
 * Build a markdown hover card for a cx() call and its resolved
 * SelectorInfo list.
 *
 * - 0 infos → null (caller turns into a null Hover result)
 * - 1 info → single-match card (spec §4.3)
 * - >1 infos → multi-match card, capped at MAX_CANDIDATES
 *
 * No LSP types leak in or out — this function is a pure string
 * builder, making it trivial to unit-test with fixtures.
 */
export function renderHover(args: RenderArgs): string | null {
  if (args.infos.length === 0) return null;
  if (args.infos.length === 1) return renderSingle(args, args.infos[0]!);
  return renderMulti(args);
}

function renderSingle(args: RenderArgs, info: SelectorInfo): string {
  const location = formatLocation(args.binding.scssModulePath, info.range.start.line, args.workspaceRoot);
  const body = buildRule(info);
  return `**\`.${info.name}\`** — _${location}_\n\n\`\`\`scss\n${body}\n\`\`\``;
}

function renderMulti(args: RenderArgs): string {
  const header = buildMultiHeader(args);
  const shown = args.infos.slice(0, MAX_CANDIDATES);
  const sections = shown.map((info) => {
    const location = formatLocation(args.binding.scssModulePath, info.range.start.line, args.workspaceRoot);
    return `**\`.${info.name}\`** — _${location}_\n\n\`\`\`scss\n${buildRule(info)}\n\`\`\``;
  });
  const tail = args.infos.length > MAX_CANDIDATES
    ? `\n\n_…and ${args.infos.length - MAX_CANDIDATES} more_`
    : "";
  return `${header}\n\n${sections.join("\n\n---\n\n")}${tail}`;
}

function buildMultiHeader(args: RenderArgs): string {
  const kind = args.call.kind;
  const summary =
    kind === "variable"
      ? `\`cx(${args.call.variableName})\``
      : kind === "template"
        ? `\`cx(\\\`${args.call.staticPrefix}\${...}\\\`)\``
        : `\`cx(...)\``;
  return `**${args.infos.length} matches** for ${summary}`;
}

function buildRule(info: SelectorInfo): string {
  const decls = info.declarations.trim();
  if (decls.length === 0) return `.${info.name} {}`;
  const formatted = decls
    .split(/;\s*/)
    .filter((d) => d.length > 0)
    .map((d) => `  ${d.trim()};`)
    .join("\n");
  return `.${info.name} {\n${formatted}\n}`;
}

function formatLocation(scssPath: string, line: number, workspaceRoot: string): string {
  const rel = relative(workspaceRoot, scssPath) || scssPath;
  return `${rel}:${line + 1}`;
}
```

Tier 1 unit test `test/unit/providers/hover-renderer.test.ts` with ≥4 cases: single static, multi template, multi variable, empty declarations edge case, >MAX_CANDIDATES tail.

### 7.3 handleHover

Create `server/src/providers/hover.ts`:
```ts
import type { Hover } from "vscode-languageserver/node";
import { resolveCxCallToSelectorInfos } from "../core/cx/call-resolver.js";
import { withCxCallAtCursor, type CursorParams, type CxCallContext, type ProviderDeps } from "./provider-utils.js";
import { renderHover } from "./hover-renderer.js";
import { toLspRange } from "./lsp-adapters.js";

export function handleHover(params: CursorParams, deps: ProviderDeps): Hover | null {
  try {
    return withCxCallAtCursor(params, deps, (ctx) => buildHover(ctx, params, deps));
  } catch (err) {
    deps.logError?.("hover handler failed", err);
    return null;
  }
}

function buildHover(ctx: CxCallContext, params: CursorParams, deps: ProviderDeps): Hover | null {
  const infos = resolveCxCallToSelectorInfos({
    call: ctx.call,
    classMap: ctx.classMap,
    typeResolver: deps.typeResolver,
    filePath: params.filePath,
    workspaceRoot: deps.workspaceRoot,
  });
  const markdown = renderHover({
    call: ctx.call,
    binding: ctx.binding,
    infos,
    workspaceRoot: deps.workspaceRoot,
  });
  if (!markdown) return null;
  return {
    range: toLspRange(ctx.call.originRange),
    contents: { kind: "markdown", value: markdown },
  };
}
```

Tier 1 unit test `test/unit/providers/hover.test.ts` with ≥3 cases: static match, no-match → null, exception → logged + null.

### 7.4 Composition-root wiring

Register `hoverProvider: true`, wire `connection.onHover` to call `handleHover`.

### 7.5 Tier 2 hover protocol test

`test/protocol/hover.test.ts` — ≥3 cases: static, unresolvable, variable union.

Update harness `LspTestClient` to expose `hover(params)` using `HoverRequest.type` from vscode-languageserver-protocol.

### 7.6 Pipeline + commit
`pnpm format && pnpm check && pnpm test && pnpm build`. Expect ≥ 195 tests.
