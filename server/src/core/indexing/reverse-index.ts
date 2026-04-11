import type { CallSite, ScssClassMap } from "@css-module-explainer/shared";
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
      const key = site.match.kind === "static" ? site.match.className : "__non_static__";
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
    const base = { uri, range: call.originRange, scssModulePath: call.scssModulePath };
    switch (call.kind) {
      case "static":
        // Native static token: the user literally wrote this class name.
        sites.push({
          ...base,
          match: { kind: "static", className: call.className },
          expansion: "direct",
        });
        break;
      case "template": {
        // The template ref itself is a direct site (the literal the user wrote).
        sites.push({
          ...base,
          match: { kind: "template", staticPrefix: call.staticPrefix },
          expansion: "direct",
        });
        // If resolver context available, expand to individual static entries.
        // These entries carry the template's origin range, not a literal
        // token — they are synthesized from a class-map lookup, so they
        // are flagged "expanded" and rename must filter them out (otherwise
        // the whole template expression would be rewritten with the new
        // class name, destroying the template literal source).
        if (ctx) {
          const classMap = ctx.classMapForPath(call.scssModulePath);
          if (classMap) {
            for (const name of classMap.keys()) {
              if (name.startsWith(call.staticPrefix)) {
                sites.push({
                  ...base,
                  match: { kind: "static", className: name },
                  expansion: "expanded",
                });
              }
            }
          }
        }
        break;
      }
      case "variable": {
        // The variable ref itself is a direct site (the identifier the user wrote).
        sites.push({
          ...base,
          match: { kind: "variable", variableName: call.variableName },
          expansion: "direct",
        });
        // Union-type resolution synthesizes one static entry per union
        // value. Like template expansion, each entry carries the
        // variable's origin range and must be flagged "expanded".
        if (ctx) {
          const resolved = ctx.typeResolver.resolve(
            ctx.filePath,
            call.variableName,
            ctx.workspaceRoot,
          );
          if (resolved.kind === "union") {
            for (const value of resolved.values) {
              sites.push({
                ...base,
                match: { kind: "static", className: value },
                expansion: "expanded",
              });
            }
          }
        }
        break;
      }
    }
  }

  // Process styles.x direct references (StylePropertyRef reverse-index entries).
  for (const ref of entry.styleRefs) {
    sites.push({
      uri,
      range: ref.originRange,
      scssModulePath: ref.scssModulePath,
      match: { kind: "static", className: ref.className },
      expansion: "direct",
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
