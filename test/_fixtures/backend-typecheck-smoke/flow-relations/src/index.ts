type Status =
  | { kind: "loading"; spinnerClass: "state-loading" }
  | { kind: "error"; errorClass: "state-error" }
  | { kind: "success"; successClass: "state-success" };

type StatusClass<TStatus extends Status> = TStatus extends { kind: "loading" }
  ? TStatus["spinnerClass"]
  : TStatus extends { kind: "error" }
    ? TStatus["errorClass"]
    : TStatus extends { kind: "success" }
      ? TStatus["successClass"]
      : never;

function resolveStatusClass<TStatus extends Status>(status: TStatus): StatusClass<TStatus> {
  switch (status.kind) {
    case "loading":
      return status.spinnerClass as StatusClass<TStatus>;
    case "error":
      return status.errorClass as StatusClass<TStatus>;
    case "success":
      return status.successClass as StatusClass<TStatus>;
  }
}

const states = [
  resolveStatusClass({ kind: "loading", spinnerClass: "state-loading" }),
  resolveStatusClass({ kind: "success", successClass: "state-success" }),
] as const;

void states;
