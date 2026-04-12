export type EdgeReason =
  | "documentContains"
  | "bindingUsesImport"
  | "aliasCanonicalization"
  | "literal"
  | "styleAccess"
  | "templatePrefix"
  | "typeUnion"
  | "flowLiteral"
  | "flowBranch";
