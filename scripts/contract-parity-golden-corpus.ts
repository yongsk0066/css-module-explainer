import path from "node:path";
import type { ContractParityEntry } from "./contract-parity-corpus";

const workspaceRoot = process.cwd();

export const CONTRACT_PARITY_GOLDEN_CORPUS: readonly ContractParityEntry[] = [
  {
    label: "type-fact-parity",
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
    label: "source-flow-parity",
    workspace: {
      workspaceRoot,
      sourceFilePaths: [
        path.join(workspaceRoot, "test/_fixtures/contract-parity/SourceFlowParity.tsx"),
      ],
      styleFilePaths: [
        path.join(workspaceRoot, "test/_fixtures/contract-parity/SourceFlowParity.module.scss"),
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
    label: "style-composes-parity",
    workspace: {
      workspaceRoot,
      sourceFilePaths: [],
      styleFilePaths: [
        path.join(workspaceRoot, "test/_fixtures/semantic-smoke/ComposesSmoke.module.scss"),
      ],
    },
    filters: {
      preset: "changed-style",
      category: "style",
      severity: "all",
      includeBundles: ["style-recovery"],
      includeCodes: [],
      excludeCodes: [],
    },
  },
  {
    label: "style-value-imports-parity",
    workspace: {
      workspaceRoot,
      sourceFilePaths: [],
      styleFilePaths: [
        path.join(workspaceRoot, "test/_fixtures/semantic-smoke/ValueSmoke.module.scss"),
      ],
    },
    filters: {
      preset: "changed-style",
      category: "style",
      severity: "all",
      includeBundles: ["style-recovery"],
      includeCodes: [],
      excludeCodes: [],
    },
  },
  {
    label: "style-keyframes-parity",
    workspace: {
      workspaceRoot,
      sourceFilePaths: [],
      styleFilePaths: [
        path.join(workspaceRoot, "test/_fixtures/semantic-smoke/KeyframesSmoke.module.scss"),
      ],
    },
    filters: {
      preset: "changed-style",
      category: "style",
      severity: "all",
      includeBundles: ["style-recovery"],
      includeCodes: [],
      excludeCodes: [],
    },
  },
  {
    label: "style-less-parity",
    workspace: {
      workspaceRoot,
      sourceFilePaths: [],
      styleFilePaths: [
        path.join(workspaceRoot, "examples/src/scenarios/18-less-module/LessModule.module.less"),
      ],
    },
    filters: {
      preset: "changed-style",
      category: "style",
      severity: "all",
      includeBundles: ["style-recovery"],
      includeCodes: [],
      excludeCodes: [],
    },
  },
] as const;
