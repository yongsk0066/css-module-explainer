import type { SourceBinderResult } from "./scope-types";

export function findImportDeclId(
  sourceBinder: SourceBinderResult | undefined,
  localName: string,
  allowedImportPaths?: ReadonlySet<string>,
): string | null {
  if (!sourceBinder) return null;

  const match = sourceBinder.decls.find(
    (decl) =>
      decl.kind === "import" &&
      decl.name === localName &&
      (!allowedImportPaths || (decl.importPath && allowedImportPaths.has(decl.importPath))),
  );
  return match?.id ?? null;
}
