import path from "node:path";
import type { StyleDocumentHIR } from "../hir/style-types";

export type StyleDependencyReason = "localComposes" | "crossFileComposes";

export interface StyleDependencySelectorRef {
  readonly filePath: string;
  readonly canonicalName: string;
  readonly reason: StyleDependencyReason;
}

interface StyleDependencyEdge {
  readonly fromFilePath: string;
  readonly fromCanonicalName: string;
  readonly toFilePath: string;
  readonly toCanonicalName: string;
  readonly reason: StyleDependencyReason;
}

export interface StyleDependencyGraph {
  record(filePath: string, styleDocument: StyleDocumentHIR): void;
  forget(filePath: string): void;
  forgetWithinRoot(rootPath: string): void;
  getIncoming(filePath: string, canonicalName: string): readonly StyleDependencySelectorRef[];
  getOutgoing(filePath: string, canonicalName: string): readonly StyleDependencySelectorRef[];
}

export class WorkspaceStyleDependencyGraph implements StyleDependencyGraph {
  private readonly moduleEdges = new Map<string, readonly StyleDependencyEdge[]>();
  private readonly incoming = new Map<string, readonly StyleDependencySelectorRef[]>();
  private readonly outgoing = new Map<string, readonly StyleDependencySelectorRef[]>();

  record(filePath: string, styleDocument: StyleDocumentHIR): void {
    this.moduleEdges.set(filePath, collectEdges(filePath, styleDocument));
    this.rebuild();
  }

  forget(filePath: string): void {
    if (!this.moduleEdges.delete(filePath)) return;
    this.rebuild();
  }

  forgetWithinRoot(rootPath: string): void {
    let changed = false;
    for (const filePath of this.moduleEdges.keys()) {
      if (!isWithinRoot(rootPath, filePath)) continue;
      this.moduleEdges.delete(filePath);
      changed = true;
    }
    if (changed) this.rebuild();
  }

  getIncoming(filePath: string, canonicalName: string): readonly StyleDependencySelectorRef[] {
    return this.incoming.get(selectorKey(filePath, canonicalName)) ?? [];
  }

  getOutgoing(filePath: string, canonicalName: string): readonly StyleDependencySelectorRef[] {
    return this.outgoing.get(selectorKey(filePath, canonicalName)) ?? [];
  }

  private rebuild(): void {
    this.incoming.clear();
    this.outgoing.clear();
    for (const edges of this.moduleEdges.values()) {
      for (const edge of edges) {
        push(this.outgoing, selectorKey(edge.fromFilePath, edge.fromCanonicalName), {
          filePath: edge.toFilePath,
          canonicalName: edge.toCanonicalName,
          reason: edge.reason,
        });
        push(this.incoming, selectorKey(edge.toFilePath, edge.toCanonicalName), {
          filePath: edge.fromFilePath,
          canonicalName: edge.fromCanonicalName,
          reason: edge.reason,
        });
      }
    }
  }
}

function collectEdges(
  filePath: string,
  styleDocument: StyleDocumentHIR,
): readonly StyleDependencyEdge[] {
  const canonicalNames = new Set(
    styleDocument.selectors
      .filter((selector) => selector.viewKind === "canonical")
      .map((selector) => selector.canonicalName),
  );
  const edges: StyleDependencyEdge[] = [];

  for (const selector of styleDocument.selectors) {
    if (selector.viewKind !== "canonical") continue;
    for (const ref of selector.composes) {
      if (ref.fromGlobal) continue;
      if (!ref.from) {
        for (const className of ref.classNames) {
          if (!canonicalNames.has(className)) continue;
          edges.push({
            fromFilePath: filePath,
            fromCanonicalName: selector.canonicalName,
            toFilePath: filePath,
            toCanonicalName: className,
            reason: "localComposes",
          });
        }
        continue;
      }
      if (!isRelativeSpecifier(ref.from)) continue;
      const targetPath = path.resolve(path.dirname(filePath), ref.from);
      for (const className of ref.classNames) {
        edges.push({
          fromFilePath: filePath,
          fromCanonicalName: selector.canonicalName,
          toFilePath: targetPath,
          toCanonicalName: className,
          reason: "crossFileComposes",
        });
      }
    }
  }

  return edges;
}

function selectorKey(filePath: string, canonicalName: string): string {
  return `${filePath}\u0000${canonicalName}`;
}

function isRelativeSpecifier(specifier: string): boolean {
  return specifier.startsWith("./") || specifier.startsWith("../");
}

function push(
  map: Map<string, readonly StyleDependencySelectorRef[]>,
  key: string,
  value: StyleDependencySelectorRef,
): void {
  const existing = map.get(key) ?? [];
  map.set(key, [...existing, value]);
}

function isWithinRoot(rootPath: string, candidatePath: string): boolean {
  const rel = path.relative(rootPath, candidatePath);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}
