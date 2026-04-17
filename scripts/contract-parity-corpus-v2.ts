import path from "node:path";
import type { ContractParityEntry } from "./contract-parity-corpus";

const workspaceRoot = process.cwd();

export const CONTRACT_PARITY_CORPUS_V2: readonly ContractParityEntry[] = [
  {
    label: "type-fact-parity-v2",
    contractVersion: "2",
    workspace: {
      workspaceRoot,
      sourceFilePaths: [
        path.join(workspaceRoot, "test/_fixtures/contract-parity/TypeFactParity.tsx"),
      ],
      styleFilePaths: [
        path.join(workspaceRoot, "test/_fixtures/contract-parity/TypeFactParity.module.scss"),
      ],
    },
    filters: {
      preset: "changed-source",
      category: "source",
      severity: "all",
      includeBundles: ["source-missing"],
      includeCodes: [],
      excludeCodes: [],
    },
  },
  {
    label: "source-prefix-suffix-parity-v2",
    contractVersion: "2",
    workspace: {
      workspaceRoot,
      sourceFilePaths: [
        path.join(workspaceRoot, "test/_fixtures/contract-parity/SourcePrefixSuffixParity.tsx"),
      ],
      styleFilePaths: [
        path.join(
          workspaceRoot,
          "test/_fixtures/contract-parity/SourcePrefixSuffixParity.module.scss",
        ),
      ],
    },
    filters: {
      preset: "changed-source",
      category: "source",
      severity: "all",
      includeBundles: ["source-missing"],
      includeCodes: [],
      excludeCodes: [],
    },
  },
  {
    label: "source-char-inclusion-parity-v2",
    contractVersion: "2",
    workspace: {
      workspaceRoot,
      sourceFilePaths: [
        path.join(workspaceRoot, "test/_fixtures/contract-parity/SourceCharInclusionParity.tsx"),
      ],
      styleFilePaths: [
        path.join(
          workspaceRoot,
          "test/_fixtures/contract-parity/SourceCharInclusionParity.module.scss",
        ),
      ],
    },
    filters: {
      preset: "changed-source",
      category: "source",
      severity: "all",
      includeBundles: ["source-missing"],
      includeCodes: [],
      excludeCodes: [],
    },
  },
] as const;
