import classNames from "classnames/bind";
import styles from "./LessModule.module.less";

const cx = classNames.bind(styles);

/**
 * 18 · less module
 *
 * Manual QA targets:
 * - `.module.less` style document parsing
 * - `&.active` nested class in LESS
 * - dashed selector through bracket access
 */
export function LessModuleScenario() {
  return (
    <article className={cx("card", "active")} style={{ maxWidth: 520 }}>
      <strong className={cx("title")}>LESS module coverage</strong>
      <span className={styles["accent-badge"]}>accent-badge</span>
      <p style={{ margin: 0, color: "#475569", lineHeight: 1.6 }}>
        Hover, definition, references, diagnostics, and rename should work the same here as they
        do for SCSS and CSS modules.
      </p>
    </article>
  );
}
