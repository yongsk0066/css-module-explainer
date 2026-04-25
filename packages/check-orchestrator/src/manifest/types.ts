export type CheckScopeId =
  | "core"
  | "plugin"
  | "release"
  | "ts7"
  | "tsgo"
  | "rust"
  | "contract"
  | "editor"
  | "test"
  | "workspace"
  | "tooling";

export type CheckGateKind = "command" | "gate" | "bundle" | "alias";

export interface CheckGate {
  readonly id: string;
  readonly scriptName: string;
  readonly command: string;
  readonly scope: CheckScopeId;
  readonly kind: CheckGateKind;
  readonly referencedScripts: readonly string[];
}

export interface CheckBundle extends CheckGate {
  readonly kind: "bundle" | "alias";
}

export type CheckDiagnosticSeverity = "error" | "warning";

export interface CheckDiagnostic {
  readonly severity: CheckDiagnosticSeverity;
  readonly code: string;
  readonly message: string;
}

export interface CheckManifest {
  readonly rootDir: string;
  readonly gates: readonly CheckGate[];
  readonly bundles: readonly CheckBundle[];
  readonly diagnostics: readonly CheckDiagnostic[];
}

export interface CheckPlanStep {
  readonly id: string;
  readonly scriptName: string;
  readonly scope: CheckScopeId;
  readonly kind: CheckGateKind;
  readonly depth: number;
  readonly referencedScripts: readonly string[];
  readonly repeated: boolean;
  readonly cycle: boolean;
}

export interface CheckPlan {
  readonly target: CheckGate;
  readonly steps: readonly CheckPlanStep[];
}

export interface CheckAliasChain {
  readonly aliasId: string;
  readonly aliasScriptName: string;
  readonly referencedAliasId: string;
  readonly referencedAliasScriptName: string;
  readonly directTargetScripts: readonly string[];
}

export interface CheckBundleSurface {
  readonly id: string;
  readonly scriptName: string;
  readonly scope: CheckScopeId;
  readonly kind: CheckGateKind;
  readonly uniqueLeafCount: number;
  readonly totalStepCount: number;
  readonly repeatedStepCount: number;
  readonly maxDepth: number;
}

export interface CheckSurfaceReport {
  readonly totalGates: number;
  readonly gateCount: number;
  readonly bundleCount: number;
  readonly aliasCount: number;
  readonly commandCount: number;
  readonly aliasChains: readonly CheckAliasChain[];
  readonly largestBundles: readonly CheckBundleSurface[];
}

export interface RootPackageJson {
  readonly name?: string;
  readonly scripts?: Record<string, string>;
}
