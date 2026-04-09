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
 * the server (spec section 2.8 — error isolation).
 */
export function handleDefinition(params: CursorParams, deps: ProviderDeps): LocationLink[] | null {
  try {
    return withCxCallAtCursor(params, deps, (ctx) => buildLinks(ctx, params, deps));
  } catch {
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

function toLocationLink(originRange: Range, targetUri: string, info: SelectorInfo): LocationLink {
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
 * Necessary because shared ranges carry `readonly` markers and
 * the LSP type does not — TS variance rejects the direct
 * assignment even though the shapes match. One call per
 * resolved SelectorInfo, so the allocation is negligible.
 */
function toLspRange(r: Range): LspRange {
  return {
    start: { line: r.start.line, character: r.start.character },
    end: { line: r.end.line, character: r.end.character },
  };
}
