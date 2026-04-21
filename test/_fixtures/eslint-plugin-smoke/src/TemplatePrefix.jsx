import classNames from "classnames/bind";
import styles from "./TemplatePrefix.module.scss";

const cx = classNames.bind(styles);

export function TemplatePrefix({ variant }) {
  return <div className={cx(`ghost-${variant}`)}>hi</div>;
}
