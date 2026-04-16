import type { Range } from "@css-module-explainer/shared";
import type { FlowResolution } from "../flow/lattice";

export type CheckerSeverity = "warning" | "hint";

export type CheckerFinding = SourceCheckerFinding | StyleCheckerFinding;

export interface WorkspaceCheckerFinding {
  readonly filePath: string;
  readonly finding: CheckerFinding;
}

export interface CheckerReportJsonFinding {
  readonly filePath: string;
  readonly category: CheckerFinding["category"];
  readonly code: CheckerFinding["code"];
  readonly severity: CheckerFinding["severity"];
  readonly range: CheckerFinding["range"];
  readonly message: string;
}

export interface CheckerReportJsonV1 {
  readonly schemaVersion: "1";
  readonly tool: "css-module-explainer/checker";
  readonly workspaceRoot: string;
  readonly filters: {
    readonly preset: "ci" | "changed-style" | "changed-source" | null;
    readonly category: CheckerFinding["category"] | "all";
    readonly severity: CheckerSeverity | "all";
    readonly includeCodes: readonly string[];
    readonly excludeCodes: readonly string[];
  };
  readonly sourceFiles: readonly string[];
  readonly styleFiles: readonly string[];
  readonly summary: {
    readonly warnings: number;
    readonly hints: number;
    readonly total: number;
  };
  readonly findings: readonly CheckerReportJsonFinding[];
}

export type SourceCheckerFinding =
  | {
      readonly category: "source";
      readonly code: "missing-module";
      readonly severity: "warning";
      readonly range: Range;
      readonly specifier: string;
      readonly absolutePath: string;
    }
  | {
      readonly category: "source";
      readonly code: "missing-static-class";
      readonly severity: "warning";
      readonly range: Range;
      readonly scssModulePath: string;
      readonly className: string;
      readonly suggestion?: string;
    }
  | {
      readonly category: "source";
      readonly code: "missing-template-prefix";
      readonly severity: "warning";
      readonly range: Range;
      readonly scssModulePath: string;
      readonly staticPrefix: string;
    }
  | {
      readonly category: "source";
      readonly code: "missing-resolved-class-values";
      readonly severity: "warning";
      readonly range: Range;
      readonly scssModulePath: string;
      readonly missingValues: readonly string[];
      readonly abstractValue: FlowResolution["abstractValue"];
      readonly valueCertainty: "exact" | "inferred" | "possible";
      readonly selectorCertainty: "exact" | "inferred" | "possible";
      readonly reason: "flowLiteral" | "flowBranch" | "typeUnion";
    }
  | {
      readonly category: "source";
      readonly code: "missing-resolved-class-domain";
      readonly severity: "warning";
      readonly range: Range;
      readonly scssModulePath: string;
      readonly abstractValue: FlowResolution["abstractValue"];
      readonly valueCertainty: "exact" | "inferred" | "possible";
      readonly selectorCertainty: "exact" | "inferred" | "possible";
      readonly reason: "flowLiteral" | "flowBranch" | "typeUnion";
    };

export type StyleCheckerFinding =
  | {
      readonly category: "style";
      readonly code: "unused-selector";
      readonly severity: "hint";
      readonly range: Range;
      readonly selectorFilePath: string;
      readonly canonicalName: string;
    }
  | {
      readonly category: "style";
      readonly code: "missing-composed-module";
      readonly severity: "warning";
      readonly range: Range;
      readonly selectorFilePath: string;
      readonly fromSpecifier?: string;
      readonly targetFilePath: string;
    }
  | {
      readonly category: "style";
      readonly code: "missing-composed-selector";
      readonly severity: "warning";
      readonly range: Range;
      readonly selectorFilePath: string;
      readonly fromSpecifier?: string;
      readonly targetFilePath: string;
      readonly className: string;
    }
  | {
      readonly category: "style";
      readonly code: "missing-value-module";
      readonly severity: "warning";
      readonly range: Range;
      readonly selectorFilePath: string;
      readonly fromSpecifier: string;
      readonly targetFilePath: string;
    }
  | {
      readonly category: "style";
      readonly code: "missing-imported-value";
      readonly severity: "warning";
      readonly range: Range;
      readonly selectorFilePath: string;
      readonly fromSpecifier: string;
      readonly targetFilePath: string;
      readonly importedName: string;
      readonly localName: string;
    }
  | {
      readonly category: "style";
      readonly code: "missing-keyframes";
      readonly severity: "warning";
      readonly range: Range;
      readonly selectorFilePath: string;
      readonly animationName: string;
    };
