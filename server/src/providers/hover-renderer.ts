import { relative } from "node:path";
import type { ClassExpressionHIR } from "../core/hir/source-types";
import type { SelectorDeclHIR } from "../core/hir/style-types";
import type {
  DynamicHoverExplanation,
  SelectorStyleDependencySummary,
  SelectorUsageSummary,
} from "../core/query";

export interface RenderArgs {
  readonly expression: ClassExpressionHIR;
  readonly scssModulePath: string;
  readonly selectors: readonly SelectorDeclHIR[];
  readonly dynamicExplanation?: DynamicHoverExplanation | null;
  readonly styleDependenciesBySelector?: ReadonlyMap<string, SelectorStyleDependencySummary>;
  readonly workspaceRoot: string;
  readonly maxCandidates?: number;
}

export interface RenderSelectorHoverArgs {
  readonly selector: SelectorDeclHIR;
  readonly scssModulePath: string;
  readonly usageSummary: SelectorUsageSummary;
  readonly styleDependencies?: SelectorStyleDependencySummary;
  readonly workspaceRoot: string;
  readonly headingName?: string;
  readonly note?: string;
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

export function renderSelectorHover(args: RenderSelectorHoverArgs): string {
  const location = formatLocation(
    args.scssModulePath,
    args.selector.range.start.line,
    args.workspaceRoot,
  );
  const usageNote = renderSelectorUsageNote(args.usageSummary);
  const incomingNote = renderStyleDependencyNote(args.styleDependencies, args.workspaceRoot);
  const outgoingNote = renderOutgoingStyleDependencyNote(
    args.styleDependencies,
    args.workspaceRoot,
  );
  const headingName = args.headingName ?? args.selector.name;
  const note = args.note ? `\n\n_${args.note}_` : "";
  return `**\`.${headingName}\`** — _${location}_${note}${usageNote}\n\n\`\`\`scss\n${buildRule(args.selector)}\n\`\`\`${incomingNote}${outgoingNote}`;
}

function renderSingle(args: RenderArgs, selector: SelectorDeclHIR): string {
  const location = formatLocation(
    args.scssModulePath,
    selector.range.start.line,
    args.workspaceRoot,
  );
  const body = buildRule(selector);
  const explanation = renderDynamicExplanation(args.dynamicExplanation, args.maxCandidates);
  const dependencyNote = renderStyleDependencyNote(
    args.styleDependenciesBySelector?.get(selector.canonicalName),
    args.workspaceRoot,
  );
  return `**\`.${selector.name}\`** — _${location}_${explanation}\n\n\`\`\`scss\n${body}\n\`\`\`${dependencyNote}`;
}

function renderMulti(args: RenderArgs): string {
  const max = args.maxCandidates ?? 10;
  const header = buildMultiHeader(args);
  const explanation = renderDynamicExplanation(args.dynamicExplanation, max);
  const shown = args.selectors.slice(0, max);
  const sections = shown.map((selector) => {
    const location = formatLocation(
      args.scssModulePath,
      selector.range.start.line,
      args.workspaceRoot,
    );
    const dependencyNote = renderStyleDependencyNote(
      args.styleDependenciesBySelector?.get(selector.canonicalName),
      args.workspaceRoot,
    );
    return `**\`.${selector.name}\`** — _${location}_\n\n\`\`\`scss\n${buildRule(selector)}\n\`\`\`${dependencyNote}`;
  });
  const tail = args.selectors.length > max ? `\n\n_…and ${args.selectors.length - max} more_` : "";
  return `${header}${explanation}\n\n${sections.join("\n\n---\n\n")}${tail}`;
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

function renderDynamicExplanation(
  explanation: DynamicHoverExplanation | null | undefined,
  maxCandidates = 10,
): string {
  if (!explanation) return "";

  const lines: string[] = [];
  if (explanation.kind === "symbolRef") {
    if (explanation.reasonLabel) {
      lines.push(`_Resolved from \`${explanation.subject}\` via ${explanation.reasonLabel}._`);
    } else {
      lines.push(`_Resolved from \`${explanation.subject}\`._`);
    }
    if (explanation.valueCertainty) {
      lines.push(`_Value certainty: ${explanation.valueCertainty}._`);
    }
    if (explanation.selectorCertainty) {
      lines.push(`_Selector certainty: ${explanation.selectorCertainty}._`);
    }
    if (explanation.valueDomainLabel) {
      lines.push(`_Value domain: ${explanation.valueDomainLabel}._`);
    }
  } else {
    lines.push(`_Resolved by template prefix \`${explanation.subject}\`._`);
    if (explanation.selectorCertainty) {
      lines.push(`_Selector certainty: ${explanation.selectorCertainty}._`);
    }
    if (explanation.valueDomainLabel) {
      lines.push(`_Value domain: ${explanation.valueDomainLabel}._`);
    }
  }

  const shown = explanation.candidates
    .slice(0, maxCandidates)
    .map((candidate) => `\`${candidate}\``);
  if (shown.length > 0) {
    const suffix =
      explanation.candidates.length > maxCandidates
        ? `, …and ${explanation.candidates.length - maxCandidates} more`
        : "";
    lines.push(`_Candidates: ${shown.join(", ")}${suffix}._`);
  }

  return `\n\n${lines.join("\n\n")}`;
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

function renderStyleDependencyNote(
  summary: SelectorStyleDependencySummary | undefined,
  workspaceRoot: string,
): string {
  if (!summary || summary.incoming.length === 0) return "";

  const shown = summary.incoming
    .slice(0, 5)
    .map(
      (incoming) =>
        `\`${incoming.canonicalName}\` in \`${relative(workspaceRoot, incoming.filePath) || incoming.filePath}\``,
    );
  const suffix = summary.incoming.length > 5 ? `, …and ${summary.incoming.length - 5} more` : "";
  return `\n\n_Composed by: ${shown.join(", ")}${suffix}._`;
}

function renderOutgoingStyleDependencyNote(
  summary: SelectorStyleDependencySummary | undefined,
  workspaceRoot: string,
): string {
  if (!summary || summary.outgoing.length === 0) return "";

  const shown = summary.outgoing
    .slice(0, 5)
    .map(
      (outgoing) =>
        `\`${outgoing.canonicalName}\` in \`${relative(workspaceRoot, outgoing.filePath) || outgoing.filePath}\``,
    );
  const suffix = summary.outgoing.length > 5 ? `, …and ${summary.outgoing.length - 5} more` : "";
  return `\n\n_Composes: ${shown.join(", ")}${suffix}._`;
}

function renderSelectorUsageNote(summary: SelectorUsageSummary): string {
  const parts = [`_References: ${summary.totalReferences} total`];
  if (summary.totalReferences !== summary.directReferenceCount) {
    parts.push(`${summary.directReferenceCount} direct`);
  }
  parts[0] = `${parts[0]}${parts.length > 1 ? ` (${parts.slice(1).join(", ")})` : ""}._`;
  if (summary.hasExpandedReferences && !summary.hasStyleDependencyReferences) {
    parts.push("_Expanded or dynamic references present._");
  } else if (summary.hasExpandedReferences && summary.hasStyleDependencyReferences) {
    parts.push("_Expanded/dynamic and composed-style references present._");
  } else if (summary.hasStyleDependencyReferences) {
    parts.push("_Composed-style references present._");
  }
  return `\n\n${parts.join("\n\n")}`;
}
