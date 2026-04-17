export interface RealProjectCorpusEntry {
  readonly label: string;
  readonly argv: readonly string[];
}

export const REAL_PROJECT_CORPUS: readonly RealProjectCorpusEntry[] = [
  {
    label: "button-variants",
    argv: [
      ".",
      "--preset",
      "ci",
      "--source-file",
      "test/_fixtures/real-project-corpus/ButtonVariants.tsx",
      "--style-file",
      "test/_fixtures/real-project-corpus/ButtonVariants.module.scss",
    ],
  },
  {
    label: "status-chip",
    argv: [
      ".",
      "--preset",
      "ci",
      "--source-file",
      "test/_fixtures/real-project-corpus/StatusChip.tsx",
      "--style-file",
      "test/_fixtures/real-project-corpus/StatusChip.module.scss",
      "--style-file",
      "test/_fixtures/real-project-corpus/StatusChipTokens.module.scss",
    ],
  },
  {
    label: "marketing-card",
    argv: [
      ".",
      "--preset",
      "ci",
      "--source-file",
      "test/_fixtures/real-project-corpus/MarketingCard.tsx",
      "--style-file",
      "test/_fixtures/real-project-corpus/MarketingCard.module.scss",
      "--style-file",
      "test/_fixtures/real-project-corpus/MarketingCardBase.module.scss",
    ],
  },
  {
    label: "analytics-grid",
    argv: [
      ".",
      "--preset",
      "ci",
      "--source-file",
      "test/_fixtures/real-project-corpus/AnalyticsGrid.tsx",
      "--style-file",
      "test/_fixtures/real-project-corpus/AnalyticsGrid.module.less",
    ],
  },
] as const;
