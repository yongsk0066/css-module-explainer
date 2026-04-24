import { spawn } from "node:child_process";
import { strict as assert } from "node:assert";

import { parseStyleDocument } from "../server/engine-core-ts/src/core/scss/scss-parser";
import { parse as postcssParse, type AtRule, type ChildNode, type Root, type Rule } from "postcss";
import safeParser from "postcss-safe-parser";

interface ParserIndexSummaryV0 {
  readonly schemaVersion: "0";
  readonly language: "css" | "scss" | "less";
  readonly selectors: {
    readonly names: readonly string[];
    readonly bemSuffixParentNames: readonly string[];
    readonly bemSuffixSafeNames: readonly string[];
    readonly nestedUnsafeNames: readonly string[];
    readonly selectorsWithValueRefsNames: readonly string[];
    readonly selectorsWithAnimationRefNames: readonly string[];
    readonly selectorsWithAnimationNameRefNames: readonly string[];
    readonly bemSuffixCount: number;
    readonly nestedSafetyCounts: {
      readonly flat: number;
      readonly bemSuffixSafe: number;
      readonly nestedUnsafe: number;
    };
  };
  readonly values: {
    readonly declNames: readonly string[];
    readonly declNamesWithLocalRefs: readonly string[];
    readonly declNamesWithImportedRefs: readonly string[];
    readonly importNames: readonly string[];
    readonly importSources: readonly string[];
    readonly importAliasCount: number;
    readonly refNames: readonly string[];
    readonly localRefNames: readonly string[];
    readonly importedRefNames: readonly string[];
    readonly importedRefSources: readonly string[];
    readonly declarationRefNames: readonly string[];
    readonly declarationImportedRefSources: readonly string[];
    readonly valueDeclRefNames: readonly string[];
    readonly valueDeclImportedRefSources: readonly string[];
    readonly selectorsWithRefsNames: readonly string[];
    readonly selectorsWithLocalRefsNames: readonly string[];
    readonly selectorsWithImportedRefsNames: readonly string[];
    readonly selectorsWithRefsUnderMediaNames: readonly string[];
    readonly selectorsWithRefsUnderSupportsNames: readonly string[];
    readonly selectorsWithRefsUnderLayerNames: readonly string[];
    readonly selectorsWithLocalRefsUnderMediaNames: readonly string[];
    readonly selectorsWithLocalRefsUnderSupportsNames: readonly string[];
    readonly selectorsWithLocalRefsUnderLayerNames: readonly string[];
    readonly selectorsWithImportedRefsUnderMediaNames: readonly string[];
    readonly selectorsWithImportedRefsUnderSupportsNames: readonly string[];
    readonly selectorsWithImportedRefsUnderLayerNames: readonly string[];
  };
  readonly sass: {
    readonly variableDeclNames: readonly string[];
    readonly variableRefNames: readonly string[];
    readonly mixinDeclNames: readonly string[];
    readonly mixinIncludeNames: readonly string[];
    readonly functionDeclNames: readonly string[];
    readonly functionCallNames: readonly string[];
    readonly moduleUseSources: readonly string[];
    readonly moduleForwardSources: readonly string[];
    readonly moduleImportSources: readonly string[];
  };
  readonly keyframes: {
    readonly names: readonly string[];
    readonly namesUnderMedia: readonly string[];
    readonly namesUnderSupports: readonly string[];
    readonly namesUnderLayer: readonly string[];
    readonly animationRefNames: readonly string[];
    readonly animationNameRefNames: readonly string[];
    readonly selectorsWithAnimationRefNames: readonly string[];
    readonly selectorsWithAnimationNameRefNames: readonly string[];
    readonly selectorsWithAnimationRefsUnderMediaNames: readonly string[];
    readonly selectorsWithAnimationRefsUnderSupportsNames: readonly string[];
    readonly selectorsWithAnimationRefsUnderLayerNames: readonly string[];
    readonly selectorsWithAnimationNameRefsUnderMediaNames: readonly string[];
    readonly selectorsWithAnimationNameRefsUnderSupportsNames: readonly string[];
    readonly selectorsWithAnimationNameRefsUnderLayerNames: readonly string[];
  };
  readonly composes: {
    readonly selectorsWithComposesNames: readonly string[];
    readonly selectorsWithComposesUnderMediaNames: readonly string[];
    readonly selectorsWithComposesUnderSupportsNames: readonly string[];
    readonly selectorsWithComposesUnderLayerNames: readonly string[];
    readonly localSelectorNames: readonly string[];
    readonly importedSelectorNames: readonly string[];
    readonly globalSelectorNames: readonly string[];
    readonly localSelectorNamesUnderMedia: readonly string[];
    readonly localSelectorNamesUnderSupports: readonly string[];
    readonly localSelectorNamesUnderLayer: readonly string[];
    readonly importedSelectorNamesUnderMedia: readonly string[];
    readonly importedSelectorNamesUnderSupports: readonly string[];
    readonly importedSelectorNamesUnderLayer: readonly string[];
    readonly globalSelectorNamesUnderMedia: readonly string[];
    readonly globalSelectorNamesUnderSupports: readonly string[];
    readonly globalSelectorNamesUnderLayer: readonly string[];
    readonly importSources: readonly string[];
    readonly importSourcesUnderMedia: readonly string[];
    readonly importSourcesUnderSupports: readonly string[];
    readonly importSourcesUnderLayer: readonly string[];
    readonly classNameCount: number;
    readonly localClassNameCount: number;
    readonly importedClassNameCount: number;
    readonly globalClassNameCount: number;
  };
  readonly wrappers: {
    readonly selectorsUnderMediaNames: readonly string[];
    readonly selectorsUnderSupportsNames: readonly string[];
    readonly selectorsUnderLayerNames: readonly string[];
  };
}

const CORPUS = [
  {
    label: "scss-basic-index",
    filePath: "/f.module.scss",
    source: `.btn { color: red; }`,
  },
  {
    label: "scss-value-import-and-ref",
    filePath: "/f.module.scss",
    source: `@value brand from "./tokens.module.scss";\n.btn { color: brand; }`,
  },
  {
    label: "scss-value-import-alias-and-ref",
    filePath: "/f.module.scss",
    source: `@value brand as accent from "./tokens.module.scss";\n.btn { color: accent; }`,
  },
  {
    label: "scss-local-value-ref",
    filePath: "/f.module.scss",
    source: `@value brand: red;\n.btn { color: brand; }`,
  },
  {
    label: "scss-value-decl-dependency-chain",
    filePath: "/f.module.scss",
    source: `@value base: red;\n@value accent: base;\n.btn { color: accent; }`,
  },
  {
    label: "scss-mixed-local-imported-value-refs",
    filePath: "/f.module.scss",
    source: `@value brand from "./tokens.module.scss";\n@value accent: red;\n.btn { color: brand; background: accent; }`,
  },
  {
    label: "scss-imported-value-ref-in-value-decl",
    filePath: "/f.module.scss",
    source: `@value brand from "./tokens.module.scss";\n@value accent: brand;\n.btn { color: accent; }`,
  },
  {
    label: "scss-composes-and-animation",
    filePath: "/f.module.scss",
    source: `@keyframes fade { from { opacity: 0; } }\n.btn { composes: base primary from "./base.module.scss"; animation: fade 1s linear; animation-name: fade; }`,
  },
  {
    label: "scss-animation-with-value-ref",
    filePath: "/f.module.scss",
    source: `@keyframes fade { from { opacity: 0; } }\n@value speed: 1s;\n.btn { animation: fade speed linear; animation-name: fade; }`,
  },
  {
    label: "scss-media-keyframes-index",
    filePath: "/f.module.scss",
    source: `@media (min-width: 1px) { @keyframes pulse { from { opacity: 0; } } .btn { animation: pulse 1s linear; } }`,
  },
  {
    label: "scss-composes-local",
    filePath: "/f.module.scss",
    source: `.btn { composes: base utility; }`,
  },
  {
    label: "scss-composes-global",
    filePath: "/f.module.scss",
    source: `.btn { composes: app-shell from global; }`,
  },
  {
    label: "scss-grouped-composes-imported",
    filePath: "/f.module.scss",
    source: `.a, .b { composes: base primary from "./base.module.scss"; }`,
  },
  {
    label: "scss-bem-safe-nested-index",
    filePath: "/f.module.scss",
    source: `.card { &__icon { &--small { color: red; } } }`,
  },
  {
    label: "scss-grouped-bem-unsafe-index",
    filePath: "/f.module.scss",
    source: `.a, .b { &__icon { &--small { color: red; } } }`,
  },
  {
    label: "scss-amp-class-unsafe-index",
    filePath: "/f.module.scss",
    source: `.btn { &.active { color: red; } }`,
  },
  {
    label: "scss-mixed-wrapper-index",
    filePath: "/f.module.scss",
    source: `@media (min-width: 1px) { @value brand from "./tokens.module.scss"; .btn:hover { color: brand; } }`,
  },
  {
    label: "scss-supports-layer-mixed-value-refs",
    filePath: "/f.module.scss",
    source: `@supports (display: grid) { @layer ui { @value brand from "./tokens.module.scss"; @value accent: red; .btn { color: brand; background: accent; } } }`,
  },
  {
    label: "scss-supports-layer-wrapper-index",
    filePath: "/f.module.scss",
    source: `@supports (display: grid) { @layer ui { .card { color: red; } } }`,
  },
  {
    label: "scss-supports-layer-animation-value-index",
    filePath: "/f.module.scss",
    source: `@supports (display: grid) { @layer ui { @keyframes fade { from { opacity: 0; } } @value speed: 1s; .btn { animation: fade speed linear; animation-name: fade; } } }`,
  },
  {
    label: "scss-media-composes-index",
    filePath: "/f.module.scss",
    source: `@media (min-width: 1px) { .btn { composes: base from "./base.module.scss"; } }`,
  },
  {
    label: "scss-supports-layer-composes-index",
    filePath: "/f.module.scss",
    source: `@supports (display: grid) { @layer ui { .card { composes: shell from global; } } }`,
  },
  {
    label: "scss-supports-layer-mixed-composes",
    filePath: "/f.module.scss",
    source: `@supports (display: grid) { @layer ui { .card { composes: base utility; composes: shell from global; composes: tone from "./base.module.scss"; } } }`,
  },
  {
    label: "scss-sass-symbol-seed-index",
    filePath: "/f.module.scss",
    source: `@use "./tokens" as tokens;\n@forward "./theme";\n@import "./legacy";\n$gap: 1rem;\n@mixin raised($depth) { box-shadow: 0 0 $depth black; }\n@function tone($value) { @return $value; }\n.btn { color: $gap; @include raised($gap); border-color: tone($gap); }`,
  },
] as const;

function comparePosition(
  left: { readonly line: number; readonly character: number },
  right: { readonly line: number; readonly character: number },
): number {
  if (left.line !== right.line) return left.line - right.line;
  return left.character - right.character;
}

function rangeContains(
  outer: {
    readonly start: { readonly line: number; readonly character: number };
    readonly end: { readonly line: number; readonly character: number };
  },
  inner: {
    readonly start: { readonly line: number; readonly character: number };
    readonly end: { readonly line: number; readonly character: number };
  },
): boolean {
  return (
    comparePosition(outer.start, inner.start) <= 0 && comparePosition(outer.end, inner.end) >= 0
  );
}

function findLangForPath(filePath: string): "scss" | "less" | "css" {
  if (filePath.endsWith(".module.scss")) return "scss";
  if (filePath.endsWith(".module.less")) return "less";
  return "css";
}

function getRuntimeSyntax(lang: "scss" | "less" | "css") {
  switch (lang) {
    case "scss":
      return safeParser;
    case "less":
      return safeParser;
    case "css":
      return null;
  }
}

function collectWrapperNamesForRanges(
  filePath: string,
  source: string,
  entries: readonly {
    readonly name: string;
    readonly ruleRange: {
      readonly start: { readonly line: number; readonly character: number };
      readonly end: { readonly line: number; readonly character: number };
    };
  }[],
) {
  const lang = findLangForPath(filePath);
  const syntax = getRuntimeSyntax(lang);
  const root =
    typeof syntax?.parse === "function"
      ? (syntax.parse(source, { from: filePath }) as Root)
      : (postcssParse(source, { from: filePath }) as Root);

  const media = new Set<string>();
  const supports = new Set<string>();
  const layer = new Set<string>();

  function walk(
    nodes: readonly ChildNode[],
    ctx: {
      readonly underMedia: boolean;
      readonly underSupports: boolean;
      readonly underLayer: boolean;
    },
  ): void {
    for (const node of nodes) {
      if (node.type === "rule") {
        const rule = node as Rule;
        const ruleRange = {
          start: { line: rule.source!.start!.line - 1, character: rule.source!.start!.column - 1 },
          end: { line: rule.source!.end!.line - 1, character: rule.source!.end!.column - 1 },
        };
        for (const entry of entries) {
          if (!rangeContains(ruleRange, entry.ruleRange)) continue;
          if (ctx.underMedia) media.add(entry.name);
          if (ctx.underSupports) supports.add(entry.name);
          if (ctx.underLayer) layer.add(entry.name);
        }
        walk(rule.nodes ?? [], ctx);
        continue;
      }
      if (node.type === "atrule") {
        const atRule = node as AtRule;
        const atRuleRange = {
          start: {
            line: atRule.source!.start!.line - 1,
            character: atRule.source!.start!.column - 1,
          },
          end: { line: atRule.source!.end!.line - 1, character: atRule.source!.end!.column - 1 },
        };
        for (const entry of entries) {
          if (!rangeContains(atRuleRange, entry.ruleRange)) continue;
          if (ctx.underMedia) media.add(entry.name);
          if (ctx.underSupports) supports.add(entry.name);
          if (ctx.underLayer) layer.add(entry.name);
        }
        walk(atRule.nodes ?? [], {
          underMedia: ctx.underMedia || atRule.name === "media",
          underSupports: ctx.underSupports || atRule.name === "supports",
          underLayer: ctx.underLayer || atRule.name === "layer",
        });
      }
    }
  }

  walk(root.nodes ?? [], { underMedia: false, underSupports: false, underLayer: false });
  return {
    media: [...media].toSorted(),
    supports: [...supports].toSorted(),
    layer: [...layer].toSorted(),
  };
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].toSorted((left, right) => left.localeCompare(right));
}

function deriveSassSummary(source: string): ParserIndexSummaryV0["sass"] {
  const variableDeclNames = [...source.matchAll(/(^|[{\s;])\$([A-Za-z_-][A-Za-z0-9_-]*)\s*:/g)].map(
    (match) => match[2]!,
  );
  const variableRefNames = [...source.matchAll(/\$([A-Za-z_-][A-Za-z0-9_-]*)/g)]
    .filter((match) => {
      const end = match.index + match[0].length;
      const next = /\S/.exec(source.slice(end))?.[0];
      return next !== ":";
    })
    .map((match) => match[1]!);
  const mixinDeclNames = [...source.matchAll(/@mixin\s+([A-Za-z_-][A-Za-z0-9_-]*)/g)].map(
    (match) => match[1]!,
  );
  const mixinIncludeNames = [...source.matchAll(/@include\s+([A-Za-z_-][A-Za-z0-9_-]*)/g)].map(
    (match) => match[1]!,
  );
  const functionDeclNames = [...source.matchAll(/@function\s+([A-Za-z_-][A-Za-z0-9_-]*)/g)].map(
    (match) => match[1]!,
  );
  const functionCallNames = functionDeclNames.flatMap((name) => {
    const callPattern = new RegExp(`\\b${escapeRegExp(name)}\\s*\\(`, "g");
    return [...source.matchAll(callPattern)].length > 1 ? [name] : [];
  });
  const sourceForAtRule = (name: "use" | "forward" | "import") =>
    [...source.matchAll(new RegExp(`@${name}\\s+([^;{]+)`, "g"))].flatMap((match) =>
      [...match[1]!.matchAll(/["']([^"']+)["']/g)].map((sourceMatch) => sourceMatch[1]!),
    );

  return {
    variableDeclNames: uniqueSorted(variableDeclNames),
    variableRefNames: uniqueSorted(variableRefNames),
    mixinDeclNames: uniqueSorted(mixinDeclNames),
    mixinIncludeNames: uniqueSorted(mixinIncludeNames),
    functionDeclNames: uniqueSorted(functionDeclNames),
    functionCallNames: uniqueSorted(functionCallNames),
    moduleUseSources: uniqueSorted(sourceForAtRule("use")),
    moduleForwardSources: uniqueSorted(sourceForAtRule("forward")),
    moduleImportSources: uniqueSorted(sourceForAtRule("import")),
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

function deriveTsSummary(filePath: string, source: string): ParserIndexSummaryV0 {
  const document = parseStyleDocument(source, filePath);
  const wrapperSelectorNames = collectWrapperNamesForRanges(
    filePath,
    source,
    document.selectors.map((selector) => ({
      name: selector.name,
      ruleRange: selector.ruleRange,
    })),
  );
  const wrapperKeyframesNames = collectWrapperNamesForRanges(
    filePath,
    source,
    document.keyframes.map((entry) => ({
      name: entry.name,
      ruleRange: entry.ruleRange,
    })),
  );
  const selectorsWithComposes = document.selectors.filter(
    (selector) => selector.composes.length > 0,
  );
  const localComposesSelectors = selectorsWithComposes.filter((selector) =>
    selector.composes.some((ref) => ref.from === undefined && ref.fromGlobal !== true),
  );
  const importedComposesSelectors = selectorsWithComposes.filter((selector) =>
    selector.composes.some((ref) => ref.from !== undefined),
  );
  const globalComposesSelectors = selectorsWithComposes.filter((selector) =>
    selector.composes.some((ref) => ref.fromGlobal === true),
  );
  const selectorsWithValueRefs = document.selectors.filter((selector) =>
    document.valueRefs.some(
      (entry) =>
        entry.source === "declaration" &&
        entry.range &&
        rangeContains(selector.ruleRange, entry.range),
    ),
  );
  const localValueNames = new Set(document.valueDecls.map((entry) => entry.name));
  const importedValueNames = new Set(document.valueImports.map((entry) => entry.name));
  const importedValueSourceByName = new Map(
    document.valueImports.map((entry) => [entry.name, entry.from] as const),
  );
  const selectorsWithLocalValueRefs = document.selectors.filter((selector) =>
    document.valueRefs.some(
      (entry) =>
        localValueNames.has(entry.name) &&
        entry.source === "declaration" &&
        entry.range &&
        rangeContains(selector.ruleRange, entry.range),
    ),
  );
  const selectorsWithImportedValueRefs = document.selectors.filter((selector) =>
    document.valueRefs.some(
      (entry) =>
        importedValueNames.has(entry.name) &&
        entry.source === "declaration" &&
        entry.range &&
        rangeContains(selector.ruleRange, entry.range),
    ),
  );
  const selectorsWithAnimationRefs = document.selectors.filter((selector) =>
    document.animationNameRefs.some(
      (entry) =>
        entry.property === "animation" &&
        entry.range &&
        rangeContains(selector.ruleRange, entry.range),
    ),
  );
  const selectorsWithAnimationNameRefs = document.selectors.filter((selector) =>
    document.animationNameRefs.some(
      (entry) =>
        entry.property === "animation-name" &&
        entry.range &&
        rangeContains(selector.ruleRange, entry.range),
    ),
  );
  const selectorsWithValueRefsUnderMedia = selectorsWithValueRefs.filter((selector) =>
    wrapperSelectorNames.media.includes(selector.name),
  );
  const selectorsWithValueRefsUnderSupports = selectorsWithValueRefs.filter((selector) =>
    wrapperSelectorNames.supports.includes(selector.name),
  );
  const selectorsWithValueRefsUnderLayer = selectorsWithValueRefs.filter((selector) =>
    wrapperSelectorNames.layer.includes(selector.name),
  );
  const selectorsWithLocalValueRefsUnderMedia = selectorsWithLocalValueRefs.filter((selector) =>
    wrapperSelectorNames.media.includes(selector.name),
  );
  const selectorsWithLocalValueRefsUnderSupports = selectorsWithLocalValueRefs.filter((selector) =>
    wrapperSelectorNames.supports.includes(selector.name),
  );
  const selectorsWithLocalValueRefsUnderLayer = selectorsWithLocalValueRefs.filter((selector) =>
    wrapperSelectorNames.layer.includes(selector.name),
  );
  const selectorsWithImportedValueRefsUnderMedia = selectorsWithImportedValueRefs.filter(
    (selector) => wrapperSelectorNames.media.includes(selector.name),
  );
  const selectorsWithImportedValueRefsUnderSupports = selectorsWithImportedValueRefs.filter(
    (selector) => wrapperSelectorNames.supports.includes(selector.name),
  );
  const selectorsWithImportedValueRefsUnderLayer = selectorsWithImportedValueRefs.filter(
    (selector) => wrapperSelectorNames.layer.includes(selector.name),
  );
  const selectorsWithAnimationRefsUnderMedia = selectorsWithAnimationRefs.filter((selector) =>
    wrapperSelectorNames.media.includes(selector.name),
  );
  const selectorsWithAnimationRefsUnderSupports = selectorsWithAnimationRefs.filter((selector) =>
    wrapperSelectorNames.supports.includes(selector.name),
  );
  const selectorsWithAnimationRefsUnderLayer = selectorsWithAnimationRefs.filter((selector) =>
    wrapperSelectorNames.layer.includes(selector.name),
  );
  const selectorsWithAnimationNameRefsUnderMedia = selectorsWithAnimationNameRefs.filter(
    (selector) => wrapperSelectorNames.media.includes(selector.name),
  );
  const selectorsWithAnimationNameRefsUnderSupports = selectorsWithAnimationNameRefs.filter(
    (selector) => wrapperSelectorNames.supports.includes(selector.name),
  );
  const selectorsWithAnimationNameRefsUnderLayer = selectorsWithAnimationNameRefs.filter(
    (selector) => wrapperSelectorNames.layer.includes(selector.name),
  );
  const valueDeclsWithLocalRefs = document.valueDecls.filter((decl) =>
    document.valueRefs.some(
      (entry) =>
        entry.source === "valueDecl" &&
        localValueNames.has(entry.name) &&
        rangeContains(decl.ruleRange, entry.range),
    ),
  );
  const valueDeclsWithImportedRefs = document.valueDecls.filter((decl) =>
    document.valueRefs.some(
      (entry) =>
        entry.source === "valueDecl" &&
        importedValueNames.has(entry.name) &&
        rangeContains(decl.ruleRange, entry.range),
    ),
  );
  const selectorsWithComposesUnderMedia = selectorsWithComposes.filter((selector) =>
    wrapperSelectorNames.media.includes(selector.name),
  );
  const selectorsWithComposesUnderSupports = selectorsWithComposes.filter((selector) =>
    wrapperSelectorNames.supports.includes(selector.name),
  );
  const selectorsWithComposesUnderLayer = selectorsWithComposes.filter((selector) =>
    wrapperSelectorNames.layer.includes(selector.name),
  );
  const localComposesSelectorsUnderMedia = localComposesSelectors.filter((selector) =>
    wrapperSelectorNames.media.includes(selector.name),
  );
  const localComposesSelectorsUnderSupports = localComposesSelectors.filter((selector) =>
    wrapperSelectorNames.supports.includes(selector.name),
  );
  const localComposesSelectorsUnderLayer = localComposesSelectors.filter((selector) =>
    wrapperSelectorNames.layer.includes(selector.name),
  );
  const importedComposesSelectorsUnderMedia = importedComposesSelectors.filter((selector) =>
    wrapperSelectorNames.media.includes(selector.name),
  );
  const importedComposesSelectorsUnderSupports = importedComposesSelectors.filter((selector) =>
    wrapperSelectorNames.supports.includes(selector.name),
  );
  const importedComposesSelectorsUnderLayer = importedComposesSelectors.filter((selector) =>
    wrapperSelectorNames.layer.includes(selector.name),
  );
  const globalComposesSelectorsUnderMedia = globalComposesSelectors.filter((selector) =>
    wrapperSelectorNames.media.includes(selector.name),
  );
  const globalComposesSelectorsUnderSupports = globalComposesSelectors.filter((selector) =>
    wrapperSelectorNames.supports.includes(selector.name),
  );
  const globalComposesSelectorsUnderLayer = globalComposesSelectors.filter((selector) =>
    wrapperSelectorNames.layer.includes(selector.name),
  );
  return {
    schemaVersion: "0",
    language: filePath.endsWith(".module.less")
      ? "less"
      : filePath.endsWith(".module.scss")
        ? "scss"
        : "css",
    selectors: {
      names: [...document.selectors].map((selector) => selector.name).toSorted(),
      bemSuffixParentNames: document.selectors
        .map((selector) => selector.bemSuffix?.parentResolvedName)
        .filter((name): name is string => name !== undefined)
        .toSorted(),
      bemSuffixSafeNames: document.selectors
        .filter((selector) => selector.nestedSafety === "bemSuffixSafe")
        .map((selector) => selector.name)
        .toSorted(),
      nestedUnsafeNames: document.selectors
        .filter((selector) => selector.nestedSafety === "nestedUnsafe")
        .map((selector) => selector.name)
        .toSorted(),
      selectorsWithValueRefsNames: selectorsWithValueRefs
        .map((selector) => selector.name)
        .toSorted(),
      selectorsWithAnimationRefNames: selectorsWithAnimationRefs
        .map((selector) => selector.name)
        .toSorted(),
      selectorsWithAnimationNameRefNames: selectorsWithAnimationNameRefs
        .map((selector) => selector.name)
        .toSorted(),
      bemSuffixCount: document.selectors.filter((selector) => selector.bemSuffix).length,
      nestedSafetyCounts: {
        flat: document.selectors.filter((selector) => selector.nestedSafety === "flat").length,
        bemSuffixSafe: document.selectors.filter(
          (selector) => selector.nestedSafety === "bemSuffixSafe",
        ).length,
        nestedUnsafe: document.selectors.filter(
          (selector) => selector.nestedSafety === "nestedUnsafe",
        ).length,
      },
    },
    values: {
      declNames: [...document.valueDecls].map((entry) => entry.name).toSorted(),
      declNamesWithLocalRefs: valueDeclsWithLocalRefs.map((entry) => entry.name).toSorted(),
      declNamesWithImportedRefs: valueDeclsWithImportedRefs.map((entry) => entry.name).toSorted(),
      importNames: [...document.valueImports].map((entry) => entry.name).toSorted(),
      importSources: [...document.valueImports].map((entry) => entry.from).toSorted(),
      importAliasCount: document.valueImports.filter((entry) => entry.importedName !== entry.name)
        .length,
      refNames: [...document.valueRefs].map((entry) => entry.name).toSorted(),
      localRefNames: document.valueRefs
        .filter((entry) => localValueNames.has(entry.name))
        .map((entry) => entry.name)
        .toSorted(),
      importedRefNames: document.valueRefs
        .filter((entry) => importedValueNames.has(entry.name))
        .map((entry) => entry.name)
        .toSorted(),
      importedRefSources: document.valueRefs
        .filter((entry) => importedValueNames.has(entry.name))
        .flatMap((entry) => importedValueSourceByName.get(entry.name) ?? [])
        .toSorted(),
      declarationRefNames: document.valueRefs
        .filter((entry) => entry.source === "declaration")
        .map((entry) => entry.name)
        .toSorted(),
      declarationImportedRefSources: document.valueRefs
        .filter((entry) => entry.source === "declaration" && importedValueNames.has(entry.name))
        .flatMap((entry) => importedValueSourceByName.get(entry.name) ?? [])
        .toSorted(),
      valueDeclRefNames: document.valueRefs
        .filter((entry) => entry.source === "valueDecl")
        .map((entry) => entry.name)
        .toSorted(),
      valueDeclImportedRefSources: document.valueRefs
        .filter((entry) => entry.source === "valueDecl" && importedValueNames.has(entry.name))
        .flatMap((entry) => importedValueSourceByName.get(entry.name) ?? [])
        .toSorted(),
      selectorsWithRefsNames: selectorsWithValueRefs.map((selector) => selector.name).toSorted(),
      selectorsWithLocalRefsNames: selectorsWithLocalValueRefs
        .map((selector) => selector.name)
        .toSorted(),
      selectorsWithImportedRefsNames: selectorsWithImportedValueRefs
        .map((selector) => selector.name)
        .toSorted(),
      selectorsWithRefsUnderMediaNames: selectorsWithValueRefsUnderMedia
        .map((selector) => selector.name)
        .toSorted(),
      selectorsWithRefsUnderSupportsNames: selectorsWithValueRefsUnderSupports
        .map((selector) => selector.name)
        .toSorted(),
      selectorsWithRefsUnderLayerNames: selectorsWithValueRefsUnderLayer
        .map((selector) => selector.name)
        .toSorted(),
      selectorsWithLocalRefsUnderMediaNames: selectorsWithLocalValueRefsUnderMedia
        .map((selector) => selector.name)
        .toSorted(),
      selectorsWithLocalRefsUnderSupportsNames: selectorsWithLocalValueRefsUnderSupports
        .map((selector) => selector.name)
        .toSorted(),
      selectorsWithLocalRefsUnderLayerNames: selectorsWithLocalValueRefsUnderLayer
        .map((selector) => selector.name)
        .toSorted(),
      selectorsWithImportedRefsUnderMediaNames: selectorsWithImportedValueRefsUnderMedia
        .map((selector) => selector.name)
        .toSorted(),
      selectorsWithImportedRefsUnderSupportsNames: selectorsWithImportedValueRefsUnderSupports
        .map((selector) => selector.name)
        .toSorted(),
      selectorsWithImportedRefsUnderLayerNames: selectorsWithImportedValueRefsUnderLayer
        .map((selector) => selector.name)
        .toSorted(),
    },
    sass: deriveSassSummary(source),
    keyframes: {
      names: [...document.keyframes].map((entry) => entry.name).toSorted(),
      namesUnderMedia: wrapperKeyframesNames.media,
      namesUnderSupports: wrapperKeyframesNames.supports,
      namesUnderLayer: wrapperKeyframesNames.layer,
      animationRefNames: document.animationNameRefs
        .filter((entry) => entry.property === "animation")
        .map((entry) => entry.name)
        .toSorted(),
      animationNameRefNames: document.animationNameRefs
        .filter((entry) => entry.property === "animation-name")
        .map((entry) => entry.name)
        .toSorted(),
      selectorsWithAnimationRefNames: selectorsWithAnimationRefs
        .map((selector) => selector.name)
        .toSorted(),
      selectorsWithAnimationNameRefNames: selectorsWithAnimationNameRefs
        .map((selector) => selector.name)
        .toSorted(),
      selectorsWithAnimationRefsUnderMediaNames: selectorsWithAnimationRefsUnderMedia
        .map((selector) => selector.name)
        .toSorted(),
      selectorsWithAnimationRefsUnderSupportsNames: selectorsWithAnimationRefsUnderSupports
        .map((selector) => selector.name)
        .toSorted(),
      selectorsWithAnimationRefsUnderLayerNames: selectorsWithAnimationRefsUnderLayer
        .map((selector) => selector.name)
        .toSorted(),
      selectorsWithAnimationNameRefsUnderMediaNames: selectorsWithAnimationNameRefsUnderMedia
        .map((selector) => selector.name)
        .toSorted(),
      selectorsWithAnimationNameRefsUnderSupportsNames: selectorsWithAnimationNameRefsUnderSupports
        .map((selector) => selector.name)
        .toSorted(),
      selectorsWithAnimationNameRefsUnderLayerNames: selectorsWithAnimationNameRefsUnderLayer
        .map((selector) => selector.name)
        .toSorted(),
    },
    composes: {
      selectorsWithComposesNames: selectorsWithComposes.map((selector) => selector.name).toSorted(),
      selectorsWithComposesUnderMediaNames: selectorsWithComposesUnderMedia
        .map((selector) => selector.name)
        .toSorted(),
      selectorsWithComposesUnderSupportsNames: selectorsWithComposesUnderSupports
        .map((selector) => selector.name)
        .toSorted(),
      selectorsWithComposesUnderLayerNames: selectorsWithComposesUnderLayer
        .map((selector) => selector.name)
        .toSorted(),
      localSelectorNames: localComposesSelectors.map((selector) => selector.name).toSorted(),
      importedSelectorNames: importedComposesSelectors.map((selector) => selector.name).toSorted(),
      globalSelectorNames: globalComposesSelectors.map((selector) => selector.name).toSorted(),
      localSelectorNamesUnderMedia: localComposesSelectorsUnderMedia
        .map((selector) => selector.name)
        .toSorted(),
      localSelectorNamesUnderSupports: localComposesSelectorsUnderSupports
        .map((selector) => selector.name)
        .toSorted(),
      localSelectorNamesUnderLayer: localComposesSelectorsUnderLayer
        .map((selector) => selector.name)
        .toSorted(),
      importedSelectorNamesUnderMedia: importedComposesSelectorsUnderMedia
        .map((selector) => selector.name)
        .toSorted(),
      importedSelectorNamesUnderSupports: importedComposesSelectorsUnderSupports
        .map((selector) => selector.name)
        .toSorted(),
      importedSelectorNamesUnderLayer: importedComposesSelectorsUnderLayer
        .map((selector) => selector.name)
        .toSorted(),
      globalSelectorNamesUnderMedia: globalComposesSelectorsUnderMedia
        .map((selector) => selector.name)
        .toSorted(),
      globalSelectorNamesUnderSupports: globalComposesSelectorsUnderSupports
        .map((selector) => selector.name)
        .toSorted(),
      globalSelectorNamesUnderLayer: globalComposesSelectorsUnderLayer
        .map((selector) => selector.name)
        .toSorted(),
      importSources: selectorsWithComposes
        .flatMap((selector) =>
          selector.composes
            .map((ref) => ref.from)
            .filter((from): from is string => from !== undefined),
        )
        .toSorted(),
      importSourcesUnderMedia: selectorsWithComposesUnderMedia
        .flatMap((selector) =>
          selector.composes
            .map((ref) => ref.from)
            .filter((from): from is string => from !== undefined),
        )
        .toSorted(),
      importSourcesUnderSupports: selectorsWithComposesUnderSupports
        .flatMap((selector) =>
          selector.composes
            .map((ref) => ref.from)
            .filter((from): from is string => from !== undefined),
        )
        .toSorted(),
      importSourcesUnderLayer: selectorsWithComposesUnderLayer
        .flatMap((selector) =>
          selector.composes
            .map((ref) => ref.from)
            .filter((from): from is string => from !== undefined),
        )
        .toSorted(),
      classNameCount: document.selectors.reduce(
        (sum, selector) =>
          sum + selector.composes.reduce((inner, ref) => inner + ref.classNames.length, 0),
        0,
      ),
      localClassNameCount: document.selectors.reduce(
        (sum, selector) =>
          sum +
          selector.composes
            .filter((ref) => ref.from === undefined && ref.fromGlobal !== true)
            .reduce((inner, ref) => inner + ref.classNames.length, 0),
        0,
      ),
      importedClassNameCount: document.selectors.reduce(
        (sum, selector) =>
          sum +
          selector.composes
            .filter((ref) => ref.from !== undefined)
            .reduce((inner, ref) => inner + ref.classNames.length, 0),
        0,
      ),
      globalClassNameCount: document.selectors.reduce(
        (sum, selector) =>
          sum +
          selector.composes
            .filter((ref) => ref.fromGlobal === true)
            .reduce((inner, ref) => inner + ref.classNames.length, 0),
        0,
      ),
    },
    wrappers: {
      selectorsUnderMediaNames: wrapperSelectorNames.media,
      selectorsUnderSupportsNames: wrapperSelectorNames.supports,
      selectorsUnderLayerNames: wrapperSelectorNames.layer,
    },
  };
}

async function runRustSummary(filePath: string, source: string): Promise<ParserIndexSummaryV0> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "cargo",
      [
        "run",
        "--quiet",
        "--manifest-path",
        "rust/Cargo.toml",
        "-p",
        "engine-style-parser",
        "--bin",
        "engine-style-parser-css-modules-intermediate",
        "--",
        filePath,
      ],
      {
        cwd: process.cwd(),
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(`engine-style-parser-css-modules-intermediate exited with ${code}\n${stderr}`),
        );
        return;
      }
      resolve(JSON.parse(stdout) as ParserIndexSummaryV0);
    });

    child.stdin.end(source);
  });
}

void (async () => {
  for (const entry of CORPUS) {
    process.stdout.write(`== rust-parser-css-modules-intermediate:${entry.label} ==\n`);
    const expected = deriveTsSummary(entry.filePath, entry.source);
    // oxlint-disable-next-line eslint/no-await-in-loop
    const actual = await runRustSummary(entry.filePath, entry.source);

    assert.deepEqual(
      actual,
      expected,
      [
        `parser index bridge mismatch for ${entry.label}`,
        `expected: ${JSON.stringify(expected, null, 2)}`,
        `actual: ${JSON.stringify(actual, null, 2)}`,
      ].join("\n"),
    );

    process.stdout.write(
      `matched intermediate summary: selectors=${actual.selectors.names.length} valueImports=${actual.values.importNames.length} valueRefs=${actual.values.refNames.length} composes=${actual.composes.classNameCount}\n\n`,
    );
  }
})().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
