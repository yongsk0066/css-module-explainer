import ts from "typescript";
import type { Range, StylePropertyRef } from "@css-module-explainer/shared";

/**
 * Walk the AST for `styles.className` property access patterns.
 *
 * Given a map of style-import identifiers → resolved SCSS paths
 * (from binding-detector's import scan), finds every
 * `PropertyAccessExpression` where the object is one of those
 * identifiers and the property name is a plain Identifier.
 *
 * Returns one `StylePropertyRef` per access site. These are
 * independent of the cx() pipeline — no CxBinding, no .bind().
 */
export function parseStylePropertyAccesses(
  sourceFile: ts.SourceFile,
  stylesBindings: ReadonlyMap<string, string>,
): StylePropertyRef[] {
  if (stylesBindings.size === 0) return [];

  const refs: StylePropertyRef[] = [];

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
        refs.push({
          kind: "style-access",
          className: propName.text,
          scssModulePath: scssPath,
          stylesVarName: objName,
          originRange,
        });
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return refs;
}
