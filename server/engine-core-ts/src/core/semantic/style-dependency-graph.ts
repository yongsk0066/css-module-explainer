import path from "node:path";
import type { Range } from "@css-module-explainer/shared";
import type { SassModuleUseHIR, SassSymbolKind, StyleDocumentHIR } from "../hir/style-types";
import { findSassSymbolDeclForSymbol } from "../query/find-style-selector";

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

export interface SassModuleMemberDependencyRef {
  readonly filePath: string;
  readonly namespace: string;
  readonly symbolKind: SassSymbolKind;
  readonly name: string;
  readonly range: Range;
}

interface SassModuleMemberDependencyEdge extends SassModuleMemberDependencyRef {
  readonly toFilePath: string;
}

export interface StyleDependencyRecordOptions {
  readonly resolveSassModuleUseTargetFilePath?: (moduleUse: SassModuleUseHIR) => string | null;
  readonly resolveSassModuleExportedSymbolTargetFilePaths?: (
    moduleUse: SassModuleUseHIR,
    symbolKind: SassSymbolKind,
    name: string,
  ) => readonly string[];
}

export interface StyleDependencyGraph {
  record(
    filePath: string,
    styleDocument: StyleDocumentHIR,
    options?: StyleDependencyRecordOptions,
  ): void;
  forget(filePath: string): void;
  forgetWithinRoot(rootPath: string): void;
  getIncoming(filePath: string, canonicalName: string): readonly StyleDependencySelectorRef[];
  getOutgoing(filePath: string, canonicalName: string): readonly StyleDependencySelectorRef[];
  getIncomingSassModuleMemberRefs(
    filePath: string,
    symbolKind: SassSymbolKind,
    name: string,
  ): readonly SassModuleMemberDependencyRef[];
}

export class WorkspaceStyleDependencyGraph implements StyleDependencyGraph {
  private readonly moduleEdges = new Map<
    string,
    {
      readonly selectorEdges: readonly StyleDependencyEdge[];
      readonly sassModuleMemberEdges: readonly SassModuleMemberDependencyEdge[];
    }
  >();
  private readonly incoming = new Map<string, readonly StyleDependencySelectorRef[]>();
  private readonly outgoing = new Map<string, readonly StyleDependencySelectorRef[]>();
  private readonly incomingSassModuleMembers = new Map<
    string,
    readonly SassModuleMemberDependencyRef[]
  >();

  record(
    filePath: string,
    styleDocument: StyleDocumentHIR,
    options: StyleDependencyRecordOptions = {},
  ): void {
    this.moduleEdges.set(filePath, {
      selectorEdges: collectEdges(filePath, styleDocument),
      sassModuleMemberEdges: collectSassModuleMemberEdges(filePath, styleDocument, options),
    });
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

  getIncomingSassModuleMemberRefs(
    filePath: string,
    symbolKind: SassSymbolKind,
    name: string,
  ): readonly SassModuleMemberDependencyRef[] {
    return this.incomingSassModuleMembers.get(sassMemberKey(filePath, symbolKind, name)) ?? [];
  }

  private rebuild(): void {
    this.incoming.clear();
    this.outgoing.clear();
    this.incomingSassModuleMembers.clear();
    for (const edges of this.moduleEdges.values()) {
      for (const edge of edges.selectorEdges) {
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
      for (const edge of edges.sassModuleMemberEdges) {
        push(
          this.incomingSassModuleMembers,
          sassMemberKey(edge.toFilePath, edge.symbolKind, edge.name),
          {
            filePath: edge.filePath,
            namespace: edge.namespace,
            symbolKind: edge.symbolKind,
            name: edge.name,
            range: edge.range,
          },
        );
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

function collectSassModuleMemberEdges(
  filePath: string,
  styleDocument: StyleDocumentHIR,
  options: StyleDependencyRecordOptions,
): readonly SassModuleMemberDependencyEdge[] {
  if (
    !options.resolveSassModuleUseTargetFilePath &&
    !options.resolveSassModuleExportedSymbolTargetFilePaths
  ) {
    return [];
  }

  const moduleUsesByNamespace = new Map(
    styleDocument.sassModuleUses
      .filter((moduleUse) => moduleUse.namespaceKind !== "wildcard" && moduleUse.namespace)
      .map((moduleUse) => [moduleUse.namespace!, moduleUse]),
  );
  const edges: SassModuleMemberDependencyEdge[] = [];

  for (const memberRef of styleDocument.sassModuleMemberRefs) {
    const moduleUse = moduleUsesByNamespace.get(memberRef.namespace);
    if (!moduleUse) continue;
    const targetFilePaths = resolveSassModuleMemberTargetFilePaths(
      moduleUse,
      memberRef.symbolKind,
      memberRef.name,
      options,
    );
    for (const targetFilePath of targetFilePaths) {
      edges.push({
        filePath,
        toFilePath: targetFilePath,
        namespace: memberRef.namespace,
        symbolKind: memberRef.symbolKind,
        name: memberRef.name,
        range: memberRef.range,
      });
    }
  }

  const wildcardModuleUses = styleDocument.sassModuleUses.filter(
    (moduleUse) => moduleUse.namespaceKind === "wildcard",
  );
  for (const symbol of styleDocument.sassSymbols) {
    if (findSassSymbolDeclForSymbol(styleDocument, symbol)) continue;
    for (const moduleUse of wildcardModuleUses) {
      const targetFilePaths = resolveSassModuleMemberTargetFilePaths(
        moduleUse,
        symbol.symbolKind,
        symbol.name,
        options,
      );
      for (const targetFilePath of targetFilePaths) {
        const edge = {
          filePath,
          toFilePath: targetFilePath,
          namespace: "*",
          symbolKind: symbol.symbolKind,
          name: symbol.name,
          range: symbol.range,
        };
        if (edges.some((candidate) => sassModuleMemberEdgeEquals(candidate, edge))) continue;
        edges.push(edge);
      }
    }
  }

  return edges;
}

function resolveSassModuleMemberTargetFilePaths(
  moduleUse: SassModuleUseHIR,
  symbolKind: SassSymbolKind,
  name: string,
  options: StyleDependencyRecordOptions,
): readonly string[] {
  if (options.resolveSassModuleExportedSymbolTargetFilePaths) {
    return options.resolveSassModuleExportedSymbolTargetFilePaths(moduleUse, symbolKind, name);
  }
  const targetFilePath = options.resolveSassModuleUseTargetFilePath?.(moduleUse);
  return targetFilePath ? [targetFilePath] : [];
}

function sassModuleMemberEdgeEquals(
  a: SassModuleMemberDependencyEdge,
  b: SassModuleMemberDependencyEdge,
): boolean {
  return (
    a.filePath === b.filePath &&
    a.toFilePath === b.toFilePath &&
    a.namespace === b.namespace &&
    a.symbolKind === b.symbolKind &&
    a.name === b.name &&
    a.range.start.line === b.range.start.line &&
    a.range.start.character === b.range.start.character &&
    a.range.end.line === b.range.end.line &&
    a.range.end.character === b.range.end.character
  );
}

function selectorKey(filePath: string, canonicalName: string): string {
  return `${filePath}\u0000${canonicalName}`;
}

function sassMemberKey(filePath: string, symbolKind: SassSymbolKind, name: string): string {
  return `${filePath}\u0000${symbolKind}\u0000${name}`;
}

function isRelativeSpecifier(specifier: string): boolean {
  return specifier.startsWith("./") || specifier.startsWith("../");
}

function push<T>(map: Map<string, readonly T[]>, key: string, value: T): void {
  const existing = map.get(key) ?? [];
  map.set(key, [...existing, value]);
}

function isWithinRoot(rootPath: string, candidatePath: string): boolean {
  const rel = path.relative(rootPath, candidatePath);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}
