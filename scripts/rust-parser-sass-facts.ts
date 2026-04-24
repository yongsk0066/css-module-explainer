export interface ParserSassSeedFactsV0 {
  readonly variableDeclNames: readonly string[];
  readonly variableParameterNames: readonly string[];
  readonly variableRefNames: readonly string[];
  readonly mixinDeclNames: readonly string[];
  readonly mixinIncludeNames: readonly string[];
  readonly functionDeclNames: readonly string[];
  readonly functionCallNames: readonly string[];
  readonly moduleUseSources: readonly string[];
  readonly moduleUseEdges: readonly ParserSassModuleUseFactV0[];
  readonly moduleForwardSources: readonly string[];
  readonly moduleImportSources: readonly string[];
  readonly sameFileResolution: ParserSassSameFileResolutionFactsV0;
}

export interface ParserSassModuleUseFactV0 {
  readonly source: string;
  readonly namespaceKind: "default" | "alias" | "wildcard";
  readonly namespace: string | null;
}

export interface ParserSassSameFileResolutionFactsV0 {
  readonly resolvedVariableRefNames: readonly string[];
  readonly unresolvedVariableRefNames: readonly string[];
  readonly resolvedMixinIncludeNames: readonly string[];
  readonly unresolvedMixinIncludeNames: readonly string[];
  readonly resolvedFunctionCallNames: readonly string[];
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
  const variableParameterNames = [
    ...source.matchAll(/@(mixin|function)\s+[A-Za-z_-][A-Za-z0-9_-]*\(([^)]*)\)/g),
  ].flatMap((match) =>
    [...match[2]!.matchAll(/\$([A-Za-z_-][A-Za-z0-9_-]*)/g)].map((paramMatch) => paramMatch[1]!),
  );
  const sourceForAtRule = (name: "use" | "forward" | "import") =>
    [...source.matchAll(new RegExp(`@${name}\\s+([^;{]+)`, "g"))].flatMap((match) =>
      [...match[1]!.matchAll(/["']([^"']+)["']/g)].map((sourceMatch) => sourceMatch[1]!),
    );
  const sortedVariableDeclNames = uniqueSorted(variableDeclNames);
  const sortedVariableParameterNames = uniqueSorted(variableParameterNames);
  const sortedVariableRefNames = uniqueSorted(variableRefNames);
  const sortedMixinDeclNames = uniqueSorted(mixinDeclNames);
  const sortedMixinIncludeNames = uniqueSorted(mixinIncludeNames);
  const sortedFunctionDeclNames = uniqueSorted(functionDeclNames);
  const sortedFunctionCallNames = uniqueSorted(functionCallNames);

  return {
    variableDeclNames: sortedVariableDeclNames,
    variableParameterNames: sortedVariableParameterNames,
    variableRefNames: sortedVariableRefNames,
    mixinDeclNames: sortedMixinDeclNames,
    mixinIncludeNames: sortedMixinIncludeNames,
    functionDeclNames: sortedFunctionDeclNames,
    functionCallNames: sortedFunctionCallNames,
    moduleUseSources: uniqueSorted(sourceForAtRule("use")),
    moduleUseEdges: uniqueSortedUseEdges(deriveSassUseEdges(source)),
    moduleForwardSources: uniqueSorted(sourceForAtRule("forward")),
    moduleImportSources: uniqueSorted(sourceForAtRule("import")),
    sameFileResolution: deriveSameFileResolution({
      variableDeclNames: sortedVariableDeclNames,
      variableParameterNames: sortedVariableParameterNames,
      variableRefNames: sortedVariableRefNames,
      mixinDeclNames: sortedMixinDeclNames,
      mixinIncludeNames: sortedMixinIncludeNames,
      functionDeclNames: sortedFunctionDeclNames,
      functionCallNames: sortedFunctionCallNames,
    }),
  };
}

function deriveSameFileResolution(input: {
  readonly variableDeclNames: readonly string[];
  readonly variableParameterNames: readonly string[];
  readonly variableRefNames: readonly string[];
  readonly mixinDeclNames: readonly string[];
  readonly mixinIncludeNames: readonly string[];
  readonly functionDeclNames: readonly string[];
  readonly functionCallNames: readonly string[];
}): ParserSassSameFileResolutionFactsV0 {
  const variableTargets = new Set([...input.variableDeclNames, ...input.variableParameterNames]);
  const mixinTargets = new Set(input.mixinDeclNames);
  const functionTargets = new Set(input.functionDeclNames);

  return {
    resolvedVariableRefNames: input.variableRefNames.filter((name) => variableTargets.has(name)),
    unresolvedVariableRefNames: input.variableRefNames.filter((name) => !variableTargets.has(name)),
    resolvedMixinIncludeNames: input.mixinIncludeNames.filter((name) => mixinTargets.has(name)),
    unresolvedMixinIncludeNames: input.mixinIncludeNames.filter((name) => !mixinTargets.has(name)),
    resolvedFunctionCallNames: input.functionCallNames.filter((name) => functionTargets.has(name)),
  };
}

function deriveSassUseEdges(source: string): ParserSassModuleUseFactV0[] {
  return [...source.matchAll(/@use\s+([^;{]+)/g)].flatMap((match) => {
    const params = match[1]!;
    const alias = parseSassUseAlias(params);
    return [...params.matchAll(/["']([^"']+)["']/g)].map((sourceMatch) => {
      const sourceValue = sourceMatch[1]!;
      if (alias === "*") {
        return {
          source: sourceValue,
          namespaceKind: "wildcard",
          namespace: null,
        };
      }
      if (alias !== undefined) {
        return {
          source: sourceValue,
          namespaceKind: "alias",
          namespace: alias,
        };
      }
      return {
        source: sourceValue,
        namespaceKind: "default",
        namespace: defaultSassNamespaceForSource(sourceValue),
      };
    });
  });
}

function parseSassUseAlias(params: string): string | undefined {
  const withoutQuotedSource = params.replaceAll(/["'](?:\\.|[^"'])*["']/g, " ");
  return /\bas\s+(\*|[A-Za-z_-][A-Za-z0-9_-]*)/.exec(withoutQuotedSource)?.[1];
}

function defaultSassNamespaceForSource(source: string): string | null {
  const clean = source.split(/[?#]/, 1)[0]!.replace(/\/+$/g, "");
  const segment = clean.split("/").at(-1) ?? clean;
  const packageSegment = segment.split(":").at(-1) ?? segment;
  const stem = packageSegment.includes(".")
    ? packageSegment.slice(0, packageSegment.lastIndexOf("."))
    : packageSegment;
  const namespace = stem.startsWith("_") ? stem.slice(1) : stem;
  return /^[A-Za-z_-][A-Za-z0-9_-]*$/.test(namespace) ? namespace : null;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].toSorted((left, right) => left.localeCompare(right));
}

function uniqueSortedUseEdges(
  values: readonly ParserSassModuleUseFactV0[],
): ParserSassModuleUseFactV0[] {
  const byKey = new Map(values.map((value) => [JSON.stringify(value), value]));
  return [...byKey.values()].toSorted((left, right) => {
    const sourceCompare = left.source.localeCompare(right.source);
    if (sourceCompare !== 0) return sourceCompare;
    const kindCompare = left.namespaceKind.localeCompare(right.namespaceKind);
    if (kindCompare !== 0) return kindCompare;
    return (left.namespace ?? "").localeCompare(right.namespace ?? "");
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}
