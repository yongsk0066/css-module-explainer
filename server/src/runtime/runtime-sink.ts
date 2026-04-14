export interface RuntimeSink {
  info(message: string): void;
  error(message: string): void;
  clearDiagnostics(uri: string): void;
  requestCodeLensRefresh(): void;
}

export interface RuntimeLogger {
  info(message: string): void;
  error(message: string): void;
}

export function createScopedRuntimeLogger(sink: RuntimeSink, prefix: string): RuntimeLogger {
  return {
    info(message: string) {
      sink.info(`${prefix}${message}`);
    },
    error(message: string) {
      sink.error(`${prefix}${message}`);
    },
  };
}
