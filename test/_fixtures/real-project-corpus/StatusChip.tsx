import classNames from "classnames/bind";
import styles from "./StatusChip.module.scss";

const cx = classNames.bind(styles);

function resolveStatusClass(status: "success" | "warning" | "danger") {
  switch (status) {
    case "success":
      return "success";
    case "warning":
      return "warning";
    case "danger":
      return "danger";
  }
}

export function StatusChip({
  compact,
  status,
}: {
  compact: boolean;
  status: "success" | "warning" | "danger";
}) {
  const statusClass = resolveStatusClass(status);
  return <span className={cx("chip", statusClass, compact && "compact")}>{status}</span>;
}
