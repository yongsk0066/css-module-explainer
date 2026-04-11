import type { ScssClassMap, SelectorInfo } from "@css-module-explainer/shared";

/**
 * 5-mode classname transformation for CSS Modules. Mirrors
 * css-loader's `localsConvention` option and the ts-plugin-css-modules
 * implementation (ref: ~/oss/typescript-plugin-css-modules/src/helpers/classTransforms.ts).
 *
 * Takes an original SCSS class name and returns the list of names
 * the JS-side `classMap` should expose for it:
 *
 * | Mode             | Original | Output for `.btn-primary` |
 * |------------------|:--------:|---------------------------|
 * | `asIs`           |    ✓     | `[btn-primary]`           |
 * | `camelCase`      |    ✓     | `[btn-primary, btnPrimary]` |
 * | `camelCaseOnly`  |    ✗     | `[btnPrimary]`            |
 * | `dashes`         |    ✓     | `[btn-primary, btnPrimary]` |
 * | `dashesOnly`     |    ✗     | `[btnPrimary]`            |
 *
 * Dedup rule: if the transformed name equals the original, only
 * the original is emitted.
 *
 * `camelCase*` consumes `-`, `_`, whitespace as separators (ASCII
 * subset of lodash-camelcase). `dashes*` consumes only `-`, leaving
 * underscores and whitespace untouched. Unicode class names are
 * out of scope; `.classNameB` or `.btn-primary` style names
 * produce lodash-equivalent output for all real-world inputs.
 */
export type ClassnameTransformMode =
  | "asIs"
  | "camelCase"
  | "camelCaseOnly"
  | "dashes"
  | "dashesOnly";

export function transformClassname(mode: ClassnameTransformMode, name: string): string[] {
  switch (mode) {
    case "asIs":
      return [name];
    case "camelCase": {
      const camel = toCamelCase(name);
      return camel === name ? [name] : [name, camel];
    }
    case "camelCaseOnly":
      return [toCamelCase(name)];
    case "dashes": {
      const dashed = dashesToCamel(name);
      return dashed === name ? [name] : [name, dashed];
    }
    case "dashesOnly":
      return [dashesToCamel(name)];
  }
}

/**
 * `-+(\w)` → uppercase. Only dashes are consumed; underscores and
 * whitespace pass through. Matches ts-plugin's regex at
 * classTransforms.ts:8.
 */
function dashesToCamel(name: string): string {
  return name.replace(/-+(\w)/g, (_, ch: string) => ch.toUpperCase());
}

/**
 * ASCII camelCase: treats `-`, `_`, whitespace as separators.
 * Leading separators are stripped, consecutive separators collapse
 * to a single boundary, the first segment stays lowercase, the rest
 * are capitalized. Output matches lodash.camelcase for ASCII input.
 */
function toCamelCase(name: string): string {
  const parts = name.split(/[\s_-]+/).filter(Boolean);
  if (parts.length === 0) return name;
  return parts
    .map((p, i) =>
      i === 0 ? p.charAt(0).toLowerCase() + p.slice(1) : p.charAt(0).toUpperCase() + p.slice(1),
    )
    .join("");
}

/**
 * Expand a base class map with classnameTransform aliases.
 *
 * For `asIs` mode this is an identity (returns the same reference
 * — zero cost, and downstream memoized structures stay valid).
 * For the other four modes it walks the base map and, for each
 * entry whose transform produces a name different from the
 * original, adds an alias entry with `originalName` set. The
 * `bemSuffix`, `isNested`, `range`, and `ruleRange` fields are
 * copied via `...info` spread — reference-identical to the
 * original so the rename provider's suffix-math operates on the
 * ORIGINAL source token.
 */
export function expandClassMapWithTransform(
  base: ScssClassMap,
  mode: ClassnameTransformMode,
): ScssClassMap {
  if (mode === "asIs") return base;

  const expanded = new Map<string, SelectorInfo>();
  for (const [name, info] of base) {
    const aliases = transformClassname(mode, name);
    for (const alias of aliases) {
      if (alias === name) {
        expanded.set(name, info);
        continue;
      }
      expanded.set(alias, {
        ...info,
        name: alias,
        originalName: name,
      });
    }
    // camelCaseOnly / dashesOnly: `aliases` does not contain the
    // original name, so the original entry is dropped from the
    // expanded map. Consumers that need the original still have
    // `alias.originalName` as the back-pointer.
  }
  return expanded;
}
