import ts from "typescript";
import type { ResolvedType } from "@css-module-explainer/shared";

/**
 * Workspace tier of the 2-tier TypeScript strategy.
 *
 * TypeResolver resolves a bare identifier like `cx(size)` to its
 * string-literal union members by walking the TypeChecker. A
 * single cached `ts.Program` per workspace amortises the expensive
 * setup; production uses `WorkspaceTypeResolver`, tests inject a
 * `FakeTypeResolver`.
 */
export interface TypeResolver {
  /**
   * Given a file path, an identifier name visible at that file,
   * and the owning workspace root, return the identifier's
   * string-literal union type.
   *
   * The method must always return a ResolvedType — `unresolvable`
   * is a valid "the checker could not narrow this" result.
   */
  resolve(filePath: string, variableName: string, workspaceRoot: string): ResolvedType;

  /** Drop the cached program for one workspace (e.g. on tsconfig change). */
  invalidate(workspaceRoot: string): void;

  /** Drop every cached program. */
  clear(): void;
}

export interface WorkspaceTypeResolverDeps {
  /**
   * Build a fresh ts.Program rooted at the given workspace. The
   * production composition root passes a function that reads
   * tsconfig.json from disk; tests pass a virtual CompilerHost
   * so no filesystem is touched.
   */
  createProgram: (workspaceRoot: string) => ts.Program;
}

/**
 * Default implementation of TypeResolver. Lazily builds one
 * ts.Program per workspaceRoot on first resolve, caches it, and
 * reuses the same TypeChecker across subsequent queries.
 */
export class WorkspaceTypeResolver implements TypeResolver {
  private readonly programs = new Map<string, ts.Program>();
  private readonly deps: WorkspaceTypeResolverDeps;

  constructor(deps: WorkspaceTypeResolverDeps) {
    this.deps = deps;
  }

  resolve(filePath: string, variableName: string, workspaceRoot: string): ResolvedType {
    const program = this.getOrCreateProgram(workspaceRoot);
    const sourceFile = program.getSourceFile(filePath);
    if (!sourceFile) {
      return UNRESOLVABLE;
    }
    const checker = program.getTypeChecker();

    const parts = variableName.split(".");
    const rootName = parts[0]!;

    let symbol = findIdentifierSymbol(sourceFile, rootName, checker);
    if (!symbol) {
      return UNRESOLVABLE;
    }

    // Follow import aliases so `import { sizes } from './theme'`
    // resolves to the original exported symbol, not the local alias.
    if (symbol.flags & ts.SymbolFlags.Alias) {
      symbol = checker.getAliasedSymbol(symbol);
    }

    let type = checker.getTypeOfSymbolAtLocation(symbol, sourceFile);

    // Walk the property chain for dotted paths like `sizes.large`.
    for (let i = 1; i < parts.length; i++) {
      const prop = type.getProperty(parts[i]!);
      if (!prop) return UNRESOLVABLE;
      type = checker.getTypeOfSymbolAtLocation(prop, sourceFile);
    }

    return extractStringLiterals(type, checker);
  }

  invalidate(workspaceRoot: string): void {
    this.programs.delete(workspaceRoot);
  }

  clear(): void {
    this.programs.clear();
  }

  private getOrCreateProgram(workspaceRoot: string): ts.Program {
    const cached = this.programs.get(workspaceRoot);
    if (cached) return cached;
    const program = this.deps.createProgram(workspaceRoot);
    this.programs.set(workspaceRoot, program);
    return program;
  }
}

const UNRESOLVABLE: ResolvedType = { kind: "unresolvable", values: [] };

/**
 * Walk the source file for an identifier matching `variableName`
 * and return its checker symbol.
 *
 * Uses a **local-first, import-fallback** 2-pass strategy:
 *   1. First pass looks only at local declarations (variable,
 *      parameter, destructuring binding) via document-order DFS.
 *   2. If no local match, a second pass checks import bindings
 *      (named, default, namespace).
 *
 * This ensures local declarations shadow imports with the same
 * name, matching TypeScript's own scoping rules in the common
 * case. Note: this is still NOT fully scope-aware — if the same
 * name appears in two different local scopes, the first one in
 * document order wins. Full scope-aware resolution requires
 * carrying the call-site node into the resolver (future work).
 */
function findIdentifierSymbol(
  sourceFile: ts.SourceFile,
  variableName: string,
  checker: ts.TypeChecker,
): ts.Symbol | null {
  // Pass 1: local declarations only.
  const local = findLocalSymbol(sourceFile, variableName, checker);
  if (local) return local;

  // Pass 2: import bindings as fallback.
  return findImportSymbol(sourceFile, variableName, checker);
}

function findLocalSymbol(
  sourceFile: ts.SourceFile,
  variableName: string,
  checker: ts.TypeChecker,
): ts.Symbol | null {
  let found: ts.Symbol | null = null;
  function visit(node: ts.Node): void {
    if (found) return;
    if (ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isBindingElement(node)) {
      const nameNode = node.name;
      if (ts.isIdentifier(nameNode) && nameNode.text === variableName) {
        found = checker.getSymbolAtLocation(nameNode) ?? null;
        if (found) return;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return found;
}

function findImportSymbol(
  sourceFile: ts.SourceFile,
  variableName: string,
  checker: ts.TypeChecker,
): ts.Symbol | null {
  let found: ts.Symbol | null = null;
  function visit(node: ts.Node): void {
    if (found) return;
    if (ts.isImportDeclaration(node) && node.importClause) {
      const clause = node.importClause;
      // Default import: `import sizes from './theme'`
      if (clause.name && clause.name.text === variableName) {
        found = checker.getSymbolAtLocation(clause.name) ?? null;
        if (found) return;
      }
      if (clause.namedBindings) {
        if (ts.isNamespaceImport(clause.namedBindings)) {
          // `import * as sizes from './theme'`
          if (clause.namedBindings.name.text === variableName) {
            found = checker.getSymbolAtLocation(clause.namedBindings.name) ?? null;
            if (found) return;
          }
        } else {
          // `import { sizes } from './theme'` or `import { sizes as s }`
          for (const spec of clause.namedBindings.elements) {
            if (spec.name.text === variableName) {
              found = checker.getSymbolAtLocation(spec.name) ?? null;
              if (found) return;
            }
          }
        }
      }
    }
    // Only recurse into non-import top-level children (imports are
    // always top-level, but this keeps the visitor generic).
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return found;
}

/**
 * Narrow a ts.Type to a string-literal union.
 *
 * - Single string literal (`"small"`) → single-member union.
 * - Union of string literals (`"small" | "medium"`) → full list.
 * - Union with any non-string-literal member → unresolvable (we
 *   refuse to guess).
 * - Generic with a literal base constraint → recurse on the base.
 * - Anything else → unresolvable.
 *
 * The recursion is bounded by MAX_CONSTRAINT_DEPTH to guard against
 * pathological constraint chains. In practice TS's checker
 * terminates quickly; the cap is cheap insurance.
 */
const MAX_CONSTRAINT_DEPTH = 10;

function extractStringLiterals(type: ts.Type, checker: ts.TypeChecker, depth = 0): ResolvedType {
  if (depth > MAX_CONSTRAINT_DEPTH) {
    return UNRESOLVABLE;
  }

  if (type.isStringLiteral()) {
    return { kind: "union", values: [type.value] };
  }

  if (type.isUnion()) {
    const values: string[] = [];
    for (const member of type.types) {
      if (member.isStringLiteral()) {
        values.push(member.value);
      } else {
        // Mixed union (e.g. `"a" | number`) — refuse to narrow.
        return UNRESOLVABLE;
      }
    }
    if (values.length > 0) {
      return { kind: "union", values };
    }
  }

  // Generic with a string-literal constraint (e.g. `T extends "a" | "b"`).
  const base = checker.getBaseConstraintOfType(type);
  if (base && base !== type) {
    return extractStringLiterals(base, checker, depth + 1);
  }

  return UNRESOLVABLE;
}
