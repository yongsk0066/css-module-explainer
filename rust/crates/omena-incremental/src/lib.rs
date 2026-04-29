use std::collections::{BTreeMap, BTreeSet};

use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OmenaIncrementalBoundarySummaryV0 {
    pub schema_version: &'static str,
    pub product: &'static str,
    pub engine_name: &'static str,
    pub invalidation_model: &'static str,
    pub node_identity: Vec<&'static str>,
    pub dirty_reasons: Vec<&'static str>,
    pub ready_surfaces: Vec<&'static str>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IncrementalRevisionV0 {
    pub value: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IncrementalGraphInputV0 {
    pub revision: IncrementalRevisionV0,
    pub nodes: Vec<IncrementalNodeInputV0>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IncrementalNodeInputV0 {
    pub id: String,
    pub digest: String,
    pub dependency_ids: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IncrementalSnapshotV0 {
    pub schema_version: &'static str,
    pub product: &'static str,
    pub revision: IncrementalRevisionV0,
    pub nodes: Vec<IncrementalSnapshotNodeV0>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IncrementalSnapshotNodeV0 {
    pub id: String,
    pub digest: String,
    pub dependency_ids: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IncrementalComputationPlanV0 {
    pub schema_version: &'static str,
    pub product: &'static str,
    pub revision: IncrementalRevisionV0,
    pub node_count: usize,
    pub dirty_node_count: usize,
    pub changed_input_count: usize,
    pub new_node_count: usize,
    pub removed_node_count: usize,
    pub dependency_dirty_count: usize,
    pub nodes: Vec<IncrementalComputationNodeV0>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IncrementalComputationNodeV0 {
    pub id: String,
    pub digest: String,
    pub dependency_ids: Vec<String>,
    pub dirty: bool,
    pub reasons: Vec<&'static str>,
}

pub fn summarize_omena_incremental_boundary() -> OmenaIncrementalBoundarySummaryV0 {
    OmenaIncrementalBoundarySummaryV0 {
        schema_version: "0",
        product: "omena-incremental.boundary",
        engine_name: "omena-incremental",
        invalidation_model: "stableNodeId+inputDigest+dependencyPropagation",
        node_identity: vec!["id", "digest", "dependencyIds"],
        dirty_reasons: vec![
            "newNode",
            "inputDigestChanged",
            "dependencySetChanged",
            "dependencyDirty",
        ],
        ready_surfaces: vec![
            "incrementalGraphInput",
            "incrementalSnapshot",
            "incrementalComputationPlan",
        ],
    }
}

pub fn snapshot_from_graph_input(input: &IncrementalGraphInputV0) -> IncrementalSnapshotV0 {
    IncrementalSnapshotV0 {
        schema_version: "0",
        product: "omena-incremental.snapshot",
        revision: input.revision,
        nodes: normalized_snapshot_nodes(input),
    }
}

pub fn plan_incremental_computation(
    input: &IncrementalGraphInputV0,
    previous: Option<&IncrementalSnapshotV0>,
) -> IncrementalComputationPlanV0 {
    let normalized_nodes = normalized_snapshot_nodes(input);
    let previous_by_id = previous
        .map(|snapshot| {
            snapshot
                .nodes
                .iter()
                .map(|node| (node.id.as_str(), node))
                .collect::<BTreeMap<_, _>>()
        })
        .unwrap_or_default();
    let current_ids = normalized_nodes
        .iter()
        .map(|node| node.id.as_str())
        .collect::<BTreeSet<_>>();
    let removed_node_count = previous_by_id
        .keys()
        .filter(|id| !current_ids.contains(**id))
        .count();
    let mut dirty_ids = BTreeSet::<String>::new();
    let mut nodes = normalized_nodes
        .into_iter()
        .map(|node| {
            let mut reasons = Vec::new();
            match previous_by_id.get(node.id.as_str()) {
                None => reasons.push("newNode"),
                Some(previous_node) => {
                    if previous_node.digest != node.digest {
                        reasons.push("inputDigestChanged");
                    }
                    if previous_node.dependency_ids != node.dependency_ids {
                        reasons.push("dependencySetChanged");
                    }
                }
            }
            if !reasons.is_empty() {
                dirty_ids.insert(node.id.clone());
            }

            IncrementalComputationNodeV0 {
                id: node.id,
                digest: node.digest,
                dependency_ids: node.dependency_ids,
                dirty: !reasons.is_empty(),
                reasons,
            }
        })
        .collect::<Vec<_>>();

    propagate_dependency_dirty(&mut nodes, &mut dirty_ids);

    IncrementalComputationPlanV0 {
        schema_version: "0",
        product: "omena-incremental.computation-plan",
        revision: input.revision,
        node_count: nodes.len(),
        dirty_node_count: nodes.iter().filter(|node| node.dirty).count(),
        changed_input_count: nodes
            .iter()
            .filter(|node| node.reasons.contains(&"inputDigestChanged"))
            .count(),
        new_node_count: nodes
            .iter()
            .filter(|node| node.reasons.contains(&"newNode"))
            .count(),
        removed_node_count,
        dependency_dirty_count: nodes
            .iter()
            .filter(|node| node.reasons.contains(&"dependencyDirty"))
            .count(),
        nodes,
    }
}

fn normalized_snapshot_nodes(input: &IncrementalGraphInputV0) -> Vec<IncrementalSnapshotNodeV0> {
    let mut nodes = input
        .nodes
        .iter()
        .map(|node| IncrementalSnapshotNodeV0 {
            id: node.id.clone(),
            digest: node.digest.clone(),
            dependency_ids: normalized_ids(&node.dependency_ids),
        })
        .collect::<Vec<_>>();
    nodes.sort_by(|left, right| left.id.cmp(&right.id));
    nodes
}

fn normalized_ids(ids: &[String]) -> Vec<String> {
    ids.iter()
        .cloned()
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect()
}

fn propagate_dependency_dirty(
    nodes: &mut [IncrementalComputationNodeV0],
    dirty_ids: &mut BTreeSet<String>,
) {
    loop {
        let mut changed = false;
        for node in nodes.iter_mut() {
            if node.dirty {
                continue;
            }
            if node
                .dependency_ids
                .iter()
                .any(|dependency_id| dirty_ids.contains(dependency_id))
            {
                node.dirty = true;
                node.reasons.push("dependencyDirty");
                dirty_ids.insert(node.id.clone());
                changed = true;
            }
        }

        if !changed {
            break;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{
        IncrementalGraphInputV0, IncrementalNodeInputV0, IncrementalRevisionV0,
        plan_incremental_computation, snapshot_from_graph_input,
        summarize_omena_incremental_boundary,
    };

    #[test]
    fn summarizes_incremental_boundary() {
        let summary = summarize_omena_incremental_boundary();

        assert_eq!(summary.product, "omena-incremental.boundary");
        assert!(summary.dirty_reasons.contains(&"dependencyDirty"));
    }

    #[test]
    fn first_plan_marks_all_nodes_dirty() {
        let input = sample_input("a:v1", "b:v1", 1);
        let plan = plan_incremental_computation(&input, None);

        assert_eq!(plan.product, "omena-incremental.computation-plan");
        assert_eq!(plan.node_count, 2);
        assert_eq!(plan.dirty_node_count, 2);
        assert_eq!(plan.new_node_count, 2);
    }

    #[test]
    fn unchanged_second_plan_marks_nodes_clean() {
        let input = sample_input("a:v1", "b:v1", 1);
        let snapshot = snapshot_from_graph_input(&input);
        let next_input = sample_input("a:v1", "b:v1", 2);
        let plan = plan_incremental_computation(&next_input, Some(&snapshot));

        assert_eq!(plan.dirty_node_count, 0);
        assert_eq!(plan.changed_input_count, 0);
    }

    #[test]
    fn changed_dependency_marks_dependent_dirty() {
        let input = sample_input("a:v1", "b:v1", 1);
        let snapshot = snapshot_from_graph_input(&input);
        let next_input = sample_input("a:v2", "b:v1", 2);
        let plan = plan_incremental_computation(&next_input, Some(&snapshot));

        assert_eq!(plan.changed_input_count, 1);
        assert_eq!(plan.dependency_dirty_count, 1);
        assert_eq!(node_reasons(&plan, "a"), vec!["inputDigestChanged"]);
        assert_eq!(node_reasons(&plan, "b"), vec!["dependencyDirty"]);
    }

    fn sample_input(a_digest: &str, b_digest: &str, revision: u64) -> IncrementalGraphInputV0 {
        IncrementalGraphInputV0 {
            revision: IncrementalRevisionV0 { value: revision },
            nodes: vec![
                IncrementalNodeInputV0 {
                    id: "b".to_string(),
                    digest: b_digest.to_string(),
                    dependency_ids: vec!["a".to_string()],
                },
                IncrementalNodeInputV0 {
                    id: "a".to_string(),
                    digest: a_digest.to_string(),
                    dependency_ids: Vec::new(),
                },
            ],
        }
    }

    fn node_reasons(plan: &super::IncrementalComputationPlanV0, id: &str) -> Vec<&'static str> {
        plan.nodes
            .iter()
            .find(|node| node.id == id)
            .map(|node| node.reasons.clone())
            .unwrap_or_default()
    }
}
