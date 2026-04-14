import classNames from "classnames/bind";
import styles from "./Shadowing.module.scss";

const cx = classNames.bind(styles);

function joinTokens(...tokens: Array<string | false | null | undefined>): string {
  return tokens.filter(Boolean).join(" ");
}

/**
 * 13 · shadowing
 *
 * The outer `cx` and imported `styles` should resolve.
 * The inner shadowed `cx` and `styles` bindings should not resolve
 * as CSS Module references even though matching class names exist.
 */
export function ShadowingScenario() {
  const localBadgeStyles = { badge: "shadowed-badge" };

  function renderShadowedStyles(styles: { badge: string }) {
    return <span className={styles.badge}>Parameter shadowing should not bind to the module.</span>;
  }

  function renderShadowedCx() {
    const cx = (...tokens: Array<string | false | null | undefined>) => joinTokens(...tokens);
    return <div className={cx("panel")}>Local helper shadowing should not resolve.</div>;
  }

  return (
    <section className={cx("panel")} style={{ display: "grid", gap: 12, maxWidth: 640 }}>
      <h3 className={styles.title}>Imported bindings should resolve</h3>
      <p className={styles.body}>
        Hover on <code>cx("panel")</code>, <code>styles.title</code>, and <code>styles.body</code>.
      </p>

      {renderShadowedCx()}
      {renderShadowedStyles(localBadgeStyles)}

      {(() => {
        const styles = { badge: "shadowed-badge" };
        return <span className={styles.badge}>Block-scoped styles shadowing should not resolve.</span>;
      })()}

      <span className={styles.badge}>This imported styles.badge should still resolve.</span>
    </section>
  );
}
