import type { CmeMarker, CmeWorkspace } from "./workspace";

export type CmeActionName = "hover" | "definition" | "prepareRename" | "codeAction" | "completion";

export interface CmeActionContext {
  readonly workspace: CmeWorkspace;
  readonly target: CmeMarker;
}

type Awaitable<T> = T | Promise<T>;

export type CmeScenarioAction<T = unknown> = (ctx: CmeActionContext) => Awaitable<T>;

export interface CmeScenarioActions {
  readonly hover?: CmeScenarioAction;
  readonly definition?: CmeScenarioAction;
  readonly prepareRename?: CmeScenarioAction;
  readonly codeAction?: CmeScenarioAction;
  readonly completion?: CmeScenarioAction;
}

type ActionResult<TActions extends CmeScenarioActions, TName extends CmeActionName> =
  TActions[TName] extends CmeScenarioAction<infer TResult> ? Awaited<TResult> : unknown;

export interface CmeScenarioDefinition<TActions extends CmeScenarioActions = CmeScenarioActions> {
  readonly name?: string;
  readonly workspace: CmeWorkspace;
  readonly actions: TActions;
}

export interface CmeScenario<TActions extends CmeScenarioActions = CmeScenarioActions> {
  readonly name: string;
  readonly workspace: CmeWorkspace;
  hover(markerName?: string, filePath?: string): Promise<ActionResult<TActions, "hover">>;
  definition(markerName?: string, filePath?: string): Promise<ActionResult<TActions, "definition">>;
  prepareRename(
    markerName?: string,
    filePath?: string,
  ): Promise<ActionResult<TActions, "prepareRename">>;
  codeAction(markerName?: string, filePath?: string): Promise<ActionResult<TActions, "codeAction">>;
  completion(markerName?: string, filePath?: string): Promise<ActionResult<TActions, "completion">>;
}

export function scenario<TActions extends CmeScenarioActions>(
  definition: CmeScenarioDefinition<TActions>,
): CmeScenario<TActions> {
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
    codeAction(markerName = "cursor", filePath) {
      return runAction(definition, "codeAction", markerName, filePath);
    },
    completion(markerName = "cursor", filePath) {
      return runAction(definition, "completion", markerName, filePath);
    },
  };
}

async function runAction<TActions extends CmeScenarioActions, TName extends CmeActionName>(
  definition: CmeScenarioDefinition<TActions>,
  actionName: TName,
  markerName: string,
  filePath: string | undefined,
): Promise<ActionResult<TActions, TName>> {
  const action = definition.actions[actionName];
  if (!action) {
    throw new Error(
      `Scenario "${definition.name ?? "anonymous"}" does not define action "${actionName}".`,
    );
  }

  return action({
    workspace: definition.workspace,
    target: definition.workspace.marker(markerName, filePath),
  }) as Awaitable<ActionResult<TActions, TName>>;
}
