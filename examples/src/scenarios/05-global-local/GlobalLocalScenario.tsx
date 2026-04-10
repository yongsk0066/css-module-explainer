import classNames from "classnames/bind";
import styles from "./GlobalLocal.module.scss";

const cx = classNames.bind(styles);

/**
 * 05 · :global / :local — selectors wrapped in :global() should
 * NOT appear in the cx() completion list. :local() should.
 */
export function GlobalLocalScenario() {
  return (
    <div className={cx("container")}>
      <p className={cx("localOnly")}>This class IS in the styles object (local).</p>
      <p className="globalReset">This class is global — NOT in the styles object.</p>
    </div>
  );
}
