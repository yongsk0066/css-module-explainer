import classNames from "classnames/bind";
import styles from "./Large.module.scss";

const cx = classNames.bind(styles);

/**
 * 09 · large component — 100+ cx() calls for perf smoke testing.
 * The extension should remain responsive during typing.
 */
export function LargeScenario() {
  const items = Array.from({ length: 100 }, (_, i) => i);
  return (
    <div className={cx("grid")}>
      {items.map((i) => (
        <div
          key={i}
          className={cx(
            "cell",
            i % 2 === 0 ? "even" : "odd",
            i < 10 && "top",
            i >= 90 && "bottom",
          )}
        >
          {i}
        </div>
      ))}
    </div>
  );
}
