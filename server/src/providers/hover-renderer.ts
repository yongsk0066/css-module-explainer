import { relative } from "node:path";
import type { ClassExpressionHIR } from "../core/hir/source-types";
import type { SelectorDeclHIR } from "../core/hir/style-types";

export interface RenderArgs {
  readonly expression: ClassExpressionHIR;
  readonly scssModulePath: string;
  readonly selectors: readonly SelectorDeclHIR[];
  readonly workspaceRoot: string;
  readonly maxCandidates?: number;
}

/**
 * Build a markdown hover card for a cx() call and its resolved
 * selector list.
 *
 * - 0 infos → null (caller turns into a null Hover result)
 * - 1 info → single-match card
 * - >1 infos → multi-match card, capped at MAX_CANDIDATES
 *
 * No LSP types leak in or out — this function is a pure string
 * builder, making it trivial to unit-test with fixtures.
 */
export function renderHover(args: RenderArgs): string | null {
  if (args.selectors.length === 0) return null;
  if (args.selectors.length === 1) return renderSingle(args, args.selectors[0]!);
  return renderMulti(args);
}

function renderSingle(args: RenderArgs, selector: SelectorDeclHIR): string {
  const location = formatLocation(
    args.scssModulePath,
    selector.range.start.line,
    args.workspaceRoot,
  );
  const body = buildRule(selector);
  return `**\`.${selector.name}\`** — _${location}_\n\n\`\`\`scss\n${body}\n\`\`\``;
}

function renderMulti(args: RenderArgs): string {
  const max = args.maxCandidates ?? 10;
  const header = buildMultiHeader(args);
  const shown = args.selectors.slice(0, max);
  const sections = shown.map((selector) => {
    const location = formatLocation(
      args.scssModulePath,
      selector.range.start.line,
      args.workspaceRoot,
    );
    return `**\`.${selector.name}\`** — _${location}_\n\n\`\`\`scss\n${buildRule(selector)}\n\`\`\``;
  });
  const tail = args.selectors.length > max ? `\n\n_…and ${args.selectors.length - max} more_` : "";
  return `${header}\n\n${sections.join("\n\n---\n\n")}${tail}`;
}

function buildMultiHeader(args: RenderArgs): string {
  const expression = args.expression;
  switch (expression.kind) {
    case "symbolRef":
      return `**${args.selectors.length} matches** for \`cx(${expression.rawReference})\``;
    case "template":
      return `**${args.selectors.length} matches** for \`cx(\\\`${expression.staticPrefix}\${...}\\\`)\``;
    case "literal":
      return `**${args.selectors.length} matches** for \`cx(...)\``;
    case "styleAccess":
      return `**${args.selectors.length} matches** for \`styles.${expression.accessPath.join(".")}\``;
    default:
      expression satisfies never;
      return "";
  }
}

function buildRule(selector: SelectorDeclHIR): string {
  const lines: string[] = [];
  // Show composes references as comments at the top.
  if (selector.composes.length > 0) {
    for (const ref of selector.composes) {
      const names = ref.classNames.join(" ");
      const source = ref.fromGlobal ? "global" : ref.from ? `'${ref.from}'` : "this file";
      lines.push(`  /* composes: ${names} from ${source} */`);
    }
  }
  const decls = selector.declarations.trim();
  if (decls.length === 0 && lines.length === 0) return `.${selector.name} {}`;
  const formatted = decls
    .split(/;\s*/)
    .filter((d) => d.length > 0)
    .map((d) => `  ${d.trim()};`);
  return `.${selector.name} {\n${[...lines, ...formatted].join("\n")}\n}`;
}

function formatLocation(scssPath: string, line: number, workspaceRoot: string): string {
  const rel = relative(workspaceRoot, scssPath) || scssPath;
  return `${rel}:${line + 1}`;
}
