import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Widget } from "./Widget";

const container = document.getElementById("root");
if (!container) throw new Error("no #root");

createRoot(container).render(
  <StrictMode>
    <main style={{ padding: 32, fontFamily: "system-ui" }}>
      <h1>css-module-explainer · 02 multi-binding</h1>
      <p>
        One component file, two <code>classNames.bind</code> bindings,
        two SCSS modules. The provider must disambiguate which
        classMap applies to each call.
      </p>
      <Widget title="Card title">Card body content</Widget>
    </main>
  </StrictMode>,
);
