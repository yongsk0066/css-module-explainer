import * as path from "node:path";
import ts from "typescript";
import type { CxBinding } from "@css-module-explainer/shared";
// Source of truth for supported style extensions (.scss, .css, .less).
import { getAllStyleExtensions } from "../scss/lang-registry";

/**
 * Walk a source file and return every active `cx` binding:
 *   const <cxVarName> = <classNamesImport>.bind(<stylesVarName>);
 *
 * The walker runs in two passes. Pass 1 collects every relevant
 * import (the classnames/bind default import name, and every
 * `.module.<ext>` style default import with its resolved absolute
 * path). Pass 2 scans all `VariableDeclaration` nodes in the file
 * — including those inside function bodies — and keeps the ones
 * whose initializer is `<classNamesImport>.bind(<knownStylesVar>)`.
 *
 * Design covers: free cxVarName, free
 * styles name, alias imports for classnames/bind, multiple
 * bindings per file, and function-scoped bindings.
 */
/**
 * Scan top-level import declarations for `.module.<ext>` default/namespace
 * imports and return a map of local identifier -> resolved absolute path.
 *
 * This is the same logic as the style-import branch inside `collectImports`,
 * extracted so `DocumentAnalysisCache.analyze()` can call it independently
 * of `detectCxBindings`. Independent style-import scanning: files without classnames/bind now get
 * a populated `stylesBindings` map for `parseStylePropertyAccesses`.
 */
export function collectStyleImports(
  sourceFile: ts.SourceFile,
  filePath: string,
): ReadonlyMap<string, string> {
  const stylesBindings = new Map<string, string>();
  const styleExtensions = getAllStyleExtensions();
  const sourceDir = path.dirname(filePath);

  for (const stmt of sourceFile.statements) {
    if (!ts.isImportDeclaration(stmt)) continue;
    const moduleSpecifier = stmt.moduleSpecifier;
    if (!ts.isStringLiteral(moduleSpecifier)) continue;
    const specifier = moduleSpecifier.text;

    const defaultName = stmt.importClause?.name?.text;
    const namespaceName =
      stmt.importClause?.namedBindings && ts.isNamespaceImport(stmt.importClause.namedBindings)
        ? stmt.importClause.namedBindings.name.text
        : undefined;
    const importName = defaultName ?? namespaceName;
    if (!importName) continue;

    // Skip non-relative specifiers (bare module names like 'design-system/Button.module.scss').
    // path.resolve() would produce nonsense for these. The existing collectImports
    // has this implicit behavior because non-relative specifiers never match
    // classnames/bind and non-relative style imports are uncommon.
    if (!specifier.startsWith(".")) continue;

    if (styleExtensions.some((ext) => specifier.endsWith(ext))) {
      const resolved = path.resolve(sourceDir, specifier);
      stylesBindings.set(importName, resolved);
    }
  }

  return stylesBindings;
}

export function detectCxBindings(sourceFile: ts.SourceFile, filePath: string): CxBinding[] {
  // Two-pass design: Pass 1 is a linear scan of top-level statements
  // for the two import sets we care about. If either set is empty,
  // we skip the full recursive AST walk in Pass 2 entirely — a real
  // short-circuit, not a micro-optimization, because Pass 2 descends
  // into every function body via ts.forEachChild.
  const imports = collectImports(sourceFile, filePath);
  if (imports.classNamesNames.size === 0 || imports.stylesBindings.size === 0) {
    return [];
  }
  return collectBindings(sourceFile, imports);
}

interface ImportScan {
  /** Identifiers bound to `import X from 'classnames/bind'`. */
  readonly classNamesNames: ReadonlySet<string>;
  /** Identifier → absolute path of its `.module.<ext>` import. */
  readonly stylesBindings: ReadonlyMap<string, string>;
}

function collectImports(sourceFile: ts.SourceFile, filePath: string): ImportScan {
  const classNamesNames = new Set<string>();
  const stylesBindings = collectStyleImports(sourceFile, filePath);

  for (const stmt of sourceFile.statements) {
    if (!ts.isImportDeclaration(stmt)) continue;
    const moduleSpecifier = stmt.moduleSpecifier;
    if (!ts.isStringLiteral(moduleSpecifier)) continue;
    const specifier = moduleSpecifier.text;

    const defaultName = stmt.importClause?.name?.text;
    const namespaceName =
      stmt.importClause?.namedBindings && ts.isNamespaceImport(stmt.importClause.namedBindings)
        ? stmt.importClause.namedBindings.name.text
        : undefined;
    const importName = defaultName ?? namespaceName;
    if (!importName) continue;

    if (specifier === "classnames/bind") {
      classNamesNames.add(importName);
    }
  }

  return { classNamesNames, stylesBindings };
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
  const scssModulePath = imports.stylesBindings.get(stylesName);
  if (!scssModulePath) return null;

  // cx variable name comes from the VariableDeclaration name.
  if (!ts.isIdentifier(decl.name)) return null;
  const cxVarName = decl.name.text;

  return {
    cxVarName,
    stylesVarName: stylesName,
    scssModulePath,
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
