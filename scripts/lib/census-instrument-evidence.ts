import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { compilerApi as ts } from "../../server/engine-core-ts/src/ts-facade";
import type tsTypes from "../../server/engine-core-ts/src/ts-facade";

export const RETIRED_INSTRUMENT = {
  pin: "cfaf03e5a09fd6e0a5f5293c30b44903411f1af4",
  path: "scripts/check-rust-precision-floor.ts",
} as const;

// The runner contract owns this population independently of the editable recipes.
export const CENSUS_ROW_IDS = [
  "a1",
  "a2",
  "b1",
  "b2",
  "c",
  "d",
  "e",
  "f",
  "g1",
  "g2",
  "s1",
  "s2",
  "s3",
  "j",
  "k",
  "l",
  "m",
  "n1",
  "n2",
  "o",
  "p",
  "q",
  "t1",
  "t2",
  "t3",
] as const;

export function assertCensusPopulation(ids: readonly string[]): void {
  const expected = new Set<string>(CENSUS_ROW_IDS);
  const actual = new Set(ids);
  assert.equal(actual.size, ids.length, "duplicate census row id");
  for (const id of expected) assert.ok(actual.has(id), "census row missing " + id);
  for (const id of actual) assert.ok(expected.has(id), "unexpected census row " + id);
  assert.equal(ids.length, CENSUS_ROW_IDS.length, "census row count diverged");
}

function parsedSource(source: string): tsTypes.SourceFile {
  return ts.createSourceFile(
    "instrument.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
}

export function checkerInventory(
  checkerPath: string,
  source: string,
): Array<{ readonly identity: string; readonly kind: "assert" | "blockBody" }> {
  const file = parsedSource(source);
  const rows: Array<{ identity: string; kind: "assert" | "blockBody" }> = [];
  const visit = (node: tsTypes.Node): void => {
    let kind: "assert" | "blockBody" | undefined;
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (
        (ts.isIdentifier(callee) && callee.text === "assert") ||
        (ts.isPropertyAccessExpression(callee) &&
          ts.isIdentifier(callee.expression) &&
          callee.expression.text === "assert")
      )
        kind = "assert";
      else if (ts.isIdentifier(callee) && callee.text === "blockBody") kind = "blockBody";
    } else if (ts.isFunctionDeclaration(node) && node.name?.text === "blockBody") {
      kind = "blockBody";
    }
    if (kind) {
      const start = node.getStart(file);
      const line = file.getLineAndCharacterOfPosition(start).line + 1;
      const digest = createHash("sha256").update(source.slice(start, node.end)).digest("hex");
      rows.push({ identity: checkerPath + ":" + line + "#" + digest, kind });
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return rows.toSorted((a, b) => {
    const left = a.kind + "\0" + a.identity;
    const right = b.kind + "\0" + b.identity;
    return left < right ? -1 : left > right ? 1 : 0;
  });
}

export function assertNoLiteralRowSelection(source: string): void {
  const file = parsedSource(source);
  const program = ts.createProgram(
    [file.fileName],
    { noLib: true, noResolve: true },
    {
      getSourceFile: (name) => (name === file.fileName ? file : undefined),
      getDefaultLibFileName: () => "no-lib.d.ts",
      writeFile: () => undefined,
      getCurrentDirectory: () => "",
      getDirectories: () => [],
      getCanonicalFileName: (name) => name,
      useCaseSensitiveFileNames: () => true,
      getNewLine: () => "\n",
      fileExists: (name) => name === file.fileName,
      readFile: (name) => (name === file.fileName ? source : undefined),
    },
  );
  const checker = program.getTypeChecker();
  type Flow =
    | "rows"
    | "row"
    | "expected"
    | "selector"
    | "selectors"
    | "literal"
    | tsTypes.ObjectLiteralExpression
    | tsTypes.ArrayLiteralExpression
    | tsTypes.CallExpression;
  type Flows = ReadonlySet<Flow>;
  const empty: Flows = new Set();
  const bindings = new Map<tsTypes.Symbol, Set<Flow>>();
  const returns = new Map<tsTypes.Node, Set<Flow>>();
  const unwrap = (node: tsTypes.Node): tsTypes.Node =>
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isNonNullExpression(node) ||
    ts.isTypeAssertionExpression(node)
      ? unwrap(node.expression)
      : node;
  const symbol = (node: tsTypes.Node): tsTypes.Symbol | undefined =>
    ts.isShorthandPropertyAssignment(node.parent) && node.parent.name === node
      ? checker.getShorthandAssignmentValueSymbol(node.parent)
      : checker.getSymbolAtLocation(node);
  const callable = (
    input: tsTypes.Node,
    seen = new Set<tsTypes.Symbol>(),
  ):
    | tsTypes.FunctionDeclaration
    | tsTypes.FunctionExpression
    | tsTypes.ArrowFunction
    | undefined => {
    const node = unwrap(input);
    if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node))
      return node;
    const key = symbol(node);
    if (!key || seen.has(key)) return undefined;
    seen.add(key);
    const declaration = key.valueDeclaration;
    if (declaration && ts.isVariableDeclaration(declaration) && declaration.initializer)
      return callable(declaration.initializer, seen);
    return declaration && ts.isFunctionDeclaration(declaration) ? declaration : undefined;
  };
  const merged = (...sets: Flows[]): Set<Flow> => new Set(sets.flatMap((set) => [...set]));
  const member = (input: Flows, name: string): Flows => {
    // Schema fields seed provenance; the binder supplies declaration identity and scope.
    if (name === "s0Rows") return new Set(["rows"]);
    const result = new Set<Flow>();
    if (input.has("row") && name === "id") result.add("selector");
    if (input.has("row") && name === "expected") result.add("expected");
    if (input.has("expected") && ["refusal", "refusalPrefix"].includes(name))
      result.add("selector");
    for (const value of input)
      if (typeof value !== "string" && ts.isObjectLiteralExpression(value)) {
        for (const property of value.properties) {
          if (
            (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) &&
            propertyName(property.name) === name
          )
            for (const origin of flow(
              ts.isPropertyAssignment(property) ? property.initializer : property.name,
            ))
              result.add(origin);
          if (ts.isSpreadAssignment(property))
            for (const origin of member(flow(property.expression), name)) result.add(origin);
        }
      }
    return result;
  };
  const element = (input: Flows, seen = new Set<Flow>()): Flows => {
    const result = new Set<Flow>();
    for (const value of input) {
      if (seen.has(value)) continue;
      seen.add(value);
      if (value === "rows") result.add("row");
      if (value === "selectors") result.add("selector");
      if (typeof value === "string") continue;
      if (ts.isArrayLiteralExpression(value)) {
        for (const entry of value.elements)
          for (const origin of ts.isSpreadElement(entry)
            ? element(flow(entry.expression), seen)
            : flow(entry))
            result.add(origin);
      } else if (ts.isCallExpression(value) && value.arguments[0]) {
        const callback = callable(value.arguments[0]);
        const returned = callback ? (returns.get(callback) ?? empty) : empty;
        const flat =
          ts.isPropertyAccessExpression(value.expression) &&
          value.expression.name.text === "flatMap";
        for (const origin of flat ? element(returned, seen) : returned) result.add(origin);
      }
    }
    return result;
  };
  const sequenceMethods = new Set([
    "filter",
    "slice",
    "toSorted",
    "sort",
    "toReversed",
    "reverse",
    "concat",
  ]);
  const callbackMethods = new Set([
    "map",
    "flatMap",
    "filter",
    "find",
    "findLast",
    "some",
    "every",
    "forEach",
    "reduce",
    "reduceRight",
  ]);
  const propertyName = (input: tsTypes.Node | undefined): string | undefined => {
    if (!input) return undefined;
    const node = unwrap(input);
    return ts.isIdentifier(node) ||
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node)
      ? node.text
      : undefined;
  };
  const flow = (input: tsTypes.Node): Flows => {
    const node = unwrap(input);
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isNumericLiteral(node) ||
      node.kind === ts.SyntaxKind.RegularExpressionLiteral ||
      node.kind === ts.SyntaxKind.TrueKeyword ||
      node.kind === ts.SyntaxKind.FalseKeyword
    )
      return new Set(["literal"]);
    if (ts.isIdentifier(node)) {
      const key = symbol(node);
      return key ? (bindings.get(key) ?? empty) : empty;
    }
    if (ts.isPropertyAccessExpression(node)) return member(flow(node.expression), node.name.text);
    if (ts.isElementAccessExpression(node)) {
      const key = propertyName(node.argumentExpression);
      return merged(
        key ? member(flow(node.expression), key) : empty,
        element(flow(node.expression)),
      );
    }
    if (ts.isArrayLiteralExpression(node) || ts.isObjectLiteralExpression(node))
      return new Set([node]);
    if (ts.isNewExpression(node)) return merged(...(node.arguments ?? []).map(flow));
    if (ts.isTemplateExpression(node))
      return merged(...node.templateSpans.map((span) => flow(span.expression)));
    if (ts.isBinaryExpression(node)) return merged(flow(node.left), flow(node.right));
    if (ts.isConditionalExpression(node)) return merged(flow(node.whenTrue), flow(node.whenFalse));
    if (ts.isCallExpression(node)) {
      if (ts.isPropertyAccessExpression(node.expression)) {
        const receiver = flow(node.expression.expression);
        const method = node.expression.name.text;
        if (sequenceMethods.has(method)) return receiver;
        if (["find", "findLast", "at", "pop", "shift"].includes(method)) return element(receiver);
        if (["map", "flatMap"].includes(method) && node.arguments[0]) return new Set([node]);
      }
      const fn = callable(node.expression);
      return fn
        ? (returns.get(fn) ?? empty)
        : merged(
            ...node.arguments.map(
              (argument) =>
                new Set(
                  [...flow(argument)].filter(
                    (origin) => origin === "row" || origin === "expected" || origin === "rows",
                  ),
                ),
            ),
            ts.isPropertyAccessExpression(node.expression) ||
              ts.isElementAccessExpression(node.expression)
              ? new Set(
                  [...flow(node.expression.expression)].filter((origin) => origin === "selector"),
                )
              : empty,
          );
    }
    return empty;
  };
  let changed = false;
  const add = <K>(map: Map<K, Set<Flow>>, key: K, values: Flows): void => {
    const stored = map.get(key) ?? new Set<Flow>();
    for (const value of values)
      if (!stored.has(value)) {
        stored.add(value);
        changed = true;
      }
    map.set(key, stored);
  };
  const bind = (name: tsTypes.BindingName, values: Flows): void => {
    if (ts.isIdentifier(name)) {
      const key = symbol(name);
      if (key) add(bindings, key, values);
    } else if (ts.isObjectBindingPattern(name)) {
      for (const binding of name.elements) {
        const key = propertyName(binding.propertyName ?? binding.name);
        if (key) bind(binding.name, member(values, key));
      }
    } else
      for (const binding of name.elements)
        if (ts.isBindingElement(binding)) bind(binding.name, element(values));
  };
  // Propagate from authority collections into loop declarations, destructuring, aliases,
  // callback parameters and local function arguments/returns, regardless of declaration order.
  do {
    changed = false;
    const collect = (node: tsTypes.Node): void => {
      if (ts.isVariableDeclaration(node) && node.initializer) {
        bind(node.name, flow(node.initializer));
      }
      if (ts.isForOfStatement(node) && ts.isVariableDeclarationList(node.initializer))
        for (const declaration of node.initializer.declarations)
          bind(declaration.name, element(flow(node.expression)));
      if (ts.isCallExpression(node)) {
        const fn = callable(node.expression);
        if (fn)
          for (const [index, parameter] of fn.parameters.entries())
            if (node.arguments[index]) {
              bind(parameter.name, flow(node.arguments[index]));
            }
        if (
          ts.isPropertyAccessExpression(node.expression) &&
          callbackMethods.has(node.expression.name.text) &&
          node.arguments[0]
        ) {
          const callback = callable(node.arguments[0]);
          const receiver = flow(node.expression.expression);
          const index = ["reduce", "reduceRight"].includes(node.expression.name.text) ? 1 : 0;
          if (callback?.parameters[index]) bind(callback.parameters[index].name, element(receiver));
        }
      }
      if (ts.isReturnStatement(node) && node.expression) {
        let parent: tsTypes.Node | undefined = node.parent;
        while (
          parent &&
          !ts.isFunctionDeclaration(parent) &&
          !ts.isFunctionExpression(parent) &&
          !ts.isArrowFunction(parent)
        )
          parent = parent.parent;
        if (parent) {
          add(returns, parent, flow(node.expression));
        }
      }
      if (ts.isArrowFunction(node) && !ts.isBlock(node.body)) {
        add(returns, node, flow(node.body));
      }
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isIdentifier(node.left)
      )
        bind(node.left, flow(node.right));
      ts.forEachChild(node, collect);
    };
    collect(file);
  } while (changed);
  const contains = (input: tsTypes.Node, predicate: (node: tsTypes.Node) => boolean): boolean => {
    const node = unwrap(input);
    if (predicate(node)) return true;
    let found = false;
    ts.forEachChild(node, (child) => {
      if (contains(child, predicate)) found = true;
    });
    return found;
  };
  const selector = (node: tsTypes.Node): boolean => flow(node).has("selector");
  const literal = (node: tsTypes.Node): boolean =>
    flow(node).has("literal") || ts.isTemplateExpression(node);
  const literalMembers = (input: Flows, seen = new Set<Flow>()): boolean => {
    for (const origin of input) {
      if (origin === "literal") return true;
      if (seen.has(origin)) continue;
      seen.add(origin);
      if (typeof origin === "string") continue;
      if (ts.isObjectLiteralExpression(origin)) {
        for (const property of origin.properties) {
          if (
            !ts.isSpreadAssignment(property) &&
            (propertyName(property.name) !== undefined ||
              (ts.isComputedPropertyName(property.name) && literal(property.name.expression)))
          )
            return true;
          if (ts.isSpreadAssignment(property) && literalMembers(flow(property.expression), seen))
            return true;
        }
      }
      if (literalMembers(element(new Set([origin])), seen)) return true;
    }
    return false;
  };
  const literalCollection = (node: tsTypes.Node): boolean => literalMembers(flow(node));
  const equality = new Set([
    ts.SyntaxKind.EqualsEqualsToken,
    ts.SyntaxKind.EqualsEqualsEqualsToken,
    ts.SyntaxKind.ExclamationEqualsToken,
    ts.SyntaxKind.ExclamationEqualsEqualsToken,
    ts.SyntaxKind.InKeyword,
  ]);
  const matchingMethods = new Set([
    "includes",
    "startsWith",
    "endsWith",
    "indexOf",
    "lastIndexOf",
    "match",
    "test",
    "search",
    "has",
  ]);
  const visit = (node: tsTypes.Node): void => {
    let forbidden = false;
    if (ts.isBinaryExpression(node) && equality.has(node.operatorToken.kind)) {
      forbidden =
        (contains(node.left, selector) && contains(node.right, literal)) ||
        (contains(node.right, selector) && contains(node.left, literal)) ||
        (node.operatorToken.kind === ts.SyntaxKind.InKeyword &&
          contains(node.left, selector) &&
          literalCollection(node.right));
    } else if (
      ts.isCallExpression(node) &&
      (ts.isPropertyAccessExpression(node.expression) ||
        ts.isElementAccessExpression(node.expression))
    ) {
      const method = ts.isPropertyAccessExpression(node.expression)
        ? node.expression.name.text
        : propertyName(node.expression.argumentExpression);
      forbidden =
        !!method &&
        matchingMethods.has(method) &&
        ((contains(node.expression.expression, selector) &&
          node.arguments.some((argument) => contains(argument, literal))) ||
          ((contains(node.expression.expression, literal) ||
            literalCollection(node.expression.expression)) &&
            node.arguments.some((argument) => contains(argument, selector))));
    } else if (ts.isElementAccessExpression(node)) {
      forbidden = !!node.argumentExpression && contains(node.argumentExpression, selector);
    } else if (ts.isSwitchStatement(node)) {
      forbidden =
        contains(node.expression, selector) &&
        node.caseBlock.clauses.some(
          (clause) => ts.isCaseClause(clause) && contains(clause.expression, literal),
        );
    }
    const line = file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
    assert.ok(!forbidden, "per-row literal selection is forbidden at line " + line);
    ts.forEachChild(node, visit);
  };
  visit(file);
}
