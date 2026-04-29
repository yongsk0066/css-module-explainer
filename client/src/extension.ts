import * as path from "node:path";
import * as vscode from "vscode";
import {
  LanguageClient,
  TransportKind,
  type LanguageClientOptions,
  type ServerOptions,
} from "vscode-languageclient/node";
import {
  buildTypeFactBackendEnv,
  readClientTypeFactBackendSetting,
} from "./type-fact-backend-config";
import { isShowReferencesArgs } from "./util/show-references-guards";

let client: LanguageClient | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const serverModule = context.asAbsolutePath(path.join("dist", "server", "server.js"));
  const typeFactBackend = readClientTypeFactBackendSetting(
    vscode.workspace.getConfiguration("cssModuleExplainer").get("typeFactBackend"),
  );
  const serverEnv = buildTypeFactBackendEnv(typeFactBackend);

  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc, options: { env: serverEnv } },
    debug: { module: serverModule, transport: TransportKind.ipc, options: { env: serverEnv } },
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
      configurationSection: ["cssModuleExplainer", "cssModules"],
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
