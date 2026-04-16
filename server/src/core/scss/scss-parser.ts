import type {
  BemSuffixInfo,
  ComposesClassToken,
  ComposesRef,
  Range,
} from "@css-module-explainer/shared";
import { parse as postcssParse, type AtRule, type ChildNode, type Root, type Rule } from "postcss";
import {
  makeStyleDocumentHIR,
  type AnimationNameRefHIR,
  type KeyframesDeclHIR,
  type NestedSelectorSafety,
  type SelectorDeclHIR,
  type StyleDocumentHIR,
  type ValueDeclHIR,
  type ValueRefHIR,
} from "../hir/style-types";
import { classifyBemSuffixSite } from "./bem-suffix";
import { findLangForPath, getRuntimeSyntax } from "./lang-registry";
import {
  atRootTokenRange,
  enumerateGroups,
  extractClassNames,
  extractIntroducedClassNames,
  findClassTokenRange,
  rangeForSourceNode,
  resolveSelector,
} from "./scss-selector-utils";

/**
 * Context threaded through the recursive SCSS walk. Carries the
 * resolved parent selector plus a narrower view for `&`-nested
 * rename support: `className` is set iff the parent rule is a
 * bare single `.classname`, and `isGrouped` tracks whether the
 * parent rule had `selectors.length > 1`.
 *
 * `className` flows into `bemSuffix.parentResolvedName` for
 * BEM-safe nested entries; the rename provider reads it to
 * drive suffix-math edits.
 */
export interface ParentContext {
  readonly selector: string;
  readonly className?: string;
  readonly isGrouped?: boolean;
}

/**
 * Build the child recursion context from a parent rule's resolved
 * selectors and one specific child branch.
 *
 * Sets `className` only when the **current branch** is a bare
 * single class (`.foo`) AND the parent rule was not grouped —
 * otherwise `className` is undefined so rename-safe-nested
 * entries reject downstream.
 *
 * Exported for unit testing of the context derivation logic.
 */
export function buildChildContext(
  resolvedSelectors: readonly string[],
  nextResolved: string,
): ParentContext {
  const classesInParent = extractClassNames(nextResolved);
  const isBareSingleClass =
    resolvedSelectors.length === 1 &&
    classesInParent.length === 1 &&
    nextResolved === "." + classesInParent[0];
  const ctx: ParentContext = {
    selector: nextResolved,
    ...(isBareSingleClass ? { className: classesInParent[0] } : {}),
    ...(resolvedSelectors.length > 1 ? { isGrouped: true } : {}),
  };
  return ctx;
}

/**
 * Parse a CSS Module file into style-document HIR.
 *
 * Parsing is best-effort: a parse error produces an empty document, never
 * throws. The caller (StyleIndexCache) treats an empty document as a
 * legitimate "no classes found" result, so upstream providers keep
 * running even when one file is broken.
 */
export function parseStyleDocument(content: string, filePath: string): StyleDocumentHIR {
  const selectorsByName = new Map<string, SelectorDeclHIR>();
  const keyframesByName = new Map<string, KeyframesDeclHIR>();
  const animationNameRefs: AnimationNameRefHIR[] = [];

  const lang = findLangForPath(filePath);
  // shared.StyleLang.syntax is typed as `unknown` so the shared
  // module stays runtime-free. The narrowing cast lives in
  // `getRuntimeSyntax` (the single documented `as` cast).
  const syntax = lang ? getRuntimeSyntax(lang) : null;

  // postcss's top-level `parse` is hardcoded to the CSS grammar
  // and silently ignores `opts.syntax`. Delegate to the Syntax
  // object's own `.parse` when one is provided (SCSS, LESS, …)
  // so non-CSS features — `//` line comments, `#{...}`
  // interpolation, SASS directives — actually reach the right
  // grammar. Plain CSS falls back to the top-level postcss parser
  // because `lang-registry` records `syntax: null` for it.
  const parse = typeof syntax?.parse === "function" ? syntax.parse.bind(syntax) : postcssParse;
  let root: Root;
  try {
    root = parse(content, { from: filePath }) as Root;
  } catch {
    return makeStyleDocumentHIR(filePath, []);
  }

  const valueDecls = collectValueDecls(root);
  const valueRefs = collectValueRefs(root, valueDecls);

  walkStyleNodes(
    root.nodes as ChildNode[],
    { selector: "" },
    selectorsByName,
    keyframesByName,
    animationNameRefs,
  );
  return makeStyleDocumentHIR(
    filePath,
    Array.from(selectorsByName.values()).toSorted(compareSelectors),
    Array.from(keyframesByName.values()).toSorted(compareNamedStyleFacts),
    [...animationNameRefs].toSorted(compareNamedStyleFacts),
    [...valueDecls].toSorted(compareNamedStyleFacts),
    [...valueRefs].toSorted(compareNamedStyleFacts),
  );
}

/**
 * Recurse through postcss nodes, recording classes that CSS Modules
 * exposes on the `styles` object. Transparent at-rules (@media,
 * @supports, @at-root) are unwrapped; @keyframes/@font-face are skipped.
 */
function walkStyleNodes(
  nodes: ChildNode[] | undefined,
  parentCtx: ParentContext,
  selectorsByName: Map<string, SelectorDeclHIR>,
  keyframesByName: Map<string, KeyframesDeclHIR>,
  animationNameRefs: AnimationNameRefHIR[],
): void {
  if (!nodes) return;
  for (const node of nodes) {
    if (node.type === "rule") {
      if (isGlobalBlockRule(node.selector)) continue;
      if (isLocalBlockRule(node.selector)) {
        walkStyleNodes(node.nodes, parentCtx, selectorsByName, keyframesByName, animationNameRefs);
        continue;
      }
      recordRule(node, parentCtx, selectorsByName, keyframesByName, animationNameRefs);
    } else if (node.type === "atrule" && isKeyframesAtRule(node.name)) {
      recordKeyframesAtRule(node, keyframesByName);
    } else if (node.type === "atrule" && isTransparentAtRule(node.name)) {
      if (node.name === "at-root" && isInlineAtRoot(node)) {
        recordAtRootInlineRule(node, selectorsByName);
      } else if (node.name === "at-root") {
        walkStyleNodes(
          node.nodes,
          { selector: "" },
          selectorsByName,
          keyframesByName,
          animationNameRefs,
        );
      } else {
        walkStyleNodes(node.nodes, parentCtx, selectorsByName, keyframesByName, animationNameRefs);
      }
    }
  }
}

function isTransparentAtRule(name: string): boolean {
  return name === "media" || name === "at-root" || name === "supports" || name === "layer";
}

function isKeyframesAtRule(name: string): boolean {
  return name === "keyframes" || name === "-webkit-keyframes";
}

function isGlobalBlockRule(selector: string): boolean {
  return /^:global\s*$/.test(selector.trim());
}

function isLocalBlockRule(selector: string): boolean {
  return /^:local\s*$/.test(selector.trim());
}

function isInlineAtRoot(atrule: AtRule): boolean {
  return atrule.params.trim().length > 0;
}

function recordRule(
  rule: Rule,
  parentCtx: ParentContext,
  selectorsByName: Map<string, SelectorDeclHIR>,
  keyframesByName: Map<string, KeyframesDeclHIR>,
  animationNameRefs: AnimationNameRefHIR[],
): void {
  const { declarations, composes, animationRefs } = collectDeclarationsAndComposes(rule.nodes);
  const ruleRange = rangeForSourceNode(rule);
  animationNameRefs.push(...animationRefs);

  const selectorSource = rule.raws.selector?.raw ?? rule.selector;
  const groups = enumerateGroups(selectorSource);
  const resolvedSelectors: string[] = [];

  for (const { raw, offset } of groups) {
    const resolved = resolveSelector(raw, parentCtx.selector);
    resolvedSelectors.push(resolved);
    const bemSuffix = classifyBemSuffixSite(rule, raw, offset, parentCtx, groups.length);
    const isNested = raw.includes("&");

    for (const className of extractIntroducedClassNames(raw, resolved)) {
      const existing = selectorsByName.get(className);
      if (existing && existing.nestedSafety === "flat" && isNested) continue;

      selectorsByName.set(
        className,
        buildSelectorDecl({
          className,
          resolved,
          raw,
          rule,
          declarations,
          composes,
          ruleRange,
          isNested,
          bemSuffix,
        }),
      );
    }
  }

  const parents = resolvedSelectors.length > 0 ? resolvedSelectors : [parentCtx.selector];
  for (const nextResolved of parents) {
    walkStyleNodes(
      rule.nodes,
      buildChildContext(resolvedSelectors, nextResolved),
      selectorsByName,
      keyframesByName,
      animationNameRefs,
    );
  }
}

interface BuildEntryArgs {
  readonly className: string;
  readonly resolved: string;
  readonly raw: string;
  readonly rule: Rule;
  readonly declarations: string;
  readonly composes: readonly ComposesRef[];
  readonly ruleRange: Range;
  readonly isNested: boolean;
  readonly bemSuffix: BemSuffixInfo | null;
}

function buildSelectorDecl(args: BuildEntryArgs): SelectorDeclHIR {
  const tokenRange = findClassTokenRange(args.rule.source?.start, args.className, args.raw);
  return {
    kind: "selector",
    id: `selector:${args.className}:${tokenRange.start.line}:${tokenRange.start.character}`,
    name: args.className,
    canonicalName: args.className,
    viewKind: "canonical",
    range: tokenRange,
    fullSelector: args.resolved,
    declarations: args.declarations,
    ruleRange: args.ruleRange,
    composes: args.composes,
    nestedSafety: classifyNestedSafety(args.isNested, args.bemSuffix),
    ...(args.bemSuffix ? { bemSuffix: args.bemSuffix } : {}),
  };
}

function collectDeclarationsAndComposes(nodes: ChildNode[] | undefined): {
  declarations: string;
  composes: ComposesRef[];
  animationRefs: AnimationNameRefHIR[];
} {
  if (!nodes) return { declarations: "", composes: [], animationRefs: [] };

  const composes: ComposesRef[] = [];
  const declParts: string[] = [];
  const animationRefs: AnimationNameRefHIR[] = [];

  for (const node of nodes) {
    if (node.type !== "decl") continue;
    if (node.prop === "composes") {
      const ref = parseComposesValue(node);
      if (ref) composes.push(ref);
    } else {
      declParts.push(`${node.prop}: ${node.value}`);
      animationRefs.push(...findAnimationNameTokens(node));
    }
  }

  return { declarations: declParts.join("; "), composes, animationRefs };
}

const COMPOSES_FROM_RE = /^(.+?)\s+from\s+(?:'([^']+)'|"([^"]+)"|(global))\s*$/;

function parseComposesValue(node: Extract<ChildNode, { type: "decl" }>): ComposesRef | null {
  const value = node.value;
  const trimmed = value.trim();
  const match = COMPOSES_FROM_RE.exec(trimmed);
  if (match) {
    const classNames = match[1]!.trim().split(/\s+/);
    const from = match[2] ?? match[3];
    const fromGlobal = match[4] === "global" || undefined;
    const classTokens = findComposesClassTokens(node, classNames);
    return {
      classNames,
      ...(classTokens.length > 0 ? { classTokens } : {}),
      ...(from ? { from } : {}),
      ...(fromGlobal ? { fromGlobal } : {}),
    };
  }
  const classNames = trimmed.split(/\s+/).filter((s) => s.length > 0);
  if (classNames.length === 0) return null;
  const classTokens = findComposesClassTokens(node, classNames);
  return {
    classNames,
    ...(classTokens.length > 0 ? { classTokens } : {}),
  };
}

function findComposesClassTokens(
  node: Extract<ChildNode, { type: "decl" }>,
  classNames: readonly string[],
): readonly ComposesClassToken[] {
  const source = node.source;
  if (!source?.start) return [];
  const propIndex = node.toString().indexOf(node.prop);
  const valueIndex = node.toString().indexOf(node.value, propIndex + node.prop.length);
  if (valueIndex < 0) return [];
  const baseOffset = source.start.offset + valueIndex;
  const tokens: ComposesClassToken[] = [];
  let searchStart = 0;

  for (const className of classNames) {
    const localOffset = node.value.indexOf(className, searchStart);
    if (localOffset < 0) continue;
    const startOffset = baseOffset + localOffset;
    const endOffset = startOffset + className.length;
    const startPos = source.input.fromOffset(startOffset);
    const endPos = source.input.fromOffset(endOffset);
    if (startPos && endPos) {
      tokens.push({
        className,
        range: {
          start: { line: startPos.line - 1, character: startPos.col - 1 },
          end: { line: endPos.line - 1, character: endPos.col - 1 },
        },
      });
    }
    searchStart = localOffset + className.length;
  }

  return tokens;
}

function recordKeyframesAtRule(
  atrule: AtRule,
  keyframesByName: Map<string, KeyframesDeclHIR>,
): void {
  const keyframesName = parseKeyframesName(atrule);
  if (!keyframesName) return;

  keyframesByName.set(keyframesName.name, {
    kind: "keyframes",
    id: `keyframes:${keyframesName.name}:${keyframesName.range.start.line}:${keyframesName.range.start.character}`,
    name: keyframesName.name,
    range: keyframesName.range,
    ruleRange: rangeForSourceNode(atrule),
  });
}

function collectValueDecls(root: Root): readonly ValueDeclHIR[] {
  const valueDecls: ValueDeclHIR[] = [];
  root.walkAtRules("value", (atrule) => {
    const localValueDecl = parseLocalValueDecl(atrule);
    if (!localValueDecl) return;
    valueDecls.push(localValueDecl);
  });
  return valueDecls;
}

function parseLocalValueDecl(atrule: AtRule): ValueDeclHIR | null {
  if (/\bfrom\b/u.test(atrule.params)) return null;
  const match = /^\s*([\p{L}_-][\p{L}\p{N}\p{M}_-]*)\s*:\s*(.+?)\s*$/u.exec(atrule.params);
  const name = match?.[1];
  const value = match?.[2];
  if (!name || !value) return null;
  const range = findAtRuleParamTokenRange(atrule, name, name.length);
  if (!range) return null;
  return {
    kind: "valueDecl",
    id: `value:${name}:${range.start.line}:${range.start.character}`,
    name,
    value,
    range,
    ruleRange: rangeForSourceNode(atrule),
  };
}

function collectValueRefs(root: Root, valueDecls: readonly ValueDeclHIR[]): readonly ValueRefHIR[] {
  if (valueDecls.length === 0) return [];
  const valueNames = new Set(valueDecls.map((decl) => decl.name));
  const refs: ValueRefHIR[] = [];

  root.walkDecls((node) => {
    if (node.prop === "composes") return;
    const matches = findValueIdentifierMatches(node.value, valueNames);
    for (const match of matches) {
      const range = findDeclValueTokenRange(node, match.offset, match.name.length);
      if (!range) continue;
      refs.push({
        kind: "valueRef",
        id: `value-ref:decl:${node.source?.start?.line ?? 0}:${match.name}:${match.offset}`,
        name: match.name,
        range,
        source: "declaration",
      });
    }
  });

  root.walkAtRules("value", (atrule) => {
    const localValueDecl = parseLocalValueDecl(atrule);
    if (!localValueDecl) return;
    const colonIndex = atrule.params.indexOf(":");
    if (colonIndex < 0) return;
    const rawValue = atrule.params.slice(colonIndex + 1);
    const matches = findValueIdentifierMatches(rawValue, valueNames);
    for (const match of matches) {
      if (match.name === localValueDecl.name) continue;
      const range = findAtRuleParamValueTokenRange(
        atrule,
        colonIndex + 1 + match.offset,
        match.name.length,
      );
      if (!range) continue;
      refs.push({
        kind: "valueRef",
        id: `value-ref:value:${atrule.source?.start?.line ?? 0}:${match.name}:${match.offset}`,
        name: match.name,
        range,
        source: "valueDecl",
      });
    }
  });

  return refs;
}

function findValueIdentifierMatches(
  raw: string,
  valueNames: ReadonlySet<string>,
): Array<{ name: string; offset: number }> {
  const matches: Array<{ name: string; offset: number }> = [];
  let quote: "'" | '"' | null = null;
  let identifierStart = -1;

  const flushIdentifier = (endIndex: number) => {
    if (identifierStart === -1) return;
    const name = raw.slice(identifierStart, endIndex);
    if (valueNames.has(name)) {
      matches.push({ name, offset: identifierStart });
    }
    identifierStart = -1;
  };

  for (let index = 0; index < raw.length; index += 1) {
    const ch = raw[index]!;
    if (quote) {
      if (ch === "\\" && index + 1 < raw.length) {
        index += 1;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      flushIdentifier(index);
      quote = ch;
      continue;
    }
    if (identifierStart === -1) {
      if (/[\p{L}_-]/u.test(ch)) {
        identifierStart = index;
      }
      continue;
    }
    if (!/[\p{L}\p{N}\p{M}_-]/u.test(ch)) {
      flushIdentifier(index);
    }
  }

  flushIdentifier(raw.length);
  return matches;
}

function parseKeyframesName(atrule: AtRule): { name: string; range: Range } | null {
  const rawName = atrule.params.trim();
  if (!rawName) return null;
  const match = /^(?:"([^"]+)"|'([^']+)'|([\p{L}_][\p{L}\p{N}\p{M}_-]*))$/u.exec(rawName);
  const name = match?.[1] ?? match?.[2] ?? match?.[3];
  if (!name) return null;
  const range = findAtRuleParamTokenRange(atrule, rawName, rawName.length);
  return range ? { name, range } : null;
}

function findAnimationNameTokens(
  node: Extract<ChildNode, { type: "decl" }>,
): readonly AnimationNameRefHIR[] {
  if (node.prop === "animation-name") {
    return enumerateAnimationSegments(node).flatMap((segment, index) => {
      const token = parseStandaloneAnimationNameToken(segment.raw);
      if (!token) return [];
      const range = findDeclValueTokenRange(node, segment.offset + token.offset, token.raw.length);
      if (!range) return [];
      return [
        {
          kind: "animationNameRef",
          id: `animation-ref:${node.source?.start?.line ?? 0}:${index}:${token.name}`,
          name: token.name,
          range,
          property: "animation-name",
        },
      ];
    });
  }

  if (node.prop === "animation") {
    return enumerateAnimationSegments(node).flatMap((segment, index) => {
      const token = findAnimationShorthandNameToken(segment.raw);
      if (!token) return [];
      const range = findDeclValueTokenRange(node, segment.offset + token.offset, token.raw.length);
      if (!range) return [];
      return [
        {
          kind: "animationNameRef",
          id: `animation-ref:${node.source?.start?.line ?? 0}:${index}:${token.name}`,
          name: token.name,
          range,
          property: "animation",
        },
      ];
    });
  }

  return [];
}

function enumerateAnimationSegments(
  node: Extract<ChildNode, { type: "decl" }>,
): Array<{ raw: string; offset: number }> {
  const value = node.value;
  const segments: Array<{ raw: string; offset: number }> = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < value.length; index++) {
    const ch = value[index];
    if (ch === "(" || ch === "[") depth += 1;
    else if (ch === ")" || ch === "]") depth -= 1;
    else if (ch === "," && depth === 0) {
      segments.push({ raw: value.slice(start, index), offset: start });
      start = index + 1;
    }
  }
  segments.push({ raw: value.slice(start), offset: start });
  return segments;
}

function parseStandaloneAnimationNameToken(
  rawSegment: string,
): { name: string; raw: string; offset: number } | null {
  const trimmed = rawSegment.trim();
  if (!trimmed) return null;
  const match = /^(?:"([^"]+)"|'([^']+)'|([\p{L}_][\p{L}\p{N}\p{M}_-]*))$/u.exec(trimmed);
  const name = match?.[1] ?? match?.[2] ?? match?.[3];
  if (!name || isReservedAnimationKeyword(name)) return null;
  return {
    name,
    raw: trimmed,
    offset: rawSegment.indexOf(trimmed),
  };
}

function findAnimationShorthandNameToken(
  rawSegment: string,
): { name: string; raw: string; offset: number } | null {
  const tokens = enumerateWhitespaceTokens(rawSegment);
  for (const token of tokens) {
    const match = /^(?:"([^"]+)"|'([^']+)'|([\p{L}_][\p{L}\p{N}\p{M}_-]*))$/u.exec(token.raw);
    const name = match?.[1] ?? match?.[2] ?? match?.[3];
    if (!name) continue;
    if (isReservedAnimationKeyword(name)) continue;
    if (isAnimationFunctionToken(token.raw)) continue;
    return {
      name,
      raw: token.raw,
      offset: token.offset,
    };
  }
  return null;
}

function enumerateWhitespaceTokens(segment: string): Array<{ raw: string; offset: number }> {
  const tokens: Array<{ raw: string; offset: number }> = [];
  let depth = 0;
  let start = -1;
  for (let index = 0; index < segment.length; index++) {
    const ch = segment[index];
    if (ch === "(" || ch === "[") {
      depth += 1;
      if (start === -1) start = index;
      continue;
    }
    if (ch === ")" || ch === "]") {
      depth -= 1;
      continue;
    }
    if (depth === 0 && /\s/.test(ch)) {
      pushWhitespaceToken(tokens, segment, start, index);
      start = -1;
      continue;
    }
    if (start === -1) start = index;
  }
  pushWhitespaceToken(tokens, segment, start, segment.length);
  return tokens;
}

function pushWhitespaceToken(
  tokens: Array<{ raw: string; offset: number }>,
  segment: string,
  start: number,
  end: number,
): void {
  if (start === -1) return;
  const raw = segment.slice(start, end).trim();
  if (!raw) return;
  tokens.push({ raw, offset: segment.indexOf(raw, start) });
}

function isReservedAnimationKeyword(token: string): boolean {
  const lower = token.toLowerCase();
  return (
    lower === "none" ||
    lower === "infinite" ||
    lower === "normal" ||
    lower === "reverse" ||
    lower === "alternate" ||
    lower === "alternate-reverse" ||
    lower === "forwards" ||
    lower === "backwards" ||
    lower === "both" ||
    lower === "running" ||
    lower === "paused" ||
    lower === "linear" ||
    lower === "ease" ||
    lower === "ease-in" ||
    lower === "ease-out" ||
    lower === "ease-in-out" ||
    lower === "step-start" ||
    lower === "step-end" ||
    lower === "initial" ||
    lower === "inherit" ||
    lower === "unset" ||
    lower === "revert" ||
    lower === "revert-layer"
  );
}

function isAnimationFunctionToken(token: string): boolean {
  if (/^-?\d*\.?\d+(ms|s)$/i.test(token)) return true;
  if (/^-?\d*\.?\d+$/.test(token)) return true;
  return /^[a-z-]+\(.+\)$/i.test(token);
}

function findDeclValueTokenRange(
  node: Extract<ChildNode, { type: "decl" }>,
  valueOffset: number,
  tokenLength: number,
): Range | null {
  const source = node.source;
  if (!source?.start) return null;
  const propIndex = node.toString().indexOf(node.prop);
  const valueIndex = node.toString().indexOf(node.value, propIndex + node.prop.length);
  if (valueIndex < 0) return null;
  const baseOffset = source.start.offset + valueIndex;
  const startOffset = baseOffset + valueOffset;
  const endOffset = startOffset + tokenLength;
  const startPos = source.input.fromOffset(startOffset);
  const endPos = source.input.fromOffset(endOffset);
  if (!startPos || !endPos) return null;
  return {
    start: { line: startPos.line - 1, character: startPos.col - 1 },
    end: { line: endPos.line - 1, character: endPos.col - 1 },
  };
}

function findAtRuleParamTokenRange(
  atrule: AtRule,
  token: string,
  tokenLength: number,
): Range | null {
  const source = atrule.source;
  if (!source?.start) return null;
  const paramsIndex = atrule.toString().indexOf(atrule.params);
  const tokenIndex = atrule.params.indexOf(token);
  if (paramsIndex < 0 || tokenIndex < 0) return null;
  const startOffset = source.start.offset + paramsIndex + tokenIndex;
  const endOffset = startOffset + tokenLength;
  const startPos = source.input.fromOffset(startOffset);
  const endPos = source.input.fromOffset(endOffset);
  if (!startPos || !endPos) return null;
  return {
    start: { line: startPos.line - 1, character: startPos.col - 1 },
    end: { line: endPos.line - 1, character: endPos.col - 1 },
  };
}

function findAtRuleParamValueTokenRange(
  atrule: AtRule,
  valueOffset: number,
  tokenLength: number,
): Range | null {
  const source = atrule.source;
  if (!source?.start) return null;
  const paramsIndex = atrule.toString().indexOf(atrule.params);
  if (paramsIndex < 0) return null;
  const startOffset = source.start.offset + paramsIndex + valueOffset;
  const endOffset = startOffset + tokenLength;
  const startPos = source.input.fromOffset(startOffset);
  const endPos = source.input.fromOffset(endOffset);
  if (!startPos || !endPos) return null;
  return {
    start: { line: startPos.line - 1, character: startPos.col - 1 },
    end: { line: endPos.line - 1, character: endPos.col - 1 },
  };
}

function recordAtRootInlineRule(
  atrule: AtRule,
  selectorsByName: Map<string, SelectorDeclHIR>,
): void {
  const selector = atrule.params.trim();
  const { declarations } = collectDeclarationsAndComposes(atrule.nodes);
  const ruleRange = rangeForSourceNode(atrule);
  const selectors = selector.split(",").map((s) => s.trim());

  for (const raw of selectors) {
    for (const className of extractClassNames(raw)) {
      const start = atrule.source?.start;
      const baseColumn = (start?.column ?? 1) - 1 + "@at-root ".length;
      selectorsByName.set(className, {
        kind: "selector",
        id: `selector:${className}:${start?.line ?? 1}:${baseColumn}`,
        name: className,
        canonicalName: className,
        viewKind: "canonical",
        range: atRootTokenRange(start?.line ?? 1, baseColumn, className, raw),
        fullSelector: raw,
        declarations,
        ruleRange,
        composes: [],
        nestedSafety: "flat",
      });
    }
  }
}

function classifyNestedSafety(
  isNested: boolean,
  bemSuffix: BemSuffixInfo | null,
): NestedSelectorSafety {
  if (bemSuffix) return "bemSuffixSafe";
  if (isNested) return "nestedUnsafe";
  return "flat";
}

function compareSelectors(a: SelectorDeclHIR, b: SelectorDeclHIR): number {
  return compareNamedStyleFacts(a, b);
}

function compareNamedStyleFacts(
  a: { range: { start: { line: number; character: number } }; name: string },
  b: { range: { start: { line: number; character: number } }; name: string },
): number {
  const line = a.range.start.line - b.range.start.line;
  if (line !== 0) return line;
  const character = a.range.start.character - b.range.start.character;
  if (character !== 0) return character;
  return a.name.localeCompare(b.name);
}
