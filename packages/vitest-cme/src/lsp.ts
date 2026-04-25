import { targetFixture, type CmeTargetFixture } from "./target";
import type { CmeRangeMarker, CmeWorkspace, Position, Range } from "./workspace";

export interface CmeCursorLike {
  readonly documentUri: string;
  readonly line: number;
  readonly character: number;
}

export interface CmeTextDocumentPositionFixture {
  readonly textDocument: { readonly uri: string };
  readonly position: Position;
  readonly target: CmeTargetFixture;
}

export interface CmeTextDocumentPositionParams {
  readonly textDocument: { readonly uri: string };
  readonly position: Position;
}

export interface CmeTextDocumentPositionFixtureOptions {
  readonly workspace: CmeWorkspace;
  readonly documentUri: string;
  readonly filePath?: string;
  readonly markerName?: string;
}

export interface CmeTextDocumentRenameFixture extends CmeTextDocumentPositionFixture {
  readonly newName: string;
}

export interface CmeTextDocumentRenameFromCursorFixture extends CmeTextDocumentPositionParams {
  readonly newName: string;
}

export interface CmeTextDocumentRenameFixtureOptions extends CmeTextDocumentPositionFixtureOptions {
  readonly newName: string;
}

export interface CmeTextDocumentRangeFixture {
  readonly textDocument: { readonly uri: string };
  readonly range: Range;
  readonly marker: CmeRangeMarker;
}

export interface CmeTextDocumentRangeFixtureOptions {
  readonly workspace: CmeWorkspace;
  readonly documentUri: string;
  readonly filePath?: string;
  readonly rangeName: string;
}

export function textDocumentPositionFixture(
  options: CmeTextDocumentPositionFixtureOptions,
): CmeTextDocumentPositionFixture {
  const targetOptions = {
    workspace: options.workspace,
    ...(options.filePath === undefined ? {} : { filePath: options.filePath }),
    ...(options.markerName === undefined ? {} : { markerName: options.markerName }),
  };
  const target = targetFixture(targetOptions);
  return {
    textDocument: { uri: options.documentUri },
    position: target.position,
    target,
  };
}

export function textDocumentPositionParams(
  options: CmeTextDocumentPositionFixtureOptions,
): CmeTextDocumentPositionParams {
  const { textDocument, position } = textDocumentPositionFixture(options);
  return { textDocument, position };
}

export function textDocumentRenameFixture(
  options: CmeTextDocumentRenameFixtureOptions,
): CmeTextDocumentRenameFixture {
  return {
    ...textDocumentPositionFixture(options),
    newName: options.newName,
  };
}

export function textDocumentPositionFromCursor(
  cursor: CmeCursorLike,
): CmeTextDocumentPositionParams {
  return {
    textDocument: { uri: cursor.documentUri },
    position: { line: cursor.line, character: cursor.character },
  };
}

export function textDocumentRenameFromCursor(
  cursor: CmeCursorLike,
  newName: string,
): CmeTextDocumentRenameFromCursorFixture {
  return {
    ...textDocumentPositionFromCursor(cursor),
    newName,
  };
}

export function textDocumentRangeFixture(
  options: CmeTextDocumentRangeFixtureOptions,
): CmeTextDocumentRangeFixture {
  const marker = options.workspace.range(options.rangeName, options.filePath);
  return {
    textDocument: { uri: options.documentUri },
    range: marker.range,
    marker,
  };
}
