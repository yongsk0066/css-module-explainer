import classNames from "classnames/bind";
import styles from "./App.module.scss";

const cx = classNames.bind(styles);

export function App({ active }) {
  return <button className={cx("button", { active })}>Save</button>;
}
