import classNames from "classnames/bind";
import styles from "./CssOnly.module.css";

const cx = classNames.bind(styles);

/**
 * 08 · .module.css only — plain CSS (no SCSS) to exercise the
 * vanilla postcss parse path (syntax: null).
 */
export function CssOnlyScenario() {
  return (
    <div className={cx("box")}>
      <p className={cx("text")}>This uses <code>.module.css</code>, not <code>.module.scss</code>.</p>
    </div>
  );
}
