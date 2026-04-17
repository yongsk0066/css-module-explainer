import classNames from "classnames/bind";
import styles from "./SourcePrefixSuffixParity.module.scss";

const cx = classNames.bind(styles);

export function SourcePrefixSuffixParity(variant: string) {
  const className = "btn-" + variant + "-chip";
  return <div className={cx(className)} />;
}
