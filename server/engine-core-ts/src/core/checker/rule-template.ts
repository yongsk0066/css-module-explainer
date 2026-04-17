export interface CheckerRuleContext<Params, Env, Options> {
  readonly params: Params;
  readonly env: Env;
  readonly options: Options;
}

export type CheckerRule<Params, Env, Options, Finding> = (
  context: CheckerRuleContext<Params, Env, Options>,
) => readonly Finding[];

export function runCheckerRules<Params, Env, Options, Finding>(
  rules: readonly CheckerRule<Params, Env, Options, Finding>[],
  context: CheckerRuleContext<Params, Env, Options>,
): readonly Finding[] {
  const findings: Finding[] = [];

  for (const rule of rules) {
    findings.push(...rule(context));
  }

  return findings;
}
