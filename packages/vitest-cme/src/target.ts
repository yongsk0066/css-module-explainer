import type { CmeMarker, CmeWorkspace, Position } from "./workspace";

export interface CmeTargetFixture {
  readonly filePath: string;
  readonly line: number;
  readonly character: number;
  readonly position: Position;
  readonly marker: CmeMarker;
}

export interface CmeTargetFixtureOptions {
  readonly workspace: CmeWorkspace;
  readonly filePath?: string;
  readonly markerName?: string;
}

export function targetFixture(options: CmeTargetFixtureOptions): CmeTargetFixture {
  const marker = options.workspace.marker(options.markerName, options.filePath);
  return {
    filePath: marker.filePath,
    line: marker.position.line,
    character: marker.position.character,
    position: marker.position,
    marker,
  };
}
