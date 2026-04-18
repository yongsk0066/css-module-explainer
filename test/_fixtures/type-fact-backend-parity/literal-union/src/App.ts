import bind from "classnames/bind";
import styles from "./App.module.scss";

const cx = bind.bind(styles);

type Variant = "button-primary" | "button-secondary";

const variant: Variant = Math.random() > 0.5 ? "button-primary" : "button-secondary";

export const className = cx(variant);
