import {
  CodeLensRefreshRequest,
  type Connection,
  type TextDocuments,
} from "vscode-languageserver/node";
import type { TextDocument } from "vscode-languageserver-textdocument";
import { pathToFileUrl } from "../../src/core/util/text-utils";
import type { RuntimeSink } from "../../engine-host-node/src/runtime";

export function readStyleTextFromOpenDocuments(
  path: string,
  documents: TextDocuments<TextDocument>,
): string | null {
  const uri = pathToFileUrl(path);
  const doc = documents.get(uri);
  return doc?.getText() ?? null;
}

export function createRuntimeSink(
  connection: Connection,
  supportsCodeLensRefresh: boolean,
): RuntimeSink {
  return {
    info(message: string): void {
      connection.console.info(message);
    },
    error(message: string): void {
      connection.console.error(message);
    },
    clearDiagnostics(uri: string): void {
      connection.sendDiagnostics({ uri, diagnostics: [] });
    },
    requestCodeLensRefresh(): void {
      if (!supportsCodeLensRefresh) return;
      void connection.sendRequest(CodeLensRefreshRequest.type).catch(() => {});
    },
  };
}
