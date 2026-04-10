import classNames from "classnames/bind";
import { useState } from "react";
import styles from "./MultilineForm.module.scss";

const cx = classNames.bind(styles);

/**
 * 03 · multiline heavy — multi-line cx() calls with conditionals,
 * spreads, and every argument shape mixed together.
 */
export function MultilineScenario() {
  const [isActive, setActive] = useState(false);
  const [isError, setError] = useState(false);
  const [size, setSize] = useState<"sm" | "md" | "lg">("md");

  return (
    <div>
      <div
        className={cx(
          "container",
          "padded",
          isActive && "active",
          size,
          isError ? "error" : "ok",
          { highlighted: isActive && !isError },
        )}
      >
        <p>Multi-line cx() call with conditionals, ternary, and object map.</p>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 12, fontSize: 12 }}>
        <label>
          <input type="checkbox" checked={isActive} onChange={(e) => setActive(e.target.checked)} />
          active
        </label>
        <label>
          <input type="checkbox" checked={isError} onChange={(e) => setError(e.target.checked)} />
          error
        </label>
        <label>
          size:{" "}
          <select value={size} onChange={(e) => setSize(e.target.value as "sm" | "md" | "lg")}>
            <option value="sm">sm</option>
            <option value="md">md</option>
            <option value="lg">lg</option>
          </select>
        </label>
      </div>
    </div>
  );
}
