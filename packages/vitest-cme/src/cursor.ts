import type { CmeMarker, CmeWorkspace, Position } from "./workspace";

export interface CmeCursorFixture {
  readonly documentUri: string;
  readonly content: string;
  readonly filePath: string;
  readonly line: number;
  readonly character: number;
  readonly position: Position;
  readonly marker: CmeMarker;
  readonly version: number;
}

export interface CmeCursorFixtureOptions {
  readonly workspace: CmeWorkspace;
  readonly filePath: string;
  readonly documentUri: string;
  readonly markerName?: string;
  readonly version?: number;
}

export function cursorFixture(options: CmeCursorFixtureOptions): CmeCursorFixture {
  const marker = options.workspace.marker(options.markerName, options.filePath);
  return {
    documentUri: options.documentUri,
    content: options.workspace.file(options.filePath).content,
    filePath: options.filePath,
    line: marker.position.line,
    character: marker.position.character,
    position: marker.position,
    marker,
    version: options.version ?? 1,
  };
}
