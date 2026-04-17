import classNames from "classnames/bind";
import styles from "./Keyframes.module.scss";

const cx = classNames.bind(styles);

/**
 * 19 · keyframes
 *
 * Manual QA targets:
 * - same-file `@keyframes` hover / definition / references
 * - `animation-name: pulse` token lookup
 * - `animation: slide-up ...` shorthand token lookup
 */
export function KeyframesScenario() {
  return (
    <section className={cx("panel")}>
      <div className={cx("pulseChip")}>pulse</div>
      <article className={cx("slideCard")}>
        <strong className={cx("title")}>Keyframes first pass</strong>
        <p className={cx("hint")}>
          Open <code>Keyframes.module.scss</code> and exercise hover, definition, and references on
          <code>pulse</code> and <code>slide-up</code> in both the declarations and the animation
          properties.
        </p>
      </article>
    </section>
  );
}
