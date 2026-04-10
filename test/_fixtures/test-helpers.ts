import type { CallSite, SelectorInfo } from "@css-module-explainer/shared";

/** Create a minimal SelectorInfo for testing. */
export function info(name: string, line: number): SelectorInfo {
  return {
    name,
    range: { start: { line, character: 1 }, end: { line, character: 1 + name.length } },
    fullSelector: `.${name}`,
    declarations: "color: red",
    ruleRange: { start: { line, character: 0 }, end: { line: line + 2, character: 1 } },
  };
}

/** Create a minimal static CallSite for testing. */
export function siteAt(
  uri: string,
  className: string,
  line: number,
  scssPath: string = "/fake/a.module.scss",
): CallSite {
  return {
    uri,
    range: { start: { line, character: 10 }, end: { line, character: 10 + className.length } },
    binding: {
      cxVarName: "cx",
      stylesVarName: "styles",
      scssModulePath: scssPath,
      classNamesImportName: "classNames",
      scope: { startLine: 0, endLine: 100 },
    },
    match: { kind: "static" as const, className },
  };
}
