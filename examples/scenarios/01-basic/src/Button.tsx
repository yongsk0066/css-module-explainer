import classNames from "classnames/bind";
import type { ReactNode } from "react";
import styles from "./Button.module.scss";

const cx = classNames.bind(styles);

export interface ButtonProps {
  readonly variant: "primary" | "secondary";
  readonly size?: "sm" | "md" | "lg";
  readonly disabled?: boolean;
  readonly children: ReactNode;
}

/**
 * This component exists to exercise every provider in
 * css-module-explainer. Try:
 *
 * - Hover over `'button'` → should show the `.button` rule.
 * - Cmd-click `'primary'` → should jump to the selector in
 *   Button.module.scss.
 * - Type `cx('` on a new line → should list every class.
 * - Rename `'primary'` to `'primari'` → diagnostic with a
 *   "Replace with 'primary'" quick fix.
 * - Inside Button.module.scss, right-click `.primary` →
 *   Find All References → shows the call sites here.
 *
 * The `typo-target` class below has no call site and exists so
 * references shows "no references" for it.
 */
export function Button({ variant, size = "md", disabled = false, children }: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={cx(
        "button",
        variant,
        size,
        { disabled },
        disabled && "disabledStripes",
      )}
    >
      {children}
    </button>
  );
}
