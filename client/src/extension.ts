import * as path from 'node:path';
import * as vscode from 'vscode';
import {
  LanguageClient,
  TransportKind,
  type LanguageClientOptions,
  type ServerOptions,
} from 'vscode-languageclient/node';

let client: LanguageClient | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const serverModule = context.asAbsolutePath(
    path.join('dist', 'server', 'server.js'),
  );

  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: { module: serverModule, transport: TransportKind.ipc },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      { scheme: 'file', language: 'typescriptreact' },
      { scheme: 'file', language: 'javascriptreact' },
      { scheme: 'file', language: 'typescript' },
      { scheme: 'file', language: 'javascript' },
      { scheme: 'file', language: 'scss' },
      { scheme: 'file', language: 'css' },
    ],
    synchronize: {
      configurationSection: 'cssModuleExplainer',
    },
    outputChannelName: 'CSS Module Explainer',
    progressOnInitialization: true,
  };

  try {
    client = new LanguageClient(
      'cssModuleExplainer',
      'CSS Module Explainer',
      serverOptions,
      clientOptions,
    );
  } catch {
    void vscode.window.showErrorMessage(
      "CSS Module Explainer couldn't be started.",
    );
    return;
  }

  void client.start();

  context.subscriptions.push({
    dispose: () => {
      void client?.stop();
    },
  });
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop();
}
