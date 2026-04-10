import cn from "classnames/bind";
import s from "./Alias.module.scss";

const classes = cn.bind(s);

/**
 * 06 · alias imports — `import cn from 'classnames/bind'` and
 * `const classes = cn.bind(s)`. Non-standard naming that the
 * binding detector must handle.
 */
export function AliasScenario() {
  return (
    <div className={classes("wrapper")}>
      <h3 className={classes("title")}>Aliased imports</h3>
      <p className={classes("body")}>
        <code>cn</code> instead of <code>classNames</code>,{" "}
        <code>s</code> instead of <code>styles</code>,{" "}
        <code>classes</code> instead of <code>cx</code>.
      </p>
    </div>
  );
}
