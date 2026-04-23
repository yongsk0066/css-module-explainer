import type { Range } from "@css-module-explainer/shared";
import {
  findAnimationNameRefAtCursor,
  findComposesTokenAtCursor,
  findKeyframesAtCursor,
  findKeyframesByName,
  findSelectorAtCursor,
  findValueDeclAtCursor,
  findValueImportAtCursor,
  findValueRefAtCursor,
  listAnimationNameRefs,
  listValueRefs,
  resolveComposesTarget,
  resolveValueImportTarget,
  resolveValueTarget,
} from "../../engine-core-ts/src/core/query";
import type { StyleDocumentHIR } from "../../engine-core-ts/src/core/hir/style-types";
import type { ProviderDeps } from "../../engine-core-ts/src/provider-deps";
import { pathToFileUrl } from "../../engine-core-ts/src/core/util/text-utils";
import {
  buildSelectorUsageLocationsFromRustPayload,
  resolveRustSelectorUsagePayloadForWorkspaceTarget,
} from "./selector-usage-query-backend";
import {
  resolveSelectedQueryBackendKind,
  usesRustSelectorUsageBackend,
} from "./selected-query-backend";
import { resolveSelectorReferenceLocations } from "./selector-references-query";

export interface StyleReferenceLocation {
  readonly uri: string;
  readonly range: Range;
}

export interface StyleReferenceQueryOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly readRustSelectorUsagePayloadForWorkspaceTarget?: typeof resolveRustSelectorUsagePayloadForWorkspaceTarget;
}

export function resolveStyleReferencesAtCursor(
  args: {
    readonly filePath: string;
    readonly line: number;
    readonly character: number;
    readonly includeDeclaration: boolean;
    readonly styleDocument: StyleDocumentHIR;
  },
  deps: Pick<
    ProviderDeps,
    | "analysisCache"
    | "semanticReferenceIndex"
    | "settings"
    | "styleDependencyGraph"
    | "styleDocumentForPath"
    | "typeResolver"
    | "workspaceRoot"
  >,
  options: StyleReferenceQueryOptions = {},
): readonly StyleReferenceLocation[] {
  const selector = findSelectorAtCursor(args.styleDocument, args.line, args.character);
  const composesHit = selector
    ? null
    : findComposesTokenAtCursor(args.styleDocument, args.line, args.character);
  const target = selector
    ? {
        filePath: args.filePath,
        canonicalName: selector.canonicalName,
      }
    : (() => {
        const resolved = resolveComposesTarget(
          deps.styleDocumentForPath,
          args.styleDocument.filePath,
          composesHit,
        );
        if (!resolved) return null;
        return {
          filePath: resolved.filePath,
          canonicalName: resolved.selector.canonicalName,
        };
      })();
  if (target) {
    if (usesRustSelectorUsageBackend(resolveSelectedQueryBackendKind(options.env))) {
      const payload = (
        options.readRustSelectorUsagePayloadForWorkspaceTarget ??
        resolveRustSelectorUsagePayloadForWorkspaceTarget
      )(
        {
          workspaceRoot: deps.workspaceRoot,
          classnameTransform: deps.settings.scss.classnameTransform,
          pathAlias: deps.settings.pathAlias,
        },
        deps,
        target.filePath,
        target.canonicalName,
      );
      const rustLocations =
        payload &&
        buildSelectorUsageLocationsFromRustPayload(payload)?.map((site) => ({
          uri: pathToFileUrl(site.filePath),
          range: site.range,
        }));
      if (rustLocations) return rustLocations;
    }
    return resolveSelectorReferenceLocations(deps, target);
  }

  const keyframes =
    findKeyframesAtCursor(args.styleDocument, args.line, args.character) ??
    (() => {
      const ref = findAnimationNameRefAtCursor(args.styleDocument, args.line, args.character);
      return ref ? findKeyframesByName(args.styleDocument, ref.name) : null;
    })();
  if (keyframes) {
    const refs = listAnimationNameRefs(
      args.styleDocument,
      keyframes.name,
    ).map<StyleReferenceLocation>((ref) => ({
      uri: pathToFileUrl(args.filePath),
      range: ref.range,
    }));
    if (args.includeDeclaration) {
      refs.unshift({
        uri: pathToFileUrl(args.filePath),
        range: keyframes.range,
      });
    }
    return refs;
  }

  const valueDecl = findValueDeclAtCursor(args.styleDocument, args.line, args.character);
  if (valueDecl) {
    const valueRefs = listValueRefs(args.styleDocument, valueDecl.name).map<StyleReferenceLocation>(
      (ref) => ({
        uri: pathToFileUrl(args.filePath),
        range: ref.range,
      }),
    );
    if (args.includeDeclaration) {
      valueRefs.unshift({
        uri: pathToFileUrl(args.filePath),
        range: valueDecl.range,
      });
    }
    return dedupeLocations(valueRefs);
  }

  const valueImport = findValueImportAtCursor(args.styleDocument, args.line, args.character);
  if (valueImport) {
    const valueRefs: StyleReferenceLocation[] = [
      {
        uri: pathToFileUrl(args.filePath),
        range: valueImport.range,
      },
      ...listValueRefs(args.styleDocument, valueImport.name).map((ref) => ({
        uri: pathToFileUrl(args.filePath),
        range: ref.range,
      })),
    ];
    if (args.includeDeclaration) {
      const importedTarget = resolveValueImportTarget(
        deps.styleDocumentForPath,
        args.styleDocument.filePath,
        valueImport,
      );
      if (importedTarget) {
        valueRefs.unshift({
          uri: pathToFileUrl(importedTarget.filePath),
          range: importedTarget.valueDecl.range,
        });
      }
    }
    return dedupeLocations(valueRefs);
  }

  const valueRef = findValueRefAtCursor(args.styleDocument, args.line, args.character);
  if (!valueRef) return [];
  const valueTarget = resolveValueTarget(
    deps.styleDocumentForPath,
    args.styleDocument.filePath,
    args.styleDocument,
    valueRef.name,
  );
  if (!valueTarget) return [];
  const valueRefs: StyleReferenceLocation[] = [
    ...(valueTarget.bindingKind === "imported"
      ? [
          {
            uri: pathToFileUrl(args.filePath),
            range: valueTarget.valueImport!.range,
          },
        ]
      : []),
    ...listValueRefs(args.styleDocument, valueRef.name).map((ref) => ({
      uri: pathToFileUrl(args.filePath),
      range: ref.range,
    })),
  ];
  if (args.includeDeclaration) {
    valueRefs.unshift({
      uri: pathToFileUrl(valueTarget.filePath),
      range: valueTarget.valueDecl.range,
    });
  }
  return dedupeLocations(valueRefs);
}

function dedupeLocations(
  locations: readonly StyleReferenceLocation[],
): readonly StyleReferenceLocation[] {
  const unique = new Map<string, StyleReferenceLocation>();
  for (const location of locations) {
    const key = [
      location.uri,
      location.range.start.line,
      location.range.start.character,
      location.range.end.line,
      location.range.end.character,
    ].join(":");
    if (!unique.has(key)) unique.set(key, location);
  }
  return [...unique.values()];
}
