import classNames from "classnames/bind";
import styles from "./MarketingCard.module.scss";

const cx = classNames.bind(styles);

export function MarketingCard({ featured }: { featured: boolean }) {
  return (
    <article className={cx("card", featured && "featured")}>
      <div className={cx("body")}>Campaign</div>
    </article>
  );
}
