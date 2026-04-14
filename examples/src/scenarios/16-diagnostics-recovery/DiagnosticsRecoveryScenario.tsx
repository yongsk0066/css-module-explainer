import classNames from "classnames/bind";
import styles from "./DiagnosticsRecovery.module.scss";

const cx = classNames.bind(styles);

/**
 * 16 · diagnostics recovery
 *
 * Manual QA targets:
 * - typo recovery on `typoTarget`
 * - missing module import recovery in this file
 * - unresolved `composes` file / selector diagnostics in
 *   `BrokenComposes.module.scss`
 */
export function DiagnosticsRecoveryScenario() {
  return (
    <section className={cx("panel")}>
      <span className={cx("typoTarget")}>Diagnostics recovery</span>
      <strong className={cx("title")}>Use this scenario to validate recovery paths.</strong>
      <p className={cx("hint")}>
        Start from a clean file, then intentionally break one thing at a time and confirm the
        extension recovers when you revert it.
      </p>
      <ol className={cx("checklist")}>
        <li>
          Change <code>cx("typoTarget")</code> to <code>cx("typoTargte")</code>. A missing-class
          diagnostic and quick fix should appear, then clear after reverting.
        </li>
        <li>
          Temporarily rename this module import to a missing path. The import string should get a
          missing-module diagnostic, then recover on revert.
        </li>
        <li>
          Open <code>BrokenComposes.module.scss</code> in the same folder. It contains one missing
          file target and one missing selector target for SCSS-side diagnostics and quick fixes.
        </li>
      </ol>
    </section>
  );
}
