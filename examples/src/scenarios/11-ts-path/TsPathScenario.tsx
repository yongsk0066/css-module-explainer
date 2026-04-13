import classNames from "classnames/bind";
import styles from "$scenarios/11-ts-path/TsPath.module.scss";

const cx = classNames.bind(styles);

/**
 * 11 · tsconfig paths — style import resolved through
 * compilerOptions.paths instead of a relative specifier.
 */
export function TsPathScenario() {
  return (
    <section className={cx("panel")}>
      <h3 className={cx("title")}>tsconfig path alias</h3>
      <p className={cx("body")}>
        The SCSS import uses <code>$scenarios/11-ts-path/TsPath.module.scss</code>.
      </p>
    </section>
  );
}
