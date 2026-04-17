import classNames from "classnames/bind";
import styles from "./AnalyticsGrid.module.less";

const cx = classNames.bind(styles);

export function AnalyticsGrid({ featured }: { featured: boolean }) {
  return (
    <section className={cx("grid", featured && "featured")}>
      <h2 className={styles["title-lg"]}>Overview</h2>
      <div className={cx("cell")}>Visits</div>
    </section>
  );
}
