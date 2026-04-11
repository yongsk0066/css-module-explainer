import classNames from "classnames/bind";
import styles from "./DynamicKeys.module.scss";

const cx = classNames.bind(styles);

/**
 * 04 · dynamic keys — template literal `cx(`btn-${variant}`)`.
 *
 * Hover on the template should show all matching classes.
 *
 * Rename check: rename `.btn-primary` in DynamicKeys.module.scss.
 * The template literal below must stay `cx(`btn-${variant}`)`
 * — the extension does not rewrite dynamic expressions. Find
 * References on `.btn-primary` still surfaces this call site.
 */
export function DynamicScenario() {
  const variants = ["primary", "secondary", "danger"] as const;
  return (
    <div style={{ display: "flex", gap: 8 }}>
      {variants.map((variant) => (
        <button key={variant} type="button" className={cx(`btn-${variant}`)}>
          {variant}
        </button>
      ))}
    </div>
  );
}
