import { useState, type ReactNode } from "react";
import { BasicScenario } from "./scenarios/01-basic/BasicScenario";
import { MultiBindingScenario } from "./scenarios/02-multi-binding/MultiBindingScenario";
import { MultilineScenario } from "./scenarios/03-multiline/MultilineScenario";
import { DynamicScenario } from "./scenarios/04-dynamic/DynamicScenario";
import { GlobalLocalScenario } from "./scenarios/05-global-local/GlobalLocalScenario";
import { AliasScenario } from "./scenarios/06-alias/AliasScenario";
import { FunctionScopedScenario } from "./scenarios/07-function-scoped/FunctionScopedScenario";
import { CssOnlyScenario } from "./scenarios/08-css-only/CssOnlyScenario";
import { LargeScenario } from "./scenarios/09-large/LargeScenario";
import { ClsxScenario } from "./scenarios/10-clsx/ClsxScenario";
import { TsPathScenario } from "./scenarios/11-ts-path/TsPathScenario";
import { NestedStyleFactsScenario } from "./scenarios/12-nested-style-facts/NestedStyleFactsScenario";
import { ShadowingScenario } from "./scenarios/13-shadowing/ShadowingScenario";
import { NonFiniteDynamicScenario } from "./scenarios/14-non-finite-dynamic/NonFiniteDynamicScenario";
import { ComposesScenario } from "./scenarios/15-composes/ComposesScenario";
import { DiagnosticsRecoveryScenario } from "./scenarios/16-diagnostics-recovery/DiagnosticsRecoveryScenario";
import { BracketAccessScenario } from "./scenarios/17-bracket-access/BracketAccessScenario";
import { LessModuleScenario } from "./scenarios/18-less-module/LessModuleScenario";
import { KeyframesScenario } from "./scenarios/19-keyframes/KeyframesScenario";
import { ValueScenario } from "./scenarios/20-value/ValueScenario";

type ScenarioGroup =
  | "Basics"
  | "Binding"
  | "Dynamic"
  | "Style-side"
  | "Diagnostics"
  | "Resolution";

interface Scenario {
  readonly id: string;
  readonly group: ScenarioGroup;
  readonly title: string;
  readonly description: string;
  readonly render: () => ReactNode;
  readonly stub?: boolean;
}

const GROUP_ORDER: readonly ScenarioGroup[] = [
  "Basics",
  "Binding",
  "Dynamic",
  "Style-side",
  "Diagnostics",
  "Resolution",
];

const SCENARIOS: readonly Scenario[] = [
  {
    id: "01-basic",
    group: "Basics",
    title: "01 · basic",
    description: "Single cx binding. String + object + multi-arg.",
    render: () => <BasicScenario />,
  },
  {
    id: "02-multi-binding",
    group: "Binding",
    title: "02 · multi-binding",
    description: "Two cx bindings (Card + Button) in one file.",
    render: () => <MultiBindingScenario />,
  },
  {
    id: "03-multiline",
    group: "Basics",
    title: "03 · multiline heavy",
    description: "Multi-line cx call with conditionals, ternary, object map.",
    render: () => <MultilineScenario />,
  },
  {
    id: "04-dynamic",
    group: "Dynamic",
    title: "04 · dynamic keys",
    description: "Template literal `cx(`btn-${variant}`)`.",
    render: () => <DynamicScenario />,
  },
  {
    id: "05-global-local",
    group: "Style-side",
    title: "05 · :global / :local",
    description: ":global() and :local() selectors in SCSS.",
    render: () => <GlobalLocalScenario />,
  },
  {
    id: "06-alias",
    group: "Binding",
    title: "06 · alias imports",
    description: "`import cn from 'classnames/bind'`, `const classes = cn.bind(s)`.",
    render: () => <AliasScenario />,
  },
  {
    id: "07-function-scoped",
    group: "Binding",
    title: "07 · function-scoped",
    description: "cx binding declared inside a function body.",
    render: () => <FunctionScopedScenario />,
  },
  {
    id: "08-css-only",
    group: "Resolution",
    title: "08 · .module.css only",
    description: "Plain .module.css instead of .module.scss.",
    render: () => <CssOnlyScenario />,
  },
  {
    id: "09-large",
    group: "Basics",
    title: "09 · large component",
    description: "100+ cx() calls — perf smoke test.",
    render: () => <LargeScenario />,
  },
  {
    id: "10-clsx",
    group: "Dynamic",
    title: "10 · clsx + styles.x",
    description: "clsx(styles.btn, cond && styles.active) and direct styles.x access.",
    render: () => <ClsxScenario />,
  },
  {
    id: "11-ts-path",
    group: "Resolution",
    title: "11 · tsconfig paths",
    description: "Styles import resolved through compilerOptions.paths instead of a relative path.",
    render: () => <TsPathScenario />,
  },
  {
    id: "12-nested-style-facts",
    group: "Style-side",
    title: "12 · nested style facts",
    description: "`&.class`, plain nesting, and BEM suffix registration in one file.",
    render: () => <NestedStyleFactsScenario />,
  },
  {
    id: "13-shadowing",
    group: "Binding",
    title: "13 · shadowing",
    description: "Imported `cx` and `styles` shadowed by local bindings.",
    render: () => <ShadowingScenario />,
  },
  {
    id: "14-non-finite-dynamic",
    group: "Dynamic",
    title: "14 · non-finite dynamic",
    description: "Finite set, prefix, and top-like dynamic class resolution.",
    render: () => <NonFiniteDynamicScenario />,
  },
  {
    id: "15-composes",
    group: "Style-side",
    title: "15 · composes graph",
    description: "Same-file and cross-file composes navigation, references, and hover.",
    render: () => <ComposesScenario />,
  },
  {
    id: "16-diagnostics-recovery",
    group: "Diagnostics",
    title: "16 · diagnostics recovery",
    description: "Typo, missing module, and unresolved composes recovery checks.",
    render: () => <DiagnosticsRecoveryScenario />,
  },
  {
    id: "17-bracket-access",
    group: "Resolution",
    title: "17 · bracket access",
    description: "Dashed and Unicode selectors through styles['...'] access.",
    render: () => <BracketAccessScenario />,
  },
  {
    id: "18-less-module",
    group: "Resolution",
    title: "18 · .module.less",
    description: "LESS module parsing, nested classes, and dashed selector access.",
    render: () => <LessModuleScenario />,
  },
  {
    id: "19-keyframes",
    group: "Style-side",
    title: "19 · keyframes",
    description: "Same-file @keyframes declarations plus animation-name and shorthand lookups.",
    render: () => <KeyframesScenario />,
  },
  {
    id: "20-value",
    group: "Style-side",
    title: "20 · @value tokens",
    description: "Local and imported @value definition, references, and diagnostics surface.",
    render: () => <ValueScenario />,
  },
];

export function App() {
  const [activeId, setActiveId] = useState<string>(SCENARIOS[0]!.id);
  const active = SCENARIOS.find((s) => s.id === activeId) ?? SCENARIOS[0]!;

  return (
    <div className="shell">
      <aside className="sidebar">
        <h1>css-module-explainer</h1>
        <p className="subtitle">dogfood sandbox</p>
        <nav>
          {GROUP_ORDER.map((group) => {
            const scenarios = SCENARIOS.filter((scenario) => scenario.group === group);
            if (scenarios.length === 0) return null;
            return (
              <section key={group} className="scenarioGroup">
                <h2>{group}</h2>
                <ul>
                  {scenarios.map((scenario) => (
                    <li key={scenario.id}>
                      <button
                        type="button"
                        onClick={() => setActiveId(scenario.id)}
                        data-active={scenario.id === activeId || undefined}
                        data-stub={scenario.stub || undefined}
                      >
                        <strong>{scenario.title}</strong>
                        <small>{scenario.description}</small>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </nav>
      </aside>
      <main className="stage">
        <header>
          <h2>{active.title}</h2>
          <p>{active.description}</p>
        </header>
        <section>{active.render()}</section>
      </main>
    </div>
  );
}
