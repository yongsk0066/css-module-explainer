export interface RustGateEvidenceEntry {
  readonly label: string;
  readonly argv: readonly string[];
}

export interface RustGateEvidenceVariant {
  readonly label: string;
  readonly env?: Readonly<Record<string, string>>;
}

export const RUST_GATE_EVIDENCE_VARIANTS: readonly RustGateEvidenceVariant[] = [
  {
    label: "typescript-current",
  },
] as const;

export const RUST_GATE_EVIDENCE_CORPUS: readonly RustGateEvidenceEntry[] = [
  {
    label: "release-batch",
    argv: ["check:release-batch"],
  },
  {
    label: "real-project-corpus",
    argv: ["check:real-project-corpus"],
  },
  {
    label: "lsp-server-smoke",
    argv: ["check:lsp-server-smoke"],
  },
  {
    label: "eslint-plugin-smoke",
    argv: ["check:eslint-plugin-smoke"],
  },
  {
    label: "stylelint-plugin-smoke",
    argv: ["check:stylelint-plugin-smoke"],
  },
  {
    label: "contract-parity-v2-smoke",
    argv: ["check:contract-parity-v2-smoke"],
  },
] as const;
