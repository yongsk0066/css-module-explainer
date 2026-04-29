use std::{
    collections::{BTreeMap, BTreeSet},
    io,
    process::{Child, Command, Stdio},
};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OmenaTsgoClientBoundarySummaryV0 {
    pub schema_version: &'static str,
    pub product: &'static str,
    pub client_name: &'static str,
    pub runtime_model: &'static str,
    pub workspace_process_policy: WorkspaceProcessPolicyV0,
    pub request_path_policy: Vec<&'static str>,
    pub api_methods: Vec<TsgoApiMethodV0>,
    pub type_fact_contract: TypeFactContractV0,
    pub lifecycle: TsgoClientLifecycleV0,
    pub ready_surfaces: Vec<&'static str>,
    pub cme_coupled_surfaces: Vec<&'static str>,
    pub next_decoupling_targets: Vec<&'static str>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceProcessPolicyV0 {
    pub process_scope: &'static str,
    pub startup_mode: &'static str,
    pub shutdown_owner: &'static str,
    pub max_workspace_processes: usize,
    pub default_checker_workers: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TsgoApiMethodV0 {
    pub method: &'static str,
    pub phase: &'static str,
    pub purpose: &'static str,
    pub request_group: &'static str,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TypeFactContractV0 {
    pub input_contract: &'static str,
    pub target_identity: Vec<&'static str>,
    pub output_contract: &'static str,
    pub unresolved_behavior: &'static str,
    pub project_miss_behavior: &'static str,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TsgoClientLifecycleV0 {
    pub open_project_method: &'static str,
    pub snapshot_release_method: &'static str,
    pub cancellation_boundary: &'static str,
    pub stale_result_policy: &'static str,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TsgoTypeFactRequestV0 {
    pub workspace_root: String,
    pub config_path: String,
    pub targets: Vec<TsgoTypeFactTargetV0>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TsgoTypeFactTargetV0 {
    pub file_path: String,
    pub expression_id: String,
    pub position: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TsgoTypeFactCollectionPlanV0 {
    pub schema_version: &'static str,
    pub product: &'static str,
    pub workspace_root: String,
    pub config_path: String,
    pub target_count: usize,
    pub unique_file_count: usize,
    pub request_sequence: Vec<TsgoClientRequestStepV0>,
    pub parallelizable_groups: Vec<&'static str>,
    pub request_path_blocking_allowed: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TsgoClientRequestStepV0 {
    pub order: usize,
    pub method: &'static str,
    pub request_count: usize,
    pub blocking_policy: &'static str,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TsgoProcessCommandV0 {
    pub command: String,
    pub args: Vec<String>,
    pub cwd: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TsgoWorkspaceProcessConfigV0 {
    pub workspace_root: String,
    pub command: TsgoProcessCommandV0,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TsgoWorkspaceProcessSnapshotV0 {
    pub schema_version: &'static str,
    pub product: &'static str,
    pub workspace_root: String,
    pub command: String,
    pub args: Vec<String>,
    pub cwd: String,
    pub generation: u64,
    pub process_id: Option<u32>,
    pub running: bool,
    pub reused: bool,
}

#[derive(Debug, Default)]
pub struct TsgoWorkspaceProcessPoolV0 {
    processes: BTreeMap<String, ManagedTsgoWorkspaceProcessV0>,
    generation_counter: u64,
}

pub fn summarize_omena_tsgo_client_boundary() -> OmenaTsgoClientBoundarySummaryV0 {
    OmenaTsgoClientBoundarySummaryV0 {
        schema_version: "0",
        product: "omena-tsgo-client.boundary",
        client_name: "omena-tsgo-client",
        runtime_model: "longLivedWorkspaceProcess",
        workspace_process_policy: WorkspaceProcessPolicyV0 {
            process_scope: "oneTsgoApiProcessPerWorkspace",
            startup_mode: "backgroundWarmup",
            shutdown_owner: "omena-lsp-server",
            max_workspace_processes: 1,
            default_checker_workers: 2,
        },
        request_path_policy: vec![
            "noTypeScriptCreateProgramOnRequestPath",
            "noSyncWorkspaceFallbackOnRequestPath",
            "returnUnresolvedWhenTsgoUnavailable",
            "cooperativeCancellationBeforeTsgoRequest",
            "releaseSnapshotsAfterBatch",
        ],
        api_methods: tsgo_api_methods(),
        type_fact_contract: TypeFactContractV0 {
            input_contract: "TsgoTypeFactRequestV0",
            target_identity: vec!["filePath", "expressionId", "position"],
            output_contract: "TsgoTypeFactWorkerResultEntry[]",
            unresolved_behavior: "unavailable or non-literal types become unresolvable",
            project_miss_behavior: "project miss returns unresolvable without entering current-ts fallback",
        },
        lifecycle: TsgoClientLifecycleV0 {
            open_project_method: "updateSnapshot",
            snapshot_release_method: "release",
            cancellation_boundary: "before getTypeAtPosition batch",
            stale_result_policy: "discard when document version or config hash changes",
        },
        ready_surfaces: vec![
            "tsgoApiInvocationArgs",
            "typeFactRequestContract",
            "typeFactResultContract",
            "requestSequencePlan",
            "persistentWorkspaceProcessPool",
            "phase3SourceProviderExitGate",
        ],
        cme_coupled_surfaces: vec![
            "server/engine-host-node/src/tsgo-type-fact-collector.ts",
            "server/engine-host-node/src/type-fact-collector.ts",
        ],
        next_decoupling_targets: vec![
            "tsgoJsonRpcTransport",
            "lspCancellationTokenWireup",
            "incrementalSnapshotDiff",
            "sourceProviderDirectRustAdapter",
        ],
    }
}

pub fn tsgo_api_methods() -> Vec<TsgoApiMethodV0> {
    vec![
        TsgoApiMethodV0 {
            method: "initialize",
            phase: "startup",
            purpose: "start tsgo API session",
            request_group: "session",
        },
        TsgoApiMethodV0 {
            method: "updateSnapshot",
            phase: "workspaceSnapshot",
            purpose: "open project config and obtain snapshot handle",
            request_group: "snapshot",
        },
        TsgoApiMethodV0 {
            method: "getDefaultProjectForFile",
            phase: "projectMapping",
            purpose: "map each source file to a tsgo project",
            request_group: "perUniqueFile",
        },
        TsgoApiMethodV0 {
            method: "getTypeAtPosition",
            phase: "typeFacts",
            purpose: "read source expression type at target offset",
            request_group: "perTarget",
        },
        TsgoApiMethodV0 {
            method: "getTypesOfType",
            phase: "typeFacts",
            purpose: "expand union members into finite string facts",
            request_group: "perUnionType",
        },
        TsgoApiMethodV0 {
            method: "release",
            phase: "cleanup",
            purpose: "release snapshot handles after a batch",
            request_group: "snapshot",
        },
    ]
}

pub fn build_tsgo_api_args(workspace_root: &str, checkers: Option<usize>) -> Vec<String> {
    let mut args = vec![
        "--api".to_string(),
        "--async".to_string(),
        "--cwd".to_string(),
        workspace_root.to_string(),
    ];

    if let Some(checkers) = checkers {
        args.push("--checkers".to_string());
        args.push(checkers.to_string());
    }

    args
}

pub fn build_tsgo_process_command(
    tsgo_path: &str,
    workspace_root: &str,
    checkers: Option<usize>,
) -> TsgoProcessCommandV0 {
    TsgoProcessCommandV0 {
        command: tsgo_path.to_string(),
        args: build_tsgo_api_args(workspace_root, checkers),
        cwd: workspace_root.to_string(),
    }
}

pub fn plan_tsgo_type_fact_collection(
    request: &TsgoTypeFactRequestV0,
) -> TsgoTypeFactCollectionPlanV0 {
    let unique_files = request
        .targets
        .iter()
        .map(|target| target.file_path.clone())
        .collect::<BTreeSet<_>>();
    let target_count = request.targets.len();

    TsgoTypeFactCollectionPlanV0 {
        schema_version: "0",
        product: "omena-tsgo-client.type-fact-collection-plan",
        workspace_root: request.workspace_root.clone(),
        config_path: request.config_path.clone(),
        target_count,
        unique_file_count: unique_files.len(),
        request_sequence: vec![
            request_step(1, "initialize", 1, "startupOnly"),
            request_step(2, "updateSnapshot", 1, "backgroundOrBatch"),
            request_step(
                3,
                "getDefaultProjectForFile",
                unique_files.len(),
                "cancelBeforeBatch",
            ),
            request_step(4, "getTypeAtPosition", target_count, "cancelBeforeBatch"),
            request_step(5, "getTypesOfType", target_count, "onlyWhenUnion"),
            request_step(6, "release", 1, "alwaysAfterSnapshotBatch"),
        ],
        parallelizable_groups: vec![
            "getDefaultProjectForFileByUniqueFile",
            "getTypeAtPositionByTarget",
            "getTypesOfTypeByUnionMember",
        ],
        request_path_blocking_allowed: false,
    }
}

impl TsgoWorkspaceProcessPoolV0 {
    pub fn ensure_workspace_process(
        &mut self,
        config: TsgoWorkspaceProcessConfigV0,
    ) -> io::Result<TsgoWorkspaceProcessSnapshotV0> {
        if let Some(existing) = self.processes.get_mut(config.workspace_root.as_str())
            && existing.config.command == config.command
            && existing.is_running()?
        {
            return Ok(existing.snapshot(true));
        }

        if let Some(mut previous) = self.processes.remove(config.workspace_root.as_str()) {
            previous.shutdown()?;
        }

        self.generation_counter += 1;
        let process = ManagedTsgoWorkspaceProcessV0::spawn(config, self.generation_counter)?;
        let snapshot = process.snapshot(false);
        self.processes
            .insert(process.config.workspace_root.clone(), process);
        Ok(snapshot)
    }

    pub fn shutdown_workspace(&mut self, workspace_root: &str) -> io::Result<bool> {
        let Some(mut process) = self.processes.remove(workspace_root) else {
            return Ok(false);
        };
        process.shutdown()?;
        Ok(true)
    }

    pub fn shutdown_all(&mut self) -> io::Result<usize> {
        let mut count = 0;
        let workspace_roots = self.processes.keys().cloned().collect::<Vec<_>>();
        for workspace_root in workspace_roots {
            if self.shutdown_workspace(workspace_root.as_str())? {
                count += 1;
            }
        }
        Ok(count)
    }

    pub fn len(&self) -> usize {
        self.processes.len()
    }

    pub fn is_empty(&self) -> bool {
        self.processes.is_empty()
    }
}

impl Drop for TsgoWorkspaceProcessPoolV0 {
    fn drop(&mut self) {
        let _ = self.shutdown_all();
    }
}

fn request_step(
    order: usize,
    method: &'static str,
    request_count: usize,
    blocking_policy: &'static str,
) -> TsgoClientRequestStepV0 {
    TsgoClientRequestStepV0 {
        order,
        method,
        request_count,
        blocking_policy,
    }
}

#[derive(Debug)]
struct ManagedTsgoWorkspaceProcessV0 {
    config: TsgoWorkspaceProcessConfigV0,
    child: Child,
    generation: u64,
}

impl ManagedTsgoWorkspaceProcessV0 {
    fn spawn(config: TsgoWorkspaceProcessConfigV0, generation: u64) -> io::Result<Self> {
        let child = Command::new(config.command.command.as_str())
            .args(&config.command.args)
            .current_dir(config.command.cwd.as_str())
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()?;

        Ok(Self {
            config,
            child,
            generation,
        })
    }

    fn is_running(&mut self) -> io::Result<bool> {
        Ok(self.child.try_wait()?.is_none())
    }

    fn snapshot(&self, reused: bool) -> TsgoWorkspaceProcessSnapshotV0 {
        TsgoWorkspaceProcessSnapshotV0 {
            schema_version: "0",
            product: "omena-tsgo-client.workspace-process",
            workspace_root: self.config.workspace_root.clone(),
            command: self.config.command.command.clone(),
            args: self.config.command.args.clone(),
            cwd: self.config.command.cwd.clone(),
            generation: self.generation,
            process_id: Some(self.child.id()),
            running: true,
            reused,
        }
    }

    fn shutdown(&mut self) -> io::Result<()> {
        if self.child.try_wait()?.is_none() {
            self.child.kill()?;
        }
        self.child.wait()?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::{
        TsgoProcessCommandV0, TsgoTypeFactRequestV0, TsgoTypeFactTargetV0,
        TsgoWorkspaceProcessConfigV0, TsgoWorkspaceProcessPoolV0, build_tsgo_api_args,
        build_tsgo_process_command, plan_tsgo_type_fact_collection,
        summarize_omena_tsgo_client_boundary,
    };
    use std::io;

    #[test]
    fn declares_long_lived_tsgo_client_boundary() {
        let summary = summarize_omena_tsgo_client_boundary();

        assert_eq!(summary.schema_version, "0");
        assert_eq!(summary.product, "omena-tsgo-client.boundary");
        assert_eq!(summary.runtime_model, "longLivedWorkspaceProcess");
        assert!(
            summary
                .request_path_policy
                .contains(&"noSyncWorkspaceFallbackOnRequestPath")
        );
        assert!(
            summary
                .ready_surfaces
                .contains(&"phase3SourceProviderExitGate")
        );
        assert!(
            summary
                .ready_surfaces
                .contains(&"persistentWorkspaceProcessPool")
        );
        assert!(
            summary
                .next_decoupling_targets
                .contains(&"tsgoJsonRpcTransport")
        );
    }

    #[test]
    fn builds_tsgo_api_invocation_args() {
        assert_eq!(
            build_tsgo_api_args("/workspace", Some(2)),
            vec!["--api", "--async", "--cwd", "/workspace", "--checkers", "2"]
        );
    }

    #[test]
    fn builds_tsgo_workspace_process_command() {
        assert_eq!(
            build_tsgo_process_command("/bin/tsgo", "/workspace", Some(2)),
            TsgoProcessCommandV0 {
                command: "/bin/tsgo".to_string(),
                args: vec![
                    "--api".to_string(),
                    "--async".to_string(),
                    "--cwd".to_string(),
                    "/workspace".to_string(),
                    "--checkers".to_string(),
                    "2".to_string()
                ],
                cwd: "/workspace".to_string(),
            }
        );
    }

    #[test]
    fn process_pool_reuses_running_workspace_process() -> io::Result<()> {
        let mut pool = TsgoWorkspaceProcessPoolV0::default();
        let config = test_process_config("reuse", 30);

        let first = pool.ensure_workspace_process(config.clone())?;
        let second = pool.ensure_workspace_process(config)?;

        assert_eq!(pool.len(), 1);
        assert!(!first.reused);
        assert!(second.reused);
        assert_eq!(first.workspace_root, second.workspace_root);
        assert_eq!(first.process_id, second.process_id);
        assert!(pool.shutdown_workspace(first.workspace_root.as_str())?);
        assert!(pool.is_empty());
        Ok(())
    }

    #[test]
    fn process_pool_restarts_when_invocation_changes() -> io::Result<()> {
        let mut pool = TsgoWorkspaceProcessPoolV0::default();
        let first_config = test_process_config("restart", 30);
        let second_config = test_process_config("restart", 29);

        let first = pool.ensure_workspace_process(first_config)?;
        let second = pool.ensure_workspace_process(second_config)?;

        assert_eq!(pool.len(), 1);
        assert!(!first.reused);
        assert!(!second.reused);
        assert_ne!(first.generation, second.generation);
        assert_ne!(first.args, second.args);
        assert!(pool.shutdown_workspace(first.workspace_root.as_str())?);
        Ok(())
    }

    #[test]
    fn plans_type_fact_collection_without_request_path_blocking() {
        let request = TsgoTypeFactRequestV0 {
            workspace_root: "/repo".to_string(),
            config_path: "/repo/tsconfig.json".to_string(),
            targets: vec![
                TsgoTypeFactTargetV0 {
                    file_path: "/repo/src/App.tsx".to_string(),
                    expression_id: "expr-1".to_string(),
                    position: 12,
                },
                TsgoTypeFactTargetV0 {
                    file_path: "/repo/src/App.tsx".to_string(),
                    expression_id: "expr-2".to_string(),
                    position: 24,
                },
                TsgoTypeFactTargetV0 {
                    file_path: "/repo/src/Card.tsx".to_string(),
                    expression_id: "expr-3".to_string(),
                    position: 8,
                },
            ],
        };

        let plan = plan_tsgo_type_fact_collection(&request);

        assert_eq!(plan.product, "omena-tsgo-client.type-fact-collection-plan");
        assert_eq!(plan.target_count, 3);
        assert_eq!(plan.unique_file_count, 2);
        assert!(!plan.request_path_blocking_allowed);
        assert_eq!(plan.request_sequence.len(), 6);
        assert_eq!(plan.request_sequence[2].method, "getDefaultProjectForFile");
        assert_eq!(plan.request_sequence[2].request_count, 2);
        assert_eq!(plan.request_sequence[3].method, "getTypeAtPosition");
        assert_eq!(plan.request_sequence[3].request_count, 3);
    }

    fn test_process_config(label: &str, seconds: u64) -> TsgoWorkspaceProcessConfigV0 {
        let workspace_root = std::env::temp_dir()
            .join(format!("omena-tsgo-client-{label}"))
            .to_string_lossy()
            .to_string();
        let _ = std::fs::create_dir_all(workspace_root.as_str());

        TsgoWorkspaceProcessConfigV0 {
            workspace_root: workspace_root.clone(),
            command: test_process_command(workspace_root, seconds),
        }
    }

    #[cfg(not(windows))]
    fn test_process_command(cwd: String, seconds: u64) -> TsgoProcessCommandV0 {
        TsgoProcessCommandV0 {
            command: "sh".to_string(),
            args: vec!["-c".to_string(), format!("sleep {seconds}")],
            cwd,
        }
    }

    #[cfg(windows)]
    fn test_process_command(cwd: String, seconds: u64) -> TsgoProcessCommandV0 {
        TsgoProcessCommandV0 {
            command: "cmd".to_string(),
            args: vec![
                "/C".to_string(),
                format!("ping -n {seconds} 127.0.0.1 > NUL"),
            ],
            cwd,
        }
    }
}
