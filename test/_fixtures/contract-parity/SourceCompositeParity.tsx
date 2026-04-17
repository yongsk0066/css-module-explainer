import classNames from "classnames/bind";
import styles from "./SourceCompositeParity.module.scss";

const cx = classNames.bind(styles);

function resolveVariant(value: number) {
  switch (value) {
    case 1:
      return "btn-primary";
    case 2:
      return "btn-secondary";
    case 3:
      return "btn-danger";
    case 4:
      return "btn-success";
    case 5:
      return "btn-warning";
    case 6:
      return "btn-info";
    case 7:
      return "btn-muted";
    case 8:
      return "btn-ghost";
    default:
      return "btn-outline";
  }
}

export function SourceCompositeParity(value: number) {
  const variant = resolveVariant(value);
  return <div className={cx(variant)} />;
}
