import type { CmeMarker, CmeWorkspace } from "./workspace";

export type CmeActionName = "hover" | "definition" | "prepareRename";

export interface CmeActionContext {
  readonly workspace: CmeWorkspace;
  readonly target: CmeMarker;
}

export type CmeScenarioAction<T = unknown> = (ctx: CmeActionContext) => T | Promise<T>;

export interface CmeScenarioActions {
  readonly hover?: CmeScenarioAction;
  readonly definition?: CmeScenarioAction;
  readonly prepareRename?: CmeScenarioAction;
}

export interface CmeScenarioDefinition {
  readonly name?: string;
  readonly workspace: CmeWorkspace;
  readonly actions: CmeScenarioActions;
}

export interface CmeScenario {
  readonly name: string;
  readonly workspace: CmeWorkspace;
  hover(markerName?: string, filePath?: string): Promise<unknown>;
  definition(markerName?: string, filePath?: string): Promise<unknown>;
  prepareRename(markerName?: string, filePath?: string): Promise<unknown>;
}

export function scenario(definition: CmeScenarioDefinition): CmeScenario {
  return {
    name: definition.name ?? "anonymous scenario",
    workspace: definition.workspace,
    hover(markerName = "cursor", filePath) {
      return runAction(definition, "hover", markerName, filePath);
    },
    definition(markerName = "cursor", filePath) {
      return runAction(definition, "definition", markerName, filePath);
    },
    prepareRename(markerName = "cursor", filePath) {
      return runAction(definition, "prepareRename", markerName, filePath);
    },
  };
}

async function runAction(
  definition: CmeScenarioDefinition,
  actionName: CmeActionName,
  markerName: string,
  filePath: string | undefined,
): Promise<unknown> {
  const action = definition.actions[actionName];
  if (!action) {
    throw new Error(
      `Scenario "${definition.name ?? "anonymous"}" does not define action "${actionName}".`,
    );
  }

  return action({
    workspace: definition.workspace,
    target: definition.workspace.marker(markerName, filePath),
  });
}
