import type { BemSuffixInfo, Range } from "@css-module-explainer/shared";
import type { ClassExpressionHIR } from "../hir/source-types";
import type { SelectorDeclHIR, StyleDocumentHIR } from "../hir/style-types";
import type { ReferenceQueryEnv } from "../query/find-references";
import { findCanonicalSelector, findSelectorAtCursor } from "../query/find-style-selector";
import {
  readSelectorRewriteSafetySummary,
  type SelectorRewriteSafetySummary,
} from "../query/read-selector-rewrite-safety";
import { type ClassnameTransformMode, transformClassname } from "../scss/classname-transform";
import { pathToFileUrl } from "../util/text-utils";
import type { Settings } from "../../settings";

const IDENTIFIER_RE = /^[a-zA-Z_][\w-]*$/;

export type RenameBlockReason =
  | "dynamicExpression"
  | "unsafeSelectorShape"
  | "interpolatedSelector"
  | "aliasViewBlocked"
  | "expandedReferences";

export type RenameEditBlockReason =
  | "invalidNewName"
  | "crossParentBemRename"
  | "noopBemRename"
  | "emptyBemSuffixRename";

export interface SelectorRenamePlannerEnv extends ReferenceQueryEnv {
  readonly settings: Pick<Settings, "scss">;
}

export interface SelectorRenameTarget {
  readonly scssPath: string;
  readonly scssUri: string;
  readonly styleDocument: StyleDocumentHIR;
  readonly selector: SelectorDeclHIR;
  readonly canonicalSelector: SelectorDeclHIR;
  readonly canonicalName: string;
  readonly placeholder: string;
  readonly placeholderRange: Range;
  readonly rewriteSafety: SelectorRewriteSafetySummary;
  readonly aliasMode: ClassnameTransformMode;
}

export interface PlannedRenameEdit {
  readonly uri: string;
  readonly range: Range;
  readonly newText: string;
}

export interface SelectorRenamePlan {
  readonly target: SelectorRenameTarget;
  readonly edits: readonly PlannedRenameEdit[];
}

export type SelectorRenamePlanResult =
  | { readonly kind: "plan"; readonly plan: SelectorRenamePlan }
  | { readonly kind: "blocked"; readonly reason: RenameEditBlockReason };

export type SelectorRenameReadResult =
  | { readonly kind: "target"; readonly target: SelectorRenameTarget }
  | { readonly kind: "blocked"; readonly reason: RenameBlockReason }
  | { readonly kind: "miss" };

export function readStyleSelectorRenameTargetAtCursor(
  filePath: string,
  line: number,
  character: number,
  styleDocument: StyleDocumentHIR,
  env: SelectorRenamePlannerEnv,
): SelectorRenameReadResult {
  const selector = findSelectorAtCursor(styleDocument, line, character);
  if (!selector) return { kind: "miss" };
  return finalizeSelectorRenameTarget(
    {
      scssPath: filePath,
      styleDocument,
      selector,
      placeholder: selector.name,
      placeholderRange: selector.bemSuffix?.rawTokenRange ?? selector.range,
      rejectAliasSelectorViews: true,
    },
    env,
  );
}

export function readExpressionRenameTarget(
  expression: ClassExpressionHIR,
  styleDocument: StyleDocumentHIR,
  env: SelectorRenamePlannerEnv,
): SelectorRenameReadResult {
  if (expression.kind === "template" || expression.kind === "symbolRef") {
    return { kind: "blocked", reason: "dynamicExpression" };
  }
  if (expression.kind !== "literal" && expression.kind !== "styleAccess") {
    return { kind: "miss" };
  }
  const selector =
    styleDocument.selectors.find(
      (candidate): candidate is SelectorDeclHIR => candidate.name === expression.className,
    ) ?? null;
  if (!selector) return { kind: "miss" };
  return finalizeSelectorRenameTarget(
    {
      scssPath: expression.scssModulePath,
      styleDocument,
      selector,
      placeholder: expression.className,
      placeholderRange: expression.range,
      rejectAliasSelectorViews: false,
    },
    env,
  );
}

export function planSelectorRename(
  target: SelectorRenameTarget,
  newName: string,
): SelectorRenamePlanResult {
  if (!IDENTIFIER_RE.test(newName)) {
    return { kind: "blocked", reason: "invalidNewName" };
  }

  const scssEdit = target.canonicalSelector.bemSuffix
    ? buildBemSuffixEdit(
        target.scssUri,
        target.canonicalSelector.bemSuffix,
        target.canonicalSelector.name,
        newName,
      )
    : {
        uri: target.scssUri,
        range: target.canonicalSelector.range,
        newText: newName,
      };
  if ("kind" in scssEdit) return scssEdit;

  const edits: PlannedRenameEdit[] = [scssEdit];
  for (const site of target.rewriteSafety.directSites) {
    const written = site.className;
    const newText =
      written === target.canonicalName
        ? newName
        : (pickAliasForm(target.aliasMode, newName) ?? newName);
    edits.push({
      uri: site.uri,
      range: site.range,
      newText,
    });
  }

  return { kind: "plan", plan: { target, edits } };
}

export function renameBlockReasonMessage(reason: RenameBlockReason): string {
  switch (reason) {
    case "dynamicExpression":
      return "Dynamic class expressions cannot be renamed safely.";
    case "interpolatedSelector":
      return "Selectors containing interpolation cannot be renamed safely.";
    case "unsafeSelectorShape":
      return "Only flat selectors and safe BEM suffix selectors can be renamed.";
    case "aliasViewBlocked":
      return "Alias selector views cannot be renamed under the current classnameTransform mode.";
    case "expandedReferences":
      return "Rename is blocked because inferred or expanded references would make the edit unsafe.";
    default:
      reason satisfies never;
      return "Rename cannot be performed safely.";
  }
}

interface FinalizeRenameTargetArgs {
  readonly scssPath: string;
  readonly styleDocument: StyleDocumentHIR;
  readonly selector: SelectorDeclHIR;
  readonly placeholder: string;
  readonly placeholderRange: Range;
  readonly rejectAliasSelectorViews: boolean;
}

function finalizeSelectorRenameTarget(
  args: FinalizeRenameTargetArgs,
  env: SelectorRenamePlannerEnv,
): SelectorRenameReadResult {
  const canonicalSelector = findCanonicalSelector(args.styleDocument, args.selector);
  if (!isRenameSafe(canonicalSelector)) {
    if (canonicalSelector.bemSuffix?.rawToken.includes("#{")) {
      return { kind: "blocked", reason: "interpolatedSelector" };
    }
    return { kind: "blocked", reason: "unsafeSelectorShape" };
  }

  const aliasMode = env.settings.scss.classnameTransform;
  if (
    args.rejectAliasSelectorViews &&
    (aliasMode === "camelCaseOnly" || aliasMode === "dashesOnly") &&
    args.selector.viewKind === "alias"
  ) {
    return { kind: "blocked", reason: "aliasViewBlocked" };
  }

  const rewriteSafety = readSelectorRewriteSafetySummary(
    env,
    args.scssPath,
    canonicalSelector.canonicalName,
  );
  if (rewriteSafety.hasBlockingExpandedReferences) {
    return { kind: "blocked", reason: "expandedReferences" };
  }

  return {
    kind: "target",
    target: {
      scssPath: args.scssPath,
      scssUri: pathToFileUrl(args.scssPath),
      styleDocument: args.styleDocument,
      selector: args.selector,
      canonicalSelector,
      canonicalName: canonicalSelector.canonicalName,
      placeholder: args.placeholder,
      placeholderRange: args.placeholderRange,
      rewriteSafety,
      aliasMode,
    },
  };
}

function isRenameSafe(selector: SelectorDeclHIR): boolean {
  if (selector.nestedSafety === "flat") return true;
  if (selector.nestedSafety !== "bemSuffixSafe" || !selector.bemSuffix) return false;
  return !selector.bemSuffix.rawToken.includes("#{");
}

function pickAliasForm(mode: ClassnameTransformMode, newName: string): string | null {
  const forms = transformClassname(mode, newName);
  for (const form of forms) {
    if (form !== newName) return form;
  }
  return null;
}

function buildBemSuffixEdit(
  uri: string,
  bemSuffix: BemSuffixInfo,
  oldName: string,
  newName: string,
): PlannedRenameEdit | { readonly kind: "blocked"; readonly reason: RenameEditBlockReason } {
  const { parentResolvedName: parent, rawToken, rawTokenRange: rawRange } = bemSuffix;

  if (!oldName.startsWith(parent)) return { kind: "blocked", reason: "crossParentBemRename" };
  if (!newName.startsWith(parent)) return { kind: "blocked", reason: "crossParentBemRename" };

  const oldSuffix = oldName.slice(parent.length);
  const newSuffix = newName.slice(parent.length);

  if (oldSuffix === newSuffix) return { kind: "blocked", reason: "noopBemRename" };
  if (newSuffix.length === 0) return { kind: "blocked", reason: "emptyBemSuffixRename" };

  const suffixOffset = rawToken.indexOf(oldSuffix);
  if (suffixOffset !== 1) return { kind: "blocked", reason: "crossParentBemRename" };

  return {
    uri,
    range: {
      start: {
        line: rawRange.start.line,
        character: rawRange.start.character + suffixOffset,
      },
      end: {
        line: rawRange.start.line,
        character: rawRange.start.character + suffixOffset + oldSuffix.length,
      },
    },
    newText: newSuffix,
  };
}
