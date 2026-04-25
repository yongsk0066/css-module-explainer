use std::collections::BTreeMap;

use engine_input_producers::{
    EngineInputV2, ExpressionSemanticsEvaluatorCandidatePayloadV0,
    summarize_expression_semantics_evaluator_candidates_input,
    summarize_selector_usage_evaluator_candidates_input,
};
use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceInputPromotionEvidenceSummaryV0 {
    pub schema_version: &'static str,
    pub product: &'static str,
    pub input_version: String,
    pub reference_site_identity: ReferenceSiteIdentityEvidenceV0,
    pub certainty_reason: CertaintyReasonEvidenceV0,
    pub blocking_gaps: Vec<&'static str>,
    pub next_priorities: Vec<&'static str>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReferenceSiteIdentityEvidenceV0 {
    pub status: &'static str,
    pub selector_count: usize,
    pub reference_site_count: usize,
    pub direct_reference_site_count: usize,
    pub expanded_reference_site_count: usize,
    pub style_dependency_reference_site_count: usize,
    pub editable_direct_site_count: usize,
    pub reference_kind_counts: BTreeMap<String, usize>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CertaintyReasonEvidenceV0 {
    pub status: &'static str,
    pub expression_count: usize,
    pub exact_count: usize,
    pub inferred_count: usize,
    pub possible_count: usize,
    pub missing_reason_count: usize,
    pub reason_counts: BTreeMap<String, usize>,
    pub shape_kind_counts: BTreeMap<String, usize>,
    pub shape_label_counts: BTreeMap<String, usize>,
}

pub fn summarize_source_input_evidence(
    input: &EngineInputV2,
) -> SourceInputPromotionEvidenceSummaryV0 {
    let reference_site_identity = summarize_reference_site_identity(input);
    let certainty_reason = summarize_certainty_reason(input);
    let mut blocking_gaps = Vec::new();

    if reference_site_identity.status == "gap" {
        blocking_gaps.push("referenceSiteIdentity");
    }
    if certainty_reason.status == "gap" {
        blocking_gaps.push("certaintyReason");
    }

    SourceInputPromotionEvidenceSummaryV0 {
        schema_version: "0",
        product: "omena-semantic.source-input-evidence",
        input_version: input.version.clone(),
        reference_site_identity,
        certainty_reason,
        blocking_gaps,
        next_priorities: vec!["bindingOrigin", "styleModuleEdge", "valueDomainExplanation"],
    }
}

fn summarize_reference_site_identity(input: &EngineInputV2) -> ReferenceSiteIdentityEvidenceV0 {
    let selector_usage = summarize_selector_usage_evaluator_candidates_input(input);
    let selector_count = selector_usage.results.len();
    let mut reference_site_count = 0usize;
    let mut direct_reference_site_count = 0usize;
    let mut expanded_reference_site_count = 0usize;
    let mut style_dependency_reference_site_count = 0usize;
    let mut editable_direct_site_count = 0usize;
    let mut reference_kind_counts = BTreeMap::new();

    for result in selector_usage.results {
        editable_direct_site_count += result.payload.editable_direct_sites.len();
        for site in result.payload.all_sites {
            reference_site_count += 1;
            if site.expansion == "direct" {
                direct_reference_site_count += 1;
            } else {
                expanded_reference_site_count += 1;
            }
            if site.reference_kind == "styleDependency" {
                style_dependency_reference_site_count += 1;
            }
            *reference_kind_counts
                .entry(site.reference_kind)
                .or_insert(0) += 1;
        }
    }

    ReferenceSiteIdentityEvidenceV0 {
        status: if reference_site_count > 0 {
            "ready"
        } else {
            "gap"
        },
        selector_count,
        reference_site_count,
        direct_reference_site_count,
        expanded_reference_site_count,
        style_dependency_reference_site_count,
        editable_direct_site_count,
        reference_kind_counts,
    }
}

fn summarize_certainty_reason(input: &EngineInputV2) -> CertaintyReasonEvidenceV0 {
    let expression_semantics = summarize_expression_semantics_evaluator_candidates_input(input);
    let mut expression_count = 0usize;
    let mut exact_count = 0usize;
    let mut inferred_count = 0usize;
    let mut possible_count = 0usize;
    let mut missing_reason_count = 0usize;
    let mut reason_counts = BTreeMap::new();
    let mut shape_kind_counts = BTreeMap::new();
    let mut shape_label_counts = BTreeMap::new();

    for result in expression_semantics.results {
        expression_count += 1;
        let payload = result.payload;
        match payload.selector_certainty.as_str() {
            "exact" => exact_count += 1,
            "inferred" => inferred_count += 1,
            "possible" => possible_count += 1,
            _ => {}
        }
        *shape_kind_counts
            .entry(payload.selector_certainty_shape_kind.clone())
            .or_insert(0) += 1;
        *shape_label_counts
            .entry(payload.selector_certainty_shape_label.clone())
            .or_insert(0) += 1;

        if let Some(reason) = selector_certainty_reason(&payload) {
            *reason_counts.entry(reason).or_insert(0) += 1;
        } else {
            missing_reason_count += 1;
        }
    }

    CertaintyReasonEvidenceV0 {
        status: if expression_count == 0 {
            "gap"
        } else if missing_reason_count == 0 {
            "ready"
        } else {
            "partial"
        },
        expression_count,
        exact_count,
        inferred_count,
        possible_count,
        missing_reason_count,
        reason_counts,
        shape_kind_counts,
        shape_label_counts,
    }
}

fn selector_certainty_reason(
    payload: &ExpressionSemanticsEvaluatorCandidatePayloadV0,
) -> Option<String> {
    match payload.selector_certainty.as_str() {
        "exact" => {
            if payload.selector_names.len() == 1 {
                Some("single selector matched".to_string())
            } else {
                Some("selector set exactly matched the proven value domain".to_string())
            }
        }
        "inferred" => match payload.selector_constraint_kind.as_deref() {
            Some("prefix" | "suffix" | "prefixSuffix" | "charInclusion" | "composite") => {
                Some("constrained runtime shape matched a bounded selector set".to_string())
            }
            _ => Some("finite candidate values matched a bounded selector set".to_string()),
        },
        "possible" => {
            if payload.selector_names.is_empty() {
                Some("no selector could be proven for this value".to_string())
            } else {
                Some("analysis could not prove an exact selector set".to_string())
            }
        }
        _ => None,
    }
}
