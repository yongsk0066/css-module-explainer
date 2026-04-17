import classNames from "classnames/bind";
import styles from "./TypeFactParity.module.scss";

const cx = classNames.bind(styles);

export function TypeFactParity({ size }: { size: "primary" | "secondary" }) {
  return <div className={cx(size)} />;
}
