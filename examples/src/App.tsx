import { useState, type ReactNode } from "react";
import { BasicScenario } from "./scenarios/01-basic/BasicScenario";
import { MultiBindingScenario } from "./scenarios/02-multi-binding/MultiBindingScenario";
import { StubScenario } from "./scenarios/_stub/StubScenario";

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
    id: "03-multiline-heavy",
    title: "03 · multiline heavy",
    description: "Multi-line cx call with conditionals + spreads.",
    render: () => <StubScenario id="03-multiline-heavy" />,
    stub: true,
  },
  {
    id: "04-dynamic-keys",
    title: "04 · dynamic keys",
    description: "Template literal `cx(`btn-${variant}`)`.",
    render: () => <StubScenario id="04-dynamic-keys" />,
    stub: true,
  },
  {
    id: "05-global-local",
    title: "05 · :global / :local",
    description: ":global() and :local() selectors in SCSS.",
    render: () => <StubScenario id="05-global-local" />,
    stub: true,
  },
  {
    id: "06-alias-imports",
    title: "06 · alias imports",
    description: "`import cn from 'classnames/bind'`.",
    render: () => <StubScenario id="06-alias-imports" />,
    stub: true,
  },
  {
    id: "07-function-scoped",
    title: "07 · function-scoped",
    description: "cx binding declared inside a function body.",
    render: () => <StubScenario id="07-function-scoped" />,
    stub: true,
  },
  {
    id: "08-css-only",
    title: "08 · .module.css only",
    description: "Plain .module.css instead of .module.scss.",
    render: () => <StubScenario id="08-css-only" />,
    stub: true,
  },
  {
    id: "09-large-component",
    title: "09 · large component",
    description: "100+ cx() calls — perf smoke test.",
    render: () => <StubScenario id="09-large-component" />,
    stub: true,
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
