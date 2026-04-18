import bind from "classnames/bind";
import styles from "./App.module.scss";
import { tokens } from "#tokens/classes";

const cx = bind.bind(styles);
const buttonClass = Math.random() > 0.5 ? tokens.primary : tokens.secondary;

export const className = cx(buttonClass);
