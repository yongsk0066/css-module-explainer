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
