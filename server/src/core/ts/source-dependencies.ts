import path from "node:path";
import ts from "typescript";

const SOURCE_FILE_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mts",
  ".cts",
  ".mjs",
  ".cjs",
  ".d.ts",
] as const;

export function collectSourceDependencyPaths(
  sourceFile: ts.SourceFile,
  filePath: string,
): readonly string[] {
  const dependencyPaths = new Set<string>([path.normalize(filePath)]);

  for (const statement of sourceFile.statements) {
    const specifier = getRelativeModuleSpecifier(statement);
    if (!specifier) continue;
    for (const candidate of resolveRelativeSourceDependencyCandidates(filePath, specifier)) {
      dependencyPaths.add(candidate);
    }
  }

  return [...dependencyPaths].toSorted();
}

function getRelativeModuleSpecifier(statement: ts.Statement): string | null {
  if (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) {
    const moduleSpecifier = statement.moduleSpecifier;
    if (
      moduleSpecifier &&
      ts.isStringLiteral(moduleSpecifier) &&
      moduleSpecifier.text.startsWith(".")
    ) {
      return moduleSpecifier.text;
    }
  }
  if (ts.isImportEqualsDeclaration(statement)) {
    const moduleReference = statement.moduleReference;
    if (
      ts.isExternalModuleReference(moduleReference) &&
      moduleReference.expression &&
      ts.isStringLiteral(moduleReference.expression) &&
      moduleReference.expression.text.startsWith(".")
    ) {
      return moduleReference.expression.text;
    }
  }
  return null;
}

function resolveRelativeSourceDependencyCandidates(
  containingFilePath: string,
  specifier: string,
): readonly string[] {
  const resolvedBase = path.normalize(path.resolve(path.dirname(containingFilePath), specifier));

  if (SOURCE_FILE_EXTENSIONS.some((ext) => resolvedBase.endsWith(ext))) {
    return [resolvedBase];
  }

  if (path.extname(resolvedBase) !== "") {
    return [];
  }

  const candidates: string[] = [];
  for (const extension of SOURCE_FILE_EXTENSIONS) {
    candidates.push(`${resolvedBase}${extension}`);
    candidates.push(path.join(resolvedBase, `index${extension}`));
  }
  return candidates;
}
