import classNames from "classnames/bind";
import type { ReactNode } from "react";
import cardStyles from "./Card.module.scss";
import buttonStyles from "./Button.module.scss";

const cxCard = classNames.bind(cardStyles);
const cxButton = classNames.bind(buttonStyles);

export interface WidgetProps {
  readonly title: string;
  readonly children: ReactNode;
}

/**
 * Q7 B #4 — multi-binding dogfood.
 *
 * Hover over `cxCard('card')` → should show rules from
 * Card.module.scss. Hover over `cxButton('button')` → should
 * show rules from Button.module.scss. The provider reads the
 * binding scope for each call and picks the correct classMap.
 *
 * Try a typo on each side independently — `cxCard('cardo')` must
 * suggest `card`, NOT `button`, even though both classMaps are
 * available in this file.
 */
export function Widget({ title, children }: WidgetProps) {
  return (
    <section className={cxCard("card", "elevated")}>
      <header className={cxCard("cardHeader")}>
        <h2 className={cxCard("cardTitle")}>{title}</h2>
      </header>
      <div className={cxCard("cardBody")}>{children}</div>
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
