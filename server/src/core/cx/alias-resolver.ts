import * as path from "node:path";

/**
 * Workspace-scoped path-alias resolver for CSS Module imports.
 *
 * Reads the clinyong-compat `cssModules.pathAlias` record and
 * matches non-relative import specifiers against it using
 * longest-prefix semantics. `${workspaceFolder}` in target values
 * is substituted at construction time; relative targets are
 * resolved against `workspaceRoot`.
 *
 * **Intentional divergence from clinyong**: clinyong's
 * `resolveImportPath` (~/oss/vscode-css-modules/src/utils/path.ts)
 * uses `Object.keys().find(...)` which is insertion-order
 * first-match — a config like `{ "@": "src", "@styles": "src/styles" }`
 * routes `@styles/button` to `src/button` when `@` appears first.
 * We use longest-prefix, which is what users actually expect.
 * README documents this one divergence.
 *
 * No wildcard (`*`) support — tsconfig `compilerOptions.paths`
 * is the natural home for that and lives on a separate axis. No
 * filesystem check — the returned path may not exist; the
 * `fileExists` DI in `DocumentAnalysisCache` runs after and
 * produces a missing-module diagnostic for dangling alias
 * targets.
 */
/**
 * Mutable holder for the workspace-scoped `AliasResolver`. The
 * composition root creates one at startup; `rebuildAliasResolver`
 * swaps the value on settings change. Consumers (the analysis
 * cache's `aliasResolver` getter) call `get()` at analyze time
 * so they always see the latest resolver without rewiring.
 */
export class AliasResolverHolder {
  private current: AliasResolver;

  constructor(
    private readonly workspaceRoot: string,
    initial: Readonly<Record<string, string>>,
  ) {
    this.current = new AliasResolver(workspaceRoot, initial);
  }

  get(): AliasResolver {
    return this.current;
  }

  rebuild(pathAlias: Readonly<Record<string, string>>): void {
    this.current = new AliasResolver(this.workspaceRoot, pathAlias);
  }
}

export class AliasResolver {
  private readonly sortedEntries: ReadonlyArray<readonly [string, string]>;

  constructor(
    private readonly workspaceRoot: string,
    pathAlias: Readonly<Record<string, string>>,
  ) {
    this.sortedEntries = Object.entries(pathAlias)
      .map<[string, string]>(([k, v]) => [k, this.substituteWorkspace(v)])
      .toSorted(([a], [b]) => b.length - a.length || a.localeCompare(b));
  }

  /**
   * Try to resolve a non-relative import specifier to an absolute
   * path. Returns `null` if no alias matches. Callers still fall
   * back to relative resolution before accepting the specifier as
   * unresolved.
   */
  resolve(specifier: string): string | null {
    for (const [prefix, target] of this.sortedEntries) {
      if (specifier === prefix) return target;
      const normalised = prefix.endsWith("/") ? prefix : prefix + "/";
      if (specifier.startsWith(normalised)) {
        return path.resolve(target, specifier.slice(normalised.length));
      }
    }
    return null;
  }

  private substituteWorkspace(target: string): string {
    // `${workspaceFolder}` is the clinyong-compat variable —
    // substituted at construction time because workspaceRoot is
    // immutable for the server's lifetime.
    const replaced = target.replace("${workspaceFolder}", this.workspaceRoot);
    return path.isAbsolute(replaced) ? replaced : path.resolve(this.workspaceRoot, replaced);
  }
}
