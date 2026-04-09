import classNames from "classnames/bind";
import { useState } from "react";
import styles from "./Button.module.scss";

const cx = classNames.bind(styles);

/**
 * 01 · basic — single cx binding, string + object + multi-arg.
 *
 * Try in the editor:
 * - Hover `'button'`, `'primary'`, `'lg'` → markdown with rule
 * - Cmd-click `'primary'` → jumps to .primary in Button.module.scss
 * - Inside an open `cx('` → completion list of every class
 * - Rename `'primary'` → `'primari'` → diagnostic + Quick Fix
 * - In Button.module.scss, right-click `.primary` → Find References
 */
export function BasicScenario() {
  const [disabled, setDisabled] = useState(false);
  const [size, setSize] = useState<"sm" | "md" | "lg">("md");

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <button
          type="button"
          className={cx("button", "primary", size, { disabled })}
          disabled={disabled}
        >
          Primary
        </button>
        <button type="button" className={cx("button", "secondary", size)}>
          Secondary
        </button>
        <button
          type="button"
          className={cx("button", "primary", "lg", disabled && "disabledStripes")}
          disabled={disabled}
        >
          Primary large
        </button>
      </div>
      <div style={{ display: "flex", gap: 8, fontSize: 12 }}>
        <label>
          <input type="checkbox" checked={disabled} onChange={(e) => setDisabled(e.target.checked)} />
          disabled
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
