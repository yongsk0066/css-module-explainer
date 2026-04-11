import { relative } from "node:path";
import type { ClassRef, SelectorInfo } from "@css-module-explainer/shared";

export interface RenderArgs {
  readonly ref: ClassRef;
  readonly scssModulePath: string;
  readonly infos: readonly SelectorInfo[];
  readonly workspaceRoot: string;
  readonly maxCandidates?: number;
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
  const location = formatLocation(args.scssModulePath, info.range.start.line, args.workspaceRoot);
  const body = buildRule(info);
  return `**\`.${info.name}\`** — _${location}_\n\n\`\`\`scss\n${body}\n\`\`\``;
}

function renderMulti(args: RenderArgs): string {
  const max = args.maxCandidates ?? 10;
  const header = buildMultiHeader(args);
  const shown = args.infos.slice(0, max);
  const sections = shown.map((info) => {
    const location = formatLocation(args.scssModulePath, info.range.start.line, args.workspaceRoot);
    return `**\`.${info.name}\`** — _${location}_\n\n\`\`\`scss\n${buildRule(info)}\n\`\`\``;
  });
  const tail = args.infos.length > max ? `\n\n_…and ${args.infos.length - max} more_` : "";
  return `${header}\n\n${sections.join("\n\n---\n\n")}${tail}`;
}

function buildMultiHeader(args: RenderArgs): string {
  const ref = args.ref;
  switch (ref.kind) {
    case "variable":
      return `**${args.infos.length} matches** for \`cx(${ref.variableName})\``;
    case "template":
      return `**${args.infos.length} matches** for \`cx(\\\`${ref.staticPrefix}\${...}\\\`)\``;
    case "static":
      return `**${args.infos.length} matches** for \`cx(...)\``;
    default: {
      const _exhaustive: never = ref;
      return _exhaustive;
    }
  }
}

function buildRule(info: SelectorInfo): string {
  const lines: string[] = [];
  // Show composes references as comments at the top.
  if (info.composes && info.composes.length > 0) {
    for (const ref of info.composes) {
      const names = ref.classNames.join(" ");
      const source = ref.fromGlobal ? "global" : ref.from ? `'${ref.from}'` : "this file";
      lines.push(`  /* composes: ${names} from ${source} */`);
    }
  }
  const decls = info.declarations.trim();
  if (decls.length === 0 && lines.length === 0) return `.${info.name} {}`;
  const formatted = decls
    .split(/;\s*/)
    .filter((d) => d.length > 0)
    .map((d) => `  ${d.trim()};`);
  return `.${info.name} {\n${[...lines, ...formatted].join("\n")}\n}`;
}

function formatLocation(scssPath: string, line: number, workspaceRoot: string): string {
  const rel = relative(workspaceRoot, scssPath) || scssPath;
  return `${rel}:${line + 1}`;
}
