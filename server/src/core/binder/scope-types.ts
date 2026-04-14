export type BinderScopeKind = "sourceFile" | "function" | "block";

export type BinderDeclKind = "import" | "localVar" | "parameter";

export interface TextSpan {
  readonly start: number;
  readonly end: number;
}

export interface BinderScope {
  readonly id: string;
  readonly kind: BinderScopeKind;
  readonly filePath: string;
  readonly span: TextSpan;
  readonly parentScopeId?: string;
}

export interface BinderDecl {
  readonly id: string;
  readonly kind: BinderDeclKind;
  readonly scopeId: string;
  readonly name: string;
  readonly filePath: string;
  readonly span: TextSpan;
  readonly importPath?: string;
}

export interface BinderRef {
  readonly id: string;
  readonly scopeId: string;
  readonly name: string;
  readonly filePath: string;
  readonly span: TextSpan;
}

export interface BinderResolution {
  readonly refId: string;
  readonly declId: string;
  readonly depth: number;
}

export interface SourceBinderResult {
  readonly filePath: string;
  readonly scopes: readonly BinderScope[];
  readonly decls: readonly BinderDecl[];
}
