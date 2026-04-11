import classNames from "classnames/bind";
import cardStyles from "./Card.module.scss";
import buttonStyles from "./Button.module.scss";

const cxCard = classNames.bind(cardStyles);
const cxButton = classNames.bind(buttonStyles);

/**
 * 02 · multi-binding — two cx bindings in one file.
 *
 * Two classMaps, two bindings. The provider must disambiguate
 * which one applies per call: `cxCard('card')` must resolve
 * against Card.module.scss, `cxButton('button')` against
 * Button.module.scss, even though both are imported here.
 *
 * Try a typo on each side independently — `cxCard('cardo')`
 * must suggest `card`, NOT `button`.
 *
 * Rename checks on Button.module.scss:
 *  - `.button` (flat) → works. Rewrites every `cxButton('button')`.
 *  - `&--primary` / `&--secondary` (BEM suffix nested) → works.
 *    Only the `--primary` / `--secondary` slice is rewritten in
 *    the SCSS file; every `cxButton('button--primary')` in the
 *    TSX file updates in lockstep.
 *  - `&:hover` → no class is extracted from a pseudo-only nested
 *    rule, so there is nothing to rename. VS Code falls back to
 *    its built-in word rename.
 */
export function MultiBindingScenario() {
  return (
    <section className={cxCard("card", "elevated")}>
      <header className={cxCard("cardHeader")}>
        <h3 className={cxCard("cardTitle")}>Multi-binding card</h3>
      </header>
      <div className={cxCard("cardBody")}>
        <p>
          One file, two cx bindings, two SCSS modules. The extension must pick the
          correct classMap per call.
        </p>
      </div>
      <footer className={cxCard("cardFooter")}>
        <button type="button" className={cxButton("button", "primary")}>
          Accept
        </button>
        <button type="button" className={cxButton("button", "secondary")}>
          Cancel
        </button>
      </footer>
    </section>
  );
}
