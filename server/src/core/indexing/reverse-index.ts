import type { CallSite } from "@css-module-explainer/shared";

/**
 * Reverse index of cx() call sites, keyed by (scssPath, className).
 *
 * In Phase 5 every provider records its findings into a
 * NullReverseIndex — the contract is exercised but nothing is
 * stored. Phase Final swaps in a WorkspaceReverseIndex that
 * actually builds the reverse map; no provider code changes.
 */
export interface ReverseIndex {
  /**
   * Replace the contribution for `uri` with `callSites`. Idempotent:
   * a second call with the same uri drops the previous entries
   * automatically. Phase Final implementations maintain a reverse
   * pointer (uri → keys) so this stays O(1) amortised.
   */
  record(uri: string, callSites: readonly CallSite[]): void;

  /** Drop every contribution previously recorded under `uri`. */
  forget(uri: string): void;

  /**
   * Look up every CallSite referencing `className` inside the
   * CSS module at `scssPath`. Returns `[]` when nothing is known.
   */
  find(scssPath: string, className: string): readonly CallSite[];

  /** Fast count for reference-lens rendering (Phase Final). */
  count(scssPath: string, className: string): number;

  /** Drop every contribution across every uri. */
  clear(): void;
}

/**
 * No-op implementation used throughout Phase 5–Phase 9.
 *
 * Every method silently accepts input and returns empty results.
 * The class exists so providers can call `record()` unconditionally
 * from day one — when Phase Final swaps in WorkspaceReverseIndex,
 * provider code is already shaped correctly.
 */
export class NullReverseIndex implements ReverseIndex {
  record(_uri: string, _callSites: readonly CallSite[]): void {
    // intentionally empty
  }

  forget(_uri: string): void {
    // intentionally empty
  }

  find(_scssPath: string, _className: string): readonly CallSite[] {
    return [];
  }

  count(_scssPath: string, _className: string): number {
    return 0;
  }

  clear(): void {
    // intentionally empty
  }
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
 */
export class WorkspaceReverseIndex implements ReverseIndex {
  private readonly forward = new Map<string, Map<string, CallSite[]>>();
  private readonly back = new Map<string, Set<string>>();

  record(uri: string, callSites: readonly CallSite[]): void {
    this.forget(uri);
    if (callSites.length === 0) return;
    const keys = new Set<string>();
    for (const site of callSites) {
      const scssPath = site.binding.scssModulePath;
      const className = classNameFor(site);
      if (className === null) continue;
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
 * Extract the class name a call site resolves to for indexing.
 *
 * Phase Final indexes STATIC calls only — they are the primary
 * reference target ("find every `cx('indicator')`"). Template and
 * variable calls are deliberately skipped: they cover a range of
 * possible classes and resolving each resolved member to a
 * concrete CallSite would require the classMap at index time,
 * which the reverse index does not hold. Phase Final+ can extend
 * this by emitting one CallSite per resolved member before
 * recording.
 *
 * `matchInfo` shape is defined by `provider-utils.matchInfoFor`:
 * for static it's `"static: <className>"`. We parse the prefix
 * explicitly rather than using a loose split so the parser fails
 * loudly if the shape changes.
 */
const STATIC_MATCH_PREFIX = "static: ";

function classNameFor(site: CallSite): string | null {
  if (site.kind !== "static") return null;
  if (!site.matchInfo.startsWith(STATIC_MATCH_PREFIX)) return null;
  const value = site.matchInfo.slice(STATIC_MATCH_PREFIX.length).trim();
  return value.length > 0 ? value : null;
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
