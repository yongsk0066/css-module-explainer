import type { CmeParsedFile, CmeWorkspace } from "./workspace";

export interface CmeDocumentFixture {
  readonly documentUri: string;
  readonly content: string;
  readonly filePath: string;
  readonly file: CmeParsedFile;
  readonly version: number;
}

export interface CmeDocumentFixtureOptions {
  readonly workspace: CmeWorkspace;
  readonly filePath: string;
  readonly documentUri: string;
  readonly version?: number;
}

export function documentFixture(options: CmeDocumentFixtureOptions): CmeDocumentFixture {
  const file = options.workspace.file(options.filePath);
  return {
    documentUri: options.documentUri,
    content: file.content,
    filePath: options.filePath,
    file,
    version: options.version ?? 1,
  };
}
