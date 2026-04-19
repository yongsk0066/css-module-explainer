import bind from "classnames/bind";
import styles from "./App.module.scss";

const cx = bind.bind(styles);

type Variant = "a" | "b" | "c" | "d" | "e" | "f" | "g" | "h" | "i" | "j";
type ButtonClass = `btn-${Variant}-active`;

declare const className: ButtonClass;

export const rendered = cx(className);
