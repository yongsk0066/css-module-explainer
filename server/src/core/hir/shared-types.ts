import type { Range } from "@css-module-explainer/shared";

/**
 * Base shape for document-local HIR nodes.
 *
 * IDs are intentionally document-scoped for Wave 1. They are stable
 * within one analysis result and deterministic for a given adapter
 * output, but they are not yet intended to be cross-version graph IDs.
 */
export interface HirNodeBase {
  readonly id: string;
  readonly range?: Range;
}

export type HirDocumentKind = "source" | "style";

export interface HirDocumentBase {
  readonly kind: HirDocumentKind;
  readonly filePath: string;
}

export type SourceLanguage =
  | "javascript"
  | "javascriptreact"
  | "typescript"
  | "typescriptreact"
  | "unknown";
