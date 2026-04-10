import clsx from "clsx";
import { useState } from "react";
import styles from "./Clsx.module.scss";

/**
 * 10 . clsx - direct styles.x property access inside clsx().
 *
 * Try in the editor:
 * - Hover `styles.btn`, `styles.primary` -> markdown with rule
 * - Cmd-click `styles.active` -> jumps to .active in Clsx.module.scss
 * - Inside `clsx(styles.` -> completion list of every class
 * - In Clsx.module.scss, right-click `.btn` -> Find References
 */
export function ClsxScenario() {
  const [isActive, setIsActive] = useState(false);
  const [isDisabled, setIsDisabled] = useState(false);

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <button
          type="button"
          className={clsx(styles.btn, styles.primary, isActive && styles.active)}
          disabled={isDisabled}
        >
          Primary
        </button>
        <button
          type="button"
          className={clsx(styles.btn, styles.secondary, isActive && styles.active)}
        >
          Secondary
        </button>
        <button
          type="button"
          className={clsx(
            styles.btn,
            styles.primary,
            styles.lg,
            isDisabled && styles.disabled,
          )}
          disabled={isDisabled}
        >
          Primary large
        </button>
      </div>
      <div style={{ display: "flex", gap: 8, fontSize: 12 }}>
        <label>
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          active
        </label>
        <label>
          <input
            type="checkbox"
            checked={isDisabled}
            onChange={(e) => setIsDisabled(e.target.checked)}
          />
          disabled
        </label>
      </div>
    </div>
  );
}
