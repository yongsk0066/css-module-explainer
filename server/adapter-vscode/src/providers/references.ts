import type { Location, ReferenceParams } from "vscode-languageserver/node";
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
  readSelectorUsageSummary,
  resolveComposesTarget,
  resolveValueImportTarget,
  resolveValueTarget,
} from "../../../src/core/query";
import { findLangForPath } from "../../../src/core/scss/lang-registry";
import { fileUrlToPath, pathToFileUrl } from "../../../src/core/util/text-utils";
import { toLspRange } from "./lsp-adapters";
import { wrapHandler } from "./_wrap-handler";

/**
 * Handle `textDocument/references` for a class selector inside a
 * `.module.{scss,css}` file.
 *
 * Pipeline:
 * 1. Bail if the file is not a style module.
 * 2. Ask `deps.styleDocumentForPath` — null result also covers
 *    "file missing on disk", so no separate exists-check.
 * 3. Find the selector whose range contains the cursor.
 * 4. Ask the shared reference query for every site referencing
 *    that `(scssPath, canonicalName)` pair.
 * 5. Convert each CallSite to an LSP `Location`.
 *
 * Error isolation is owned by `wrapHandler`.
 */
export const handleReferences = wrapHandler<ReferenceParams, [], Location[] | null>(
  "references",
  (params, deps) => {
    const filePath = fileUrlToPath(params.textDocument.uri);
    if (!findLangForPath(filePath)) return null;

    const styleDocument = deps.styleDocumentForPath(filePath);
    if (!styleDocument) return null;

    const selector = findSelectorAtCursor(
      styleDocument,
      params.position.line,
      params.position.character,
    );
    const composesHit = selector
      ? null
      : findComposesTokenAtCursor(styleDocument, params.position.line, params.position.character);
    const target = selector
      ? {
          filePath,
          canonicalName: selector.canonicalName,
        }
      : (() => {
          const resolved = resolveComposesTarget(
            deps.styleDocumentForPath,
            styleDocument.filePath,
            composesHit,
          );
          if (!resolved) return null;
          return {
            filePath: resolved.filePath,
            canonicalName: resolved.selector.canonicalName,
          };
        })();
    if (target) {
      const usage = readSelectorUsageSummary(deps, target.filePath, target.canonicalName);
      if (!usage.hasAnyReferences) return null;

      // No expansion filter here — expanded sites are valid Find Refs
      // results (they represent where a rename WOULD edit if the user
      // changed the template/variable resolution). Rename is the only
      // provider that filters `expansion === "expanded"`; see rename.ts.
      return usage.allSites.map<Location>((site) => ({
        uri: site.uri,
        range: toLspRange(site.range),
      }));
    }

    const keyframes =
      findKeyframesAtCursor(styleDocument, params.position.line, params.position.character) ??
      (() => {
        const ref = findAnimationNameRefAtCursor(
          styleDocument,
          params.position.line,
          params.position.character,
        );
        return ref ? findKeyframesByName(styleDocument, ref.name) : null;
      })();
    if (keyframes) {
      const refs = listAnimationNameRefs(styleDocument, keyframes.name).map<Location>((ref) => ({
        uri: params.textDocument.uri,
        range: toLspRange(ref.range),
      }));
      if (params.context.includeDeclaration) {
        refs.unshift({
          uri: params.textDocument.uri,
          range: toLspRange(keyframes.range),
        });
      }
      return refs.length > 0 ? refs : null;
    }

    const valueDecl = findValueDeclAtCursor(
      styleDocument,
      params.position.line,
      params.position.character,
    );
    if (valueDecl) {
      const valueRefs = listValueRefs(styleDocument, valueDecl.name).map<Location>((ref) => ({
        uri: params.textDocument.uri,
        range: toLspRange(ref.range),
      }));
      if (params.context.includeDeclaration) {
        valueRefs.unshift({
          uri: params.textDocument.uri,
          range: toLspRange(valueDecl.range),
        });
      }
      return valueRefs.length > 0 ? dedupeLocations(valueRefs) : null;
    }

    const valueImport = findValueImportAtCursor(
      styleDocument,
      params.position.line,
      params.position.character,
    );
    if (valueImport) {
      const valueRefs = [
        {
          uri: params.textDocument.uri,
          range: toLspRange(valueImport.range),
        },
        ...listValueRefs(styleDocument, valueImport.name).map<Location>((ref) => ({
          uri: params.textDocument.uri,
          range: toLspRange(ref.range),
        })),
      ];
      if (params.context.includeDeclaration) {
        const importedTarget = resolveValueImportTarget(
          deps.styleDocumentForPath,
          styleDocument.filePath,
          valueImport,
        );
        if (importedTarget) {
          valueRefs.unshift({
            uri: pathToFileUrl(importedTarget.filePath),
            range: toLspRange(importedTarget.valueDecl.range),
          });
        }
      }
      return valueRefs.length > 0 ? dedupeLocations(valueRefs) : null;
    }

    const valueRef = findValueRefAtCursor(
      styleDocument,
      params.position.line,
      params.position.character,
    );
    if (!valueRef) return null;
    const valueTarget = resolveValueTarget(
      deps.styleDocumentForPath,
      styleDocument.filePath,
      styleDocument,
      valueRef.name,
    );
    if (!valueTarget) return null;
    const valueRefs = [
      ...(valueTarget.bindingKind === "imported"
        ? [
            {
              uri: params.textDocument.uri,
              range: toLspRange(valueTarget.valueImport!.range),
            },
          ]
        : []),
      ...listValueRefs(styleDocument, valueRef.name).map<Location>((ref) => ({
        uri: params.textDocument.uri,
        range: toLspRange(ref.range),
      })),
    ];
    if (params.context.includeDeclaration) {
      valueRefs.unshift({
        uri:
          valueTarget.filePath === styleDocument.filePath
            ? params.textDocument.uri
            : `file://${valueTarget.filePath}`,
        range: toLspRange(valueTarget.valueDecl.range),
      });
    }
    return valueRefs.length > 0 ? dedupeLocations(valueRefs) : null;
  },
  null,
);
export { findSelectorAtCursor } from "../../../src/core/query";

function dedupeLocations(locations: readonly Location[]): Location[] {
  const unique = new Map<string, Location>();
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
