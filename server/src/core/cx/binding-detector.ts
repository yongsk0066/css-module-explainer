import * as path from "node:path";
import ts from "typescript";
import type { CxBinding, Range, StyleImport } from "@css-module-explainer/shared";
import type { AliasResolver } from "./alias-resolver";
// Source of truth for supported style extensions (.scss, .css, .less).
import { getAllStyleExtensions } from "../scss/lang-registry";

/**
 * Scan `sourceFile` for default/named imports from `'clsx'`,
 * `'clsx/lite'`, or `'classnames'` (NOT `'classnames/bind'`).
 * Returns the local identifier names (e.g., `["clsx"]`, `["cn"]`).
 *
 * Used by the completion provider (via `AnalysisEntry.classUtilNames`)
 * to detect clsx-style calls. Cheap: walks only top-level statements
 * (imports are always top-level in valid TS/JS).
 */
export function detectClassUtilImports(sourceFile: ts.SourceFile): string[] {
  const names: string[] = [];
  const targets = new Set(["clsx", "clsx/lite", "classnames"]);
  for (const stmt of sourceFile.statements) {
    if (!ts.isImportDeclaration(stmt)) continue;
    if (!ts.isStringLiteral(stmt.moduleSpecifier)) continue;
    if (!targets.has(stmt.moduleSpecifier.text)) continue;
    const defaultName = stmt.importClause?.name?.text;
    if (defaultName) names.push(defaultName);
    const namedBindings = stmt.importClause?.namedBindings;
    if (namedBindings && ts.isNamedImports(namedBindings)) {
      for (const spec of namedBindings.elements) {
        names.push(spec.name.text);
      }
    }
  }
  return names;
}

/**
 * Scan top-level import declarations for `.module.<ext>` default or
 * namespace imports and return a map of local identifier → resolved
 * absolute path.
 *
 * This is the same logic as the style-import branch inside
 * `collectImports`, exposed so `DocumentAnalysisCache.analyze()` can
 * call it without pulling in the classnames/bind bookkeeping. Files
 * without a `classnames/bind` import still get a populated
 * `stylesBindings` map for `parseClassRefs`.
 */
export function collectStyleImports(
  sourceFile: ts.SourceFile,
  filePath: string,
  fileExists: (p: string) => boolean,
  aliasResolver: AliasResolver,
): ReadonlyMap<string, StyleImport> {
  const stylesBindings = new Map<string, StyleImport>();
  for (const stmt of sourceFile.statements) {
    const resolved = tryResolveImportStatement(stmt, sourceFile, filePath, aliasResolver);
    if (resolved?.kind !== "style") continue;
    stylesBindings.set(
      resolved.importName,
      fileExists(resolved.absolutePath)
        ? { kind: "resolved", absolutePath: resolved.absolutePath }
        : {
            kind: "missing",
            absolutePath: resolved.absolutePath,
            specifier: resolved.specifier,
            range: resolved.range,
          },
    );
  }
  return stylesBindings;
}

/**
 * Walk a source file and return every active `cx` binding:
 *   const <cxVarName> = <classNamesImport>.bind(<stylesVarName>);
 *
 * The walker runs in two passes. Pass 1 is a single linear scan of
 * top-level import declarations that collects BOTH the
 * `classnames/bind` default-import identifiers AND every
 * `.module.<ext>` style default/namespace import with its resolved
 * absolute path. Pass 2 scans every `VariableDeclaration` node in
 * the file — including those inside function bodies — and keeps the
 * ones whose initializer is
 * `<classNamesImport>.bind(<knownStylesVar>)`.
 *
 * The design covers: free `cxVarName`, free styles name, alias
 * imports for `classnames/bind`, multiple bindings per file, and
 * function-scoped bindings.
 */
export function detectCxBindings(
  sourceFile: ts.SourceFile,
  filePath: string,
  aliasResolver: AliasResolver,
): CxBinding[] {
  // Two-pass design: Pass 1 is a linear scan of top-level statements
  // for the two import sets we care about. If either set is empty,
  // we skip the full recursive AST walk in Pass 2 entirely — a real
  // short-circuit, not a micro-optimization, because Pass 2 descends
  // into every function body via ts.forEachChild.
  const imports = collectImports(sourceFile, filePath, aliasResolver);
  if (imports.classNamesNames.size === 0 || imports.stylesBindings.size === 0) {
    return [];
  }
  return collectBindings(sourceFile, imports);
}

interface ImportScan {
  /** Identifiers bound to `import X from 'classnames/bind'`. */
  readonly classNamesNames: ReadonlySet<string>;
  /** Identifier → resolved style import (resolved for now; `missing` variant lands with the fileExists DI). */
  readonly stylesBindings: ReadonlyMap<string, StyleImport>;
}

function collectImports(
  sourceFile: ts.SourceFile,
  filePath: string,
  aliasResolver: AliasResolver,
): ImportScan {
  // Single walk over top-level statements that produces both outputs
  // (classnames/bind identifiers and style-import bindings). Used
  // only by `detectCxBindings`, which does not care whether a style
  // module exists on disk — it only needs the resolved path to wire
  // cx bindings. Therefore this internal walker never emits `missing`
  // variants; it treats every style import as `resolved` regardless
  // of filesystem state. The exported `collectStyleImports` (which
  // takes a `fileExists` DI) is the authoritative path that emits
  // the two-variant union for diagnostics.
  const classNamesNames = new Set<string>();
  const stylesBindings = new Map<string, StyleImport>();

  for (const stmt of sourceFile.statements) {
    const resolved = tryResolveImportStatement(stmt, sourceFile, filePath, aliasResolver);
    if (!resolved) continue;
    if (resolved.kind === "classnamesBind") {
      classNamesNames.add(resolved.importName);
    } else {
      stylesBindings.set(resolved.importName, {
        kind: "resolved",
        absolutePath: resolved.absolutePath,
      });
    }
  }

  return { classNamesNames, stylesBindings };
}

type ResolvedImport =
  | { readonly kind: "classnamesBind"; readonly importName: string }
  | {
      readonly kind: "style";
      readonly importName: string;
      readonly absolutePath: string;
      readonly specifier: string;
      readonly range: Range;
    };

/**
 * Classify a single top-level statement. Returns `null` for anything
 * that is not a `classnames/bind` import or a relative
 * `.module.<ext>` import. Shared by `collectImports` and
 * `collectStyleImports` so the walking rule (default/namespace
 * identifiers, `.`-prefixed specifiers, known extensions) lives in
 * exactly one place. For style imports, also computes the LSP range
 * covering the string literal (excluding the enclosing quotes) so
 * diagnostics can underline the specifier on a missing-module error.
 */
function tryResolveImportStatement(
  stmt: ts.Statement,
  sourceFile: ts.SourceFile,
  filePath: string,
  aliasResolver: AliasResolver,
): ResolvedImport | null {
  if (!ts.isImportDeclaration(stmt)) return null;
  const moduleSpecifier = stmt.moduleSpecifier;
  if (!ts.isStringLiteral(moduleSpecifier)) return null;
  const specifier = moduleSpecifier.text;

  const defaultName = stmt.importClause?.name?.text;
  const namespaceName =
    stmt.importClause?.namedBindings && ts.isNamespaceImport(stmt.importClause.namedBindings)
      ? stmt.importClause.namedBindings.name.text
      : undefined;
  const importName = defaultName ?? namespaceName;
  if (!importName) return null;

  if (specifier === "classnames/bind") {
    return { kind: "classnamesBind", importName };
  }

  // Resolve the specifier to an absolute path — relative first,
  // alias second, drop otherwise. Matches clinyong's precedence
  // (relative always wins over alias).
  let absolutePath: string | null = null;
  if (specifier.startsWith(".")) {
    absolutePath = path.resolve(path.dirname(filePath), specifier);
  } else {
    absolutePath = aliasResolver.resolve(specifier);
    if (!absolutePath) return null;
  }

  // Extension filter applies to the resolved path, not the raw
  // specifier — an aliased `@styles/button.module.scss` maps to
  // `/abs/src/styles/button.module.scss` which still ends in
  // `.scss`, passing the gate.
  const styleExtensions = getAllStyleExtensions();
  if (!styleExtensions.some((ext) => absolutePath!.endsWith(ext))) return null;

  // String literal range excluding the quotes: getStart() points at
  // the opening quote, getEnd() points just past the closing quote.
  // Step past the quote chars so the diagnostic underlines only the
  // specifier text, matching how TS underlines TS2307.
  const startPos = sourceFile.getLineAndCharacterOfPosition(
    moduleSpecifier.getStart(sourceFile) + 1,
  );
  const endPos = sourceFile.getLineAndCharacterOfPosition(moduleSpecifier.getEnd() - 1);
  const range: Range = {
    start: { line: startPos.line, character: startPos.character },
    end: { line: endPos.line, character: endPos.character },
  };

  return { kind: "style", importName, absolutePath, specifier, range };
}

function collectBindings(sourceFile: ts.SourceFile, imports: ImportScan): CxBinding[] {
  const bindings: CxBinding[] = [];

  function visit(node: ts.Node): void {
    if (ts.isVariableDeclaration(node)) {
      const binding = tryParseCxBinding(node, sourceFile, imports);
      if (binding) {
        bindings.push(binding);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return bindings;
}

function tryParseCxBinding(
  decl: ts.VariableDeclaration,
  sourceFile: ts.SourceFile,
  imports: ImportScan,
): CxBinding | null {
  const init = decl.initializer;
  if (!init || !ts.isCallExpression(init)) return null;

  // `initializer` must be `<classNamesName>.bind(<stylesName>)`.
  // Does not unwrap ParenthesizedExpression or AsExpression,
  // so `(classNames as typeof cn).bind(...)` is silently skipped.
  const callee = init.expression;
  if (!ts.isPropertyAccessExpression(callee)) return null;
  if (callee.name.text !== "bind") return null;
  if (!ts.isIdentifier(callee.expression)) return null;
  const classNamesName = callee.expression.text;
  if (!imports.classNamesNames.has(classNamesName)) return null;

  const [firstArg] = init.arguments;
  if (!firstArg || !ts.isIdentifier(firstArg)) return null;
  const stylesName = firstArg.text;
  const styleImport = imports.stylesBindings.get(stylesName);
  if (!styleImport) return null;

  // cx variable name comes from the VariableDeclaration name.
  if (!ts.isIdentifier(decl.name)) return null;
  const cxVarName = decl.name.text;

  return {
    cxVarName,
    stylesVarName: stylesName,
    scssModulePath: styleImport.absolutePath,
    scope: computeScope(decl, sourceFile),
    classNamesImportName: classNamesName,
  };
}

/**
 * Return the scope in which a binding is visible.
 * - Top-level bindings span the whole source file.
 * - Function-scoped bindings span the enclosing function body.
 *
 * Line numbers are 0-based to match LSP conventions.
 */
function computeScope(
  decl: ts.VariableDeclaration,
  sourceFile: ts.SourceFile,
): { startLine: number; endLine: number } {
  const enclosingFn = findEnclosingFunctionLike(decl);
  if (enclosingFn) {
    const startPos = enclosingFn.getStart(sourceFile);
    const endPos = enclosingFn.getEnd();
    return {
      startLine: sourceFile.getLineAndCharacterOfPosition(startPos).line,
      endLine: sourceFile.getLineAndCharacterOfPosition(endPos).line,
    };
  }
  return {
    startLine: 0,
    endLine: sourceFile.getLineAndCharacterOfPosition(sourceFile.getEnd()).line,
  };
}

function findEnclosingFunctionLike(node: ts.Node): ts.Node | null {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (
      ts.isFunctionDeclaration(current) ||
      ts.isFunctionExpression(current) ||
      ts.isArrowFunction(current) ||
      ts.isMethodDeclaration(current) ||
      ts.isConstructorDeclaration(current) ||
      ts.isAccessor(current)
    ) {
      return current;
    }
    current = current.parent;
  }
  return null;
}
