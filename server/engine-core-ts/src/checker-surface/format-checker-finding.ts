import { messageForInvalidClassFinding } from "../core/query";
import type { CheckerFinding } from "../core/checker/contracts";

export function formatCheckerFinding(finding: CheckerFinding, workspaceRoot: string): string {
  switch (finding.code) {
    case "missing-module":
      return `Cannot resolve CSS Module '${finding.specifier}'. The file does not exist.`;
    case "missing-static-class": {
      const hint = finding.suggestion ? ` Did you mean '${finding.suggestion}'?` : "";
      return `Class '.${finding.className}' not found in ${relativePath(
        finding.scssModulePath,
        workspaceRoot,
      )}.${hint}`;
    }
    case "missing-template-prefix":
      return `No class starting with '${finding.staticPrefix}' found in ${relativePath(
        finding.scssModulePath,
        workspaceRoot,
      )}.`;
    case "missing-resolved-class-values":
      return messageForInvalidClassFinding({
        kind: "missingResolvedClassValues",
        expression: null as never,
        range: finding.range,
        missingValues: finding.missingValues,
        abstractValue: finding.abstractValue,
        valueCertainty: finding.valueCertainty,
        selectorCertainty: finding.selectorCertainty,
        reason: finding.reason,
      });
    case "missing-resolved-class-domain":
      return messageForInvalidClassFinding({
        kind: "missingResolvedClassDomain",
        expression: null as never,
        range: finding.range,
        abstractValue: finding.abstractValue,
        valueCertainty: finding.valueCertainty,
        selectorCertainty: finding.selectorCertainty,
        reason: finding.reason,
      });
    case "unused-selector":
      return `Selector '.${finding.canonicalName}' is declared but never used.`;
    case "missing-composed-module":
      return `Cannot resolve composed CSS Module '${finding.fromSpecifier ?? "."}'.`;
    case "missing-composed-selector":
      if (finding.fromSpecifier) {
        return `Selector '.${finding.className}' not found in composed module '${finding.fromSpecifier}'.`;
      }
      return `Selector '.${finding.className}' not found in this file for composes.`;
    case "missing-value-module":
      return `Cannot resolve imported @value module '${finding.fromSpecifier}'.`;
    case "missing-imported-value":
      if (finding.localName === finding.importedName) {
        return `@value '${finding.importedName}' not found in '${finding.fromSpecifier}'.`;
      }
      return `@value '${finding.importedName}' not found in '${finding.fromSpecifier}' for local binding '${finding.localName}'.`;
    case "missing-keyframes":
      return `@keyframes '${finding.animationName}' not found in this file.`;
    case "missing-custom-property":
      return `CSS custom property '${finding.propertyName}' not found in indexed style tokens.`;
    case "missing-sass-symbol":
      return `${formatSassSymbolLabel(
        finding.symbolKind,
        finding.symbolName,
        finding.symbolSyntax,
      )} not found in this file.`;
    default:
      finding satisfies never;
      return "";
  }
}

function formatSassSymbolLabel(
  kind: "variable" | "mixin" | "function",
  name: string,
  syntax: "sass" | "less" = "sass",
): string {
  if (syntax === "less") return `Less variable '@${name}'`;
  switch (kind) {
    case "variable":
      return `Sass variable '$${name}'`;
    case "mixin":
      return `Sass mixin '@mixin ${name}'`;
    case "function":
      return `Sass function '${name}()'`;
  }
}

function relativePath(filePath: string, workspaceRoot: string): string {
  if (filePath.startsWith(workspaceRoot)) {
    return filePath.slice(workspaceRoot.length + 1) || filePath;
  }
  return filePath;
}
