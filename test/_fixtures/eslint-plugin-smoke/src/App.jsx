import classNames from "classnames/bind";
import styles from "./App.module.scss";

const cx = classNames.bind(styles);

export function App() {
  return <div className={cx("chip", "ghost")}>hi</div>;
}
