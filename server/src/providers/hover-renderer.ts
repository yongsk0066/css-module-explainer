import { relative } from "node:path";
import type { CxBinding, CxCallInfo, SelectorInfo } from "@css-module-explainer/shared";

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
 * - 1 info → single-match card
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
  const location = formatLocation(
    args.binding.scssModulePath,
    info.range.start.line,
    args.workspaceRoot,
  );
  const body = buildRule(info);
  return `**\`.${info.name}\`** — _${location}_\n\n\`\`\`scss\n${body}\n\`\`\``;
}

function renderMulti(args: RenderArgs): string {
  const header = buildMultiHeader(args);
  const shown = args.infos.slice(0, MAX_CANDIDATES);
  const sections = shown.map((info) => {
    const location = formatLocation(
      args.binding.scssModulePath,
      info.range.start.line,
      args.workspaceRoot,
    );
    return `**\`.${info.name}\`** — _${location}_\n\n\`\`\`scss\n${buildRule(info)}\n\`\`\``;
  });
  const tail =
    args.infos.length > MAX_CANDIDATES
      ? `\n\n_…and ${args.infos.length - MAX_CANDIDATES} more_`
      : "";
  return `${header}\n\n${sections.join("\n\n---\n\n")}${tail}`;
}

function buildMultiHeader(args: RenderArgs): string {
  const kind = args.call.kind;
  if (kind === "variable") {
    return `**${args.infos.length} matches** for \`cx(${args.call.variableName})\``;
  }
  if (kind === "template") {
    return `**${args.infos.length} matches** for \`cx(\\\`${args.call.staticPrefix}\${...}\\\`)\``;
  }
  return `**${args.infos.length} matches** for \`cx(...)\``;
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
