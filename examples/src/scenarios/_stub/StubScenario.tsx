interface StubScenarioProps {
  readonly id: string;
}

export function StubScenario({ id }: StubScenarioProps) {
  return (
    <div style={{ padding: 16, background: "#fef3c7", borderRadius: 8, color: "#78350f" }}>
      <strong>Stub</strong> — <code>{id}</code> has no implementation yet. Contributions welcome:
      add a component + SCSS module under{" "}
      <code>src/scenarios/{id}/</code>, then wire it in <code>App.tsx</code>.
    </div>
  );
}
