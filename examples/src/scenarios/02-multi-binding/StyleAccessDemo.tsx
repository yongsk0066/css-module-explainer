import styles from "./Button.module.scss";

/**
 * 02 · style-access demo — `styles.x` with camelCase alias.
 *
 * This component accesses `.button--primary` via the camelCase
 * property form `styles.buttonPrimary` instead of the original
 * dashed name. Under `classnameTransform: "camelCase"` the
 * extension recognises the alias and marks `.button--primary` as
 * used. Under `"asIs"` the alias is unknown, so the SCSS
 * selector appears unused (faded).
 *
 * Toggle the mode in `.vscode/settings.json` and watch the SCSS
 * file's unused-selector hints update without editing the SCSS.
 */
export function StyleAccessDemo() {
  return (
    <div className={styles.button}>
      <button type="button" className={styles.buttonPrimary}>
        camelCase alias
      </button>
    </div>
  );
}
