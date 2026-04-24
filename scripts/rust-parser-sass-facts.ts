export interface ParserSassSeedFactsV0 {
  readonly variableDeclNames: readonly string[];
  readonly variableParameterNames: readonly string[];
  readonly variableRefNames: readonly string[];
  readonly selectorsWithVariableRefsNames: readonly string[];
  readonly selectorsWithResolvedVariableRefsNames: readonly string[];
  readonly selectorsWithUnresolvedVariableRefsNames: readonly string[];
  readonly mixinDeclNames: readonly string[];
  readonly mixinIncludeNames: readonly string[];
  readonly selectorsWithMixinIncludesNames: readonly string[];
  readonly selectorsWithResolvedMixinIncludesNames: readonly string[];
  readonly selectorsWithUnresolvedMixinIncludesNames: readonly string[];
  readonly functionDeclNames: readonly string[];
  readonly functionCallNames: readonly string[];
  readonly selectorsWithFunctionCallsNames: readonly string[];
  readonly selectorSymbolFacts: readonly ParserSassSelectorSymbolFactV0[];
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

export interface ParserByteSpanV0 {
  readonly start: number;
  readonly end: number;
}

export interface ParserPositionV0 {
  readonly line: number;
  readonly character: number;
}

export interface ParserRangeV0 {
  readonly start: ParserPositionV0;
  readonly end: ParserPositionV0;
}

export interface ParserSassSelectorSymbolFactV0 {
  readonly selectorName: string;
  readonly symbolKind: "variable" | "mixin" | "function";
  readonly name: string;
  readonly role: "reference" | "include" | "call";
  readonly resolution: "resolved" | "unresolved";
  readonly byteSpan: ParserByteSpanV0;
  readonly range: ParserRangeV0;
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
  const selectorAttachments = deriveSassSelectorAttachments(source, {
    variableDeclNames: sortedVariableDeclNames,
    variableParameterNames: sortedVariableParameterNames,
    mixinDeclNames: sortedMixinDeclNames,
    functionDeclNames: sortedFunctionDeclNames,
  });

  return {
    variableDeclNames: sortedVariableDeclNames,
    variableParameterNames: sortedVariableParameterNames,
    variableRefNames: sortedVariableRefNames,
    selectorsWithVariableRefsNames: selectorAttachments.selectorsWithVariableRefsNames,
    selectorsWithResolvedVariableRefsNames:
      selectorAttachments.selectorsWithResolvedVariableRefsNames,
    selectorsWithUnresolvedVariableRefsNames:
      selectorAttachments.selectorsWithUnresolvedVariableRefsNames,
    mixinDeclNames: sortedMixinDeclNames,
    mixinIncludeNames: sortedMixinIncludeNames,
    selectorsWithMixinIncludesNames: selectorAttachments.selectorsWithMixinIncludesNames,
    selectorsWithResolvedMixinIncludesNames:
      selectorAttachments.selectorsWithResolvedMixinIncludesNames,
    selectorsWithUnresolvedMixinIncludesNames:
      selectorAttachments.selectorsWithUnresolvedMixinIncludesNames,
    functionDeclNames: sortedFunctionDeclNames,
    functionCallNames: sortedFunctionCallNames,
    selectorsWithFunctionCallsNames: selectorAttachments.selectorsWithFunctionCallsNames,
    selectorSymbolFacts: selectorAttachments.selectorSymbolFacts,
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

function deriveSassSelectorAttachments(
  source: string,
  input: {
    readonly variableDeclNames: readonly string[];
    readonly variableParameterNames: readonly string[];
    readonly mixinDeclNames: readonly string[];
    readonly functionDeclNames: readonly string[];
  },
): Pick<
  ParserSassSeedFactsV0,
  | "selectorsWithVariableRefsNames"
  | "selectorsWithResolvedVariableRefsNames"
  | "selectorsWithUnresolvedVariableRefsNames"
  | "selectorsWithMixinIncludesNames"
  | "selectorsWithResolvedMixinIncludesNames"
  | "selectorsWithUnresolvedMixinIncludesNames"
  | "selectorsWithFunctionCallsNames"
  | "selectorSymbolFacts"
> {
  const variableTargets = new Set([...input.variableDeclNames, ...input.variableParameterNames]);
  const mixinTargets = new Set(input.mixinDeclNames);
  const selectorsWithVariableRefsNames: string[] = [];
  const selectorsWithResolvedVariableRefsNames: string[] = [];
  const selectorsWithUnresolvedVariableRefsNames: string[] = [];
  const selectorsWithMixinIncludesNames: string[] = [];
  const selectorsWithResolvedMixinIncludesNames: string[] = [];
  const selectorsWithUnresolvedMixinIncludesNames: string[] = [];
  const selectorsWithFunctionCallsNames: string[] = [];
  const selectorSymbolFacts: ParserSassSelectorSymbolFactV0[] = [];

  for (const match of source.matchAll(/\.([A-Za-z_-][A-Za-z0-9_-]*)[^{]*\{([^{}]*)\}/g)) {
    const selectorName = match[1]!;
    const body = match[2]!;
    const ruleStart = match.index ?? 0;
    const bodyStart = ruleStart + match[0].indexOf("{") + 1;
    const variableRefMatches = [...body.matchAll(/\$([A-Za-z_-][A-Za-z0-9_-]*)/g)].map(
      (variableMatch) => {
        const start = bodyStart + (variableMatch.index ?? 0);
        return {
          name: variableMatch[1]!,
          location: symbolLocation(source, start, start + variableMatch[0].length),
        };
      },
    );
    const variableRefs = variableRefMatches.map((variableMatch) => variableMatch.name);
    if (variableRefs.length > 0) {
      selectorsWithVariableRefsNames.push(selectorName);
      if (variableRefs.some((name) => variableTargets.has(name))) {
        selectorsWithResolvedVariableRefsNames.push(selectorName);
      }
      if (variableRefs.some((name) => !variableTargets.has(name))) {
        selectorsWithUnresolvedVariableRefsNames.push(selectorName);
      }
      for (const { name, location } of variableRefMatches) {
        selectorSymbolFacts.push({
          selectorName,
          symbolKind: "variable",
          name,
          role: "reference",
          resolution: variableTargets.has(name) ? "resolved" : "unresolved",
          ...location,
        });
      }
    }

    const mixinIncludeMatches = [...body.matchAll(/@include\s+([A-Za-z_-][A-Za-z0-9_-]*)/g)].map(
      (includeMatch) => {
        const name = includeMatch[1]!;
        const start = bodyStart + (includeMatch.index ?? 0) + includeMatch[0].indexOf(name);
        return {
          name,
          location: symbolLocation(source, start, start + name.length),
        };
      },
    );
    const mixinIncludes = mixinIncludeMatches.map((includeMatch) => includeMatch.name);
    if (mixinIncludes.length > 0) {
      selectorsWithMixinIncludesNames.push(selectorName);
      if (mixinIncludes.some((name) => mixinTargets.has(name))) {
        selectorsWithResolvedMixinIncludesNames.push(selectorName);
      }
      if (mixinIncludes.some((name) => !mixinTargets.has(name))) {
        selectorsWithUnresolvedMixinIncludesNames.push(selectorName);
      }
      for (const { name, location } of mixinIncludeMatches) {
        selectorSymbolFacts.push({
          selectorName,
          symbolKind: "mixin",
          name,
          role: "include",
          resolution: mixinTargets.has(name) ? "resolved" : "unresolved",
          ...location,
        });
      }
    }

    const functionCalls = input.functionDeclNames.flatMap((name) =>
      [...body.matchAll(new RegExp(`\\b(${escapeRegExp(name)})\\s*\\(`, "g"))].map((callMatch) => {
        const callName = callMatch[1]!;
        const start = bodyStart + (callMatch.index ?? 0) + callMatch[0].indexOf(callName);
        return {
          name: callName,
          location: symbolLocation(source, start, start + callName.length),
        };
      }),
    );
    if (functionCalls.length > 0) {
      selectorsWithFunctionCallsNames.push(selectorName);
      selectorSymbolFacts.push(
        ...functionCalls.map(({ name, location }) => ({
          selectorName,
          symbolKind: "function" as const,
          name,
          role: "call" as const,
          resolution: "resolved" as const,
          byteSpan: location.byteSpan,
          range: location.range,
        })),
      );
    }
  }

  return {
    selectorsWithVariableRefsNames: uniqueSorted(selectorsWithVariableRefsNames),
    selectorsWithResolvedVariableRefsNames: uniqueSorted(selectorsWithResolvedVariableRefsNames),
    selectorsWithUnresolvedVariableRefsNames: uniqueSorted(
      selectorsWithUnresolvedVariableRefsNames,
    ),
    selectorsWithMixinIncludesNames: uniqueSorted(selectorsWithMixinIncludesNames),
    selectorsWithResolvedMixinIncludesNames: uniqueSorted(selectorsWithResolvedMixinIncludesNames),
    selectorsWithUnresolvedMixinIncludesNames: uniqueSorted(
      selectorsWithUnresolvedMixinIncludesNames,
    ),
    selectorsWithFunctionCallsNames: uniqueSorted(selectorsWithFunctionCallsNames),
    selectorSymbolFacts: uniqueSortedSelectorSymbolFacts(selectorSymbolFacts),
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

function uniqueSortedSelectorSymbolFacts(
  values: readonly ParserSassSelectorSymbolFactV0[],
): ParserSassSelectorSymbolFactV0[] {
  const byKey = new Map(values.map((value) => [JSON.stringify(value), value]));
  return [...byKey.values()].toSorted((left, right) => {
    const selectorCompare = left.selectorName.localeCompare(right.selectorName);
    if (selectorCompare !== 0) return selectorCompare;
    const kindCompare = left.symbolKind.localeCompare(right.symbolKind);
    if (kindCompare !== 0) return kindCompare;
    const nameCompare = left.name.localeCompare(right.name);
    if (nameCompare !== 0) return nameCompare;
    const roleCompare = left.role.localeCompare(right.role);
    if (roleCompare !== 0) return roleCompare;
    const resolutionCompare = left.resolution.localeCompare(right.resolution);
    if (resolutionCompare !== 0) return resolutionCompare;
    const spanStartCompare = left.byteSpan.start - right.byteSpan.start;
    if (spanStartCompare !== 0) return spanStartCompare;
    return left.byteSpan.end - right.byteSpan.end;
  });
}

function symbolLocation(
  source: string,
  startCodeUnitOffset: number,
  endCodeUnitOffset: number,
): Pick<ParserSassSelectorSymbolFactV0, "byteSpan" | "range"> {
  return {
    byteSpan: {
      start: utf8ByteOffsetForCodeUnitOffset(source, startCodeUnitOffset),
      end: utf8ByteOffsetForCodeUnitOffset(source, endCodeUnitOffset),
    },
    range: {
      start: positionAtCodeUnitOffset(source, startCodeUnitOffset),
      end: positionAtCodeUnitOffset(source, endCodeUnitOffset),
    },
  };
}

function utf8ByteOffsetForCodeUnitOffset(source: string, codeUnitOffset: number): number {
  return new TextEncoder().encode(source.slice(0, codeUnitOffset)).length;
}

function positionAtCodeUnitOffset(source: string, codeUnitOffset: number): ParserPositionV0 {
  let line = 0;
  let character = 0;
  let index = 0;

  while (index < codeUnitOffset) {
    const codePoint = source.codePointAt(index);
    if (codePoint === undefined) break;
    const codeUnitLength = codePoint > 0xffff ? 2 : 1;
    const value = source.slice(index, index + codeUnitLength);
    if (value === "\n") {
      line += 1;
      character = 0;
    } else {
      character += codeUnitLength;
    }
    index += codeUnitLength;
  }

  return { line, character };
}

function escapeRegExp(value: string): string {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}
