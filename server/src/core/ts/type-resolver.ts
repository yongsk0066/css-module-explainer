import ts from "typescript";
import type { ResolvedType } from "@css-module-explainer/shared";

/**
 * Workspace tier of the 2-tier TypeScript strategy.
 *
 * TypeResolver resolves a bare identifier like `cx(size)` to its
 * string-literal union members by walking the TypeChecker. A
 * single cached `ts.Program` per workspace amortises the expensive
 * setup; Phase 4 callers either use the real WorkspaceTypeResolver
 * or inject a FakeTypeResolver in unit tests.
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
    const symbol = findIdentifierSymbol(sourceFile, variableName, checker);
    if (!symbol) {
      return UNRESOLVABLE;
    }
    const type = checker.getTypeOfSymbolAtLocation(symbol, sourceFile);
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
 * and return its checker symbol. Looks at variable declarations,
 * function parameters, and destructuring binding elements — all
 * three places a `cx(x)` argument typically comes from.
 *
 * Known limitation: this is a document-order DFS that matches by
 * name only, NOT by lexical scope. If a file has both a top-level
 * `const size = "outer"` and a nested `function f({ size }: Props)`,
 * the outer binding wins. This is acceptable for Phase 4 because
 * every test fixture uses unique names within a file, but Phase 6's
 * hover-over-shadowed-identifier tests are the first place a
 * shadowing reproducer is likely to surface. The fix at that point
 * is to walk up from the call site via `ts.findAncestor` + per-node
 * symbol lookup instead of global DFS.
 */
function findIdentifierSymbol(
  sourceFile: ts.SourceFile,
  variableName: string,
  checker: ts.TypeChecker,
): ts.Symbol | null {
  let found: ts.Symbol | null = null;

  function visit(node: ts.Node): void {
    if (found) return;

    const nameNode =
      ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isBindingElement(node)
        ? node.name
        : null;

    if (nameNode && ts.isIdentifier(nameNode) && nameNode.text === variableName) {
      const symbol = checker.getSymbolAtLocation(nameNode);
      if (symbol) {
        found = symbol;
        return;
      }
    }

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
