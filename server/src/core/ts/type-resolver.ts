import ts from "typescript";
import type { Range, ResolvedType } from "@css-module-explainer/shared";
import {
  buildSourceBinder,
  getDeclById,
  resolveIdentifierAtOffset,
} from "../binder/binder-builder";
import type { SourceBinderResult } from "../binder/scope-types";

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
  resolve(
    filePath: string,
    variableName: string,
    workspaceRoot: string,
    range: Range,
    options?: ResolveTypeOptions,
  ): ResolvedType;

  /** Drop the cached program for one workspace (e.g. on tsconfig change). */
  invalidate(workspaceRoot: string): void;

  /** Drop every cached program. */
  clear(): void;
}

export interface ResolveTypeOptions {
  readonly sourceBinder?: SourceBinderResult;
  readonly rootBindingDeclId?: string | null;
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

  resolve(
    filePath: string,
    variableName: string,
    workspaceRoot: string,
    range: Range,
    options?: ResolveTypeOptions,
  ): ResolvedType {
    const program = this.getOrCreateProgram(workspaceRoot);
    const sourceFile = program.getSourceFile(filePath);
    if (!sourceFile) {
      return UNRESOLVABLE;
    }
    const checker = program.getTypeChecker();

    const parts = variableName.split(".");
    const rootName = parts[0]!;

    let symbol = findIdentifierSymbol(sourceFile, rootName, checker, range, options);
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
 * Uses the lexical binder and the actual call-site range.
 * Local shadowing and import visibility now depend on the
 * reference location rather than document-order heuristics.
 */
function findIdentifierSymbol(
  sourceFile: ts.SourceFile,
  variableName: string,
  checker: ts.TypeChecker,
  range: Range,
  options?: ResolveTypeOptions,
): ts.Symbol | null {
  return findBoundSymbol(sourceFile, variableName, checker, range, options);
}

function findBoundSymbol(
  sourceFile: ts.SourceFile,
  variableName: string,
  checker: ts.TypeChecker,
  range: Range,
  options?: ResolveTypeOptions,
): ts.Symbol | null {
  if (range.start.line >= sourceFile.getLineStarts().length) {
    return null;
  }

  const binder = options?.sourceBinder ?? buildSourceBinder(sourceFile);
  const decl = options?.rootBindingDeclId
    ? getDeclById(binder, options.rootBindingDeclId)
    : resolveDeclFromRange(binder, sourceFile, variableName, range);
  if (!decl) {
    return null;
  }
  if (decl.name !== variableName) {
    return null;
  }

  const identifier = findIdentifierNodeForDecl(
    sourceFile,
    decl.name,
    decl.span.start,
    decl.span.end,
  );
  if (!identifier) {
    return null;
  }

  return checker.getSymbolAtLocation(identifier) ?? null;
}

function resolveDeclFromRange(
  binder: SourceBinderResult,
  sourceFile: ts.SourceFile,
  variableName: string,
  range: Range,
) {
  const offset = ts.getPositionOfLineAndCharacter(
    sourceFile,
    range.start.line,
    range.start.character,
  );
  const resolution = resolveIdentifierAtOffset(binder, variableName, offset);
  if (!resolution) {
    return null;
  }
  return getDeclById(binder, resolution.declId);
}

function findIdentifierNodeForDecl(
  sourceFile: ts.SourceFile,
  name: string,
  start: number,
  end: number,
): ts.Identifier | null {
  let found: ts.Identifier | null = null;

  const visit = (node: ts.Node): void => {
    if (found) return;
    if (
      ts.isIdentifier(node) &&
      node.text === name &&
      node.getStart(sourceFile) === start &&
      node.getEnd() === end
    ) {
      found = node;
      return;
    }
    ts.forEachChild(node, visit);
  };

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
