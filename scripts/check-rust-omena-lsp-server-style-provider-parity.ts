import { spawnSync } from "node:child_process";
import { strict as assert } from "node:assert";
import { resolveOmenaLspServerInvocation } from "./omena-lsp-server-invocation";
import {
  findCustomPropertyDeclAtCursor,
  findCustomPropertyRefAtCursor,
  findSelectorAtCursor,
} from "../server/engine-core-ts/src/core/query";
import { parseStyleDocument } from "../server/engine-core-ts/src/core/scss/scss-parser";

const workspaceUri = "file:///tmp/cme-rust-lsp-style-provider";
const stylePath = "/tmp/cme-rust-lsp-style-provider/src/App.module.scss";
const styleUri = `${workspaceUri}/src/App.module.scss`;
const sourceUri = `${workspaceUri}/src/App.tsx`;
const sourceText = 'const cls = "root";';
const sourceSelectorRange = {
  start: { line: 0, character: 13 },
  end: { line: 0, character: 17 },
};
const styleText =
  ".root { color: var(--brand); }\n.theme { --brand: red; }\n.alert { color: var(--missing); }";
const sourceSelectorQueryPosition = {
  line: 0,
  character: 14,
};
const selectorQueryPosition = {
  line: 0,
  character: 2,
};
const customPropertyReferenceQueryPosition = {
  line: 0,
  character: 21,
};
const customPropertyDeclarationQueryPosition = {
  line: 1,
  character: 11,
};
const missingCustomPropertyReferenceQueryPosition = {
  line: 2,
  character: 22,
};

const nodeStyleDocument = parseStyleDocument(styleText, stylePath);
const nodeSelector = findSelectorAtCursor(
  nodeStyleDocument,
  selectorQueryPosition.line,
  selectorQueryPosition.character,
);
assert.ok(nodeSelector, "node selector fixture did not produce a hover target");
const nodeCustomPropertyReference = findCustomPropertyRefAtCursor(
  nodeStyleDocument,
  customPropertyReferenceQueryPosition.line,
  customPropertyReferenceQueryPosition.character,
);
assert.ok(
  nodeCustomPropertyReference,
  "node custom property reference fixture did not produce a hover target",
);
const nodeCustomPropertyDeclaration = findCustomPropertyDeclAtCursor(
  nodeStyleDocument,
  customPropertyDeclarationQueryPosition.line,
  customPropertyDeclarationQueryPosition.character,
);
assert.ok(
  nodeCustomPropertyDeclaration,
  "node custom property declaration fixture did not produce a hover target",
);
const nodeMissingCustomPropertyReference = findCustomPropertyRefAtCursor(
  nodeStyleDocument,
  missingCustomPropertyReferenceQueryPosition.line,
  missingCustomPropertyReferenceQueryPosition.character,
);
assert.ok(
  nodeMissingCustomPropertyReference,
  "node missing custom property fixture did not produce a hover target",
);
const expectedMissingCustomPropertyDiagnostic = {
  range: nodeMissingCustomPropertyReference.range,
  severity: 2,
  source: "css-module-explainer",
  message: "CSS custom property '--missing' not found in indexed style tokens.",
  data: {
    createCustomProperty: {
      uri: styleUri,
      range: documentEndRange(styleText),
      newText: "\n\n:root {\n  --missing: ;\n}\n",
      propertyName: "--missing",
    },
  },
};

const initializeRequest = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    processId: null,
    rootUri: workspaceUri,
    workspaceFolders: [
      {
        uri: workspaceUri,
        name: "cme-rust-lsp-style-provider",
      },
    ],
    capabilities: {},
  },
};
const didOpenStyleNotification = {
  jsonrpc: "2.0",
  method: "textDocument/didOpen",
  params: {
    textDocument: {
      uri: styleUri,
      languageId: "scss",
      version: 1,
      text: styleText,
    },
  },
};
const didOpenSourceNotification = {
  jsonrpc: "2.0",
  method: "textDocument/didOpen",
  params: {
    textDocument: {
      uri: sourceUri,
      languageId: "typescriptreact",
      version: 1,
      text: sourceText,
    },
  },
};
const styleHoverCandidatesRequest = {
  jsonrpc: "2.0",
  id: 2,
  method: "cssModuleExplainer/rustStyleHoverCandidates",
  params: {
    textDocument: {
      uri: styleUri,
    },
    position: selectorQueryPosition,
  },
};
const customPropertyReferenceCandidatesRequest = {
  jsonrpc: "2.0",
  id: 3,
  method: "cssModuleExplainer/rustStyleHoverCandidates",
  params: {
    textDocument: {
      uri: styleUri,
    },
    position: customPropertyReferenceQueryPosition,
  },
};
const customPropertyDeclarationCandidatesRequest = {
  jsonrpc: "2.0",
  id: 4,
  method: "cssModuleExplainer/rustStyleHoverCandidates",
  params: {
    textDocument: {
      uri: styleUri,
    },
    position: customPropertyDeclarationQueryPosition,
  },
};
const lspHoverRequest = {
  jsonrpc: "2.0",
  id: 5,
  method: "textDocument/hover",
  params: {
    textDocument: {
      uri: styleUri,
    },
    position: selectorQueryPosition,
  },
};
const lspDefinitionRequest = {
  jsonrpc: "2.0",
  id: 6,
  method: "textDocument/definition",
  params: {
    textDocument: {
      uri: styleUri,
    },
    position: customPropertyReferenceQueryPosition,
  },
};
const lspReferencesRequest = {
  jsonrpc: "2.0",
  id: 7,
  method: "textDocument/references",
  params: {
    textDocument: {
      uri: styleUri,
    },
    position: customPropertyReferenceQueryPosition,
    context: {
      includeDeclaration: true,
    },
  },
};
const lspCompletionRequest = {
  jsonrpc: "2.0",
  id: 8,
  method: "textDocument/completion",
  params: {
    textDocument: {
      uri: styleUri,
    },
    position: customPropertyReferenceQueryPosition,
  },
};
const styleDiagnosticsRequest = {
  jsonrpc: "2.0",
  id: 9,
  method: "cssModuleExplainer/rustStyleDiagnostics",
  params: {
    textDocument: {
      uri: styleUri,
    },
  },
};
const lspCodeActionRequest = {
  jsonrpc: "2.0",
  id: 10,
  method: "textDocument/codeAction",
  params: {
    textDocument: {
      uri: styleUri,
    },
    range: nodeMissingCustomPropertyReference.range,
    context: {
      diagnostics: [expectedMissingCustomPropertyDiagnostic],
    },
  },
};
const lspPrepareRenameRequest = {
  jsonrpc: "2.0",
  id: 11,
  method: "textDocument/prepareRename",
  params: {
    textDocument: {
      uri: styleUri,
    },
    position: selectorQueryPosition,
  },
};
const lspRenameRequest = {
  jsonrpc: "2.0",
  id: 12,
  method: "textDocument/rename",
  params: {
    textDocument: {
      uri: styleUri,
    },
    position: customPropertyReferenceQueryPosition,
    newName: "--accent",
  },
};
const lspCodeLensRequest = {
  jsonrpc: "2.0",
  id: 13,
  method: "textDocument/codeLens",
  params: {
    textDocument: {
      uri: styleUri,
    },
  },
};
const lspSourceHoverRequest = {
  jsonrpc: "2.0",
  id: 14,
  method: "textDocument/hover",
  params: {
    textDocument: {
      uri: sourceUri,
    },
    position: sourceSelectorQueryPosition,
  },
};
const lspSourceDefinitionRequest = {
  jsonrpc: "2.0",
  id: 15,
  method: "textDocument/definition",
  params: {
    textDocument: {
      uri: sourceUri,
    },
    position: sourceSelectorQueryPosition,
  },
};
const lspSourceReferencesRequest = {
  jsonrpc: "2.0",
  id: 16,
  method: "textDocument/references",
  params: {
    textDocument: {
      uri: sourceUri,
    },
    position: sourceSelectorQueryPosition,
    context: {
      includeDeclaration: true,
    },
  },
};
const lspSourceCompletionRequest = {
  jsonrpc: "2.0",
  id: 17,
  method: "textDocument/completion",
  params: {
    textDocument: {
      uri: sourceUri,
    },
    position: sourceSelectorQueryPosition,
  },
};
const lspSourcePrepareRenameRequest = {
  jsonrpc: "2.0",
  id: 18,
  method: "textDocument/prepareRename",
  params: {
    textDocument: {
      uri: sourceUri,
    },
    position: sourceSelectorQueryPosition,
  },
};
const lspSourceRenameRequest = {
  jsonrpc: "2.0",
  id: 19,
  method: "textDocument/rename",
  params: {
    textDocument: {
      uri: sourceUri,
    },
    position: sourceSelectorQueryPosition,
    newName: "panel",
  },
};
const shutdownRequest = {
  jsonrpc: "2.0",
  id: 20,
  method: "shutdown",
};
const exitNotification = {
  jsonrpc: "2.0",
  method: "exit",
};

const invocation = resolveOmenaLspServerInvocation();
const result = spawnSync(invocation.command, [...invocation.args], {
  cwd: process.cwd(),
  input: [
    initializeRequest,
    didOpenSourceNotification,
    didOpenStyleNotification,
    styleHoverCandidatesRequest,
    customPropertyReferenceCandidatesRequest,
    customPropertyDeclarationCandidatesRequest,
    lspHoverRequest,
    lspDefinitionRequest,
    lspReferencesRequest,
    lspCompletionRequest,
    styleDiagnosticsRequest,
    lspCodeActionRequest,
    lspPrepareRenameRequest,
    lspRenameRequest,
    lspCodeLensRequest,
    lspSourceHoverRequest,
    lspSourceDefinitionRequest,
    lspSourceReferencesRequest,
    lspSourceCompletionRequest,
    lspSourcePrepareRenameRequest,
    lspSourceRenameRequest,
    shutdownRequest,
    exitNotification,
  ]
    .map(frame)
    .join(""),
  encoding: "utf8",
  stdio: ["pipe", "pipe", "pipe"],
});

assert.equal(
  result.status,
  0,
  [
    "omena-lsp-server style provider parity failed",
    result.error ? `error=${result.error.message}` : null,
    result.stderr.trim() ? `stderr=${result.stderr.trim()}` : null,
  ]
    .filter(Boolean)
    .join("\n"),
);

const messages = readFrames(result.stdout);
const responses = messages.filter((message) => "id" in message);
const diagnosticNotifications = messages.filter(
  (message) => message.method === "textDocument/publishDiagnostics",
);
assert.equal(responses.length, 20);
assert.deepEqual(diagnosticNotifications, [
  {
    jsonrpc: "2.0",
    method: "textDocument/publishDiagnostics",
    params: {
      uri: styleUri,
      diagnostics: [expectedMissingCustomPropertyDiagnostic],
    },
  },
]);

const styleHoverResponse = responses[1]!;
assert.equal(styleHoverResponse.id, 2);
assertSingleCandidate(styleHoverResponse, selectorQueryPosition, {
  kind: "selector",
  name: nodeSelector.name,
  range: nodeSelector.range,
  source: "openedStyleDocumentIndex",
});

const customPropertyReferenceResponse = responses[2]!;
assert.equal(customPropertyReferenceResponse.id, 3);
assertSingleCandidate(customPropertyReferenceResponse, customPropertyReferenceQueryPosition, {
  kind: "customPropertyReference",
  name: nodeCustomPropertyReference.name,
  range: nodeCustomPropertyReference.range,
  source: "openedStyleDocumentIndex",
});

const customPropertyDeclarationResponse = responses[3]!;
assert.equal(customPropertyDeclarationResponse.id, 4);
assertSingleCandidate(customPropertyDeclarationResponse, customPropertyDeclarationQueryPosition, {
  kind: "customPropertyDeclaration",
  name: nodeCustomPropertyDeclaration.name,
  range: nodeCustomPropertyDeclaration.range,
  source: "openedStyleDocumentIndex",
});

const lspHoverResponse = responses[4]!;
assert.equal(lspHoverResponse.id, 5);
assert.deepEqual(lspHoverResponse.result.range, nodeSelector.range);
assert.equal(lspHoverResponse.result.contents.kind, "markdown");
assert.match(lspHoverResponse.result.contents.value, /\.root/);

const lspDefinitionResponse = responses[5]!;
assert.equal(lspDefinitionResponse.id, 6);
assert.deepEqual(lspDefinitionResponse.result, [
  {
    uri: styleUri,
    range: nodeCustomPropertyDeclaration.range,
  },
]);

const lspReferencesResponse = responses[6]!;
assert.equal(lspReferencesResponse.id, 7);
assert.deepEqual(lspReferencesResponse.result, [
  {
    uri: styleUri,
    range: nodeCustomPropertyReference.range,
  },
  {
    uri: styleUri,
    range: nodeCustomPropertyDeclaration.range,
  },
]);

const lspCompletionResponse = responses[7]!;
assert.equal(lspCompletionResponse.id, 8);
assert.equal(lspCompletionResponse.result.isIncomplete, false);
assert.deepEqual(
  lspCompletionResponse.result.items.map((item: { readonly label: string }) => item.label),
  ["--brand", ".alert", ".root", ".theme"],
);

const styleDiagnosticsResponse = responses[8]!;
assert.equal(styleDiagnosticsResponse.id, 9);
assert.deepEqual(styleDiagnosticsResponse.result, [expectedMissingCustomPropertyDiagnostic]);

const lspCodeActionResponse = responses[9]!;
assert.equal(lspCodeActionResponse.id, 10);
assert.deepEqual(lspCodeActionResponse.result, [
  {
    title: "Add '--missing' to App.module.scss",
    kind: "quickfix",
    diagnostics: [expectedMissingCustomPropertyDiagnostic],
    edit: {
      changes: {
        [styleUri]: [
          {
            range: expectedMissingCustomPropertyDiagnostic.data.createCustomProperty.range,
            newText: expectedMissingCustomPropertyDiagnostic.data.createCustomProperty.newText,
          },
        ],
      },
    },
    data: {
      source: "openedStyleDocumentIndex",
      diagnosticIndex: 0,
    },
  },
]);

const lspPrepareRenameResponse = responses[10]!;
assert.equal(lspPrepareRenameResponse.id, 11);
assert.deepEqual(lspPrepareRenameResponse.result, {
  range: nodeSelector.range,
  placeholder: nodeSelector.name,
});

const lspRenameResponse = responses[11]!;
assert.equal(lspRenameResponse.id, 12);
assert.deepEqual(lspRenameResponse.result, {
  changes: {
    [styleUri]: [
      {
        range: nodeCustomPropertyReference.range,
        newText: "--accent",
      },
      {
        range: nodeCustomPropertyDeclaration.range,
        newText: "--accent",
      },
    ],
  },
});

const lspCodeLensResponse = responses[12]!;
assert.equal(lspCodeLensResponse.id, 13);
assert.deepEqual(lspCodeLensResponse.result, [
  {
    range: {
      start: nodeSelector.range.start,
      end: nodeSelector.range.start,
    },
    command: {
      title: "1 reference",
      command: "editor.action.showReferences",
      arguments: [
        styleUri,
        nodeSelector.range.start,
        [
          {
            uri: sourceUri,
            range: sourceSelectorRange,
          },
        ],
      ],
    },
  },
]);

const lspSourceHoverResponse = responses[13]!;
assert.equal(lspSourceHoverResponse.id, 14);
assert.deepEqual(lspSourceHoverResponse.result.range, sourceSelectorRange);
assert.equal(lspSourceHoverResponse.result.contents.kind, "markdown");
assert.match(lspSourceHoverResponse.result.contents.value, /\.root/);
assert.match(lspSourceHoverResponse.result.contents.value, /App\.module\.scss/);

const lspSourceDefinitionResponse = responses[14]!;
assert.equal(lspSourceDefinitionResponse.id, 15);
assert.deepEqual(lspSourceDefinitionResponse.result, [
  {
    uri: styleUri,
    range: nodeSelector.range,
  },
]);

const lspSourceReferencesResponse = responses[15]!;
assert.equal(lspSourceReferencesResponse.id, 16);
assert.deepEqual(lspSourceReferencesResponse.result, [
  {
    uri: styleUri,
    range: nodeSelector.range,
  },
  {
    uri: sourceUri,
    range: sourceSelectorRange,
  },
]);

const lspSourceCompletionResponse = responses[16]!;
assert.equal(lspSourceCompletionResponse.id, 17);
assert.equal(lspSourceCompletionResponse.result.isIncomplete, false);
assert.deepEqual(
  lspSourceCompletionResponse.result.items.map((item: { readonly label: string }) => item.label),
  ["alert", "root", "theme"],
);

const lspSourcePrepareRenameResponse = responses[17]!;
assert.equal(lspSourcePrepareRenameResponse.id, 18);
assert.deepEqual(lspSourcePrepareRenameResponse.result, {
  range: sourceSelectorRange,
  placeholder: "root",
});

const lspSourceRenameResponse = responses[18]!;
assert.equal(lspSourceRenameResponse.id, 19);
assert.deepEqual(lspSourceRenameResponse.result, {
  changes: {
    [styleUri]: [
      {
        range: nodeSelector.range,
        newText: "panel",
      },
    ],
    [sourceUri]: [
      {
        range: sourceSelectorRange,
        newText: "panel",
      },
    ],
  },
});

process.stdout.write(
  [
    "validated omena-lsp-server style provider parity:",
    `command=${invocation.command}`,
    `candidate=${styleHoverResponse.result.candidates[0].name}`,
    `customPropertyReference=${customPropertyReferenceResponse.result.candidates[0].name}`,
    `customPropertyDeclaration=${customPropertyDeclarationResponse.result.candidates[0].name}`,
    `lspHover=${lspHoverResponse.result.contents.kind}`,
    `lspDefinitionTargets=${lspDefinitionResponse.result.length}`,
    `lspReferences=${lspReferencesResponse.result.length}`,
    `lspCompletionItems=${lspCompletionResponse.result.items.length}`,
    `diagnostics=${styleDiagnosticsResponse.result.length}`,
    `diagnosticNotifications=${diagnosticNotifications.length}`,
    `codeActions=${lspCodeActionResponse.result.length}`,
    `prepareRename=${lspPrepareRenameResponse.result.placeholder}`,
    `renameEdits=${lspRenameResponse.result.changes[styleUri].length}`,
    `codeLens=${lspCodeLensResponse.result.length}`,
    `sourceHover=${lspSourceHoverResponse.result.contents.kind}`,
    `sourceDefinitionTargets=${lspSourceDefinitionResponse.result.length}`,
    `sourceReferences=${lspSourceReferencesResponse.result.length}`,
    `sourceCompletionItems=${lspSourceCompletionResponse.result.items.length}`,
    `sourceRenameEdits=${
      lspSourceRenameResponse.result.changes[styleUri].length +
      lspSourceRenameResponse.result.changes[sourceUri].length
    }`,
    `line=${styleHoverResponse.result.candidates[0].range.start.line}`,
    `character=${styleHoverResponse.result.candidates[0].range.start.character}`,
    `nodeRangeParity=${JSON.stringify(styleHoverResponse.result.candidates[0].range)}`,
  ].join(" "),
);
process.stdout.write("\n");

function frame(value: unknown): string {
  const body = JSON.stringify(value);
  return `Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`;
}

function documentEndRange(text: string): {
  readonly start: { readonly line: number; readonly character: number };
  readonly end: { readonly line: number; readonly character: number };
} {
  const lines = text.split("\n");
  const position = {
    line: lines.length - 1,
    character: lines[lines.length - 1]!.length,
  };
  return {
    start: position,
    end: position,
  };
}

function assertSingleCandidate(
  response: any,
  queryPosition: { readonly line: number; readonly character: number },
  expectedCandidate: {
    readonly kind: string;
    readonly name: string;
    readonly range: unknown;
    readonly source: string;
  },
): void {
  assert.equal(response.result.product, "omena-lsp-server.style-hover-candidates");
  assert.equal(response.result.documentUri, styleUri);
  assert.equal(response.result.workspaceFolderUri, workspaceUri);
  assert.equal(response.result.language, "scss");
  assert.equal(response.result.candidateCount, 1);
  assert.deepEqual(response.result.queryPosition, queryPosition);
  assert.deepEqual(response.result.candidates, [expectedCandidate]);
}

function readFrames(stdout: string): any[] {
  const responses: any[] = [];
  let offset = 0;

  while (offset < stdout.length) {
    const headerEnd = stdout.indexOf("\r\n\r\n", offset);
    if (headerEnd < 0) break;
    const header = stdout.slice(offset, headerEnd);
    const match = /^Content-Length:\s*(\d+)$/imu.exec(header);
    assert.ok(match, `missing Content-Length in response header: ${header}`);
    const length = Number(match[1]);
    const bodyStart = headerEnd + 4;
    const bodyEnd = bodyStart + length;
    assert.ok(bodyEnd <= stdout.length, "incomplete response body");
    responses.push(JSON.parse(stdout.slice(bodyStart, bodyEnd)));
    offset = bodyEnd;
  }

  return responses;
}
