import classNames from "classnames/bind";
import styles from "./Dynamic.module.scss";

const cx = classNames.bind(styles);

export function DynamicDomain({ suffix }) {
  const variant = "ghost-" + suffix;
  return <div className={cx(variant)}>hi</div>;
}
