import * as path from "node:path";
import * as vscode from "vscode";
import {
  LanguageClient,
  TransportKind,
  type LanguageClientOptions,
  type ServerOptions,
} from "vscode-languageclient/node";
import type {
  Position,
  Range,
  ShowReferencesArgs,
  ShowReferencesLocation,
} from "@css-module-explainer/shared";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPosition(value: unknown): value is Position {
  if (!isRecord(value)) return false;
  return typeof value.line === "number" && typeof value.character === "number";
}

function isRange(value: unknown): value is Range {
  if (!isRecord(value)) return false;
  return isPosition(value.start) && isPosition(value.end);
}

function isShowReferencesLocation(value: unknown): value is ShowReferencesLocation {
  if (!isRecord(value)) return false;
  return typeof value.uri === "string" && isRange(value.range);
}

function isShowReferencesArgs(value: readonly unknown[]): value is ShowReferencesArgs {
  if (value.length !== 3) return false;
  const [uri, position, locations] = value;
  if (typeof uri !== "string") return false;
  if (!isPosition(position)) return false;
  if (!Array.isArray(locations)) return false;
  return locations.every((loc) => isShowReferencesLocation(loc));
}

let client: LanguageClient | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const serverModule = context.asAbsolutePath(path.join("dist", "server", "server.js"));

  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: { module: serverModule, transport: TransportKind.ipc },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      { scheme: "file", language: "typescriptreact" },
      { scheme: "file", language: "javascriptreact" },
      { scheme: "file", language: "typescript" },
      { scheme: "file", language: "javascript" },
      { scheme: "file", language: "scss" },
      { scheme: "file", language: "less" },
      { scheme: "file", language: "css" },
    ],
    synchronize: {
      configurationSection: "cssModuleExplainer",
    },
    outputChannelName: "CSS Module Explainer",
    progressOnInitialization: true,
  };

  client = new LanguageClient("cssModuleExplainer", "CSS Module Explainer", serverOptions, {
    ...clientOptions,
    middleware: {
      provideCodeLenses: async (document, token, next) => {
        const lenses = await next(document, token);
        if (!lenses) return lenses;
        for (const lens of lenses) {
          if (lens.command?.command !== "editor.action.showReferences") continue;
          const args = lens.command.arguments;
          if (!args || !isShowReferencesArgs(args)) continue;
          try {
            const [uri, pos, locations] = args;
            lens.command.arguments = [
              vscode.Uri.parse(uri),
              new vscode.Position(pos.line, pos.character),
              locations.map(
                (loc) =>
                  new vscode.Location(
                    vscode.Uri.parse(loc.uri),
                    new vscode.Range(
                      loc.range.start.line,
                      loc.range.start.character,
                      loc.range.end.line,
                      loc.range.end.character,
                    ),
                  ),
              ),
            ];
          } catch {
            // Conversion failed — leave args as-is.
          }
        }
        return lenses;
      },
    },
  });

  void client.start().catch((err) => {
    void vscode.window.showErrorMessage(
      `CSS Module Explainer failed to start: ${err instanceof Error ? err.message : String(err)}`,
    );
  });

  context.subscriptions.push({
    dispose: () => {
      void client?.stop();
    },
  });
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop();
}
