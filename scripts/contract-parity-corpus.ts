import type {
  WorkspaceCheckCommandFilters,
  WorkspaceCheckOptions,
} from "../server/engine-host-node/src/checker-host";

export interface ContractParityEntry {
  readonly label: string;
  readonly contractVersion?: "1" | "2";
  readonly workspace: WorkspaceCheckOptions;
  readonly filters: WorkspaceCheckCommandFilters;
}

export const CONTRACT_PARITY_CORPUS: readonly ContractParityEntry[] = [
  {
    label: "workspace-ci",
    workspace: {
      workspaceRoot: process.cwd(),
    },
    filters: {
      preset: "ci",
      category: "all",
      severity: "all",
      includeBundles: ["ci-default"],
      includeCodes: [],
      excludeCodes: [],
    },
  },
  {
    label: "changed-source-shadowing",
    workspace: {
      workspaceRoot: process.cwd(),
      styleFilePaths: [],
      sourceFilePaths: ["examples/src/scenarios/13-shadowing/ShadowingScenario.tsx"].map(
        (file) => `${process.cwd()}/${file}`,
      ),
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
    label: "changed-style-composes",
    workspace: {
      workspaceRoot: process.cwd(),
      sourceFilePaths: [],
      styleFilePaths: ["test/_fixtures/semantic-smoke/ComposesSmoke.module.scss"].map(
        (file) => `${process.cwd()}/${file}`,
      ),
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
    label: "changed-style-value-imports",
    workspace: {
      workspaceRoot: process.cwd(),
      sourceFilePaths: [],
      styleFilePaths: ["test/_fixtures/semantic-smoke/ValueSmoke.module.scss"].map(
        (file) => `${process.cwd()}/${file}`,
      ),
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
    label: "changed-style-keyframes",
    workspace: {
      workspaceRoot: process.cwd(),
      sourceFilePaths: [],
      styleFilePaths: ["test/_fixtures/semantic-smoke/KeyframesSmoke.module.scss"].map(
        (file) => `${process.cwd()}/${file}`,
      ),
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
    label: "changed-style-less-module",
    workspace: {
      workspaceRoot: process.cwd(),
      sourceFilePaths: [],
      styleFilePaths: ["examples/src/scenarios/18-less-module/LessModule.module.less"].map(
        (file) => `${process.cwd()}/${file}`,
      ),
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
