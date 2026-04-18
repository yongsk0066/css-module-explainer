import classNames from "classnames/bind";
import styles from "./Dynamic.module.scss";

const cx = classNames.bind(styles);

export function Dynamic() {
  const variant = Math.random() > 0.5 ? "chip" : "ghost";
  return <div className={cx(variant)}>hi</div>;
}
