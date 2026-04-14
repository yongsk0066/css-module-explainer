import classNames from "classnames/bind";
import { useState } from "react";
import styles from "./NonFiniteDynamic.module.scss";

const cx = classNames.bind(styles);

type Size = "sm" | "lg";
type Variant = "primary" | "secondary";
type Status = "idle" | "busy" | "error";

function resolveStatusClass(status: Status): string {
  switch (status) {
    case "idle":
      return "state-idle";
    case "busy":
      return "state-busy";
    case "error":
      return "state-error";
  }
}

/**
 * 14 · non-finite dynamic
 *
 * Manual QA targets:
 * - finite set: `size`
 * - prefix: `"btn-" + variant`
 * - possible/top-like: `resolveStatusClass(status)`
 */
export function NonFiniteDynamicScenario() {
  const [size, setSize] = useState<Size>("sm");
  const [variant, setVariant] = useState<Variant>("primary");
  const [status, setStatus] = useState<Status>("idle");

  const prefixClass = "btn-" + variant;
  const derivedStatusClass = resolveStatusClass(status);

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 680 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <label>
          size{" "}
          <select value={size} onChange={(event) => setSize(event.target.value as Size)}>
            <option value="sm">sm</option>
            <option value="lg">lg</option>
          </select>
        </label>
        <label>
          variant{" "}
          <select value={variant} onChange={(event) => setVariant(event.target.value as Variant)}>
            <option value="primary">primary</option>
            <option value="secondary">secondary</option>
          </select>
        </label>
        <label>
          status{" "}
          <select value={status} onChange={(event) => setStatus(event.target.value as Status)}>
            <option value="idle">idle</option>
            <option value="busy">busy</option>
            <option value="error">error</option>
          </select>
        </label>
      </div>

      <div className={cx("chip", size)}>
        Finite set resolution through a string-literal union: <code>{size}</code>
      </div>

      <div className={cx("chip", prefixClass)}>
        Prefix-based dynamic resolution: <code>{prefixClass}</code>
      </div>

      <div className={cx("chip", derivedStatusClass)}>
        Function-derived dynamic resolution: <code>{derivedStatusClass}</code>
      </div>
    </div>
  );
}
