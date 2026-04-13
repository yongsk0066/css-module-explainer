import type { SourceDocumentHIR, SymbolRefClassExpressionHIR } from "../hir/source-types";
import type { StyleDocumentHIR } from "../hir/style-types";
import {
  exactClassValue,
  prefixClassValue,
  type AbstractClassValue,
} from "../abstract-value/class-value-domain";
import { resolveAbstractValueSelectors } from "../abstract-value/selector-projection";
import type { FlowResolution } from "../flow/lattice";
import type {
  DocumentNode,
  RefNode,
  SelectorNode,
  SelectorViewNode,
  SemanticEdge,
  SemanticGraph,
  SemanticNode,
  StyleImportNode,
  UtilityBindingNode,
} from "./graph-types";

interface GraphBuilderState {
  readonly nodes: Map<string, SemanticNode>;
  readonly edges: Map<string, SemanticEdge>;
}

export interface BuildSourceSemanticGraphArgs {
  readonly sourceDocument: SourceDocumentHIR;
  readonly styleDocumentsByPath?: ReadonlyMap<string, StyleDocumentHIR>;
  readonly resolveSymbolValues?: (
    ref: SymbolRefClassExpressionHIR,
    sourceDocument: SourceDocumentHIR,
  ) => FlowResolution | null;
}

export function buildStyleSemanticGraph(styleDocument: StyleDocumentHIR): SemanticGraph {
  const state = createState();
  appendStyleDocument(state, styleDocument);
  return finalize(state);
}

export function buildSourceSemanticGraph(args: BuildSourceSemanticGraphArgs): SemanticGraph {
  const state = createState();
  appendSourceDocument(state, args.sourceDocument);
  const appendedStyleDocuments = new Set<string>();

  for (const styleImport of args.sourceDocument.styleImports) {
    if (styleImport.resolved.kind !== "resolved") continue;
    const styleDocument = args.styleDocumentsByPath?.get(styleImport.resolved.absolutePath);
    if (!styleDocument) continue;
    appendedStyleDocuments.add(styleDocument.filePath);
    appendStyleDocument(state, styleDocument);
  }

  for (const expr of args.sourceDocument.classExpressions) {
    const styleDocument = args.styleDocumentsByPath?.get(expr.scssModulePath);
    if (!styleDocument) continue;
    if (!appendedStyleDocuments.has(styleDocument.filePath)) {
      appendedStyleDocuments.add(styleDocument.filePath);
      appendStyleDocument(state, styleDocument);
    }

    switch (expr.kind) {
      case "literal": {
        const canonical = findCanonicalSelectorId(styleDocument, expr.className);
        if (!canonical) break;
        addEdge(state, expr.id, canonical, "literal", "exact", exactClassValue(expr.className));
        break;
      }
      case "styleAccess": {
        const canonical = findCanonicalSelectorId(styleDocument, expr.className);
        if (!canonical) break;
        addEdge(state, expr.id, canonical, "styleAccess", "exact", exactClassValue(expr.className));
        break;
      }
      case "template": {
        const emitted = new Set<string>();
        for (const selector of resolveAbstractValueSelectors(
          prefixClassValue(expr.staticPrefix),
          styleDocument,
        )) {
          const canonical = selectorNodeId(styleDocument.filePath, selector.canonicalName);
          if (emitted.has(canonical)) continue;
          emitted.add(canonical);
          addEdge(
            state,
            expr.id,
            canonical,
            "templatePrefix",
            "inferred",
            prefixClassValue(expr.staticPrefix),
          );
        }
        break;
      }
      case "symbolRef": {
        const resolved = args.resolveSymbolValues?.(expr, args.sourceDocument);
        if (!resolved) break;
        const emitted = new Set<string>();
        for (const selector of resolveAbstractValueSelectors(
          resolved.abstractValue,
          styleDocument,
        )) {
          const canonical = selectorNodeId(styleDocument.filePath, selector.canonicalName);
          if (emitted.has(canonical)) continue;
          emitted.add(canonical);
          addEdge(
            state,
            expr.id,
            canonical,
            resolved.reason,
            resolved.certainty,
            resolved.abstractValue,
          );
        }
        break;
      }
      default:
        expr satisfies never;
        break;
    }
  }

  return finalize(state);
}

function appendSourceDocument(state: GraphBuilderState, sourceDocument: SourceDocumentHIR): void {
  const documentNode: DocumentNode = {
    id: documentNodeId("source", sourceDocument.filePath),
    kind: "document",
    documentKind: "source",
    filePath: sourceDocument.filePath,
  };
  addNode(state, documentNode);

  for (const styleImport of sourceDocument.styleImports) {
    const node: StyleImportNode = {
      id: styleImportNodeId(sourceDocument.filePath, styleImport.id),
      kind: "styleImport",
      filePath: sourceDocument.filePath,
      localName: styleImport.localName,
      resolved: styleImport.resolved,
      ...(styleImport.range ? { range: styleImport.range } : {}),
    };
    addNode(state, node);
    addEdge(state, documentNode.id, node.id, "documentContains", "exact");
  }

  for (const utilityBinding of sourceDocument.utilityBindings) {
    const node: UtilityBindingNode =
      utilityBinding.kind === "classnamesBind"
        ? {
            id: utilityBindingNodeId(sourceDocument.filePath, utilityBinding.id),
            kind: "utilityBinding",
            filePath: sourceDocument.filePath,
            bindingKind: utilityBinding.kind,
            localName: utilityBinding.localName,
            scssModulePath: utilityBinding.scssModulePath,
            stylesLocalName: utilityBinding.stylesLocalName,
            classNamesImportName: utilityBinding.classNamesImportName,
            bindingDeclId: utilityBinding.bindingDeclId,
          }
        : {
            id: utilityBindingNodeId(sourceDocument.filePath, utilityBinding.id),
            kind: "utilityBinding",
            filePath: sourceDocument.filePath,
            bindingKind: utilityBinding.kind,
            localName: utilityBinding.localName,
          };
    addNode(state, node);
    addEdge(state, documentNode.id, node.id, "documentContains", "exact");

    if (utilityBinding.kind !== "classnamesBind") continue;
    const importNode = sourceDocument.styleImports.find(
      (styleImport) => styleImport.localName === utilityBinding.stylesLocalName,
    );
    if (!importNode) continue;
    addEdge(
      state,
      node.id,
      styleImportNodeId(sourceDocument.filePath, importNode.id),
      "bindingUsesImport",
      "exact",
    );
  }

  for (const expr of sourceDocument.classExpressions) {
    const node = toRefNode(sourceDocument.filePath, expr);
    addNode(state, node);
    addEdge(state, documentNode.id, node.id, "documentContains", "exact");
  }
}

function appendStyleDocument(state: GraphBuilderState, styleDocument: StyleDocumentHIR): void {
  const documentNode: DocumentNode = {
    id: documentNodeId("style", styleDocument.filePath),
    kind: "document",
    documentKind: "style",
    filePath: styleDocument.filePath,
  };
  addNode(state, documentNode);

  for (const selector of styleDocument.selectors) {
    const canonicalNode: SelectorNode = {
      id: selectorNodeId(styleDocument.filePath, selector.canonicalName),
      kind: "selector",
      filePath: styleDocument.filePath,
      canonicalName: selector.canonicalName,
    };
    addNode(state, canonicalNode);
    addEdge(state, documentNode.id, canonicalNode.id, "documentContains", "exact");

    const viewNode: SelectorViewNode = {
      id: selectorViewNodeId(styleDocument.filePath, selector.name),
      kind: "selectorView",
      filePath: styleDocument.filePath,
      name: selector.name,
      canonicalName: selector.canonicalName,
      viewKind: selector.viewKind,
      nestedSafety: selector.nestedSafety,
      range: selector.range,
      ruleRange: selector.ruleRange,
      fullSelector: selector.fullSelector,
      ...(selector.originalName ? { originalName: selector.originalName } : {}),
    };
    addNode(state, viewNode);
    addEdge(state, documentNode.id, viewNode.id, "documentContains", "exact");
    addEdge(state, viewNode.id, canonicalNode.id, "aliasCanonicalization", "exact");
  }
}

function toRefNode(filePath: string, expr: SourceDocumentHIR["classExpressions"][number]): RefNode {
  switch (expr.kind) {
    case "literal":
      return {
        id: expr.id,
        kind: "ref",
        filePath,
        expressionKind: expr.kind,
        origin: expr.origin,
        scssModulePath: expr.scssModulePath,
        range: expr.range,
        className: expr.className,
      };
    case "template":
      return {
        id: expr.id,
        kind: "ref",
        filePath,
        expressionKind: expr.kind,
        origin: expr.origin,
        scssModulePath: expr.scssModulePath,
        range: expr.range,
        rawTemplate: expr.rawTemplate,
        staticPrefix: expr.staticPrefix,
      };
    case "symbolRef":
      return {
        id: expr.id,
        kind: "ref",
        filePath,
        expressionKind: expr.kind,
        origin: expr.origin,
        scssModulePath: expr.scssModulePath,
        range: expr.range,
        rawReference: expr.rawReference,
        rootName: expr.rootName,
        ...(expr.rootBindingDeclId ? { rootBindingDeclId: expr.rootBindingDeclId } : {}),
        pathSegments: expr.pathSegments,
      };
    case "styleAccess":
      return {
        id: expr.id,
        kind: "ref",
        filePath,
        expressionKind: expr.kind,
        origin: expr.origin,
        scssModulePath: expr.scssModulePath,
        range: expr.range,
        className: expr.className,
        accessPath: expr.accessPath,
      };
    default:
      expr satisfies never;
      return expr;
  }
}

function findCanonicalSelectorId(styleDocument: StyleDocumentHIR, viewName: string): string | null {
  const selector = styleDocument.selectors.find((entry) => entry.name === viewName);
  if (!selector) return null;
  return selectorNodeId(styleDocument.filePath, selector.canonicalName);
}

function addNode(state: GraphBuilderState, node: SemanticNode): void {
  if (!state.nodes.has(node.id)) {
    state.nodes.set(node.id, node);
  }
}

function addEdge(
  state: GraphBuilderState,
  from: string,
  to: string,
  reason: SemanticEdge["reason"],
  certainty: SemanticEdge["certainty"],
  abstractValue?: AbstractClassValue,
): void {
  const edge: SemanticEdge = {
    id: `${from}->${to}:${reason}:${certainty}`,
    from,
    to,
    reason,
    certainty,
    ...(abstractValue ? { abstractValue } : {}),
  };
  if (!state.edges.has(edge.id)) {
    state.edges.set(edge.id, edge);
  }
}

function createState(): GraphBuilderState {
  return {
    nodes: new Map<string, SemanticNode>(),
    edges: new Map<string, SemanticEdge>(),
  };
}

function finalize(state: GraphBuilderState): SemanticGraph {
  return {
    nodes: Array.from(state.nodes.values()).toSorted((a, b) => a.id.localeCompare(b.id)),
    edges: Array.from(state.edges.values()).toSorted((a, b) => a.id.localeCompare(b.id)),
  };
}

function documentNodeId(documentKind: "source" | "style", filePath: string): string {
  return `document:${documentKind}:${filePath}`;
}

function styleImportNodeId(filePath: string, localId: string): string {
  return `style-import:${filePath}:${localId}`;
}

function utilityBindingNodeId(filePath: string, localId: string): string {
  return `utility-binding:${filePath}:${localId}`;
}

function selectorNodeId(filePath: string, canonicalName: string): string {
  return `selector:${filePath}:${canonicalName}`;
}

function selectorViewNodeId(filePath: string, viewName: string): string {
  return `selector-view:${filePath}:${viewName}`;
}
