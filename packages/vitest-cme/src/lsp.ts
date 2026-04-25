import { targetFixture, type CmeTargetFixture } from "./target";
import type { CmeRangeMarker, CmeWorkspace, Position, Range } from "./workspace";

export interface CmeTextDocumentPositionFixture {
  readonly textDocument: { readonly uri: string };
  readonly position: Position;
  readonly target: CmeTargetFixture;
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

export function textDocumentRenameFixture(
  options: CmeTextDocumentRenameFixtureOptions,
): CmeTextDocumentRenameFixture {
  return {
    ...textDocumentPositionFixture(options),
    newName: options.newName,
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
