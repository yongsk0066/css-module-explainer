import classNames from "classnames/bind";
import styles from "./Value.module.scss";

const cx = classNames.bind(styles);

/**
 * 20 · value tokens
 *
 * Manual QA targets:
 * - local `@value` hover / definition / references
 * - imported `@value` hover / definition / references
 * - imported source token navigation into `ValueTokens.module.scss`
 */
export function ValueScenario() {
  return (
    <section className={cx("panel")}>
      <div className={cx("eyebrow")}>@value</div>
      <article className={cx("card")}>
        <strong className={cx("title")}>Value token coverage</strong>
        <p className={cx("hint")}>
          Open <code>Value.module.scss</code> and test local and imported token navigation. The
          local token is <code>accentLocal</code>. Imported tokens come from
          <code>ValueTokens.module.scss</code>.
        </p>
      </article>
    </section>
  );
}
