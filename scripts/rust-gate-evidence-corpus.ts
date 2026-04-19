export interface RustGateEvidenceEntry {
  readonly label: string;
  readonly argv: readonly string[];
  readonly variants?: readonly string[];
}

export interface RustGateEvidenceVariant {
  readonly label: string;
  readonly env?: Readonly<Record<string, string>>;
}

export const RUST_GATE_EVIDENCE_VARIANTS: readonly RustGateEvidenceVariant[] = [
  {
    label: "typescript-current",
  },
  {
    label: "tsgo-preview",
    env: {
      CME_TYPE_FACT_BACKEND: "tsgo-preview",
      CME_TYPECHECK_VARIANT: "tsgo-preview",
    },
  },
] as const;

export const RUST_GATE_EVIDENCE_CORPUS: readonly RustGateEvidenceEntry[] = [
  {
    label: "release-batch",
    argv: ["check:release-batch"],
    variants: ["typescript-current", "tsgo-preview"],
  },
  {
    label: "real-project-corpus",
    argv: ["check:real-project-corpus"],
    variants: ["typescript-current", "tsgo-preview"],
  },
  {
    label: "lsp-server-smoke",
    argv: ["check:lsp-server-smoke"],
    variants: ["typescript-current"],
  },
  {
    label: "eslint-plugin-smoke",
    argv: ["check:eslint-plugin-smoke"],
    variants: ["typescript-current"],
  },
  {
    label: "stylelint-plugin-smoke",
    argv: ["check:stylelint-plugin-smoke"],
    variants: ["typescript-current"],
  },
  {
    label: "contract-parity-v2-smoke",
    argv: ["check:contract-parity-v2-smoke"],
    variants: ["typescript-current"],
  },
  {
    label: "rust-shadow-smoke",
    argv: ["check:rust-shadow-smoke"],
    variants: ["typescript-current"],
  },
  {
    label: "rust-shadow-compare",
    argv: ["check:rust-shadow-compare"],
    variants: ["typescript-current"],
  },
  {
    label: "backend-typecheck-smoke",
    argv: ["check:backend-typecheck-smoke"],
    variants: ["typescript-current", "tsgo-preview"],
  },
  {
    label: "type-fact-backend-parity",
    argv: ["check:type-fact-backend-parity"],
    variants: ["typescript-current"],
  },
] as const;
