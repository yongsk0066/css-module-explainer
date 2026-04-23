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
    env: {
      CME_TYPE_FACT_BACKEND: "typescript-current",
      CME_TYPECHECK_VARIANT: "typescript-current",
    },
  },
  {
    label: "tsgo",
    env: {
      CME_TYPE_FACT_BACKEND: "tsgo",
      CME_TYPECHECK_VARIANT: "tsgo",
    },
  },
] as const;

export const RUST_GATE_EVIDENCE_CORPUS: readonly RustGateEvidenceEntry[] = [
  {
    label: "release-batch",
    argv: ["check:release-batch"],
    variants: ["typescript-current", "tsgo"],
  },
  {
    label: "real-project-corpus",
    argv: ["check:real-project-corpus"],
    variants: ["typescript-current", "tsgo"],
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
    label: "rust-type-fact-compare",
    argv: ["check:rust-type-fact-compare"],
    variants: ["typescript-current"],
  },
  {
    label: "rust-query-plan-compare",
    argv: ["check:rust-query-plan-compare"],
    variants: ["typescript-current"],
  },
  {
    label: "rust-expression-domain-compare",
    argv: ["check:rust-expression-domain-compare"],
    variants: ["typescript-current"],
  },
  {
    label: "rust-expression-domain-fragments",
    argv: ["check:rust-expression-domain-fragments"],
    variants: ["typescript-current"],
  },
  {
    label: "rust-expression-domain-candidates",
    argv: ["check:rust-expression-domain-candidates"],
    variants: ["typescript-current"],
  },
  {
    label: "rust-expression-domain-canonical-candidate",
    argv: ["check:rust-expression-domain-canonical-candidate"],
    variants: ["typescript-current"],
  },
  {
    label: "rust-expression-domain-evaluator-candidates",
    argv: ["check:rust-expression-domain-evaluator-candidates"],
    variants: ["typescript-current"],
  },
  {
    label: "rust-expression-domain-canonical-producer",
    argv: ["check:rust-expression-domain-canonical-producer"],
    variants: ["typescript-current"],
  },
  {
    label: "rust-expression-semantics-fragments",
    argv: ["check:rust-expression-semantics-fragments"],
    variants: ["typescript-current"],
  },
  {
    label: "rust-expression-semantics-candidates",
    argv: ["check:rust-expression-semantics-candidates"],
    variants: ["typescript-current"],
  },
  {
    label: "rust-expression-semantics-query-fragments",
    argv: ["check:rust-expression-semantics-query-fragments"],
    variants: ["typescript-current"],
  },
  {
    label: "rust-expression-semantics-match-fragments",
    argv: ["check:rust-expression-semantics-match-fragments"],
    variants: ["typescript-current"],
  },
  {
    label: "rust-expression-semantics-canonical-candidate",
    argv: ["check:rust-expression-semantics-canonical-candidate"],
    variants: ["typescript-current"],
  },
  {
    label: "rust-expression-semantics-evaluator-candidates",
    argv: ["check:rust-expression-semantics-evaluator-candidates"],
    variants: ["typescript-current"],
  },
  {
    label: "rust-expression-semantics-canonical-producer",
    argv: ["check:rust-expression-semantics-canonical-producer"],
    variants: ["typescript-current"],
  },
  {
    label: "rust-source-side-canonical-candidate",
    argv: ["check:rust-source-side-canonical-candidate"],
    variants: ["typescript-current"],
  },
  {
    label: "rust-source-side-evaluator-candidates",
    argv: ["check:rust-source-side-evaluator-candidates"],
    variants: ["typescript-current"],
  },
  {
    label: "rust-source-side-canonical-producer",
    argv: ["check:rust-source-side-canonical-producer"],
    variants: ["typescript-current"],
  },
  {
    label: "rust-semantic-canonical-candidate",
    argv: ["check:rust-semantic-canonical-candidate"],
    variants: ["typescript-current"],
  },
  {
    label: "rust-semantic-evaluator-candidates",
    argv: ["check:rust-semantic-evaluator-candidates"],
    variants: ["typescript-current"],
  },
  {
    label: "rust-semantic-canonical-producer",
    argv: ["check:rust-semantic-canonical-producer"],
    variants: ["typescript-current"],
  },
  {
    label: "rust-source-resolution-fragments",
    argv: ["check:rust-source-resolution-fragments"],
    variants: ["typescript-current"],
  },
  {
    label: "rust-source-resolution-candidates",
    argv: ["check:rust-source-resolution-candidates"],
    variants: ["typescript-current"],
  },
  {
    label: "rust-source-resolution-evaluator-candidates",
    argv: ["check:rust-source-resolution-evaluator-candidates"],
    variants: ["typescript-current"],
  },
  {
    label: "rust-source-resolution-match-fragments",
    argv: ["check:rust-source-resolution-match-fragments"],
    variants: ["typescript-current"],
  },
  {
    label: "rust-source-resolution-canonical-candidate",
    argv: ["check:rust-source-resolution-canonical-candidate"],
    variants: ["typescript-current"],
  },
  {
    label: "rust-source-resolution-canonical-producer",
    argv: ["check:rust-source-resolution-canonical-producer"],
    variants: ["typescript-current"],
  },
  {
    label: "rust-source-resolution-query-fragments",
    argv: ["check:rust-source-resolution-query-fragments"],
    variants: ["typescript-current"],
  },
  {
    label: "rust-selector-usage-plan-compare",
    argv: ["check:rust-selector-usage-plan-compare"],
    variants: ["typescript-current"],
  },
  {
    label: "rust-selector-usage-fragments",
    argv: ["check:rust-selector-usage-fragments"],
    variants: ["typescript-current"],
  },
  {
    label: "rust-selector-usage-query-fragments",
    argv: ["check:rust-selector-usage-query-fragments"],
    variants: ["typescript-current"],
  },
  {
    label: "rust-source-resolution-plan-compare",
    argv: ["check:rust-source-resolution-plan-compare"],
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
    variants: ["typescript-current", "tsgo"],
  },
  {
    label: "type-fact-backend-parity",
    argv: ["check:type-fact-backend-parity"],
    variants: ["typescript-current"],
  },
] as const;
