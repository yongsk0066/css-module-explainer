import {
  checkStyleDocument,
  type StyleCheckerFinding,
} from "../../engine-core-ts/src/core/checker";
import type { StyleDocumentHIR } from "../../engine-core-ts/src/core/hir/style-types";
import type { ProviderDeps } from "../../engine-core-ts/src/provider-deps";

export function resolveStyleDiagnosticFindings(
  args: {
    readonly scssPath: string;
    readonly styleDocument: StyleDocumentHIR;
  },
  deps: Pick<ProviderDeps, "semanticReferenceIndex"> & {
    readonly styleDependencyGraph?: ProviderDeps["styleDependencyGraph"];
    readonly styleDocumentForPath?: ProviderDeps["styleDocumentForPath"];
  },
): readonly StyleCheckerFinding[] {
  return checkStyleDocument(args, {
    semanticReferenceIndex: deps.semanticReferenceIndex,
    ...(deps.styleDependencyGraph ? { styleDependencyGraph: deps.styleDependencyGraph } : {}),
    ...(deps.styleDocumentForPath ? { styleDocumentForPath: deps.styleDocumentForPath } : {}),
  });
}
