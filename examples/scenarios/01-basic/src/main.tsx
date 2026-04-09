import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Button } from "./Button";

const container = document.getElementById("root");
if (!container) throw new Error("no #root");

createRoot(container).render(
  <StrictMode>
    <main style={{ padding: 32, fontFamily: "system-ui" }}>
      <h1>css-module-explainer · 01 basic</h1>
      <p>Hover, go-to-def, completion, diagnostics, references.</p>
      <Button variant="primary">Primary</Button>
      <Button variant="primary" size="lg">
        Primary large
      </Button>
      <Button variant="primary" disabled>
        Disabled
      </Button>
    </main>
  </StrictMode>,
);
