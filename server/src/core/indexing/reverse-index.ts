import type { CallSite } from "@css-module-explainer/shared";
import type { AnalysisEntry } from "./document-analysis-cache.js";

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
 * Production reverse index.
 *
 * Storage:
 *   `forward`  Map<scssPath, Map<className, CallSite[]>>
 *   `back`     Map<uri, Set<{ scssPath, className }>>
 *
 * `record(uri, callSites)` is idempotent: the back-pointer lets
 * `forget(uri)` find every (scssPath, className) bucket the uri
 * previously contributed to and drop only its entries, without
 * a full-forward-scan. This keeps incremental document updates
 * O(|callSites|), not O(|workspace|).
 *
 * `find` and `count` are O(1) amortised — both walk at most
 * one flat array.
 *
 * Only `CallSite.match.kind === "static"` contributes entries.
 * Template and variable kinds are deliberately skipped — they
 * cover a range of possible classes and resolving each member
 * to a concrete CallSite would need the classMap at index time,
 * which the reverse index does not hold. A future extension can
 * emit one CallSite per resolved member before recording.
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

/**
 * Build the `CallSite[]` list the reverse index consumes from
 * an AnalysisEntry. Co-located with `WorkspaceReverseIndex` — the
 * projection and its consumer change together.
 */
export function collectCallSites(uri: string, entry: AnalysisEntry): CallSite[] {
  return entry.calls.map((call) => ({
    uri,
    range: call.originRange,
    binding: call.binding,
    match: matchOf(call),
  }));
}

function matchOf(call: AnalysisEntry["calls"][number]): CallSite["match"] {
  switch (call.kind) {
    case "static":
      return { kind: "static", className: call.className };
    case "template":
      return { kind: "template", staticPrefix: call.staticPrefix };
    case "variable":
      return { kind: "variable", variableName: call.variableName };
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
