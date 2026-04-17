export interface ReleaseBatchCorpusEntry {
  readonly kind: "source" | "style";
  readonly path: string;
}

export const RELEASE_BATCH_CORPUS: readonly ReleaseBatchCorpusEntry[] = [
  {
    kind: "source",
    path: "examples/src/scenarios/13-shadowing/ShadowingScenario.tsx",
  },
  {
    kind: "style",
    path: "test/_fixtures/semantic-smoke/ComposesSmoke.module.scss",
  },
  {
    kind: "style",
    path: "test/_fixtures/semantic-smoke/ValueSmoke.module.scss",
  },
  {
    kind: "style",
    path: "test/_fixtures/semantic-smoke/KeyframesSmoke.module.scss",
  },
  {
    kind: "style",
    path: "examples/src/scenarios/18-less-module/LessModule.module.less",
  },
] as const;
