export interface ParserSassSeedFactsV0 {
  readonly variableDeclNames: readonly string[];
  readonly variableRefNames: readonly string[];
  readonly mixinDeclNames: readonly string[];
  readonly mixinIncludeNames: readonly string[];
  readonly functionDeclNames: readonly string[];
  readonly functionCallNames: readonly string[];
  readonly moduleUseSources: readonly string[];
  readonly moduleForwardSources: readonly string[];
  readonly moduleImportSources: readonly string[];
}

export function deriveSassSummary(source: string): ParserSassSeedFactsV0 {
  const variableDeclNames = [...source.matchAll(/(^|[{\s;])\$([A-Za-z_-][A-Za-z0-9_-]*)\s*:/g)].map(
    (match) => match[2]!,
  );
  const variableRefNames = [...source.matchAll(/\$([A-Za-z_-][A-Za-z0-9_-]*)/g)]
    .filter((match) => {
      const end = match.index + match[0].length;
      const next = /\S/.exec(source.slice(end))?.[0];
      return next !== ":";
    })
    .map((match) => match[1]!);
  const mixinDeclNames = [...source.matchAll(/@mixin\s+([A-Za-z_-][A-Za-z0-9_-]*)/g)].map(
    (match) => match[1]!,
  );
  const mixinIncludeNames = [...source.matchAll(/@include\s+([A-Za-z_-][A-Za-z0-9_-]*)/g)].map(
    (match) => match[1]!,
  );
  const functionDeclNames = [...source.matchAll(/@function\s+([A-Za-z_-][A-Za-z0-9_-]*)/g)].map(
    (match) => match[1]!,
  );
  const functionCallNames = functionDeclNames.flatMap((name) => {
    const callPattern = new RegExp(`\\b${escapeRegExp(name)}\\s*\\(`, "g");
    return [...source.matchAll(callPattern)].length > 1 ? [name] : [];
  });
  const sourceForAtRule = (name: "use" | "forward" | "import") =>
    [...source.matchAll(new RegExp(`@${name}\\s+([^;{]+)`, "g"))].flatMap((match) =>
      [...match[1]!.matchAll(/["']([^"']+)["']/g)].map((sourceMatch) => sourceMatch[1]!),
    );

  return {
    variableDeclNames: uniqueSorted(variableDeclNames),
    variableRefNames: uniqueSorted(variableRefNames),
    mixinDeclNames: uniqueSorted(mixinDeclNames),
    mixinIncludeNames: uniqueSorted(mixinIncludeNames),
    functionDeclNames: uniqueSorted(functionDeclNames),
    functionCallNames: uniqueSorted(functionCallNames),
    moduleUseSources: uniqueSorted(sourceForAtRule("use")),
    moduleForwardSources: uniqueSorted(sourceForAtRule("forward")),
    moduleImportSources: uniqueSorted(sourceForAtRule("import")),
  };
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].toSorted((left, right) => left.localeCompare(right));
}

function escapeRegExp(value: string): string {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}
