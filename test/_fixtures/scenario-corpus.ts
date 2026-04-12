import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import type {
  ClassRef,
  Range,
  ScssClassMap,
  SelectorInfo,
  StyleImport,
} from "@css-module-explainer/shared";
import { detectClassUtilImports, scanCxImports } from "../../server/src/core/cx/binding-detector";
import { parseClassRefs } from "../../server/src/core/cx/compat/class-ref-parser-compat";
import { buildSourceDocumentFromLegacy } from "../../server/src/core/hir/compat/source-document-builder-compat";
import { buildStyleDocumentFromClassMap } from "../../server/src/core/hir/compat/style-document-builder-compat";
import { sourceDocumentToLegacyClassRefs } from "../../server/src/core/hir/compat/source-document-compat";
import { styleDocumentToLegacyClassMap } from "../../server/src/core/hir/compat/style-document-compat";
import type { SourceDocumentHIR } from "../../server/src/core/hir/source-types";
import type { StyleDocumentHIR } from "../../server/src/core/hir/style-types";
import {
  expandClassMapWithTransform,
  type ClassnameTransformMode,
} from "../../server/src/core/scss/classname-transform";
import { parseStyleModule } from "../../server/src/core/scss/scss-parser";
import { EMPTY_ALIAS_RESOLVER } from "./test-helpers";

const REPO_ROOT = process.cwd();
const EXAMPLES_ROOT = path.join(REPO_ROOT, "examples/src/scenarios");

export interface SourceScenarioDef {
  readonly id: string;
  readonly sourcePath: string;
}

export interface StyleScenarioDef {
  readonly id: string;
  readonly stylePath: string;
  readonly mode?: ClassnameTransformMode;
}

export const SOURCE_SCENARIOS: readonly SourceScenarioDef[] = [
  { id: "01-basic", sourcePath: "01-basic/BasicScenario.tsx" },
  { id: "02-multi-binding", sourcePath: "02-multi-binding/MultiBindingScenario.tsx" },
  { id: "02-style-access", sourcePath: "02-multi-binding/StyleAccessDemo.tsx" },
  { id: "04-dynamic", sourcePath: "04-dynamic/DynamicScenario.tsx" },
  { id: "10-clsx", sourcePath: "10-clsx/ClsxScenario.tsx" },
];

export const STYLE_SCENARIOS: readonly StyleScenarioDef[] = [
  { id: "01-basic-style", stylePath: "01-basic/Button.module.scss" },
  {
    id: "02-button-camel-case",
    stylePath: "02-multi-binding/Button.module.scss",
    mode: "camelCase",
  },
  { id: "04-dynamic-style", stylePath: "04-dynamic/DynamicKeys.module.scss" },
  { id: "10-clsx-style", stylePath: "10-clsx/Clsx.module.scss" },
];

export interface LoadedSourceScenario {
  readonly id: string;
  readonly filePath: string;
  readonly relativePath: string;
  readonly sourceDocument: SourceDocumentHIR;
  readonly legacyClassRefs: readonly ClassRef[];
  readonly compatClassRefs: readonly ClassRef[];
}

export interface LoadedStyleScenario {
  readonly id: string;
  readonly filePath: string;
  readonly relativePath: string;
  readonly styleDocument: StyleDocumentHIR;
  readonly legacyClassMap: ScssClassMap;
  readonly compatClassMap: ScssClassMap;
}

export function loadSourceScenario(def: SourceScenarioDef): LoadedSourceScenario {
  const filePath = path.join(EXAMPLES_ROOT, def.sourcePath);
  const relativePath = toRepoRelative(filePath);
  const content = readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(filePath),
  );

  const { stylesBindings, bindings } = scanCxImports(
    sourceFile,
    filePath,
    existsSync,
    EMPTY_ALIAS_RESOLVER,
  );
  const classRefs = parseClassRefs(sourceFile, bindings, stylesBindings);
  const sourceDocument = buildSourceDocumentFromLegacy({
    filePath,
    bindings,
    stylesBindings,
    classUtilNames: detectClassUtilImports(sourceFile),
    classRefs,
  });

  return {
    id: def.id,
    filePath,
    relativePath,
    sourceDocument,
    legacyClassRefs: classRefs,
    compatClassRefs: sourceDocumentToLegacyClassRefs(sourceDocument),
  };
}

export function loadStyleScenario(def: StyleScenarioDef): LoadedStyleScenario {
  const filePath = path.join(EXAMPLES_ROOT, def.stylePath);
  const relativePath = toRepoRelative(filePath);
  const content = readFileSync(filePath, "utf8");
  const parsed = parseStyleModule(content, filePath);
  const legacyClassMap = expandClassMapWithTransform(parsed, def.mode ?? "asIs");
  const styleDocument = buildStyleDocumentFromClassMap(filePath, legacyClassMap);

  return {
    id: def.id,
    filePath,
    relativePath,
    styleDocument,
    legacyClassMap,
    compatClassMap: styleDocumentToLegacyClassMap(styleDocument),
  };
}

export function normalizeSourceDocument(doc: SourceDocumentHIR): unknown {
  return {
    filePath: toRepoRelative(doc.filePath),
    language: doc.language,
    styleImports: doc.styleImports.map((binding) => ({
      kind: binding.kind,
      localName: binding.localName,
      resolved: normalizeStyleImport(binding.resolved),
      ...(binding.range ? { range: normalizeRange(binding.range) } : {}),
    })),
    utilityBindings: doc.utilityBindings.map((binding) =>
      binding.kind === "classnamesBind"
        ? {
            kind: binding.kind,
            localName: binding.localName,
            stylesLocalName: binding.stylesLocalName,
            scssModulePath: toRepoRelative(binding.scssModulePath),
            classNamesImportName: binding.classNamesImportName,
            scope: binding.scope,
          }
        : {
            kind: binding.kind,
            localName: binding.localName,
          },
    ),
    classExpressions: doc.classExpressions.map((expr) => ({
      kind: expr.kind,
      origin: expr.origin,
      scssModulePath: toRepoRelative(expr.scssModulePath),
      range: normalizeRange(expr.range),
      ...(expr.kind === "literal" ? { className: expr.className } : {}),
      ...(expr.kind === "template"
        ? { rawTemplate: expr.rawTemplate, staticPrefix: expr.staticPrefix }
        : {}),
      ...(expr.kind === "symbolRef"
        ? {
            rawReference: expr.rawReference,
            rootName: expr.rootName,
            pathSegments: [...expr.pathSegments],
          }
        : {}),
      ...(expr.kind === "styleAccess"
        ? {
            className: expr.className,
            accessPath: [...expr.accessPath],
          }
        : {}),
    })),
  };
}

export function normalizeStyleDocument(doc: StyleDocumentHIR): unknown {
  return {
    filePath: toRepoRelative(doc.filePath),
    selectors: doc.selectors.map((selector) => ({
      name: selector.name,
      canonicalName: selector.canonicalName,
      viewKind: selector.viewKind,
      nestedSafety: selector.nestedSafety,
      range: normalizeRange(selector.range),
      ruleRange: normalizeRange(selector.ruleRange),
      fullSelector: selector.fullSelector,
      ...(selector.originalName ? { originalName: selector.originalName } : {}),
      ...(selector.bemSuffix
        ? {
            bemSuffix: {
              rawToken: selector.bemSuffix.rawToken,
              rawTokenRange: normalizeRange(selector.bemSuffix.rawTokenRange),
              parentResolvedName: selector.bemSuffix.parentResolvedName,
            },
          }
        : {}),
      ...(selector.composes.length > 0 ? { composes: selector.composes } : {}),
    })),
  };
}

export function normalizeClassRefs(classRefs: readonly ClassRef[]): unknown {
  return classRefs.map((ref) => ({
    kind: ref.kind,
    origin: ref.origin,
    scssModulePath: toRepoRelative(ref.scssModulePath),
    originRange: normalizeRange(ref.originRange),
    ...(ref.kind === "static" ? { className: ref.className } : {}),
    ...(ref.kind === "template"
      ? { rawTemplate: ref.rawTemplate, staticPrefix: ref.staticPrefix }
      : {}),
    ...(ref.kind === "variable" ? { variableName: ref.variableName } : {}),
  }));
}

export function normalizeClassMap(classMap: ScssClassMap): unknown {
  return Array.from(classMap.values(), normalizeSelectorInfo).toSorted((a, b) =>
    a.name.localeCompare(b.name),
  );
}

function normalizeSelectorInfo(info: SelectorInfo): {
  readonly name: string;
  readonly range: ReturnType<typeof normalizeRange>;
  readonly ruleRange: ReturnType<typeof normalizeRange>;
  readonly fullSelector: string;
  readonly declarations: string;
  readonly isNested?: true;
  readonly originalName?: string;
  readonly bemSuffix?: {
    readonly rawToken: string;
    readonly rawTokenRange: ReturnType<typeof normalizeRange>;
    readonly parentResolvedName: string;
  };
  readonly composes?: SelectorInfo["composes"];
} {
  return {
    name: info.name,
    range: normalizeRange(info.range),
    ruleRange: normalizeRange(info.ruleRange),
    fullSelector: info.fullSelector,
    declarations: info.declarations,
    ...(info.isNested ? { isNested: true as const } : {}),
    ...(info.originalName ? { originalName: info.originalName } : {}),
    ...(info.bemSuffix
      ? {
          bemSuffix: {
            rawToken: info.bemSuffix.rawToken,
            rawTokenRange: normalizeRange(info.bemSuffix.rawTokenRange),
            parentResolvedName: info.bemSuffix.parentResolvedName,
          },
        }
      : {}),
    ...(info.composes ? { composes: info.composes } : {}),
  };
}

function normalizeStyleImport(styleImport: StyleImport): unknown {
  return styleImport.kind === "resolved"
    ? {
        kind: "resolved",
        absolutePath: toRepoRelative(styleImport.absolutePath),
      }
    : {
        kind: "missing",
        absolutePath: toRepoRelative(styleImport.absolutePath),
        specifier: styleImport.specifier,
        range: normalizeRange(styleImport.range),
      };
}

function normalizeRange(range: Range): readonly [number, number, number, number] {
  return [range.start.line, range.start.character, range.end.line, range.end.character];
}

function toRepoRelative(filePath: string): string {
  return path.relative(REPO_ROOT, filePath).replaceAll(path.sep, "/");
}

function scriptKindFor(filePath: string): ts.ScriptKind {
  if (filePath.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (filePath.endsWith(".ts")) return ts.ScriptKind.TS;
  if (filePath.endsWith(".jsx")) return ts.ScriptKind.JSX;
  return ts.ScriptKind.JS;
}
