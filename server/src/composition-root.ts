import { readFileSync } from "node:fs";
import type { MessageReader, MessageWriter } from "vscode-languageserver/node";
import {
  createConnection,
  ProposedFeatures,
  TextDocuments,
  TextDocumentSyncKind,
  type Connection,
  type InitializeParams,
  type InitializeResult,
  type TextDocumentPositionParams,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import ts from "typescript";
import type { CxBinding, ScssClassMap } from "@css-module-explainer/shared";
import { findLangForPath } from "./core/scss/lang-registry.js";
import { StyleIndexCache } from "./core/scss/scss-index.js";
import { detectCxBindings } from "./core/cx/binding-detector.js";
import { parseCxCalls } from "./core/cx/call-parser.js";
import { SourceFileCache } from "./core/ts/source-file-cache.js";
import { WorkspaceTypeResolver, type TypeResolver } from "./core/ts/type-resolver.js";
import { DocumentAnalysisCache } from "./core/indexing/document-analysis-cache.js";
import { NullReverseIndex } from "./core/indexing/reverse-index.js";
import { fileUrlToPath } from "./core/util/text-utils.js";
import { COMPLETION_TRIGGER_CHARACTERS, handleCompletion } from "./providers/completion.js";
import { handleDefinition } from "./providers/definition.js";
import { computeDiagnostics } from "./providers/diagnostics.js";
import { handleHover } from "./providers/hover.js";
import type { CursorParams, ProviderDeps } from "./providers/provider-utils.js";

const DIAGNOSTICS_DEBOUNCE_MS = 200;

const SERVER_NAME = "css-module-explainer";
const SERVER_VERSION = "0.0.1";

export interface CreateServerOptions {
  readonly reader: MessageReader | NodeJS.ReadableStream;
  readonly writer: MessageWriter | NodeJS.WritableStream;
  /** Override the workspace TypeResolver (tests pass a Fake). */
  readonly typeResolver?: TypeResolver;
  /** Override disk read for SCSS files (tests pass an in-memory map). */
  readonly readStyleFile?: (path: string) => string | null;
  /** Override ts.Program creation (test injection for the real resolver). */
  readonly createProgram?: (workspaceRoot: string) => ts.Program;
}

export interface CreatedServer {
  readonly connection: Connection;
  readonly documents: TextDocuments<TextDocument>;
}

/**
 * Build an LSP server instance from a pair of streams plus
 * optional dependency overrides.
 *
 * Does NOT call `connection.listen()` — the caller decides when
 * the event loop starts. Production wiring calls it immediately;
 * the Tier 2 harness calls it after attaching its client side.
 *
 * `ProviderDeps` is built inside `onInitialize` because
 * `workspaceRoot` comes from the client's initialize params.
 * Tests that only exercise lifecycle never touch the deps bag.
 */
export function createServer(options: CreateServerOptions): CreatedServer {
  const connection = createConnection(
    ProposedFeatures.all,
    options.reader as MessageReader,
    options.writer as MessageWriter,
  );
  const documents = new TextDocuments<TextDocument>(TextDocument);

  let deps: ProviderDeps | null = null;

  connection.onInitialize((params: InitializeParams): InitializeResult => {
    connection.console.info(`[${SERVER_NAME}] initialize received`);
    const workspaceRoot = resolveWorkspaceRoot(params);
    deps = buildDeps(workspaceRoot, options, connection);
    return {
      capabilities: {
        textDocumentSync: TextDocumentSyncKind.Incremental,
        // Phase 6/7/8 hardcode; Plan 10/12 wires these to
        // config.features.* (see spec §4.8).
        definitionProvider: true,
        hoverProvider: true,
        completionProvider: {
          triggerCharacters: [...COMPLETION_TRIGGER_CHARACTERS],
          resolveProvider: false,
        },
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

  connection.onDefinition((p: TextDocumentPositionParams) => {
    if (!deps) return null;
    const cursor = toCursorParams(p, documents);
    if (!cursor) return null;
    return handleDefinition(cursor, deps);
  });

  connection.onHover((p: TextDocumentPositionParams) => {
    if (!deps) return null;
    const cursor = toCursorParams(p, documents);
    if (!cursor) return null;
    return handleHover(cursor, deps);
  });

  connection.onCompletion((p) => {
    if (!deps) return null;
    const cursor = toCursorParams(p, documents);
    if (!cursor) return null;
    return handleCompletion(cursor, p, deps);
  });

  // Push-based diagnostics with 200ms debounce (spec §4.5).
  const diagTimers = new Map<string, NodeJS.Timeout>();
  const scheduleDiagnostics = (uri: string): void => {
    const existing = diagTimers.get(uri);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      diagTimers.delete(uri);
      if (!deps) return;
      const doc = documents.get(uri);
      if (!doc) return;
      const diagnostics = computeDiagnostics(
        {
          documentUri: uri,
          content: doc.getText(),
          filePath: fileUrlToPath(uri),
          version: doc.version,
        },
        deps,
      );
      connection.sendDiagnostics({ uri, diagnostics });
    }, DIAGNOSTICS_DEBOUNCE_MS);
    diagTimers.set(uri, timer);
  };

  documents.onDidChangeContent((change) => {
    scheduleDiagnostics(change.document.uri);
  });

  documents.onDidClose((change) => {
    const existing = diagTimers.get(change.document.uri);
    if (existing) {
      clearTimeout(existing);
      diagTimers.delete(change.document.uri);
    }
    // Clear lingering warnings on close.
    connection.sendDiagnostics({ uri: change.document.uri, diagnostics: [] });
  });

  connection.onShutdown(() => {
    deps = null;
  });

  documents.listen(connection);
  return { connection, documents };
}

function resolveWorkspaceRoot(params: InitializeParams): string {
  const folder = params.workspaceFolders?.[0];
  if (folder) return fileUrlToPath(folder.uri);
  if (params.rootUri) return fileUrlToPath(params.rootUri);
  if (params.rootPath) return params.rootPath;
  return process.cwd();
}

function buildDeps(
  workspaceRoot: string,
  options: CreateServerOptions,
  connection: Connection,
): ProviderDeps {
  const sourceFileCache = new SourceFileCache({ max: 200 });
  const styleIndexCache = new StyleIndexCache({ max: 500 });
  const analysisCache = new DocumentAnalysisCache({
    sourceFileCache,
    detectCxBindings,
    parseCxCalls,
    max: 200,
  });

  const typeResolver: TypeResolver =
    options.typeResolver ??
    new WorkspaceTypeResolver({
      createProgram: options.createProgram ?? createDefaultProgram,
    });

  const readStyleFile = options.readStyleFile ?? defaultReadStyleFile;
  const scssClassMapFor = (binding: CxBinding): ScssClassMap | null => {
    const lang = findLangForPath(binding.scssModulePath);
    if (!lang) return null;
    const content = readStyleFile(binding.scssModulePath);
    if (content === null) return null;
    return styleIndexCache.get(binding.scssModulePath, content);
  };

  return {
    analysisCache,
    scssClassMapFor,
    typeResolver,
    reverseIndex: new NullReverseIndex(),
    workspaceRoot,
    logError: (message, err) => {
      const detail = err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err);
      connection.console.error(`[${SERVER_NAME}] ${message}: ${detail}`);
    },
  };
}

function defaultReadStyleFile(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

/**
 * Minimal production ts.Program builder for Phase 6.
 *
 * Parses tsconfig.json relative to the workspace root, falls back
 * to an empty program when missing. Phase 10 refines this with a
 * cached CompilerHost and proper watch-mode plumbing.
 */
export function createDefaultProgram(workspaceRoot: string): ts.Program {
  const configPath = ts.findConfigFile(workspaceRoot, ts.sys.fileExists, "tsconfig.json");
  if (!configPath) {
    return ts.createProgram({
      rootNames: [],
      options: { allowJs: true, jsx: ts.JsxEmit.Preserve },
    });
  }
  const parsed = ts.getParsedCommandLineOfConfigFile(configPath, undefined, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: () => {},
  });
  if (!parsed) {
    return ts.createProgram({ rootNames: [], options: {} });
  }
  return ts.createProgram({
    rootNames: parsed.fileNames,
    options: parsed.options,
  });
}

function toCursorParams(
  p: TextDocumentPositionParams,
  documents: TextDocuments<TextDocument>,
): CursorParams | null {
  const doc = documents.get(p.textDocument.uri);
  if (!doc) return null;
  return {
    documentUri: p.textDocument.uri,
    content: doc.getText(),
    filePath: fileUrlToPath(p.textDocument.uri),
    line: p.position.line,
    character: p.position.character,
    version: doc.version,
  };
}
