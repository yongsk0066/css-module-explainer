import {
  createConnection,
  ProposedFeatures,
  TextDocuments,
  TextDocumentSyncKind,
  type InitializeParams,
  type InitializeResult,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

const SERVER_NAME = 'css-module-explainer';
const SERVER_VERSION = '0.0.1';

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments<TextDocument>(TextDocument);

connection.onInitialize((_params: InitializeParams): InitializeResult => {
  connection.console.info(`[${SERVER_NAME}] initialize received`);
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
    },
    serverInfo: {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
  };
});

connection.onInitialized(() => {
  connection.console.info(`[${SERVER_NAME}] initialized`);
});

documents.listen(connection);
connection.listen();
