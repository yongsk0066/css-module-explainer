import ts from "typescript";
import type {
  CxBinding,
  CxCallInfo,
  Range,
  StaticClassCall,
  TemplateLiteralCall,
} from "@css-module-explainer/shared";

/**
 * Walk a source file for every `cxVarName(...)` call that lies
 * inside `binding.scope` and return a discriminated-union list of
 * extracted class references.
 *
 * Arguments are dispatched per AST node shape:
 *
 *   StringLiteral / NoSubstitutionTemplateLiteral → static
 *   ObjectLiteralExpression key names             → static[]
 *   BinaryExpression(&&) / ConditionalExpression  → recurse on branches
 *   TemplateExpression                            → template (with staticPrefix)
 *   Identifier                                    → variable
 *   ArrayLiteralExpression                        → recurse on elements
 *   SpreadElement(ArrayLiteral)                   → recurse on elements
 *   Anything else                                 → skip
 *
 * Multi-line calls fall out of AST handling for free; the walker
 * never sees a line boundary.
 */
export function parseCxCalls(sourceFile: ts.SourceFile, binding: CxBinding): CxCallInfo[] {
  const calls: CxCallInfo[] = [];

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node) && isMatchingCxCall(node, binding, sourceFile)) {
      for (const arg of node.arguments) {
        extractFromArgument(arg, binding, sourceFile, calls);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return calls;
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
  out: CxCallInfo[],
): void {
  // 1. String literal or no-substitution template → static
  if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) {
    out.push(makeStatic(arg.text, innerStringRange(arg, sourceFile), binding));
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
        out.push(makeStatic(name.text, rangeOfNode(name, sourceFile), binding));
      } else if (ts.isStringLiteral(name)) {
        out.push(makeStatic(name.text, innerStringRange(name, sourceFile), binding));
      }
      // Intentional: computed-property keys (`{ [dynamicKey]: x }`)
      // and numeric literal keys cannot be resolved to a class name
      // at static analysis time, so they are skipped without
      // warning. A future Phase could emit a diagnostic for these.
    }
    return;
  }

  // 3. Logical && → recurse on the right branch only (left is the condition).
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

  // 5. Template literal with substitutions → one template call.
  if (ts.isTemplateExpression(arg)) {
    out.push(makeTemplate(arg, sourceFile, binding));
    return;
  }

  // 6. Identifier → one variable call. Intentional: PropertyAccess
  // (e.g. `cx(props.variant)`) is NOT captured as a variable
  // reference because we cannot resolve a property path against a
  // string-literal union type without more TS Compiler API work.
  // Such calls are silently skipped until Phase 4's type-resolver
  // can weigh in.
  if (ts.isIdentifier(arg)) {
    out.push({
      kind: "variable",
      variableName: arg.text,
      originRange: rangeOfNode(arg, sourceFile),
      binding,
    });
    return;
  }

  // 7. Array literal → recurse on each element.
  if (ts.isArrayLiteralExpression(arg)) {
    for (const el of arg.elements) {
      extractFromArgument(el, binding, sourceFile, out);
    }
    return;
  }

  // 8. Spread element → if inner is array literal, recurse; else skip.
  if (ts.isSpreadElement(arg) && ts.isArrayLiteralExpression(arg.expression)) {
    for (const el of arg.expression.elements) {
      extractFromArgument(el, binding, sourceFile, out);
    }
    return;
  }
}

function makeStatic(className: string, originRange: Range, binding: CxBinding): StaticClassCall {
  return { kind: "static", className, originRange, binding };
}

function makeTemplate(
  expr: ts.TemplateExpression,
  sourceFile: ts.SourceFile,
  binding: CxBinding,
): TemplateLiteralCall {
  const rawTemplate = expr.getText(sourceFile);
  const staticPrefix = expr.head.text;
  return {
    kind: "template",
    rawTemplate,
    staticPrefix,
    originRange: rangeOfNode(expr, sourceFile),
    binding,
  };
}

/**
 * Range of a node that is a whole expression (ternary, identifier,
 * template, array literal, etc.). Includes the node's full text span.
 */
function rangeOfNode(node: ts.Node, sourceFile: ts.SourceFile): Range {
  const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
  return {
    start: { line: start.line, character: start.character },
    end: { line: end.line, character: end.character },
  };
}

/**
 * Range of a string literal or no-substitution template literal
 * **excluding** its surrounding quote characters, so LSP highlights
 * land on the raw class-name text.
 */
function innerStringRange(
  node: ts.StringLiteral | ts.NoSubstitutionTemplateLiteral,
  sourceFile: ts.SourceFile,
): Range {
  const fullStart = node.getStart(sourceFile) + 1; // skip opening quote
  const fullEnd = node.getEnd() - 1; // skip closing quote
  const start = sourceFile.getLineAndCharacterOfPosition(fullStart);
  const end = sourceFile.getLineAndCharacterOfPosition(fullEnd);
  return {
    start: { line: start.line, character: start.character },
    end: { line: end.line, character: end.character },
  };
}
