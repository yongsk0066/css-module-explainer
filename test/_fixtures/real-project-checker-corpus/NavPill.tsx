import classNames from "classnames/bind";
import styles from "./NavPill.module.scss";

const cx = classNames.bind(styles);

export function NavPill() {
  return <button className={cx("pillGhost")}>Open</button>;
}
