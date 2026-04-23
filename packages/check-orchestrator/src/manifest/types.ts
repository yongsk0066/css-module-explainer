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

export interface RootPackageJson {
  readonly name?: string;
  readonly scripts?: Record<string, string>;
}
