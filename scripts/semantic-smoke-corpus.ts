export interface SemanticSmokeEntry {
  readonly label: string;
  readonly argv: readonly string[];
}

export const SEMANTIC_SMOKE_CORPUS: readonly SemanticSmokeEntry[] = [
  {
    label: "workspace-ci",
    argv: [".", "--preset", "ci", "--fail-on", "none"],
  },
  {
    label: "changed-source-shadowing",
    argv: [
      ".",
      "--preset",
      "changed-source",
      "--changed-file",
      "examples/src/scenarios/13-shadowing/ShadowingScenario.tsx",
      "--fail-on",
      "none",
    ],
  },
  {
    label: "changed-style-composes",
    argv: [
      ".",
      "--preset",
      "changed-style",
      "--changed-file",
      "test/_fixtures/semantic-smoke/ComposesSmoke.module.scss",
      "--include-bundle",
      "style-recovery",
      "--fail-on",
      "none",
    ],
  },
  {
    label: "changed-style-value-imports",
    argv: [
      ".",
      "--preset",
      "changed-style",
      "--changed-file",
      "test/_fixtures/semantic-smoke/ValueSmoke.module.scss",
      "--include-bundle",
      "style-recovery",
      "--fail-on",
      "none",
    ],
  },
  {
    label: "changed-style-keyframes",
    argv: [
      ".",
      "--preset",
      "changed-style",
      "--changed-file",
      "test/_fixtures/semantic-smoke/KeyframesSmoke.module.scss",
      "--include-bundle",
      "style-recovery",
      "--fail-on",
      "none",
    ],
  },
  {
    label: "changed-style-less-module",
    argv: [
      ".",
      "--preset",
      "changed-style",
      "--changed-file",
      "examples/src/scenarios/18-less-module/LessModule.module.less",
      "--include-bundle",
      "style-recovery",
      "--fail-on",
      "none",
    ],
  },
] as const;
