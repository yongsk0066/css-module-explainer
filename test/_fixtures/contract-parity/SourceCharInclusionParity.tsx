import classNames from "classnames/bind";
import styles from "./SourceCharInclusionParity.module.scss";

const cx = classNames.bind(styles);

function resolveState(value: number) {
  switch (value) {
    case 1:
      return "stateOne";
    case 2:
      return "stateTwo";
    case 3:
      return "stateThree";
    case 4:
      return "stateFour";
    case 5:
      return "stateFive";
    case 6:
      return "stateSix";
    case 7:
      return "stateSeven";
    case 8:
      return "stateEight";
    default:
      return "stateNine";
  }
}

export function SourceCharInclusionParity(value: number) {
  const state = resolveState(value);
  return <div className={cx(state)} />;
}
