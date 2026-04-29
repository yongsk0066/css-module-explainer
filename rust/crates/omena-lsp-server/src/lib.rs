use engine_style_parser::{
    ParserByteSpanV0, ParserPositionV0, ParserRangeV0, RulePayload, SelectorSegment, StyleLanguage,
    SyntaxNode, SyntaxNodePayload, TextSpan, parse_style_module,
    summarize_css_modules_intermediate,
};
use serde::Serialize;
use serde_json::{Value, json};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::PathBuf,
};

pub const NODE_TEXT_DOCUMENT_SYNC_KIND: u8 = 2;
pub const DEBUG_STATE_REQUEST: &str = "cssModuleExplainer/rustLspState";
pub const STYLE_HOVER_CANDIDATES_REQUEST: &str = "cssModuleExplainer/rustStyleHoverCandidates";
pub const STYLE_DIAGNOSTICS_REQUEST: &str = "cssModuleExplainer/rustStyleDiagnostics";

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OmenaLspServerBoundarySummaryV0 {
    pub schema_version: &'static str,
    pub product: &'static str,
    pub server_name: &'static str,
    pub migration_status: &'static str,
    pub transport_contract: &'static str,
    pub capabilities: OmenaLspServerCapabilitiesV0,
    pub handler_surfaces: Vec<LspHandlerSurfaceV0>,
    pub migration_phases: Vec<LspMigrationPhaseV0>,
    pub blocking_work_policy: Vec<&'static str>,
    pub node_parity_contracts: Vec<&'static str>,
    pub next_decoupling_targets: Vec<&'static str>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OmenaLspServerCapabilitiesV0 {
    pub text_document_sync: u8,
    pub definition_provider: bool,
    pub hover_provider: bool,
    pub completion_provider: CompletionProviderCapabilityV0,
    pub code_action_provider: CodeActionProviderCapabilityV0,
    pub references_provider: bool,
    pub code_lens_provider: ResolveProviderCapabilityV0,
    pub rename_provider: RenameProviderCapabilityV0,
    pub workspace: WorkspaceCapabilityV0,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompletionProviderCapabilityV0 {
    pub trigger_characters: Vec<&'static str>,
    pub resolve_provider: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodeActionProviderCapabilityV0 {
    pub code_action_kinds: Vec<&'static str>,
    pub resolve_provider: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolveProviderCapabilityV0 {
    pub resolve_provider: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameProviderCapabilityV0 {
    pub prepare_provider: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceCapabilityV0 {
    pub workspace_folders: WorkspaceFoldersCapabilityV0,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceFoldersCapabilityV0 {
    pub supported: bool,
    pub change_notifications: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LspHandlerSurfaceV0 {
    pub method: &'static str,
    pub node_owner: &'static str,
    pub rust_owner_target: &'static str,
    pub migration_state: &'static str,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LspMigrationPhaseV0 {
    pub phase: &'static str,
    pub goal: &'static str,
    pub exit_gate: &'static str,
}

pub fn summarize_omena_lsp_server_boundary() -> OmenaLspServerBoundarySummaryV0 {
    OmenaLspServerBoundarySummaryV0 {
        schema_version: "0",
        product: "omena-lsp-server.boundary",
        server_name: "css-module-explainer",
        migration_status: "runtimeShell",
        transport_contract: "LSP stdio or IPC JSON-RPC",
        capabilities: current_node_lsp_capability_contract(),
        handler_surfaces: lsp_handler_surfaces(),
        migration_phases: lsp_migration_phases(),
        blocking_work_policy: vec![
            "noFullWorkspaceProgramOnRequestPath",
            "cooperativeCancellationBeforeProviderWork",
            "backgroundIndexAndTypeFactWarmup",
            "staleOrUnresolvableFastReturn",
        ],
        node_parity_contracts: vec![
            "initializeCapabilities",
            "textDocumentSync",
            "workspaceFolders",
            "dynamicFileWatchers",
            "diagnosticsPush",
            "codeLensRefresh",
        ],
        next_decoupling_targets: vec![
            "rustWorkspaceRuntimeRegistry",
            "rustDiagnosticsScheduler",
            "longLivedTsgoClient",
            "incrementalQueryCancellation",
        ],
    }
}

pub fn current_node_lsp_capability_contract() -> OmenaLspServerCapabilitiesV0 {
    OmenaLspServerCapabilitiesV0 {
        text_document_sync: NODE_TEXT_DOCUMENT_SYNC_KIND,
        definition_provider: true,
        hover_provider: true,
        completion_provider: CompletionProviderCapabilityV0 {
            trigger_characters: vec!["'", "\"", "`", ",", ".", "$", "@", "-"],
            resolve_provider: false,
        },
        code_action_provider: CodeActionProviderCapabilityV0 {
            code_action_kinds: vec!["quickfix"],
            resolve_provider: false,
        },
        references_provider: true,
        code_lens_provider: ResolveProviderCapabilityV0 {
            resolve_provider: false,
        },
        rename_provider: RenameProviderCapabilityV0 {
            prepare_provider: true,
        },
        workspace: WorkspaceCapabilityV0 {
            workspace_folders: WorkspaceFoldersCapabilityV0 {
                supported: true,
                change_notifications: true,
            },
        },
    }
}

pub fn lsp_handler_surfaces() -> Vec<LspHandlerSurfaceV0> {
    vec![
        style_provider_handler("textDocument/definition"),
        style_provider_handler("textDocument/hover"),
        style_provider_handler("textDocument/completion"),
        style_provider_handler("textDocument/codeAction"),
        style_provider_handler("textDocument/references"),
        style_provider_handler("textDocument/codeLens"),
        style_provider_handler("textDocument/prepareRename"),
        style_provider_handler("textDocument/rename"),
        runtime_handler("textDocument/didOpen"),
        runtime_handler("textDocument/didChange"),
        runtime_handler("textDocument/didClose"),
        runtime_handler("workspace/didChangeWatchedFiles"),
        runtime_handler("workspace/didChangeConfiguration"),
        runtime_handler("workspace/didChangeWorkspaceFolders"),
        diagnostics_handler("textDocument/publishDiagnostics"),
    ]
}

fn style_provider_handler(method: &'static str) -> LspHandlerSurfaceV0 {
    LspHandlerSurfaceV0 {
        method,
        node_owner: "server/lsp-server/src/providers",
        rust_owner_target: "omena-lsp-server/providers/style",
        migration_state: "styleSidePartial",
    }
}

fn runtime_handler(method: &'static str) -> LspHandlerSurfaceV0 {
    LspHandlerSurfaceV0 {
        method,
        node_owner: "server/lsp-server/src/handler-registration.ts",
        rust_owner_target: "omena-lsp-server/runtime",
        migration_state: "planned",
    }
}

fn diagnostics_handler(method: &'static str) -> LspHandlerSurfaceV0 {
    LspHandlerSurfaceV0 {
        method,
        node_owner: "server/lsp-server/src/diagnostics-scheduler.ts",
        rust_owner_target: "omena-lsp-server/diagnostics",
        migration_state: "planned",
    }
}

pub fn lsp_migration_phases() -> Vec<LspMigrationPhaseV0> {
    vec![
        LspMigrationPhaseV0 {
            phase: "phase-0-boundary",
            goal: "declare Rust LSP capability and handler parity with the Node server",
            exit_gate: "rust/omena-lsp-server/boundary",
        },
        LspMigrationPhaseV0 {
            phase: "phase-1-shell",
            goal: "own initialize, shutdown, text sync, workspace folders, and watcher state in Rust",
            exit_gate: "rust/omena-lsp-server/runtime-loop",
        },
        LspMigrationPhaseV0 {
            phase: "phase-2-style-providers",
            goal: "serve style-side hover, definition, references, diagnostics, and code lens from Rust",
            exit_gate: "rust/omena-lsp-server/provider-parity",
        },
        LspMigrationPhaseV0 {
            phase: "phase-3-source-providers",
            goal: "replace Node WorkspaceTypeResolver hot path with a long-lived tsgo client and Rust query runtime",
            exit_gate: "rust/omena-lsp-server/provider-parity",
        },
    ]
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LspTextDocumentState {
    pub uri: String,
    pub workspace_folder_uri: Option<String>,
    pub language_id: String,
    pub version: i64,
    pub text: String,
    pub style_summary: Option<LspStyleDocumentSummary>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LspStyleDocumentSummary {
    pub language: &'static str,
    pub selector_names: Vec<String>,
    pub custom_property_decl_names: Vec<String>,
    pub custom_property_ref_names: Vec<String>,
    pub sass_module_use_sources: Vec<String>,
    pub sass_module_forward_sources: Vec<String>,
    pub diagnostic_count: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LspStyleHoverCandidatesResult {
    pub schema_version: &'static str,
    pub product: &'static str,
    pub document_uri: String,
    pub workspace_folder_uri: Option<String>,
    pub language: Option<&'static str>,
    pub query_position: Option<ParserPositionV0>,
    pub candidate_count: usize,
    pub candidates: Vec<LspStyleHoverCandidate>,
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LspStyleHoverCandidate {
    pub kind: &'static str,
    pub name: String,
    pub range: ParserRangeV0,
    pub source: &'static str,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LspWorkspaceFolderState {
    pub uri: String,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LspWatchedFileChangeState {
    pub uri: String,
    pub change_type: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LspShellStateSnapshot {
    pub shutdown_requested: bool,
    pub should_exit: bool,
    pub document_count: usize,
    pub workspace_folder_count: usize,
    pub configuration_change_count: usize,
    pub watched_file_event_count: usize,
    pub documents: Vec<LspTextDocumentState>,
    pub workspace_folders: Vec<LspWorkspaceFolderState>,
    pub watched_file_changes: Vec<LspWatchedFileChangeState>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct LspShellState {
    pub shutdown_requested: bool,
    pub should_exit: bool,
    configuration_change_count: usize,
    documents: BTreeMap<String, LspTextDocumentState>,
    workspace_folders: BTreeMap<String, LspWorkspaceFolderState>,
    watched_file_changes: Vec<LspWatchedFileChangeState>,
}

impl LspShellState {
    pub fn document_count(&self) -> usize {
        self.documents.len()
    }

    pub fn workspace_folder_count(&self) -> usize {
        self.workspace_folders.len()
    }

    pub fn document(&self, uri: &str) -> Option<&LspTextDocumentState> {
        self.documents.get(uri)
    }

    pub fn workspace_folder(&self, uri: &str) -> Option<&LspWorkspaceFolderState> {
        self.workspace_folders.get(uri)
    }

    pub fn snapshot(&self) -> LspShellStateSnapshot {
        LspShellStateSnapshot {
            shutdown_requested: self.shutdown_requested,
            should_exit: self.should_exit,
            document_count: self.document_count(),
            workspace_folder_count: self.workspace_folder_count(),
            configuration_change_count: self.configuration_change_count,
            watched_file_event_count: self.watched_file_changes.len(),
            documents: self.documents.values().cloned().collect(),
            workspace_folders: self.workspace_folders.values().cloned().collect(),
            watched_file_changes: self.watched_file_changes.clone(),
        }
    }
}

pub fn handle_lsp_message(state: &mut LspShellState, message: Value) -> Option<Value> {
    let method = message.get("method").and_then(Value::as_str);
    let id = message.get("id").cloned();

    match (method, id) {
        (Some("initialize"), Some(request_id)) => {
            initialize_workspace_folders(state, message.get("params"));
            Some(json!({
                "jsonrpc": "2.0",
                "id": request_id,
                "result": {
                    "capabilities": current_node_lsp_capability_contract(),
                    "serverInfo": {
                        "name": "css-module-explainer-rust",
                    },
                },
            }))
        }
        (Some("textDocument/didOpen"), None) => {
            did_open_text_document(state, message.get("params"));
            None
        }
        (Some("textDocument/didChange"), None) => {
            did_change_text_document(state, message.get("params"));
            None
        }
        (Some("textDocument/didClose"), None) => {
            did_close_text_document(state, message.get("params"));
            None
        }
        (Some("workspace/didChangeWorkspaceFolders"), None) => {
            did_change_workspace_folders(state, message.get("params"));
            None
        }
        (Some("workspace/didChangeConfiguration"), None) => {
            did_change_configuration(state);
            None
        }
        (Some("workspace/didChangeWatchedFiles"), None) => {
            did_change_watched_files(state, message.get("params"));
            None
        }
        (Some("textDocument/hover"), Some(request_id)) => Some(json!({
            "jsonrpc": "2.0",
            "id": request_id,
            "result": resolve_lsp_hover(state, message.get("params")),
        })),
        (Some("textDocument/definition"), Some(request_id)) => Some(json!({
            "jsonrpc": "2.0",
            "id": request_id,
            "result": resolve_lsp_definition(state, message.get("params")),
        })),
        (Some("textDocument/references"), Some(request_id)) => Some(json!({
            "jsonrpc": "2.0",
            "id": request_id,
            "result": resolve_lsp_references(state, message.get("params")),
        })),
        (Some("textDocument/completion"), Some(request_id)) => Some(json!({
            "jsonrpc": "2.0",
            "id": request_id,
            "result": resolve_lsp_completion(state, message.get("params")),
        })),
        (Some("textDocument/codeAction"), Some(request_id)) => Some(json!({
            "jsonrpc": "2.0",
            "id": request_id,
            "result": resolve_lsp_code_actions(message.get("params")),
        })),
        (Some("textDocument/codeLens"), Some(request_id)) => Some(json!({
            "jsonrpc": "2.0",
            "id": request_id,
            "result": resolve_lsp_code_lens(state, message.get("params")),
        })),
        (Some("textDocument/prepareRename"), Some(request_id)) => Some(json!({
            "jsonrpc": "2.0",
            "id": request_id,
            "result": resolve_lsp_prepare_rename(state, message.get("params")),
        })),
        (Some("textDocument/rename"), Some(request_id)) => Some(json!({
            "jsonrpc": "2.0",
            "id": request_id,
            "result": resolve_lsp_rename(state, message.get("params")),
        })),
        (Some(DEBUG_STATE_REQUEST), Some(request_id)) => Some(json!({
            "jsonrpc": "2.0",
            "id": request_id,
            "result": state.snapshot(),
        })),
        (Some(STYLE_HOVER_CANDIDATES_REQUEST), Some(request_id)) => Some(json!({
            "jsonrpc": "2.0",
            "id": request_id,
            "result": resolve_style_hover_candidates(state, message.get("params")),
        })),
        (Some(STYLE_DIAGNOSTICS_REQUEST), Some(request_id)) => Some(json!({
            "jsonrpc": "2.0",
            "id": request_id,
            "result": resolve_style_diagnostics(state, message.get("params")),
        })),
        (Some("shutdown"), Some(request_id)) => {
            state.shutdown_requested = true;
            Some(json!({
                "jsonrpc": "2.0",
                "id": request_id,
                "result": null,
            }))
        }
        (Some("exit"), None) => {
            state.should_exit = true;
            None
        }
        (Some(_), Some(request_id)) => Some(json!({
            "jsonrpc": "2.0",
            "id": request_id,
            "error": {
                "code": -32601,
                "message": "Method not found",
            },
        })),
        (Some(_), None) => None,
        (None, Some(request_id)) => Some(json!({
            "jsonrpc": "2.0",
            "id": request_id,
            "error": {
                "code": -32600,
                "message": "Invalid Request",
            },
        })),
        (None, None) => None,
    }
}

pub fn handle_lsp_message_outputs(state: &mut LspShellState, message: Value) -> Vec<Value> {
    let method = message
        .get("method")
        .and_then(Value::as_str)
        .map(str::to_string);
    let document_uri = message
        .get("params")
        .and_then(|value| value.get("textDocument"))
        .and_then(|value| value.get("uri"))
        .and_then(Value::as_str)
        .map(str::to_string);
    let mut outputs = Vec::new();

    if let Some(response) = handle_lsp_message(state, message) {
        outputs.push(response);
    }

    if matches!(
        method.as_deref(),
        Some("textDocument/didOpen" | "textDocument/didChange" | "textDocument/didClose")
    ) && let Some(uri) = document_uri
        && StyleLanguage::from_module_path(uri.as_str()).is_some()
    {
        let diagnostics = if method.as_deref() == Some("textDocument/didClose") {
            json!([])
        } else {
            resolve_style_diagnostics_for_uri(state, uri.as_str())
        };
        outputs.push(json!({
            "jsonrpc": "2.0",
            "method": "textDocument/publishDiagnostics",
            "params": {
                "uri": uri,
                "diagnostics": diagnostics,
            },
        }));
    }

    outputs
}

fn initialize_workspace_folders(state: &mut LspShellState, params: Option<&Value>) {
    state.workspace_folders.clear();
    if let Some(folders) = params
        .and_then(|value| value.get("workspaceFolders"))
        .and_then(Value::as_array)
    {
        for folder in folders {
            insert_workspace_folder(state, folder);
        }
        return;
    }

    if let Some(root_uri) = params
        .and_then(|value| value.get("rootUri"))
        .and_then(Value::as_str)
    {
        state.workspace_folders.insert(
            root_uri.to_string(),
            LspWorkspaceFolderState {
                uri: root_uri.to_string(),
                name: root_uri.to_string(),
            },
        );
    }
}

fn did_open_text_document(state: &mut LspShellState, params: Option<&Value>) {
    let Some(document) = params.and_then(|value| value.get("textDocument")) else {
        return;
    };
    let Some(uri) = document.get("uri").and_then(Value::as_str) else {
        return;
    };

    state.documents.insert(
        uri.to_string(),
        LspTextDocumentState {
            uri: uri.to_string(),
            workspace_folder_uri: resolve_workspace_folder_uri(state, uri),
            language_id: document
                .get("languageId")
                .and_then(Value::as_str)
                .unwrap_or("unknown")
                .to_string(),
            version: document.get("version").and_then(Value::as_i64).unwrap_or(0),
            text: document
                .get("text")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
            style_summary: summarize_style_document(
                uri,
                document.get("text").and_then(Value::as_str),
            ),
        },
    );
}

fn did_change_text_document(state: &mut LspShellState, params: Option<&Value>) {
    let Some(text_document) = params.and_then(|value| value.get("textDocument")) else {
        return;
    };
    let Some(uri) = text_document.get("uri").and_then(Value::as_str) else {
        return;
    };
    let Some(existing) = state.documents.get_mut(uri) else {
        return;
    };

    if let Some(version) = text_document.get("version").and_then(Value::as_i64) {
        existing.version = version;
    }
    if let Some(next_text) = params
        .and_then(|value| value.get("contentChanges"))
        .and_then(Value::as_array)
        .and_then(|changes| changes.iter().rev().find_map(|change| change.get("text")))
        .and_then(Value::as_str)
    {
        existing.text = next_text.to_string();
        existing.style_summary = summarize_style_document(uri, Some(next_text));
    }
}

fn did_close_text_document(state: &mut LspShellState, params: Option<&Value>) {
    let Some(uri) = params
        .and_then(|value| value.get("textDocument"))
        .and_then(|value| value.get("uri"))
        .and_then(Value::as_str)
    else {
        return;
    };
    state.documents.remove(uri);
}

fn did_change_workspace_folders(state: &mut LspShellState, params: Option<&Value>) {
    let event = params.and_then(|value| value.get("event"));
    if let Some(removed) = event
        .and_then(|value| value.get("removed"))
        .and_then(Value::as_array)
    {
        for folder in removed {
            if let Some(uri) = folder.get("uri").and_then(Value::as_str) {
                state.workspace_folders.remove(uri);
            }
        }
    }
    if let Some(added) = event
        .and_then(|value| value.get("added"))
        .and_then(Value::as_array)
    {
        for folder in added {
            insert_workspace_folder(state, folder);
        }
    }
    refresh_document_workspace_owners(state);
}

fn did_change_configuration(state: &mut LspShellState) {
    state.configuration_change_count += 1;
}

fn did_change_watched_files(state: &mut LspShellState, params: Option<&Value>) {
    let Some(changes) = params
        .and_then(|value| value.get("changes"))
        .and_then(Value::as_array)
    else {
        return;
    };
    for change in changes {
        let Some(uri) = change.get("uri").and_then(Value::as_str) else {
            continue;
        };
        let change_type = change.get("type").and_then(Value::as_u64).unwrap_or(0);
        state.watched_file_changes.push(LspWatchedFileChangeState {
            uri: uri.to_string(),
            change_type,
        });
        apply_watched_file_change_to_index(state, uri, change_type);
    }
}

fn apply_watched_file_change_to_index(state: &mut LspShellState, uri: &str, change_type: u64) {
    if !is_style_document_uri(uri) {
        return;
    }
    if change_type == 3 {
        state.documents.remove(uri);
        return;
    }

    let Some(path) = file_uri_to_path(uri) else {
        return;
    };
    let Ok(text) = fs::read_to_string(path) else {
        return;
    };
    state.documents.insert(
        uri.to_string(),
        LspTextDocumentState {
            uri: uri.to_string(),
            workspace_folder_uri: resolve_workspace_folder_uri(state, uri),
            language_id: StyleLanguage::from_module_path(uri)
                .map(style_language_label)
                .unwrap_or("unknown")
                .to_string(),
            version: 0,
            style_summary: summarize_style_document(uri, Some(text.as_str())),
            text,
        },
    );
}

fn insert_workspace_folder(state: &mut LspShellState, folder: &Value) {
    let Some(uri) = folder.get("uri").and_then(Value::as_str) else {
        return;
    };
    state.workspace_folders.insert(
        uri.to_string(),
        LspWorkspaceFolderState {
            uri: uri.to_string(),
            name: folder
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or(uri)
                .to_string(),
        },
    );
}

fn refresh_document_workspace_owners(state: &mut LspShellState) {
    let workspace_folders = state.workspace_folders.clone();
    for document in state.documents.values_mut() {
        document.workspace_folder_uri =
            resolve_workspace_folder_uri_from_map(&workspace_folders, document.uri.as_str());
    }
}

fn resolve_workspace_folder_uri(state: &LspShellState, document_uri: &str) -> Option<String> {
    resolve_workspace_folder_uri_from_map(&state.workspace_folders, document_uri)
}

fn resolve_workspace_folder_uri_from_map(
    workspace_folders: &BTreeMap<String, LspWorkspaceFolderState>,
    document_uri: &str,
) -> Option<String> {
    workspace_folders
        .keys()
        .filter(|workspace_uri| {
            document_uri == workspace_uri.as_str()
                || document_uri
                    .strip_prefix(workspace_uri.as_str())
                    .is_some_and(|suffix| suffix.starts_with('/'))
        })
        .max_by_key(|workspace_uri| workspace_uri.len())
        .cloned()
}

fn summarize_style_document(uri: &str, text: Option<&str>) -> Option<LspStyleDocumentSummary> {
    let text = text?;
    let sheet = parse_style_module(uri, text)?;
    let index = summarize_css_modules_intermediate(&sheet);
    Some(LspStyleDocumentSummary {
        language: style_language_label(sheet.language),
        selector_names: index.selectors.names,
        custom_property_decl_names: index.custom_properties.decl_names,
        custom_property_ref_names: index.custom_properties.ref_names,
        sass_module_use_sources: index.sass.module_use_sources,
        sass_module_forward_sources: index.sass.module_forward_sources,
        diagnostic_count: sheet.diagnostics.len(),
    })
}

pub fn resolve_style_hover_candidates(
    state: &LspShellState,
    params: Option<&Value>,
) -> LspStyleHoverCandidatesResult {
    let document_uri = document_uri_from_params(params);
    let query_position = lsp_position_from_params(params);
    let Some(document) = state.document(&document_uri) else {
        return empty_style_hover_candidates_result(document_uri, None, query_position);
    };

    let Some((language, mut candidates)) =
        collect_style_hover_candidates(document.uri.as_str(), document.text.as_str())
    else {
        return empty_style_hover_candidates_result(
            document_uri,
            document.workspace_folder_uri.clone(),
            query_position,
        );
    };

    if let Some(position) = query_position {
        candidates.retain(|candidate| parser_range_contains_position(&candidate.range, position));
    }

    LspStyleHoverCandidatesResult {
        schema_version: "0",
        product: "omena-lsp-server.style-hover-candidates",
        document_uri,
        workspace_folder_uri: document.workspace_folder_uri.clone(),
        language: Some(language),
        query_position,
        candidate_count: candidates.len(),
        candidates,
    }
}

fn resolve_lsp_definition(state: &LspShellState, params: Option<&Value>) -> Value {
    let document_uri = document_uri_from_params(params);
    let Some(position) = lsp_position_from_params(params) else {
        return Value::Null;
    };
    let Some(document) = state.document(&document_uri) else {
        return Value::Null;
    };
    if !is_style_document_uri(document.uri.as_str()) {
        return resolve_source_lsp_definition(state, document, position);
    }

    let Some((_, candidates)) =
        collect_style_hover_candidates(document.uri.as_str(), document.text.as_str())
    else {
        return Value::Null;
    };
    let Some(candidate) = candidates
        .iter()
        .find(|candidate| parser_range_contains_position(&candidate.range, position))
    else {
        return Value::Null;
    };
    let target = if candidate.kind == "customPropertyReference" {
        candidates
            .iter()
            .find(|target| {
                target.kind == "customPropertyDeclaration" && target.name == candidate.name
            })
            .unwrap_or(candidate)
    } else {
        candidate
    };

    json!([
        {
            "uri": document.uri.as_str(),
            "range": target.range,
        },
    ])
}

fn resolve_lsp_references(state: &LspShellState, params: Option<&Value>) -> Value {
    let document_uri = document_uri_from_params(params);
    let Some(position) = lsp_position_from_params(params) else {
        return Value::Null;
    };
    let Some(document) = state.document(&document_uri) else {
        return Value::Null;
    };
    if !is_style_document_uri(document.uri.as_str()) {
        return resolve_source_lsp_references(state, document, position, params);
    }

    let Some((_, candidates)) =
        collect_style_hover_candidates(document.uri.as_str(), document.text.as_str())
    else {
        return Value::Null;
    };
    let Some(candidate) = candidates
        .iter()
        .find(|candidate| parser_range_contains_position(&candidate.range, position))
    else {
        return Value::Null;
    };
    let include_declaration = include_declaration_from_params(params);
    let mut locations: Vec<Value> = if candidate.kind.starts_with("customProperty") {
        candidates
            .iter()
            .filter(|target| {
                target.name == candidate.name
                    && (target.kind == "customPropertyReference"
                        || (include_declaration && target.kind == "customPropertyDeclaration"))
            })
            .map(|target| json!({ "uri": document.uri.as_str(), "range": target.range }))
            .collect()
    } else if candidate.kind == "selector" {
        let mut locations = if include_declaration {
            vec![json!({ "uri": document.uri.as_str(), "range": candidate.range })]
        } else {
            Vec::new()
        };
        locations.extend(selector_reference_locations_from_open_documents(
            state,
            candidate.name.as_str(),
        ));
        locations
    } else if include_declaration {
        vec![json!({ "uri": document.uri.as_str(), "range": candidate.range })]
    } else {
        Vec::new()
    };

    locations.sort_by_key(|location| {
        let line = location
            .pointer("/range/start/line")
            .and_then(Value::as_u64)
            .unwrap_or_default();
        let character = location
            .pointer("/range/start/character")
            .and_then(Value::as_u64)
            .unwrap_or_default();
        (line, character)
    });
    json!(locations)
}

fn resolve_lsp_completion(state: &LspShellState, params: Option<&Value>) -> Value {
    let document_uri = document_uri_from_params(params);
    let Some(document) = state.document(&document_uri) else {
        return Value::Null;
    };
    if !is_style_document_uri(document.uri.as_str()) {
        return resolve_source_lsp_completion(state, document);
    }

    let Some((_, candidates)) =
        collect_style_hover_candidates(document.uri.as_str(), document.text.as_str())
    else {
        return Value::Null;
    };

    let mut emitted_labels = BTreeSet::new();
    let items: Vec<Value> = candidates
        .iter()
        .filter_map(|candidate| match candidate.kind {
            "selector" => Some((format!(".{}", candidate.name), 7, "CSS Module selector")),
            "customPropertyDeclaration" => Some((
                candidate.name.clone(),
                10,
                "CSS custom property from opened style document index",
            )),
            _ => None,
        })
        .filter(|(label, _, _)| emitted_labels.insert(label.clone()))
        .map(|(label, kind, detail)| {
            json!({
                "label": label,
                "kind": kind,
                "detail": detail,
                "data": {
                    "source": "openedStyleDocumentIndex",
                },
            })
        })
        .collect();

    json!({
        "isIncomplete": false,
        "items": items,
    })
}

fn resolve_style_diagnostics(state: &LspShellState, params: Option<&Value>) -> Value {
    let document_uri = document_uri_from_params(params);
    resolve_style_diagnostics_for_uri(state, document_uri.as_str())
}

fn resolve_style_diagnostics_for_uri(state: &LspShellState, document_uri: &str) -> Value {
    let Some(document) = state.document(document_uri) else {
        return json!([]);
    };
    let Some((_, candidates)) =
        collect_style_hover_candidates(document.uri.as_str(), document.text.as_str())
    else {
        return json!([]);
    };

    let decl_names: BTreeSet<&str> = candidates
        .iter()
        .filter(|candidate| candidate.kind == "customPropertyDeclaration")
        .map(|candidate| candidate.name.as_str())
        .collect();
    if decl_names.is_empty() {
        return json!([]);
    }

    let insertion_range = end_of_document_range(document.text.as_str());
    let diagnostics: Vec<Value> = candidates
        .iter()
        .filter(|candidate| {
            candidate.kind == "customPropertyReference"
                && !decl_names.contains(candidate.name.as_str())
        })
        .map(|candidate| {
            json!({
                "range": candidate.range,
                "severity": 2,
                "source": "css-module-explainer",
                "message": format!(
                    "CSS custom property '{}' not found in indexed style tokens.",
                    candidate.name
                ),
                "data": {
                    "createCustomProperty": {
                        "uri": document.uri.as_str(),
                        "range": insertion_range,
                        "newText": format!("\n\n:root {{\n  {}: ;\n}}\n", candidate.name),
                        "propertyName": candidate.name.as_str(),
                    },
                },
            })
        })
        .collect();

    json!(diagnostics)
}

fn resolve_lsp_code_actions(params: Option<&Value>) -> Value {
    let Some(diagnostics) = params
        .and_then(|value| value.get("context"))
        .and_then(|value| value.get("diagnostics"))
        .and_then(Value::as_array)
    else {
        return Value::Null;
    };

    let actions: Vec<Value> = diagnostics
        .iter()
        .enumerate()
        .filter_map(|(index, diagnostic)| {
            let payload = diagnostic
                .pointer("/data/createCustomProperty")
                .and_then(Value::as_object)?;
            let uri = payload.get("uri").and_then(Value::as_str)?;
            let range = payload.get("range")?;
            let new_text = payload.get("newText").and_then(Value::as_str)?;
            let property_name = payload.get("propertyName").and_then(Value::as_str)?;
            let mut changes = serde_json::Map::new();
            changes.insert(
                uri.to_string(),
                json!([
                    {
                        "range": range,
                        "newText": new_text,
                    },
                ]),
            );

            Some(json!({
                "title": format!("Add '{}' to {}", property_name, file_label_from_uri(uri)),
                "kind": "quickfix",
                "diagnostics": [diagnostic],
                "edit": {
                    "changes": Value::Object(changes),
                },
                "data": {
                    "source": "openedStyleDocumentIndex",
                    "diagnosticIndex": index,
                },
            }))
        })
        .collect();

    if actions.is_empty() {
        Value::Null
    } else {
        json!(actions)
    }
}

fn resolve_lsp_code_lens(state: &LspShellState, params: Option<&Value>) -> Value {
    let document_uri = document_uri_from_params(params);
    let Some(document) = state.document(document_uri.as_str()) else {
        return Value::Null;
    };
    let Some((_, candidates)) =
        collect_style_hover_candidates(document.uri.as_str(), document.text.as_str())
    else {
        return Value::Null;
    };

    let mut lenses = Vec::new();
    let mut emitted_selectors = BTreeSet::new();
    for candidate in candidates
        .iter()
        .filter(|candidate| candidate.kind == "selector")
    {
        if !emitted_selectors.insert(candidate.name.as_str()) {
            continue;
        }
        let locations =
            selector_reference_locations_from_open_documents(state, candidate.name.as_str());
        if locations.is_empty() {
            continue;
        }
        let position = candidate.range.start;
        lenses.push(json!({
            "range": {
                "start": position,
                "end": position,
            },
            "command": {
                "title": reference_lens_title(locations.len()),
                "command": "editor.action.showReferences",
                "arguments": [
                    document.uri.as_str(),
                    position,
                    locations,
                ],
            },
        }));
    }

    if lenses.is_empty() {
        Value::Null
    } else {
        json!(lenses)
    }
}

fn selector_reference_locations_from_open_documents(
    state: &LspShellState,
    selector_name: &str,
) -> Vec<Value> {
    let mut locations = Vec::new();
    for document in state.documents.values() {
        if is_style_document_uri(document.uri.as_str()) {
            continue;
        }
        for byte_span in selector_name_byte_spans(document.text.as_str(), selector_name) {
            locations.push(json!({
                "uri": document.uri.as_str(),
                "range": parser_range_for_byte_span(document.text.as_str(), byte_span),
            }));
        }
    }
    locations.sort_by_key(|location| {
        let uri = location
            .get("uri")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        let line = location
            .pointer("/range/start/line")
            .and_then(Value::as_u64)
            .unwrap_or_default();
        let character = location
            .pointer("/range/start/character")
            .and_then(Value::as_u64)
            .unwrap_or_default();
        (uri, line, character)
    });
    locations
}

fn selector_name_byte_spans(source: &str, selector_name: &str) -> Vec<ParserByteSpanV0> {
    let mut spans = Vec::new();
    let mut search_offset = 0usize;

    while let Some(relative_match) = source[search_offset..].find(selector_name) {
        let start = search_offset + relative_match;
        let end = start + selector_name.len();
        if is_source_reference_name_boundary(source, start, end) {
            spans.push(ParserByteSpanV0 { start, end });
        }
        search_offset += relative_match + selector_name.len();
    }

    spans
}

fn is_source_reference_name_boundary(source: &str, start: usize, end: usize) -> bool {
    let before = source[..start]
        .chars()
        .next_back()
        .is_none_or(|ch| !is_css_identifier_continue(ch));
    let after = source[end..]
        .chars()
        .next()
        .is_none_or(|ch| !is_css_identifier_continue(ch));
    before && after
}

fn reference_lens_title(count: usize) -> String {
    if count == 1 {
        "1 reference".to_string()
    } else {
        format!("{count} references")
    }
}

fn resolve_lsp_prepare_rename(state: &LspShellState, params: Option<&Value>) -> Value {
    if let Some((_, candidate)) = source_selector_candidate_for_params(state, params) {
        return json!({
            "range": candidate.range,
            "placeholder": candidate.name,
        });
    }

    let Some((_, candidate, _)) = style_candidates_for_params(state, params) else {
        return Value::Null;
    };

    json!({
        "range": candidate.range,
        "placeholder": rename_placeholder(&candidate),
    })
}

fn resolve_lsp_rename(state: &LspShellState, params: Option<&Value>) -> Value {
    let Some(new_name) = params
        .and_then(|value| value.get("newName"))
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
    else {
        return Value::Null;
    };
    if let Some((document_uri, candidate)) = source_selector_candidate_for_params(state, params) {
        return resolve_source_selector_rename(
            state,
            document_uri.as_str(),
            candidate.name.as_str(),
            new_name,
        );
    }

    let Some((document_uri, candidate, candidates)) = style_candidates_for_params(state, params)
    else {
        return Value::Null;
    };

    let replacement = match candidate.kind {
        "selector" => new_name.trim_start_matches('.').to_string(),
        "customPropertyReference" | "customPropertyDeclaration" => new_name.to_string(),
        _ => return Value::Null,
    };
    let mut targets: Vec<&LspStyleHoverCandidate> = candidates
        .iter()
        .filter(|target| rename_target_matches(&candidate, target))
        .collect();
    targets.sort_by_key(|target| {
        (
            target.range.start.line,
            target.range.start.character,
            target.range.end.line,
            target.range.end.character,
        )
    });
    let edits: Vec<Value> = targets
        .into_iter()
        .map(|target| {
            json!({
                "range": target.range,
                "newText": replacement,
            })
        })
        .collect();
    if edits.is_empty() {
        return Value::Null;
    }

    let mut changes = serde_json::Map::new();
    changes.insert(document_uri, json!(edits));
    json!({
        "changes": Value::Object(changes),
    })
}

fn style_candidates_for_params(
    state: &LspShellState,
    params: Option<&Value>,
) -> Option<(String, LspStyleHoverCandidate, Vec<LspStyleHoverCandidate>)> {
    let document_uri = document_uri_from_params(params);
    let position = lsp_position_from_params(params)?;
    let document = state.document(document_uri.as_str())?;
    let (_, candidates) =
        collect_style_hover_candidates(document.uri.as_str(), document.text.as_str())?;
    let candidate = candidates
        .iter()
        .find(|candidate| parser_range_contains_position(&candidate.range, position))?
        .clone();
    Some((document_uri, candidate, candidates))
}

fn rename_placeholder(candidate: &LspStyleHoverCandidate) -> &str {
    candidate.name.as_str()
}

fn rename_target_matches(
    candidate: &LspStyleHoverCandidate,
    target: &LspStyleHoverCandidate,
) -> bool {
    match candidate.kind {
        "selector" => target.kind == "selector" && target.name == candidate.name,
        "customPropertyReference" | "customPropertyDeclaration" => {
            target.name == candidate.name && target.kind.starts_with("customProperty")
        }
        _ => false,
    }
}

fn resolve_lsp_hover(state: &LspShellState, params: Option<&Value>) -> Value {
    let document_uri = document_uri_from_params(params);
    if let Some(document) = state.document(document_uri.as_str())
        && !is_style_document_uri(document.uri.as_str())
    {
        return resolve_source_lsp_hover(state, document, params);
    }

    let candidates = resolve_style_hover_candidates(state, params);
    let Some(candidate) = candidates.candidates.first() else {
        return Value::Null;
    };

    json!({
        "contents": {
            "kind": "markdown",
            "value": render_style_hover_candidate_markdown(candidate),
        },
        "range": candidate.range,
    })
}

fn resolve_source_lsp_hover(
    state: &LspShellState,
    document: &LspTextDocumentState,
    params: Option<&Value>,
) -> Value {
    let Some(position) = lsp_position_from_params(params) else {
        return Value::Null;
    };
    let Some(candidate) = source_selector_candidate_at_position(state, document, position) else {
        return Value::Null;
    };
    let definition = style_selector_definitions_from_open_documents(
        state,
        candidate.name.as_str(),
        document.workspace_folder_uri.as_deref(),
    )
    .into_iter()
    .next();
    let definition_label = definition
        .as_ref()
        .map(|(uri, _)| format!("\n\nDefined in `{}`.", file_label_from_uri(uri)))
        .unwrap_or_default();

    json!({
        "contents": {
            "kind": "markdown",
            "value": format!(
                "### .{}\n\nCSS Module selector reference from the Rust opened source document index.{}",
                candidate.name,
                definition_label
            ),
        },
        "range": candidate.range,
    })
}

fn resolve_source_lsp_definition(
    state: &LspShellState,
    document: &LspTextDocumentState,
    position: ParserPositionV0,
) -> Value {
    let Some(candidate) = source_selector_candidate_at_position(state, document, position) else {
        return Value::Null;
    };
    let definitions = style_selector_definitions_from_open_documents(
        state,
        candidate.name.as_str(),
        document.workspace_folder_uri.as_deref(),
    );
    if definitions.is_empty() {
        return Value::Null;
    }

    json!(
        definitions
            .into_iter()
            .map(|(uri, definition)| json!({ "uri": uri, "range": definition.range }))
            .collect::<Vec<_>>()
    )
}

fn resolve_source_lsp_references(
    state: &LspShellState,
    document: &LspTextDocumentState,
    position: ParserPositionV0,
    params: Option<&Value>,
) -> Value {
    let Some(candidate) = source_selector_candidate_at_position(state, document, position) else {
        return Value::Null;
    };
    let include_declaration = include_declaration_from_params(params);
    let mut locations = Vec::new();
    if include_declaration {
        locations.extend(
            style_selector_definitions_from_open_documents(
                state,
                candidate.name.as_str(),
                document.workspace_folder_uri.as_deref(),
            )
            .into_iter()
            .map(|(uri, definition)| json!({ "uri": uri, "range": definition.range })),
        );
    }
    locations.extend(selector_reference_locations_from_open_documents(
        state,
        candidate.name.as_str(),
    ));
    locations.sort_by_key(location_sort_key);

    if locations.is_empty() {
        Value::Null
    } else {
        json!(locations)
    }
}

fn resolve_source_lsp_completion(state: &LspShellState, document: &LspTextDocumentState) -> Value {
    let labels: BTreeSet<String> = style_selector_definitions_from_open_documents(
        state,
        "",
        document.workspace_folder_uri.as_deref(),
    )
    .into_iter()
    .map(|(_, definition)| definition.name)
    .collect();
    let items: Vec<Value> = labels
        .into_iter()
        .map(|label| {
            json!({
                "label": label,
                "kind": 10,
                "detail": "CSS Module selector from opened style document index",
                "data": {
                    "source": "openedStyleDocumentIndex",
                },
            })
        })
        .collect();

    json!({
        "isIncomplete": false,
        "items": items,
    })
}

fn source_selector_candidate_for_params(
    state: &LspShellState,
    params: Option<&Value>,
) -> Option<(String, LspStyleHoverCandidate)> {
    let document_uri = document_uri_from_params(params);
    let position = lsp_position_from_params(params)?;
    let document = state.document(document_uri.as_str())?;
    if is_style_document_uri(document.uri.as_str()) {
        return None;
    }
    source_selector_candidate_at_position(state, document, position)
        .map(|candidate| (document_uri, candidate))
}

fn source_selector_candidate_at_position(
    state: &LspShellState,
    document: &LspTextDocumentState,
    position: ParserPositionV0,
) -> Option<LspStyleHoverCandidate> {
    collect_source_selector_reference_candidates(state, document)
        .into_iter()
        .find(|candidate| parser_range_contains_position(&candidate.range, position))
}

fn collect_source_selector_reference_candidates(
    state: &LspShellState,
    document: &LspTextDocumentState,
) -> Vec<LspStyleHoverCandidate> {
    let selector_names: BTreeSet<String> = style_selector_definitions_from_open_documents(
        state,
        "",
        document.workspace_folder_uri.as_deref(),
    )
    .into_iter()
    .map(|(_, definition)| definition.name)
    .collect();
    let mut candidates = Vec::new();
    for selector_name in selector_names {
        for byte_span in selector_name_byte_spans(document.text.as_str(), selector_name.as_str()) {
            candidates.push(LspStyleHoverCandidate {
                kind: "sourceSelectorReference",
                name: selector_name.clone(),
                range: parser_range_for_byte_span(document.text.as_str(), byte_span),
                source: "openedSourceDocumentIndex",
            });
        }
    }
    candidates.sort();
    candidates
}

fn style_selector_definitions_from_open_documents(
    state: &LspShellState,
    selector_name: &str,
    workspace_folder_uri: Option<&str>,
) -> Vec<(String, LspStyleHoverCandidate)> {
    let mut definitions = Vec::new();
    for document in state.documents.values() {
        if !is_style_document_uri(document.uri.as_str())
            || !workspace_folder_compatible(workspace_folder_uri, document)
        {
            continue;
        }
        let Some((_, candidates)) =
            collect_style_hover_candidates(document.uri.as_str(), document.text.as_str())
        else {
            continue;
        };
        definitions.extend(
            candidates
                .into_iter()
                .filter(|candidate| {
                    candidate.kind == "selector"
                        && (selector_name.is_empty() || candidate.name == selector_name)
                })
                .map(|candidate| (document.uri.clone(), candidate)),
        );
    }
    definitions.sort_by_key(|(uri, candidate)| {
        (
            uri.clone(),
            candidate.range.start.line,
            candidate.range.start.character,
        )
    });
    definitions
}

fn resolve_source_selector_rename(
    state: &LspShellState,
    source_document_uri: &str,
    selector_name: &str,
    new_name: &str,
) -> Value {
    let replacement = new_name.trim_start_matches('.');
    if replacement.is_empty() {
        return Value::Null;
    }

    let Some(source_document) = state.document(source_document_uri) else {
        return Value::Null;
    };
    let mut changes: BTreeMap<String, Vec<Value>> = BTreeMap::new();
    for (uri, definition) in style_selector_definitions_from_open_documents(
        state,
        selector_name,
        source_document.workspace_folder_uri.as_deref(),
    ) {
        changes.entry(uri).or_default().push(json!({
            "range": definition.range,
            "newText": replacement,
        }));
    }
    for document in state.documents.values() {
        if is_style_document_uri(document.uri.as_str()) {
            continue;
        }
        for candidate in collect_source_selector_reference_candidates(state, document)
            .into_iter()
            .filter(|candidate| candidate.name == selector_name)
        {
            changes
                .entry(document.uri.clone())
                .or_default()
                .push(json!({
                    "range": candidate.range,
                    "newText": replacement,
                }));
        }
    }

    if changes.is_empty() {
        return Value::Null;
    }
    for edits in changes.values_mut() {
        edits.sort_by_key(|edit| {
            let line = edit
                .pointer("/range/start/line")
                .and_then(Value::as_u64)
                .unwrap_or_default();
            let character = edit
                .pointer("/range/start/character")
                .and_then(Value::as_u64)
                .unwrap_or_default();
            (line, character)
        });
    }

    let mut response_changes = serde_json::Map::new();
    for (uri, edits) in changes {
        response_changes.insert(uri, json!(edits));
    }
    json!({
        "changes": Value::Object(response_changes),
    })
}

fn workspace_folder_compatible(
    workspace_folder_uri: Option<&str>,
    document: &LspTextDocumentState,
) -> bool {
    match (
        workspace_folder_uri,
        document.workspace_folder_uri.as_deref(),
    ) {
        (Some(left), Some(right)) => left == right,
        _ => true,
    }
}

fn is_style_document_uri(uri: &str) -> bool {
    StyleLanguage::from_module_path(uri).is_some()
}

fn file_uri_to_path(uri: &str) -> Option<PathBuf> {
    let raw_path = uri.strip_prefix("file://")?;
    Some(PathBuf::from(percent_decode_uri_path(raw_path)?))
}

fn percent_decode_uri_path(raw_path: &str) -> Option<String> {
    let bytes = raw_path.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0usize;
    while index < bytes.len() {
        if bytes[index] == b'%' {
            let high = bytes.get(index + 1).and_then(|byte| hex_value(*byte))?;
            let low = bytes.get(index + 2).and_then(|byte| hex_value(*byte))?;
            decoded.push((high << 4) | low);
            index += 3;
        } else {
            decoded.push(bytes[index]);
            index += 1;
        }
    }
    String::from_utf8(decoded).ok()
}

fn hex_value(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

fn location_sort_key(location: &Value) -> (String, u64, u64) {
    let uri = location
        .get("uri")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let line = location
        .pointer("/range/start/line")
        .and_then(Value::as_u64)
        .unwrap_or_default();
    let character = location
        .pointer("/range/start/character")
        .and_then(Value::as_u64)
        .unwrap_or_default();
    (uri, line, character)
}

fn render_style_hover_candidate_markdown(candidate: &LspStyleHoverCandidate) -> String {
    match candidate.kind {
        "selector" => format!(
            "### .{}\n\nCSS Module selector from the Rust opened style document index.",
            candidate.name
        ),
        "customPropertyReference" => format!(
            "### var({})\n\nCSS custom property reference from the Rust opened style document index.",
            candidate.name
        ),
        "customPropertyDeclaration" => format!(
            "### {}\n\nCSS custom property declaration from the Rust opened style document index.",
            candidate.name
        ),
        _ => candidate.name.clone(),
    }
}

fn include_declaration_from_params(params: Option<&Value>) -> bool {
    params
        .and_then(|value| value.get("context"))
        .and_then(|value| value.get("includeDeclaration"))
        .and_then(Value::as_bool)
        .unwrap_or(false)
}

fn end_of_document_range(source: &str) -> ParserRangeV0 {
    let position = parser_position_for_byte_offset(source, source.len());
    ParserRangeV0 {
        start: position,
        end: position,
    }
}

fn file_label_from_uri(uri: &str) -> &str {
    uri.rsplit('/')
        .next()
        .filter(|label| !label.is_empty())
        .unwrap_or(uri)
}

fn document_uri_from_params(params: Option<&Value>) -> String {
    params
        .and_then(|value| value.get("textDocument"))
        .and_then(|value| value.get("uri"))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn empty_style_hover_candidates_result(
    document_uri: String,
    workspace_folder_uri: Option<String>,
    query_position: Option<ParserPositionV0>,
) -> LspStyleHoverCandidatesResult {
    LspStyleHoverCandidatesResult {
        schema_version: "0",
        product: "omena-lsp-server.style-hover-candidates",
        document_uri,
        workspace_folder_uri,
        language: None,
        query_position,
        candidate_count: 0,
        candidates: Vec::new(),
    }
}

fn lsp_position_from_params(params: Option<&Value>) -> Option<ParserPositionV0> {
    let position = params.and_then(|value| value.get("position"))?;
    Some(ParserPositionV0 {
        line: position.get("line").and_then(Value::as_u64)? as usize,
        character: position.get("character").and_then(Value::as_u64)? as usize,
    })
}

fn collect_style_hover_candidates(
    uri: &str,
    text: &str,
) -> Option<(&'static str, Vec<LspStyleHoverCandidate>)> {
    let sheet = parse_style_module(uri, text)?;
    let index = summarize_css_modules_intermediate(&sheet);
    let mut seen = BTreeSet::new();
    let mut candidates = Vec::new();
    collect_style_selector_hover_candidates_from_nodes(
        sheet.source.as_str(),
        sheet.nodes.as_slice(),
        &mut seen,
        &mut candidates,
    );
    collect_custom_property_hover_candidates(
        sheet.source.as_str(),
        index.custom_properties.decl_facts.as_slice(),
        index.custom_properties.ref_names.as_slice(),
        &mut seen,
        &mut candidates,
    );
    candidates.sort();
    Some((style_language_label(sheet.language), candidates))
}

fn collect_style_selector_hover_candidates_from_nodes(
    source: &str,
    nodes: &[SyntaxNode],
    seen: &mut BTreeSet<(usize, usize, String)>,
    candidates: &mut Vec<LspStyleHoverCandidate>,
) {
    for node in nodes {
        if let Some(SyntaxNodePayload::Rule(rule)) = &node.payload {
            let header_span = node.header_span.unwrap_or(node.span);
            for name in class_segment_names(rule) {
                for byte_span in class_name_byte_spans_in_header(source, header_span, name) {
                    if seen.insert((byte_span.start, byte_span.end, name.to_string())) {
                        candidates.push(LspStyleHoverCandidate {
                            kind: "selector",
                            name: name.to_string(),
                            range: parser_range_for_byte_span(source, byte_span),
                            source: "openedStyleDocumentIndex",
                        });
                    }
                }
            }
        }
        collect_style_selector_hover_candidates_from_nodes(
            source,
            node.children.as_slice(),
            seen,
            candidates,
        );
    }
}

fn class_segment_names(rule: &RulePayload) -> Vec<&str> {
    rule.selector_groups
        .iter()
        .flat_map(|group| {
            group.segments.iter().filter_map(|segment| match segment {
                SelectorSegment::ClassName(name) => Some(name.as_str()),
                _ => None,
            })
        })
        .collect()
}

fn class_name_byte_spans_in_header(
    source: &str,
    header_span: TextSpan,
    name: &str,
) -> Vec<ParserByteSpanV0> {
    let header = &source[header_span.start..header_span.end];
    let needle = format!(".{name}");
    let mut spans = Vec::new();
    let mut search_offset = 0usize;

    while let Some(relative_match) = header[search_offset..].find(&needle) {
        let dot_start = header_span.start + search_offset + relative_match;
        let name_start = dot_start + 1;
        let name_end = name_start + name.len();
        if is_selector_name_boundary(source, name_end) {
            spans.push(ParserByteSpanV0 {
                start: name_start,
                end: name_end,
            });
        }
        search_offset += relative_match + needle.len();
    }

    spans
}

fn collect_custom_property_hover_candidates(
    source: &str,
    decl_facts: &[engine_style_parser::ParserIndexCustomPropertyDeclFactV0],
    ref_names: &[String],
    seen: &mut BTreeSet<(usize, usize, String)>,
    candidates: &mut Vec<LspStyleHoverCandidate>,
) {
    for fact in decl_facts {
        if seen.insert((fact.byte_span.start, fact.byte_span.end, fact.name.clone())) {
            candidates.push(LspStyleHoverCandidate {
                kind: "customPropertyDeclaration",
                name: fact.name.clone(),
                range: fact.range,
                source: "openedStyleDocumentIndex",
            });
        }
    }

    for name in ref_names {
        for byte_span in custom_property_ref_byte_spans(source, name) {
            if seen.insert((byte_span.start, byte_span.end, name.clone())) {
                candidates.push(LspStyleHoverCandidate {
                    kind: "customPropertyReference",
                    name: name.clone(),
                    range: parser_range_for_byte_span(source, byte_span),
                    source: "openedStyleDocumentIndex",
                });
            }
        }
    }
}

fn custom_property_ref_byte_spans(source: &str, name: &str) -> Vec<ParserByteSpanV0> {
    let mut spans = Vec::new();
    let mut search_offset = 0usize;

    while let Some(relative_match) = source[search_offset..].find(name) {
        let name_start = search_offset + relative_match;
        let name_end = name_start + name.len();
        if source[..name_start].trim_end().ends_with("var(")
            && is_selector_name_boundary(source, name_end)
        {
            spans.push(ParserByteSpanV0 {
                start: name_start,
                end: name_end,
            });
        }
        search_offset += relative_match + name.len();
    }

    spans
}

fn is_selector_name_boundary(source: &str, byte_offset: usize) -> bool {
    source[byte_offset..]
        .chars()
        .next()
        .is_none_or(|ch| !is_css_identifier_continue(ch))
}

fn is_css_identifier_continue(ch: char) -> bool {
    ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_')
}

fn parser_range_for_byte_span(source: &str, span: ParserByteSpanV0) -> ParserRangeV0 {
    ParserRangeV0 {
        start: parser_position_for_byte_offset(source, span.start),
        end: parser_position_for_byte_offset(source, span.end),
    }
}

fn parser_position_for_byte_offset(source: &str, offset: usize) -> ParserPositionV0 {
    let clamped_offset = offset.min(source.len());
    let mut line = 0usize;
    let mut character = 0usize;

    for (byte_index, ch) in source.char_indices() {
        if byte_index >= clamped_offset {
            break;
        }
        if ch == '\n' {
            line += 1;
            character = 0;
        } else {
            character += ch.len_utf16();
        }
    }

    ParserPositionV0 { line, character }
}

fn parser_range_contains_position(range: &ParserRangeV0, position: ParserPositionV0) -> bool {
    parser_position_is_after_or_equal(position, range.start)
        && parser_position_is_before(position, range.end)
}

fn parser_position_is_after_or_equal(position: ParserPositionV0, start: ParserPositionV0) -> bool {
    position.line > start.line
        || (position.line == start.line && position.character >= start.character)
}

fn parser_position_is_before(position: ParserPositionV0, end: ParserPositionV0) -> bool {
    position.line < end.line || (position.line == end.line && position.character < end.character)
}

fn style_language_label(language: StyleLanguage) -> &'static str {
    match language {
        StyleLanguage::Css => "css",
        StyleLanguage::Scss => "scss",
        StyleLanguage::Less => "less",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn declares_current_node_lsp_capability_contract() {
        let capabilities = current_node_lsp_capability_contract();

        assert_eq!(capabilities.text_document_sync, 2);
        assert!(capabilities.definition_provider);
        assert!(capabilities.hover_provider);
        assert!(capabilities.references_provider);
        assert_eq!(
            capabilities.completion_provider.trigger_characters,
            vec!["'", "\"", "`", ",", ".", "$", "@", "-"],
        );
        assert_eq!(
            capabilities.code_action_provider.code_action_kinds,
            vec!["quickfix"]
        );
        assert!(capabilities.rename_provider.prepare_provider);
        assert!(capabilities.workspace.workspace_folders.supported);
        assert!(
            capabilities
                .workspace
                .workspace_folders
                .change_notifications
        );
    }

    #[test]
    fn declares_migration_blocking_work_policy() {
        let summary = summarize_omena_lsp_server_boundary();

        assert_eq!(summary.product, "omena-lsp-server.boundary");
        assert!(
            summary
                .blocking_work_policy
                .contains(&"noFullWorkspaceProgramOnRequestPath")
        );
        assert!(
            summary
                .next_decoupling_targets
                .contains(&"longLivedTsgoClient")
        );
        assert!(
            summary
                .handler_surfaces
                .iter()
                .any(|surface| surface.method == "textDocument/hover"),
        );
    }

    #[test]
    fn handles_minimal_lsp_lifecycle_requests() {
        let mut state = LspShellState::default();
        let initialize = handle_lsp_message(
            &mut state,
            json!({
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {
                    "workspaceFolders": [
                        {
                            "uri": "file:///workspace-a",
                            "name": "workspace-a",
                        },
                    ],
                },
            }),
        );

        assert_eq!(
            initialize.as_ref().and_then(|value| value.get("id")),
            Some(&json!(1))
        );
        assert_eq!(
            initialize
                .as_ref()
                .and_then(|value| value.pointer("/result/capabilities/textDocumentSync")),
            Some(&json!(2)),
        );
        assert!(!state.shutdown_requested);
        assert_eq!(state.workspace_folder_count(), 1);
        assert_eq!(
            state
                .workspace_folder("file:///workspace-a")
                .map(|folder| folder.name.as_str()),
            Some("workspace-a"),
        );

        let shutdown = handle_lsp_message(
            &mut state,
            json!({
                "jsonrpc": "2.0",
                "id": 2,
                "method": "shutdown",
            }),
        );
        assert_eq!(
            shutdown.as_ref().and_then(|value| value.get("result")),
            Some(&Value::Null)
        );
        assert!(state.shutdown_requested);

        let exit = handle_lsp_message(
            &mut state,
            json!({
                "jsonrpc": "2.0",
                "method": "exit",
            }),
        );
        assert!(exit.is_none());
        assert!(state.should_exit);
    }

    #[test]
    fn reports_unknown_requests_without_panicking() {
        let mut state = LspShellState::default();
        let response = handle_lsp_message(
            &mut state,
            json!({
                "jsonrpc": "2.0",
                "id": "unknown-1",
                "method": "workspace/symbol",
            }),
        );

        assert_eq!(
            response
                .as_ref()
                .and_then(|value| value.pointer("/error/code")),
            Some(&json!(-32601)),
        );
    }

    #[test]
    fn tracks_text_document_lifecycle_notifications() {
        let mut state = LspShellState::default();

        assert!(
            handle_lsp_message(
                &mut state,
                json!({
                    "jsonrpc": "2.0",
                    "method": "textDocument/didOpen",
                    "params": {
                        "textDocument": {
                            "uri": "file:///workspace-a/src/App.tsx",
                            "languageId": "typescriptreact",
                            "version": 1,
                            "text": "const tone = 'blue';",
                        },
                    },
                }),
            )
            .is_none()
        );
        assert_eq!(state.document_count(), 1);
        assert_eq!(
            state
                .document("file:///workspace-a/src/App.tsx")
                .map(|document| document.text.as_str()),
            Some("const tone = 'blue';"),
        );
        assert_eq!(
            state
                .document("file:///workspace-a/src/App.tsx")
                .and_then(|document| document.workspace_folder_uri.as_deref()),
            None,
        );

        handle_lsp_message(
            &mut state,
            json!({
                "jsonrpc": "2.0",
                "method": "textDocument/didChange",
                "params": {
                    "textDocument": {
                        "uri": "file:///workspace-a/src/App.tsx",
                        "version": 2,
                    },
                    "contentChanges": [
                        {
                            "text": "const tone = 'red';",
                        },
                    ],
                },
            }),
        );
        let document = state.document("file:///workspace-a/src/App.tsx");
        assert_eq!(document.map(|document| document.version), Some(2));
        assert_eq!(
            document.map(|document| document.text.as_str()),
            Some("const tone = 'red';"),
        );

        handle_lsp_message(
            &mut state,
            json!({
                "jsonrpc": "2.0",
                "method": "textDocument/didClose",
                "params": {
                    "textDocument": {
                        "uri": "file:///workspace-a/src/App.tsx",
                    },
                },
            }),
        );
        assert_eq!(state.document_count(), 0);
    }

    #[test]
    fn indexes_style_documents_on_open_and_change() {
        let mut state = LspShellState::default();
        handle_lsp_message(
            &mut state,
            json!({
                "jsonrpc": "2.0",
                "method": "textDocument/didOpen",
                "params": {
                    "textDocument": {
                        "uri": "file:///workspace-a/src/App.module.scss",
                        "languageId": "scss",
                        "version": 1,
                        "text": ".root { color: var(--brand); } :root { --brand: red; }",
                    },
                },
            }),
        );
        let summary = state
            .document("file:///workspace-a/src/App.module.scss")
            .and_then(|document| document.style_summary.as_ref());
        assert_eq!(
            summary.map(|summary| summary.selector_names.clone()),
            Some(vec!["root".to_string()]),
        );
        assert_eq!(
            summary.map(|summary| summary.custom_property_decl_names.clone()),
            Some(vec!["--brand".to_string()]),
        );
        assert_eq!(
            summary.map(|summary| summary.custom_property_ref_names.clone()),
            Some(vec!["--brand".to_string()]),
        );

        handle_lsp_message(
            &mut state,
            json!({
                "jsonrpc": "2.0",
                "method": "textDocument/didChange",
                "params": {
                    "textDocument": {
                        "uri": "file:///workspace-a/src/App.module.scss",
                        "version": 2,
                    },
                    "contentChanges": [
                        {
                            "text": ".card { --gap: 4px; }",
                        },
                    ],
                },
            }),
        );
        let updated = state
            .document("file:///workspace-a/src/App.module.scss")
            .and_then(|document| document.style_summary.as_ref());
        assert_eq!(
            updated.map(|summary| summary.selector_names.clone()),
            Some(vec!["card".to_string()]),
        );
        assert_eq!(
            updated.map(|summary| summary.custom_property_decl_names.clone()),
            Some(vec!["--gap".to_string()]),
        );
    }

    #[test]
    fn resolves_style_hover_candidates_from_opened_style_documents() {
        let mut state = LspShellState::default();
        handle_lsp_message(
            &mut state,
            json!({
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {
                    "workspaceFolders": [
                        {
                            "uri": "file:///workspace-a",
                            "name": "workspace-a",
                        },
                    ],
                },
            }),
        );
        handle_lsp_message(
            &mut state,
            json!({
                "jsonrpc": "2.0",
                "method": "textDocument/didOpen",
                "params": {
                    "textDocument": {
                        "uri": "file:///workspace-a/src/App.tsx",
                        "languageId": "typescriptreact",
                        "version": 1,
                        "text": "const cls = \"root\";",
                    },
                },
            }),
        );
        handle_lsp_message(
            &mut state,
            json!({
                "jsonrpc": "2.0",
                "method": "textDocument/didOpen",
                "params": {
                    "textDocument": {
                        "uri": "file:///workspace-a/src/App.module.scss",
                        "languageId": "scss",
                        "version": 1,
                        "text": ".root { color: var(--brand); }\n.theme { --brand: red; }",
                    },
                },
            }),
        );

        let response = handle_lsp_message(
            &mut state,
            json!({
                "jsonrpc": "2.0",
                "id": 2,
                "method": STYLE_HOVER_CANDIDATES_REQUEST,
                "params": {
                    "textDocument": {
                        "uri": "file:///workspace-a/src/App.module.scss",
                    },
                    "position": {
                        "line": 0,
                        "character": 2,
                    },
                },
            }),
        );

        assert_eq!(
            response
                .as_ref()
                .and_then(|value| value.pointer("/result/product")),
            Some(&json!("omena-lsp-server.style-hover-candidates")),
        );
        assert_eq!(
            response
                .as_ref()
                .and_then(|value| value.pointer("/result/candidateCount")),
            Some(&json!(1)),
        );
        assert_eq!(
            response
                .as_ref()
                .and_then(|value| value.pointer("/result/candidates/0/name")),
            Some(&json!("root")),
        );
        assert_eq!(
            response
                .as_ref()
                .and_then(|value| value.pointer("/result/candidates/0/range")),
            Some(&json!({
                "start": {
                    "line": 0,
                    "character": 1,
                },
                "end": {
                    "line": 0,
                    "character": 5,
                },
            })),
        );
        assert_eq!(
            response
                .as_ref()
                .and_then(|value| value.pointer("/result/workspaceFolderUri")),
            Some(&json!("file:///workspace-a")),
        );

        let custom_property_ref_response = handle_lsp_message(
            &mut state,
            json!({
                "jsonrpc": "2.0",
                "id": 3,
                "method": STYLE_HOVER_CANDIDATES_REQUEST,
                "params": {
                    "textDocument": {
                        "uri": "file:///workspace-a/src/App.module.scss",
                    },
                    "position": {
                        "line": 0,
                        "character": 21,
                    },
                },
            }),
        );
        assert_eq!(
            custom_property_ref_response
                .as_ref()
                .and_then(|value| value.pointer("/result/candidates/0/kind")),
            Some(&json!("customPropertyReference")),
        );
        assert_eq!(
            custom_property_ref_response
                .as_ref()
                .and_then(|value| value.pointer("/result/candidates/0/range")),
            Some(&json!({
                "start": {
                    "line": 0,
                    "character": 19,
                },
                "end": {
                    "line": 0,
                    "character": 26,
                },
            })),
        );

        let custom_property_decl_response = handle_lsp_message(
            &mut state,
            json!({
                "jsonrpc": "2.0",
                "id": 4,
                "method": STYLE_HOVER_CANDIDATES_REQUEST,
                "params": {
                    "textDocument": {
                        "uri": "file:///workspace-a/src/App.module.scss",
                    },
                    "position": {
                        "line": 1,
                        "character": 11,
                    },
                },
            }),
        );
        assert_eq!(
            custom_property_decl_response
                .as_ref()
                .and_then(|value| value.pointer("/result/candidates/0/kind")),
            Some(&json!("customPropertyDeclaration")),
        );
        assert_eq!(
            custom_property_decl_response
                .as_ref()
                .and_then(|value| value.pointer("/result/candidates/0/range")),
            Some(&json!({
                "start": {
                    "line": 1,
                    "character": 9,
                },
                "end": {
                    "line": 1,
                    "character": 16,
                },
            })),
        );

        let hover_response = handle_lsp_message(
            &mut state,
            json!({
                "jsonrpc": "2.0",
                "id": 5,
                "method": "textDocument/hover",
                "params": {
                    "textDocument": {
                        "uri": "file:///workspace-a/src/App.module.scss",
                    },
                    "position": {
                        "line": 0,
                        "character": 2,
                    },
                },
            }),
        );
        assert_eq!(
            hover_response
                .as_ref()
                .and_then(|value| value.pointer("/result/contents/kind")),
            Some(&json!("markdown")),
        );
        assert_eq!(
            hover_response
                .as_ref()
                .and_then(|value| value.pointer("/result/range")),
            Some(&json!({
                "start": {
                    "line": 0,
                    "character": 1,
                },
                "end": {
                    "line": 0,
                    "character": 5,
                },
            })),
        );

        let definition_response = handle_lsp_message(
            &mut state,
            json!({
                "jsonrpc": "2.0",
                "id": 6,
                "method": "textDocument/definition",
                "params": {
                    "textDocument": {
                        "uri": "file:///workspace-a/src/App.module.scss",
                    },
                    "position": {
                        "line": 0,
                        "character": 21,
                    },
                },
            }),
        );
        assert_eq!(
            definition_response
                .as_ref()
                .and_then(|value| value.pointer("/result/0/uri")),
            Some(&json!("file:///workspace-a/src/App.module.scss")),
        );
        assert_eq!(
            definition_response
                .as_ref()
                .and_then(|value| value.pointer("/result/0/range")),
            Some(&json!({
                "start": {
                    "line": 1,
                    "character": 9,
                },
                "end": {
                    "line": 1,
                    "character": 16,
                },
            })),
        );

        let references_response = handle_lsp_message(
            &mut state,
            json!({
                "jsonrpc": "2.0",
                "id": 7,
                "method": "textDocument/references",
                "params": {
                    "textDocument": {
                        "uri": "file:///workspace-a/src/App.module.scss",
                    },
                    "position": {
                        "line": 0,
                        "character": 21,
                    },
                    "context": {
                        "includeDeclaration": true,
                    },
                },
            }),
        );
        assert_eq!(
            references_response
                .as_ref()
                .and_then(|value| value.pointer("/result/0/range")),
            Some(&json!({
                "start": {
                    "line": 0,
                    "character": 19,
                },
                "end": {
                    "line": 0,
                    "character": 26,
                },
            })),
        );
        assert_eq!(
            references_response
                .as_ref()
                .and_then(|value| value.pointer("/result/1/range")),
            Some(&json!({
                "start": {
                    "line": 1,
                    "character": 9,
                },
                "end": {
                    "line": 1,
                    "character": 16,
                },
            })),
        );

        let completion_response = handle_lsp_message(
            &mut state,
            json!({
                "jsonrpc": "2.0",
                "id": 8,
                "method": "textDocument/completion",
                "params": {
                    "textDocument": {
                        "uri": "file:///workspace-a/src/App.module.scss",
                    },
                    "position": {
                        "line": 0,
                        "character": 20,
                    },
                },
            }),
        );
        assert_eq!(
            completion_response
                .as_ref()
                .and_then(|value| value.pointer("/result/isIncomplete")),
            Some(&json!(false)),
        );
        assert_eq!(
            completion_response
                .as_ref()
                .and_then(|value| value.pointer("/result/items/0/label")),
            Some(&json!("--brand")),
        );
        assert_eq!(
            completion_response
                .as_ref()
                .and_then(|value| value.pointer("/result/items/1/label")),
            Some(&json!(".root")),
        );

        let prepare_rename_response = handle_lsp_message(
            &mut state,
            json!({
                "jsonrpc": "2.0",
                "id": 9,
                "method": "textDocument/prepareRename",
                "params": {
                    "textDocument": {
                        "uri": "file:///workspace-a/src/App.module.scss",
                    },
                    "position": {
                        "line": 0,
                        "character": 2,
                    },
                },
            }),
        );
        assert_eq!(
            prepare_rename_response
                .as_ref()
                .and_then(|value| value.pointer("/result/placeholder")),
            Some(&json!("root")),
        );

        let rename_response = handle_lsp_message(
            &mut state,
            json!({
                "jsonrpc": "2.0",
                "id": 10,
                "method": "textDocument/rename",
                "params": {
                    "textDocument": {
                        "uri": "file:///workspace-a/src/App.module.scss",
                    },
                    "position": {
                        "line": 0,
                        "character": 21,
                    },
                    "newName": "--accent",
                },
            }),
        );
        assert_eq!(
            rename_response.as_ref().and_then(|value| value
                .pointer("/result/changes/file:~1~1~1workspace-a~1src~1App.module.scss/0/newText")),
            Some(&json!("--accent")),
        );
        assert_eq!(
            rename_response.as_ref().and_then(|value| value
                .pointer("/result/changes/file:~1~1~1workspace-a~1src~1App.module.scss/1/newText")),
            Some(&json!("--accent")),
        );

        let code_lens_response = handle_lsp_message(
            &mut state,
            json!({
                "jsonrpc": "2.0",
                "id": 11,
                "method": "textDocument/codeLens",
                "params": {
                    "textDocument": {
                        "uri": "file:///workspace-a/src/App.module.scss",
                    },
                },
            }),
        );
        assert_eq!(
            code_lens_response
                .as_ref()
                .and_then(|value| value.pointer("/result/0/command/title")),
            Some(&json!("1 reference")),
        );
        assert_eq!(
            code_lens_response
                .as_ref()
                .and_then(|value| value.pointer("/result/0/command/command")),
            Some(&json!("editor.action.showReferences")),
        );
        assert_eq!(
            code_lens_response
                .as_ref()
                .and_then(|value| value.pointer("/result/0/command/arguments/2/0/range")),
            Some(&json!({
                "start": {
                    "line": 0,
                    "character": 13,
                },
                "end": {
                    "line": 0,
                    "character": 17,
                },
            })),
        );
    }

    #[test]
    fn resolves_style_diagnostics_and_code_actions_from_opened_style_documents() {
        let mut state = LspShellState::default();
        handle_lsp_message(
            &mut state,
            json!({
                "jsonrpc": "2.0",
                "method": "textDocument/didOpen",
                "params": {
                    "textDocument": {
                        "uri": "file:///workspace-a/src/App.module.scss",
                        "languageId": "scss",
                        "version": 1,
                        "text": ":root { --brand: red; }\n.alert { color: var(--missing); }",
                    },
                },
            }),
        );

        let diagnostics_response = handle_lsp_message(
            &mut state,
            json!({
                "jsonrpc": "2.0",
                "id": 1,
                "method": STYLE_DIAGNOSTICS_REQUEST,
                "params": {
                    "textDocument": {
                        "uri": "file:///workspace-a/src/App.module.scss",
                    },
                },
            }),
        );
        assert_eq!(
            diagnostics_response
                .as_ref()
                .and_then(|value| value.pointer("/result/0/message")),
            Some(&json!(
                "CSS custom property '--missing' not found in indexed style tokens."
            )),
        );
        assert_eq!(
            diagnostics_response
                .as_ref()
                .and_then(|value| value.pointer("/result/0/range")),
            Some(&json!({
                "start": {
                    "line": 1,
                    "character": 20,
                },
                "end": {
                    "line": 1,
                    "character": 29,
                },
            })),
        );
        assert_eq!(
            diagnostics_response
                .as_ref()
                .and_then(|value| value.pointer("/result/0/data/createCustomProperty/range")),
            Some(&json!({
                "start": {
                    "line": 1,
                    "character": 33,
                },
                "end": {
                    "line": 1,
                    "character": 33,
                },
            })),
        );

        let diagnostic = diagnostics_response
            .as_ref()
            .and_then(|value| value.pointer("/result/0"))
            .cloned()
            .unwrap_or(Value::Null);
        let code_action_response = handle_lsp_message(
            &mut state,
            json!({
                "jsonrpc": "2.0",
                "id": 2,
                "method": "textDocument/codeAction",
                "params": {
                    "textDocument": {
                        "uri": "file:///workspace-a/src/App.module.scss",
                    },
                    "range": {
                        "start": {
                            "line": 1,
                            "character": 20,
                        },
                        "end": {
                            "line": 1,
                            "character": 29,
                        },
                    },
                    "context": {
                        "diagnostics": [diagnostic],
                    },
                },
            }),
        );
        assert_eq!(
            code_action_response
                .as_ref()
                .and_then(|value| value.pointer("/result/0/title")),
            Some(&json!("Add '--missing' to App.module.scss")),
        );
        assert_eq!(
            code_action_response
                .as_ref()
                .and_then(|value| value.pointer(
                    "/result/0/edit/changes/file:~1~1~1workspace-a~1src~1App.module.scss/0/newText"
                )),
            Some(&json!("\n\n:root {\n  --missing: ;\n}\n")),
        );
    }

    #[test]
    fn tracks_workspace_folder_changes() {
        let mut state = LspShellState::default();
        handle_lsp_message(
            &mut state,
            json!({
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {
                    "workspaceFolders": [
                        {
                            "uri": "file:///workspace-a",
                            "name": "workspace-a",
                        },
                    ],
                },
            }),
        );
        handle_lsp_message(
            &mut state,
            json!({
                "jsonrpc": "2.0",
                "method": "workspace/didChangeWorkspaceFolders",
                "params": {
                    "event": {
                        "removed": [
                            {
                                "uri": "file:///workspace-a",
                                "name": "workspace-a",
                            },
                        ],
                        "added": [
                            {
                                "uri": "file:///workspace-b",
                                "name": "workspace-b",
                            },
                        ],
                    },
                },
            }),
        );

        assert_eq!(state.workspace_folder_count(), 1);
        assert!(state.workspace_folder("file:///workspace-a").is_none());
        assert!(state.workspace_folder("file:///workspace-b").is_some());
    }

    #[test]
    fn indexes_watched_style_file_changes_from_disk() {
        let workspace_root =
            std::env::temp_dir().join(format!("omena-lsp-server-watched-{}", std::process::id()));
        let src_dir = workspace_root.join("src");
        let style_path = src_dir.join("App.module.scss");
        let _ = std::fs::remove_dir_all(&workspace_root);
        let create_dir_result = std::fs::create_dir_all(&src_dir);
        assert!(
            create_dir_result.is_ok(),
            "create watched fixture directory: {:?}",
            create_dir_result.err(),
        );
        let write_result = std::fs::write(&style_path, ".fromDisk { color: red; }");
        assert!(
            write_result.is_ok(),
            "write watched style fixture: {:?}",
            write_result.err(),
        );

        let workspace_uri = format!("file://{}", workspace_root.display());
        let style_uri = format!("file://{}", style_path.display());
        let mut state = LspShellState::default();
        handle_lsp_message(
            &mut state,
            json!({
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {
                    "workspaceFolders": [
                        {
                            "uri": workspace_uri,
                            "name": "watched",
                        },
                    ],
                },
            }),
        );
        handle_lsp_message(
            &mut state,
            json!({
                "jsonrpc": "2.0",
                "method": "workspace/didChangeWatchedFiles",
                "params": {
                    "changes": [
                        {
                            "uri": style_uri,
                            "type": 2,
                        },
                    ],
                },
            }),
        );

        let indexed = state
            .document(style_uri.as_str())
            .and_then(|document| document.style_summary.as_ref());
        assert_eq!(
            indexed.map(|summary| summary.selector_names.clone()),
            Some(vec!["fromDisk".to_string()]),
        );
        assert_eq!(state.snapshot().watched_file_event_count, 1);

        handle_lsp_message(
            &mut state,
            json!({
                "jsonrpc": "2.0",
                "method": "workspace/didChangeWatchedFiles",
                "params": {
                    "changes": [
                        {
                            "uri": style_uri,
                            "type": 3,
                        },
                    ],
                },
            }),
        );
        assert!(state.document(style_uri.as_str()).is_none());
        let _ = std::fs::remove_dir_all(&workspace_root);
    }

    #[test]
    fn assigns_document_workspace_folder_by_longest_uri_prefix() {
        let mut state = LspShellState::default();
        handle_lsp_message(
            &mut state,
            json!({
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {
                    "workspaceFolders": [
                        {
                            "uri": "file:///workspace",
                            "name": "workspace",
                        },
                        {
                            "uri": "file:///workspace/packages/app",
                            "name": "app",
                        },
                    ],
                },
            }),
        );

        handle_lsp_message(
            &mut state,
            json!({
                "jsonrpc": "2.0",
                "method": "textDocument/didOpen",
                "params": {
                    "textDocument": {
                        "uri": "file:///workspace/packages/app/src/App.tsx",
                        "languageId": "typescriptreact",
                        "version": 1,
                        "text": "export const App = () => null;",
                    },
                },
            }),
        );

        assert_eq!(
            state
                .document("file:///workspace/packages/app/src/App.tsx")
                .and_then(|document| document.workspace_folder_uri.as_deref()),
            Some("file:///workspace/packages/app"),
        );

        handle_lsp_message(
            &mut state,
            json!({
                "jsonrpc": "2.0",
                "method": "workspace/didChangeWorkspaceFolders",
                "params": {
                    "event": {
                        "removed": [
                            {
                                "uri": "file:///workspace/packages/app",
                                "name": "app",
                            },
                        ],
                        "added": [],
                    },
                },
            }),
        );

        assert_eq!(
            state
                .document("file:///workspace/packages/app/src/App.tsx")
                .and_then(|document| document.workspace_folder_uri.as_deref()),
            Some("file:///workspace"),
        );
    }
}
