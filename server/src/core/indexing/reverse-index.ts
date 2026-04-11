import type { CallSite, ScssClassMap } from "@css-module-explainer/shared";
import { canonicalNameOf } from "../scss/classname-transform";
import type { AnalysisEntry } from "./document-analysis-cache";
import type { TypeResolver } from "../ts/type-resolver";

/**
 * Reverse index of cx() call sites, keyed by (scssPath, className).
 */
export interface ReverseIndex {
  /**
   * Replace the contribution for `uri` with `callSites`. Idempotent:
   * a second call with the same uri drops the previous entries
   * automatically. Implementations maintain a reverse pointer
   * (uri → keys) so this stays O(1) amortised.
   */
  record(uri: string, callSites: readonly CallSite[]): void;

  /** Drop every contribution previously recorded under `uri`. */
  forget(uri: string): void;

  /**
   * Look up every CallSite referencing `className` inside the
   * CSS module at `scssPath`. Returns `[]` when nothing is known.
   */
  find(scssPath: string, className: string): readonly CallSite[];

  /** Fast count for reference-lens rendering. */
  count(scssPath: string, className: string): number;

  /**
   * Return every CallSite recorded for the given SCSS file path,
   * across all class names. Used by unused-selector detection to
   * check for unresolvable variable/template references that
   * suppress false positives at the module level.
   */
  findAllForScssPath(scssPath: string): readonly CallSite[];

  /** Drop every contribution across every uri. */
  clear(): void;
}

/**
 * No-op ReverseIndex. Kept so test doubles and benchmark harnesses
 * can exercise the ReverseIndex contract without maintaining a
 * real forward/back map.
 */
export class NullReverseIndex implements ReverseIndex {
  record(_uri: string, _callSites: readonly CallSite[]): void {}
  forget(_uri: string): void {}
  find(_scssPath: string, _className: string): readonly CallSite[] {
    return [];
  }
  count(_scssPath: string, _className: string): number {
    return 0;
  }
  findAllForScssPath(_scssPath: string): readonly CallSite[] {
    return [];
  }
  clear(): void {}
}

/**
 * Two-level map (scssPath → className → CallSite[]) with
 * back-pointers for O(1) `forget(uri)` on document close.
 *
 * Only static call kinds are indexed. Template and variable
 * kinds are skipped — resolving them would require the classMap
 * at index time, which this layer does not hold.
 */
export class WorkspaceReverseIndex implements ReverseIndex {
  private readonly forward = new Map<string, Map<string, CallSite[]>>();
  private readonly back = new Map<string, Set<string>>();

  record(uri: string, callSites: readonly CallSite[]): void {
    this.forget(uri);
    if (callSites.length === 0) return;
    const keys = new Set<string>();
    for (const site of callSites) {
      const scssPath = site.scssModulePath;
      // Keyed by `canonicalName` (the original SCSS selector) so
      // every alias access form resolves to the same bucket. Non-
      // static kinds (template/variable) share a sentinel bucket
      // because they are not directly lookupable by class name.
      const key = site.match.kind === "static" ? site.match.canonicalName : "__non_static__";
      const classMap = this.forward.get(scssPath) ?? new Map<string, CallSite[]>();
      const list = classMap.get(key) ?? [];
      list.push(site);
      classMap.set(key, list);
      this.forward.set(scssPath, classMap);
      keys.add(backKey(scssPath, key));
    }
    this.back.set(uri, keys);
  }

  forget(uri: string): void {
    const keys = this.back.get(uri);
    if (!keys) return;
    for (const key of keys) {
      const { scssPath, className } = parseBackKey(key);
      const classMap = this.forward.get(scssPath);
      if (!classMap) continue;
      const list = classMap.get(className);
      if (!list) continue;
      const remaining = list.filter((site) => site.uri !== uri);
      if (remaining.length === 0) {
        classMap.delete(className);
        if (classMap.size === 0) this.forward.delete(scssPath);
      } else {
        classMap.set(className, remaining);
      }
    }
    this.back.delete(uri);
  }

  find(scssPath: string, className: string): readonly CallSite[] {
    return this.forward.get(scssPath)?.get(className) ?? [];
  }

  count(scssPath: string, className: string): number {
    return this.find(scssPath, className).length;
  }

  findAllForScssPath(scssPath: string): readonly CallSite[] {
    const result: CallSite[] = [];
    const classMap = this.forward.get(scssPath);
    if (classMap) {
      for (const list of classMap.values()) {
        result.push(...list);
      }
    }
    return result;
  }

  clear(): void {
    this.forward.clear();
    this.back.clear();
  }
}

export interface CallSiteResolverContext {
  readonly classMapForPath: (path: string) => ScssClassMap | null;
  readonly typeResolver: TypeResolver;
  readonly workspaceRoot: string;
  readonly filePath: string;
}

/**
 * Build the `CallSite[]` list the reverse index consumes from the
 * document's unified `classRefs`.
 *
 * When `ctx` is provided, template and variable cx() refs are
 * EXPANDED into individual static-keyed entries so Find References
 * can locate them. Without `ctx`, only direct static entries land
 * in the index (template/variable kinds are recorded but cannot be
 * looked up by className).
 */
export function collectCallSites(
  uri: string,
  entry: AnalysisEntry,
  ctx?: CallSiteResolverContext,
): CallSite[] {
  const sites: CallSite[] = [];
  for (const ref of entry.classRefs) {
    const base: CallSiteBase = { uri, range: ref.originRange, scssModulePath: ref.scssModulePath };
    switch (ref.kind) {
      case "static": {
        // Native static token: the user literally wrote this class
        // name. Applies to both cxCall (`cx('btn')`) and styleAccess
        // (`styles.btn`) origins. Resolve the canonical SCSS name
        // via classMap lookup so alias-form access points at the
        // same reverse-index bucket as the original form.
        const canonicalName = resolveCanonicalName(ctx, ref.scssModulePath, ref.className);
        sites.push({
          ...base,
          match: { kind: "static", className: ref.className, canonicalName },
          expansion: "direct",
        });
        break;
      }
      case "template":
        sites.push({
          ...base,
          match: { kind: "template", staticPrefix: ref.staticPrefix },
          expansion: "direct",
        });
        if (ctx) expandTemplateRef(ref, base, ctx, sites);
        break;
      case "variable":
        sites.push({
          ...base,
          match: { kind: "variable", variableName: ref.variableName },
          expansion: "direct",
        });
        if (ctx) expandVariableRef(ref, base, ctx, sites);
        break;
      default:
        // Compile-time exhaustiveness check. `satisfies never`
        // surfaces a new `ClassRef` kind at build time; the
        // `break` ensures a runtime-widened kind (e.g. via a
        // bad JSON deserialization) skips the one bad ref
        // instead of truncating the whole document's call-site
        // list with an early return.
        ref satisfies never;
        break;
    }
  }

  return sites;
}

/**
 * Look up the original SCSS selector name for a class token. When
 * no class map is available (unit tests without the DI context),
 * or when the token is not in the map, returns the token itself —
 * the non-alias case collapses to the identity and the reverse
 * index stores under the same key the caller would query with.
 */
function resolveCanonicalName(
  ctx: CallSiteResolverContext | undefined,
  scssModulePath: string,
  className: string,
): string {
  if (!ctx) return className;
  const classMap = ctx.classMapForPath(scssModulePath);
  if (!classMap) return className;
  const entry = classMap.get(className);
  return entry?.originalName ?? className;
}

type CallSiteBase = Pick<CallSite, "uri" | "range" | "scssModulePath">;

/**
 * Push one synthesized static CallSite per class name whose
 * identifier starts with the template's static prefix. The
 * synthesized sites carry the template's origin range, not the
 * literal class token, so rename filters them out.
 */
function expandTemplateRef(
  ref: { readonly staticPrefix: string; readonly scssModulePath: string },
  base: CallSiteBase,
  ctx: CallSiteResolverContext,
  out: CallSite[],
): void {
  const classMap = ctx.classMapForPath(ref.scssModulePath);
  if (!classMap) return;
  for (const [name, info] of classMap) {
    if (!name.startsWith(ref.staticPrefix)) continue;
    out.push({
      ...base,
      match: { kind: "static", className: name, canonicalName: canonicalNameOf(info) },
      expansion: "expanded",
    });
  }
}

/**
 * Push one synthesized static CallSite per union member when the
 * variable's type resolves to a string-literal union. Like template
 * expansion, each synthesized entry carries the variable's origin
 * range and is flagged `"expanded"`.
 */
function expandVariableRef(
  ref: { readonly variableName: string; readonly scssModulePath: string },
  base: CallSiteBase,
  ctx: CallSiteResolverContext,
  out: CallSite[],
): void {
  const resolved = ctx.typeResolver.resolve(ctx.filePath, ref.variableName, ctx.workspaceRoot);
  if (resolved.kind !== "union") return;
  const classMap = ctx.classMapForPath(ref.scssModulePath);
  for (const value of resolved.values) {
    const canonicalName = classMap?.get(value)?.originalName ?? value;
    out.push({
      ...base,
      match: { kind: "static", className: value, canonicalName },
      expansion: "expanded",
    });
  }
}

const BACK_KEY_SEP = "\u0000";

function backKey(scssPath: string, className: string): string {
  return `${scssPath}${BACK_KEY_SEP}${className}`;
}

function parseBackKey(key: string): { scssPath: string; className: string } {
  const idx = key.indexOf(BACK_KEY_SEP);
  return {
    scssPath: key.slice(0, idx),
    className: key.slice(idx + 1),
  };
}
