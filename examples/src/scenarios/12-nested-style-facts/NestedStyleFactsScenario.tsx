import classNames from "classnames/bind";
import styles from "./NestedStyleFacts.module.scss";

const cx = classNames.bind(styles);

/**
 * 12 · nested style facts
 *
 * Manual QA targets:
 * - `&.type-card`
 * - `&.compact .body`
 * - `&.disabled`
 * - plain nested `.wrapper { .inner {} }`
 * - `&--primary`
 * - `&__icon`
 */
export function NestedStyleFactsScenario() {
  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 620 }}>
      <article className={cx("item", "type-card", "compact")}>
        <strong>Nested compound facts</strong>
        <p className={cx("body")}>
          Hover and definition on <code>type-card</code>, <code>compact</code>, and{" "}
          <code>body</code> should all land on the same nested selector chain.
        </p>
      </article>

      <article className={cx("item", "type-inline", "disabled")}>
        <strong>Do not overwrite earlier nested parent facts</strong>
        <p className={cx("body")}>
          <code>type-inline</code> should still resolve to its own selector, while{" "}
          <code>disabled</code> resolves to the later nested compound.
        </p>
      </article>

      <button type="button" className={cx("item", "item--primary")}>
        <span className={cx("item__icon")}>i</span>
        <span className={cx("body")}>BEM suffix selectors should still resolve correctly.</span>
      </button>

      <div className={cx("wrapper")}>
        <span className={cx("inner")}>Plain nested selectors without &amp; stay registered.</span>
      </div>
    </div>
  );
}
