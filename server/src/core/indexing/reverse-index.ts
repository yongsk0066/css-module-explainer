import type { CallSite, CxBinding, ScssClassMap } from "@css-module-explainer/shared";
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
      if (site.match.kind !== "static") continue;
      const scssPath = site.binding.scssModulePath;
      const className = site.match.className;
      const classMap = this.forward.get(scssPath) ?? new Map<string, CallSite[]>();
      const list = classMap.get(className) ?? [];
      list.push(site);
      classMap.set(className, list);
      this.forward.set(scssPath, classMap);
      keys.add(backKey(scssPath, className));
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
 * Build the `CallSite[]` list the reverse index consumes.
 *
 * When `ctx` is provided, template and variable calls are EXPANDED
 * into individual static-keyed entries so Find References can
 * locate them. Without `ctx`, only static calls are indexed (the
 * default behavior).
 */
export function collectCallSites(
  uri: string,
  entry: AnalysisEntry,
  ctx?: CallSiteResolverContext,
): CallSite[] {
  const sites: CallSite[] = [];
  for (const call of entry.calls) {
    const base = { uri, range: call.originRange, binding: call.binding };
    switch (call.kind) {
      case "static":
        sites.push({ ...base, match: { kind: "static", className: call.className } });
        break;
      case "template": {
        // Always record the template match for display purposes.
        sites.push({ ...base, match: { kind: "template", staticPrefix: call.staticPrefix } });
        // If resolver context available, expand to individual static entries.
        if (ctx) {
          const classMap = ctx.classMapForPath(call.binding.scssModulePath);
          if (classMap) {
            for (const name of classMap.keys()) {
              if (name.startsWith(call.staticPrefix)) {
                sites.push({ ...base, match: { kind: "static", className: name } });
              }
            }
          }
        }
        break;
      }
      case "variable": {
        sites.push({ ...base, match: { kind: "variable", variableName: call.variableName } });
        if (ctx) {
          const resolved = ctx.typeResolver.resolve(
            ctx.filePath,
            call.variableName,
            ctx.workspaceRoot,
          );
          if (resolved.kind === "union") {
            for (const value of resolved.values) {
              sites.push({ ...base, match: { kind: "static", className: value } });
            }
          }
        }
        break;
      }
    }
  }

  // Process styles.x direct references (L8 reverse-index extension).
  // Synthetic CxBinding satisfies the CallSite.binding field -- acknowledged
  // tech debt until CallSite.binding is replaced with CallSite.scssModulePath.
  for (const ref of entry.styleRefs) {
    const syntheticBinding: CxBinding = {
      cxVarName: ref.stylesVarName,
      stylesVarName: ref.stylesVarName,
      scssModulePath: ref.scssModulePath,
      classNamesImportName: "",
      scope: { startLine: 0, endLine: Number.MAX_SAFE_INTEGER },
    };
    sites.push({
      uri,
      range: ref.originRange,
      binding: syntheticBinding,
      match: { kind: "static", className: ref.className },
    });
  }

  return sites;
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
