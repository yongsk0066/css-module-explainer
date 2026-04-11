import { describe, expect, it } from "vitest";

// ──────────────────────────────────────────────────────────────
// Wave 1 Stage 3.5 — reverse-index TSX staleness (red regression)
//
// Bug: when a class is ADDED to a .module.scss file, cached
// TSX analysis entries still carry the pre-change classRefs
// expansions. The fix walks `deps.reverseIndex.findAllForScssPath`
// on SCSS change and invalidates each affected TSX entry so the
// next provider call re-expands against the fresh classMap.
//
// This file is new in Stage 1 — body placeholder only.
// Stage 3 un-skips it alongside the fix in composition-root /
// handler-registration.
// ──────────────────────────────────────────────────────────────

describe("Wave 1 Stage 3.5 — reverse-index staleness (red regression)", () => {
  // TODO(wave1-stage3): un-skip after fix lands
  it.skip("adding a class to a SCSS module invalidates cached TSX reverse-index expansions (wave1-stage3.5)", async () => {
    // Harness:
    //   1. Open Button.module.scss with `.a {}`.
    //   2. Open App.tsx referencing cx(\`prefix-${x}\`) where
    //      `x: "a"` — reverse index records one expanded
    //      static site at class "a".
    //   3. Change SCSS to `.a {} .b {}` and fire
    //      didChangeWatchedFiles for the SCSS path.
    //   4. Without re-opening App.tsx, run provider dispatch
    //      (e.g. findReferences for class "b").
    //   Expectation: the reverse index now contains an
    //   expanded static site for class "b" because App.tsx's
    //   cached entry was invalidated and re-analysed.
    //   Current buggy code keeps the stale entry and returns
    //   zero sites for "b".
    expect.fail("red placeholder — wave1-stage3.5");
  });
});
