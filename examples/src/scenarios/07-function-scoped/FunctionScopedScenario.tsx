import classNames from "classnames/bind";
import styles from "./FunctionScoped.module.scss";

/**
 * 07 · function-scoped — cx binding declared INSIDE a function body.
 * The binding's scope should NOT leak to the module level.
 */
export function FunctionScopedScenario() {
  const cx = classNames.bind(styles);

  return (
    <div className={cx("card")}>
      <h3 className={cx("cardTitle")}>Function-scoped binding</h3>
      <p className={cx("cardBody")}>
        <code>const cx = classNames.bind(styles)</code> is inside the function, not at module scope.
      </p>
    </div>
  );
}
