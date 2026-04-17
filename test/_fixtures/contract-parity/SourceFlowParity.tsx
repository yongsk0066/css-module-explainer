import classNames from "classnames/bind";
import styles from "./SourceFlowParity.module.scss";

const cx = classNames.bind(styles);

export function SourceFlowParity(enabled: boolean) {
  const size = enabled ? "small" : "large";
  return <div className={cx(size)} />;
}
