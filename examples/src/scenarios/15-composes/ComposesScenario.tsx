import classNames from "classnames/bind";
import styles from "./Composes.module.scss";

const cx = classNames.bind(styles);

/**
 * 15 · composes
 *
 * Manual QA targets:
 * - hover / definition / references on `base`, `toneInfo`, `toneSuccess`,
 *   and `badgeFrame` inside `composes:`
 * - CSS-side references from composed selectors back to source selectors
 * - same-file `composes: localBase`
 */
export function ComposesScenario() {
  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 620 }}>
      <button type="button" className={cx("infoButton")}>
        Cross-file composes
      </button>

      <button type="button" className={cx("successButton")}>
        Multiple imported composed selectors
      </button>

      <button type="button" className={cx("sameFileAlias")}>
        Same-file composes
      </button>

      <span className={cx("badge")}>status</span>
    </div>
  );
}
