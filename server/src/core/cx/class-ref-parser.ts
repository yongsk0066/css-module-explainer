import ts from "typescript";
import type {
  ClassRef,
  CxBinding,
  Range,
  StaticClassRef,
  TemplateClassRef,
  VariableClassRef,
} from "@css-module-explainer/shared";

/**
 * Unified ClassRef producer (Wave 1).
 *
 * Single AST walk that emits `ClassRef[]` covering both cx() call
 * arguments and direct `styles.x` property access. Each cx() call
 * produces entries with `origin: "cxCall"`; each `styles.x`
 * direct access produces a static entry with `origin: "styleAccess"`.
 */
export function parseClassRefs(
  sourceFile: ts.SourceFile,
  bindings: readonly CxBinding[],
  stylesBindings: ReadonlyMap<string, string>,
): ClassRef[] {
  const refs: ClassRef[] = [];

  // 1. cx() calls — one pass per binding. Scope filtering inside
  // `isMatchingCxCall` keeps function-scoped bindings correct.
  for (const binding of bindings) {
    collectCxCallRefs(sourceFile, binding, refs);
  }

  // 2. styles.className property accesses.
  if (stylesBindings.size > 0) {
    collectStyleAccessRefs(sourceFile, stylesBindings, refs);
  }

  return refs;
}

// ── cx() call walker ──────────────────────────────────────────

function collectCxCallRefs(sourceFile: ts.SourceFile, binding: CxBinding, out: ClassRef[]): void {
  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node) && isMatchingCxCall(node, binding, sourceFile)) {
      for (const arg of node.arguments) {
        extractFromArgument(arg, binding, sourceFile, out);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
}

function isMatchingCxCall(
  call: ts.CallExpression,
  binding: CxBinding,
  sourceFile: ts.SourceFile,
): boolean {
  if (!ts.isIdentifier(call.expression)) return false;
  if (call.expression.text !== binding.cxVarName) return false;
  const pos = sourceFile.getLineAndCharacterOfPosition(call.getStart(sourceFile));
  return pos.line >= binding.scope.startLine && pos.line <= binding.scope.endLine;
}

function extractFromArgument(
  arg: ts.Expression,
  binding: CxBinding,
  sourceFile: ts.SourceFile,
  out: ClassRef[],
): void {
  // 1. String literal or no-substitution template → static
  if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) {
    out.push(makeStaticCxRef(arg.text, innerStringRange(arg, sourceFile), binding.scssModulePath));
    return;
  }

  // 2. Object literal → each property name as a static class
  if (ts.isObjectLiteralExpression(arg)) {
    for (const prop of arg.properties) {
      if (!ts.isPropertyAssignment(prop) && !ts.isShorthandPropertyAssignment(prop)) {
        continue;
      }
      const name = prop.name;
      if (!name) continue;
      if (ts.isIdentifier(name)) {
        out.push(makeStaticCxRef(name.text, rangeOfNode(name, sourceFile), binding.scssModulePath));
      } else if (ts.isStringLiteral(name)) {
        out.push(
          makeStaticCxRef(name.text, innerStringRange(name, sourceFile), binding.scssModulePath),
        );
      }
      // Intentional: computed-property keys and numeric literal
      // keys cannot be resolved statically and are skipped
      // without warning.
    }
    return;
  }

  // 3. Logical && → recurse on the right branch only.
  if (
    ts.isBinaryExpression(arg) &&
    arg.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
  ) {
    extractFromArgument(arg.right, binding, sourceFile, out);
    return;
  }

  // 4. Ternary → recurse on both branches.
  if (ts.isConditionalExpression(arg)) {
    extractFromArgument(arg.whenTrue, binding, sourceFile, out);
    extractFromArgument(arg.whenFalse, binding, sourceFile, out);
    return;
  }

  // 5. Template literal with substitutions → one template ref.
  if (ts.isTemplateExpression(arg)) {
    out.push(makeTemplateCxRef(arg, sourceFile, binding.scssModulePath));
    return;
  }

  // 6a. Property access → variable ref with full expression text.
  if (ts.isPropertyAccessExpression(arg)) {
    const ref: VariableClassRef = {
      kind: "variable",
      origin: "cxCall",
      variableName: arg.getText(sourceFile),
      originRange: rangeOfNode(arg, sourceFile),
      scssModulePath: binding.scssModulePath,
    };
    out.push(ref);
    return;
  }

  // 6b. Bare identifier → variable ref.
  if (ts.isIdentifier(arg)) {
    const ref: VariableClassRef = {
      kind: "variable",
      origin: "cxCall",
      variableName: arg.text,
      originRange: rangeOfNode(arg, sourceFile),
      scssModulePath: binding.scssModulePath,
    };
    out.push(ref);
    return;
  }

  // 7. Array literal → recurse on each element.
  if (ts.isArrayLiteralExpression(arg)) {
    for (const el of arg.elements) {
      extractFromArgument(el, binding, sourceFile, out);
    }
    return;
  }

  // 8. Spread element → if inner is array literal, recurse.
  if (ts.isSpreadElement(arg) && ts.isArrayLiteralExpression(arg.expression)) {
    for (const el of arg.expression.elements) {
      extractFromArgument(el, binding, sourceFile, out);
    }
    return;
  }
}

// ── styles.className walker ───────────────────────────────────

function collectStyleAccessRefs(
  sourceFile: ts.SourceFile,
  stylesBindings: ReadonlyMap<string, string>,
  out: ClassRef[],
): void {
  function visit(node: ts.Node): void {
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      ts.isIdentifier(node.name)
    ) {
      const objName = node.expression.text;
      const scssPath = stylesBindings.get(objName);
      if (scssPath) {
        const propName = node.name;
        const start = sourceFile.getLineAndCharacterOfPosition(propName.getStart(sourceFile));
        const end = sourceFile.getLineAndCharacterOfPosition(propName.getEnd());
        const originRange: Range = {
          start: { line: start.line, character: start.character },
          end: { line: end.line, character: end.character },
        };
        const ref: StaticClassRef = {
          kind: "static",
          origin: "styleAccess",
          className: propName.text,
          originRange,
          scssModulePath: scssPath,
        };
        out.push(ref);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
}

// ── Builders ──────────────────────────────────────────────────

function makeStaticCxRef(
  className: string,
  originRange: Range,
  scssModulePath: string,
): StaticClassRef {
  return {
    kind: "static",
    origin: "cxCall",
    className,
    originRange,
    scssModulePath,
  };
}

function makeTemplateCxRef(
  expr: ts.TemplateExpression,
  sourceFile: ts.SourceFile,
  scssModulePath: string,
): TemplateClassRef {
  const rawTemplate = expr.getText(sourceFile);
  const staticPrefix = expr.head.text;
  return {
    kind: "template",
    origin: "cxCall",
    rawTemplate,
    staticPrefix,
    originRange: rangeOfNode(expr, sourceFile),
    scssModulePath,
  };
}

function rangeOfNode(node: ts.Node, sourceFile: ts.SourceFile): Range {
  const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
  return {
    start: { line: start.line, character: start.character },
    end: { line: end.line, character: end.character },
  };
}

function innerStringRange(
  node: ts.StringLiteral | ts.NoSubstitutionTemplateLiteral,
  sourceFile: ts.SourceFile,
): Range {
  const fullStart = node.getStart(sourceFile) + 1;
  const fullEnd = node.getEnd() - 1;
  const start = sourceFile.getLineAndCharacterOfPosition(fullStart);
  const end = sourceFile.getLineAndCharacterOfPosition(fullEnd);
  return {
    start: { line: start.line, character: start.character },
    end: { line: end.line, character: end.character },
  };
}
