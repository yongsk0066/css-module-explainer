use std::collections::BTreeSet;

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
            "phase3SourceProviderExitGate",
        ],
        cme_coupled_surfaces: vec![
            "server/engine-host-node/src/tsgo-type-fact-collector.ts",
            "server/engine-host-node/src/type-fact-collector.ts",
        ],
        next_decoupling_targets: vec![
            "persistentRustTsgoProcessPool",
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

#[cfg(test)]
mod tests {
    use super::{
        TsgoTypeFactRequestV0, TsgoTypeFactTargetV0, build_tsgo_api_args,
        plan_tsgo_type_fact_collection, summarize_omena_tsgo_client_boundary,
    };

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
                .next_decoupling_targets
                .contains(&"persistentRustTsgoProcessPool")
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
}
