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

interface Scenario {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly render: () => ReactNode;
  readonly stub?: boolean;
}

const SCENARIOS: readonly Scenario[] = [
  {
    id: "01-basic",
    title: "01 · basic",
    description: "Single cx binding. String + object + multi-arg.",
    render: () => <BasicScenario />,
  },
  {
    id: "02-multi-binding",
    title: "02 · multi-binding",
    description: "Two cx bindings (Card + Button) in one file.",
    render: () => <MultiBindingScenario />,
  },
  {
    id: "03-multiline",
    title: "03 · multiline heavy",
    description: "Multi-line cx call with conditionals, ternary, object map.",
    render: () => <MultilineScenario />,
  },
  {
    id: "04-dynamic",
    title: "04 · dynamic keys",
    description: "Template literal `cx(`btn-${variant}`)`.",
    render: () => <DynamicScenario />,
  },
  {
    id: "05-global-local",
    title: "05 · :global / :local",
    description: ":global() and :local() selectors in SCSS.",
    render: () => <GlobalLocalScenario />,
  },
  {
    id: "06-alias",
    title: "06 · alias imports",
    description: "`import cn from 'classnames/bind'`, `const classes = cn.bind(s)`.",
    render: () => <AliasScenario />,
  },
  {
    id: "07-function-scoped",
    title: "07 · function-scoped",
    description: "cx binding declared inside a function body.",
    render: () => <FunctionScopedScenario />,
  },
  {
    id: "08-css-only",
    title: "08 · .module.css only",
    description: "Plain .module.css instead of .module.scss.",
    render: () => <CssOnlyScenario />,
  },
  {
    id: "09-large",
    title: "09 · large component",
    description: "100+ cx() calls — perf smoke test.",
    render: () => <LargeScenario />,
  },
  {
    id: "10-clsx",
    title: "10 · clsx + styles.x",
    description: "clsx(styles.btn, cond && styles.active) and direct styles.x access.",
    render: () => <ClsxScenario />,
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
          <ul>
            {SCENARIOS.map((scenario) => (
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
