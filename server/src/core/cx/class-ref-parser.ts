import ts from "typescript";
import type { CxBinding, Range, StyleImport } from "@css-module-explainer/shared";
import {
  makeLiteralClassExpression,
  makeStyleAccessClassExpression,
  makeSymbolRefClassExpression,
  makeTemplateClassExpression,
  type ClassExpressionHIR,
} from "../hir/source-types";

/**
 * Unified source-expression producer.
 *
 * Single AST walk that emits `ClassExpressionHIR[]` covering both
 * cx() call arguments and direct `styles.x` access. Each cx() call
 * produces entries with `origin: "cxCall"`; each `styles.x`
 * access produces a `styleAccess` expression.
 */
export function parseClassExpressions(
  sourceFile: ts.SourceFile,
  bindings: readonly CxBinding[],
  stylesBindings: ReadonlyMap<string, StyleImport>,
): ClassExpressionHIR[] {
  const expressions: ClassExpressionHIR[] = [];
  let nextId = 0;
  const allocateId = () => `class-expr:${nextId++}`;

  for (const binding of bindings) {
    collectCxCallExpressions(sourceFile, binding, expressions, allocateId);
  }

  if (stylesBindings.size > 0) {
    collectStyleAccessExpressions(sourceFile, stylesBindings, expressions, allocateId);
  }

  return expressions;
}

function collectCxCallExpressions(
  sourceFile: ts.SourceFile,
  binding: CxBinding,
  out: ClassExpressionHIR[],
  allocateId: () => string,
): void {
  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node) && isMatchingCxCall(node, binding, sourceFile)) {
      for (const arg of node.arguments) {
        extractFromArgument(arg, binding, sourceFile, out, allocateId);
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
  out: ClassExpressionHIR[],
  allocateId: () => string,
): void {
  if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) {
    out.push(
      makeLiteralClassExpression(
        allocateId(),
        "cxCall",
        binding.scssModulePath,
        arg.text,
        innerStringRange(arg, sourceFile),
      ),
    );
    return;
  }

  if (ts.isObjectLiteralExpression(arg)) {
    extractObjectLiteral(arg, binding, sourceFile, out, allocateId);
    return;
  }

  if (
    ts.isBinaryExpression(arg) &&
    arg.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
  ) {
    extractFromArgument(arg.right, binding, sourceFile, out, allocateId);
    return;
  }

  if (ts.isConditionalExpression(arg)) {
    extractFromArgument(arg.whenTrue, binding, sourceFile, out, allocateId);
    extractFromArgument(arg.whenFalse, binding, sourceFile, out, allocateId);
    return;
  }

  if (ts.isTemplateExpression(arg)) {
    out.push(
      makeTemplateClassExpression(
        allocateId(),
        "cxCall",
        binding.scssModulePath,
        arg.getText(sourceFile),
        arg.head.text,
        rangeOfNode(arg, sourceFile),
      ),
    );
    return;
  }

  if (ts.isPropertyAccessExpression(arg) || ts.isIdentifier(arg)) {
    const rawReference = ts.isIdentifier(arg) ? arg.text : arg.getText(sourceFile);
    const [rootName, ...pathSegments] = rawReference.split(".");
    out.push(
      makeSymbolRefClassExpression(
        allocateId(),
        "cxCall",
        binding.scssModulePath,
        rawReference,
        rootName ?? rawReference,
        pathSegments,
        rangeOfNode(arg, sourceFile),
      ),
    );
    return;
  }

  if (ts.isArrayLiteralExpression(arg)) {
    for (const el of arg.elements) {
      extractFromArgument(el, binding, sourceFile, out, allocateId);
    }
    return;
  }

  if (ts.isSpreadElement(arg) && ts.isArrayLiteralExpression(arg.expression)) {
    for (const el of arg.expression.elements) {
      extractFromArgument(el, binding, sourceFile, out, allocateId);
    }
  }
}

function extractObjectLiteral(
  arg: ts.ObjectLiteralExpression,
  binding: CxBinding,
  sourceFile: ts.SourceFile,
  out: ClassExpressionHIR[],
  allocateId: () => string,
): void {
  for (const prop of arg.properties) {
    if (!ts.isPropertyAssignment(prop) && !ts.isShorthandPropertyAssignment(prop)) {
      continue;
    }

    const name = prop.name;
    if (!name) continue;

    if (ts.isIdentifier(name)) {
      out.push(
        makeLiteralClassExpression(
          allocateId(),
          "cxCall",
          binding.scssModulePath,
          name.text,
          rangeOfNode(name, sourceFile),
        ),
      );
    } else if (ts.isStringLiteral(name)) {
      out.push(
        makeLiteralClassExpression(
          allocateId(),
          "cxCall",
          binding.scssModulePath,
          name.text,
          innerStringRange(name, sourceFile),
        ),
      );
    }
  }
}

function collectStyleAccessExpressions(
  sourceFile: ts.SourceFile,
  stylesBindings: ReadonlyMap<string, StyleImport>,
  out: ClassExpressionHIR[],
  allocateId: () => string,
): void {
  function visit(node: ts.Node): void {
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      ts.isIdentifier(node.name)
    ) {
      const styleImport = stylesBindings.get(node.expression.text);
      if (styleImport) {
        const propName = node.name;
        const start = sourceFile.getLineAndCharacterOfPosition(propName.getStart(sourceFile));
        const end = sourceFile.getLineAndCharacterOfPosition(propName.getEnd());
        out.push(
          makeStyleAccessClassExpression(
            allocateId(),
            styleImport.absolutePath,
            propName.text,
            [propName.text],
            {
              start: { line: start.line, character: start.character },
              end: { line: end.line, character: end.character },
            },
          ),
        );
      }
    }

    if (
      ts.isElementAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      ts.isStringLiteral(node.argumentExpression)
    ) {
      const styleImport = stylesBindings.get(node.expression.text);
      if (styleImport) {
        const className = node.argumentExpression.text;
        out.push(
          makeStyleAccessClassExpression(
            allocateId(),
            styleImport.absolutePath,
            className,
            [className],
            innerStringRange(node.argumentExpression, sourceFile),
          ),
        );
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
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
  const startPos = node.getStart(sourceFile) + 1;
  const endPos = node.getEnd() - 1;
  const start = sourceFile.getLineAndCharacterOfPosition(startPos);
  const end = sourceFile.getLineAndCharacterOfPosition(endPos);
  return {
    start: { line: start.line, character: start.character },
    end: { line: end.line, character: end.character },
  };
}
