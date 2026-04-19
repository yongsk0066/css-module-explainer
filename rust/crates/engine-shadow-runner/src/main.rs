use std::collections::BTreeMap;
use std::env;
use std::io::{self, Read};

use engine_input_producers::{
    ConstraintDetailCounts, EngineInputV2, summarize_expression_domain_candidates_input,
    summarize_expression_domain_canonical_candidate_bundle_input,
    summarize_expression_domain_canonical_producer_signal_input,
    summarize_expression_domain_fragments_input, summarize_expression_domain_plan_input,
    summarize_expression_semantics_candidates_input,
    summarize_expression_semantics_canonical_candidate_bundle_input,
    summarize_expression_semantics_canonical_producer_signal_input,
    summarize_expression_semantics_evaluator_candidates_input,
    summarize_expression_semantics_fragments_input,
    summarize_expression_semantics_match_fragments_input,
    summarize_expression_semantics_query_fragments_input, summarize_query_plan_input,
    summarize_selector_usage_fragments_input, summarize_selector_usage_plan_input,
    summarize_selector_usage_query_fragments_input, summarize_source_resolution_candidates_input,
    summarize_source_resolution_canonical_candidate_bundle_input,
    summarize_source_resolution_canonical_producer_signal_input,
    summarize_source_resolution_evaluator_candidates_input,
    summarize_source_resolution_fragments_input, summarize_source_resolution_match_fragments_input,
    summarize_source_resolution_plan_input, summarize_source_resolution_query_fragments_input,
    summarize_source_side_canonical_candidate_bundle_input,
    summarize_source_side_canonical_producer_signal_input,
    summarize_source_side_evaluator_candidates_input, summarize_type_fact_input,
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ShadowPayloadV0 {
    input: EngineInputV2,
    output: EngineOutputV2,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EngineOutputV2 {
    query_results: Vec<QueryResultV2>,
    rewrite_plans: Vec<serde_json::Value>,
    checker_report: CheckerReportV1,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "kind")]
enum QueryResultV2 {
    #[serde(rename = "expression-semantics")]
    ExpressionSemantics {
        #[serde(rename = "queryId")]
        query_id: String,
        payload: ExpressionSemanticsPayloadV2,
    },
    #[serde(rename = "source-expression-resolution")]
    SourceExpressionResolution {
        #[serde(rename = "queryId")]
        query_id: String,
        payload: SourceExpressionResolutionPayloadV2,
    },
    #[serde(rename = "selector-usage")]
    SelectorUsage {
        #[serde(rename = "queryId")]
        query_id: String,
        payload: SelectorUsagePayloadV2,
    },
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExpressionSemanticsPayloadV2 {
    value_domain_kind: String,
    value_constraint_kind: Option<String>,
    value_prefix: Option<String>,
    value_suffix: Option<String>,
    value_min_len: Option<usize>,
    value_max_len: Option<usize>,
    value_char_must: Option<String>,
    value_char_may: Option<String>,
    value_may_include_other_chars: Option<bool>,
    value_certainty_shape_kind: Option<String>,
    selector_certainty_shape_kind: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SourceExpressionResolutionPayloadV2 {
    value_certainty_shape_kind: Option<String>,
    value_certainty_constraint_kind: Option<String>,
    value_prefix: Option<String>,
    value_suffix: Option<String>,
    value_min_len: Option<usize>,
    value_max_len: Option<usize>,
    value_char_must: Option<String>,
    value_char_may: Option<String>,
    value_may_include_other_chars: Option<bool>,
    selector_certainty_shape_kind: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SelectorUsagePayloadV2 {
    total_references: usize,
    direct_reference_count: usize,
    editable_direct_reference_count: usize,
    exact_reference_count: usize,
    inferred_or_better_reference_count: usize,
    has_expanded_references: bool,
    has_style_dependency_references: bool,
    has_any_references: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CheckerReportV1 {
    summary: CheckerReportSummaryV1,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CheckerReportSummaryV1 {
    warnings: usize,
    hints: usize,
    total: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ShadowSummaryV0 {
    schema_version: &'static str,
    input_version: String,
    source_count: usize,
    style_count: usize,
    type_fact_count: usize,
    distinct_fact_files: usize,
    by_kind: BTreeMap<String, usize>,
    constrained_kinds: BTreeMap<String, usize>,
    finite_value_count: usize,
    query_result_count: usize,
    query_kind_counts: BTreeMap<String, usize>,
    expression_value_domain_kinds: BTreeMap<String, usize>,
    expression_value_constraint_kinds: BTreeMap<String, usize>,
    expression_constraint_detail_counts: ConstraintDetailCounts,
    expression_value_certainty_shapes: BTreeMap<String, usize>,
    expression_selector_certainty_shapes: BTreeMap<String, usize>,
    resolution_value_constraint_kinds: BTreeMap<String, usize>,
    resolution_constraint_detail_counts: ConstraintDetailCounts,
    resolution_value_certainty_shapes: BTreeMap<String, usize>,
    resolution_selector_certainty_shapes: BTreeMap<String, usize>,
    selector_usage_referenced_count: usize,
    selector_usage_unreferenced_count: usize,
    selector_usage_total_references: usize,
    selector_usage_direct_references: usize,
    selector_usage_editable_direct_references: usize,
    selector_usage_exact_references: usize,
    selector_usage_inferred_or_better_references: usize,
    selector_usage_expanded_count: usize,
    selector_usage_style_dependency_count: usize,
    expected_expression_semantics_count: usize,
    expected_source_expression_resolution_count: usize,
    expected_selector_usage_count: usize,
    expected_total_query_count: usize,
    matched_expression_query_pairs: usize,
    missing_expression_semantics_count: usize,
    missing_source_expression_resolution_count: usize,
    unexpected_expression_semantics_count: usize,
    unexpected_source_expression_resolution_count: usize,
    matched_selector_usage_count: usize,
    missing_selector_usage_count: usize,
    unexpected_selector_usage_count: usize,
    rewrite_plan_count: usize,
    checker_warning_count: usize,
    checker_hint_count: usize,
    checker_total_findings: usize,
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mode = env::args().nth(1);
    let mut stdin = String::new();
    io::stdin().read_to_string(&mut stdin)?;

    match mode.as_deref() {
        None => {
            let payload: ShadowPayloadV0 = serde_json::from_str(&stdin)?;
            let summary = summarize(payload);
            serde_json::to_writer_pretty(io::stdout(), &summary)?;
        }
        Some("input-type-facts") => {
            let input: EngineInputV2 = serde_json::from_str(&stdin)?;
            let summary = summarize_type_fact_input(&input);
            serde_json::to_writer_pretty(io::stdout(), &summary)?;
        }
        Some("input-query-plan") => {
            let input: EngineInputV2 = serde_json::from_str(&stdin)?;
            let summary = summarize_query_plan_input(&input);
            serde_json::to_writer_pretty(io::stdout(), &summary)?;
        }
        Some("input-expression-domains") => {
            let input: EngineInputV2 = serde_json::from_str(&stdin)?;
            let summary = summarize_expression_domain_plan_input(&input);
            serde_json::to_writer_pretty(io::stdout(), &summary)?;
        }
        Some("input-expression-domain-fragments") => {
            let input: EngineInputV2 = serde_json::from_str(&stdin)?;
            let summary = summarize_expression_domain_fragments_input(&input);
            serde_json::to_writer_pretty(io::stdout(), &summary)?;
        }
        Some("input-expression-domain-candidates") => {
            let input: EngineInputV2 = serde_json::from_str(&stdin)?;
            let summary = summarize_expression_domain_candidates_input(&input);
            serde_json::to_writer_pretty(io::stdout(), &summary)?;
        }
        Some("input-expression-domain-canonical-candidate") => {
            let input: EngineInputV2 = serde_json::from_str(&stdin)?;
            let summary = summarize_expression_domain_canonical_candidate_bundle_input(&input);
            serde_json::to_writer_pretty(io::stdout(), &summary)?;
        }
        Some("input-expression-domain-canonical-producer") => {
            let input: EngineInputV2 = serde_json::from_str(&stdin)?;
            let summary = summarize_expression_domain_canonical_producer_signal_input(&input);
            serde_json::to_writer_pretty(io::stdout(), &summary)?;
        }
        Some("input-selector-usage-plan") => {
            let input: EngineInputV2 = serde_json::from_str(&stdin)?;
            let summary = summarize_selector_usage_plan_input(&input);
            serde_json::to_writer_pretty(io::stdout(), &summary)?;
        }
        Some("input-selector-usage-fragments") => {
            let input: EngineInputV2 = serde_json::from_str(&stdin)?;
            let summary = summarize_selector_usage_fragments_input(&input);
            serde_json::to_writer_pretty(io::stdout(), &summary)?;
        }
        Some("input-selector-usage-query-fragments") => {
            let input: EngineInputV2 = serde_json::from_str(&stdin)?;
            let summary = summarize_selector_usage_query_fragments_input(&input);
            serde_json::to_writer_pretty(io::stdout(), &summary)?;
        }
        Some("input-source-resolution-plan") => {
            let input: EngineInputV2 = serde_json::from_str(&stdin)?;
            let summary = summarize_source_resolution_plan_input(&input);
            serde_json::to_writer_pretty(io::stdout(), &summary)?;
        }
        Some("input-expression-semantics-fragments") => {
            let input: EngineInputV2 = serde_json::from_str(&stdin)?;
            let summary = summarize_expression_semantics_fragments_input(&input);
            serde_json::to_writer_pretty(io::stdout(), &summary)?;
        }
        Some("input-expression-semantics-candidates") => {
            let input: EngineInputV2 = serde_json::from_str(&stdin)?;
            let summary = summarize_expression_semantics_candidates_input(&input);
            serde_json::to_writer_pretty(io::stdout(), &summary)?;
        }
        Some("input-expression-semantics-evaluator-candidates") => {
            let input: EngineInputV2 = serde_json::from_str(&stdin)?;
            let summary = summarize_expression_semantics_evaluator_candidates_input(&input);
            serde_json::to_writer_pretty(io::stdout(), &summary)?;
        }
        Some("input-expression-semantics-canonical-candidate") => {
            let input: EngineInputV2 = serde_json::from_str(&stdin)?;
            let summary = summarize_expression_semantics_canonical_candidate_bundle_input(&input);
            serde_json::to_writer_pretty(io::stdout(), &summary)?;
        }
        Some("input-expression-semantics-canonical-producer") => {
            let input: EngineInputV2 = serde_json::from_str(&stdin)?;
            let summary = summarize_expression_semantics_canonical_producer_signal_input(&input);
            serde_json::to_writer_pretty(io::stdout(), &summary)?;
        }
        Some("input-source-side-canonical-producer") => {
            let input: EngineInputV2 = serde_json::from_str(&stdin)?;
            let summary = summarize_source_side_canonical_producer_signal_input(&input);
            serde_json::to_writer_pretty(io::stdout(), &summary)?;
        }
        Some("input-source-side-canonical-candidate") => {
            let input: EngineInputV2 = serde_json::from_str(&stdin)?;
            let summary = summarize_source_side_canonical_candidate_bundle_input(&input);
            serde_json::to_writer_pretty(io::stdout(), &summary)?;
        }
        Some("input-source-side-evaluator-candidates") => {
            let input: EngineInputV2 = serde_json::from_str(&stdin)?;
            let summary = summarize_source_side_evaluator_candidates_input(&input);
            serde_json::to_writer_pretty(io::stdout(), &summary)?;
        }
        Some("input-expression-semantics-query-fragments") => {
            let input: EngineInputV2 = serde_json::from_str(&stdin)?;
            let summary = summarize_expression_semantics_query_fragments_input(&input);
            serde_json::to_writer_pretty(io::stdout(), &summary)?;
        }
        Some("input-expression-semantics-match-fragments") => {
            let input: EngineInputV2 = serde_json::from_str(&stdin)?;
            let summary = summarize_expression_semantics_match_fragments_input(&input);
            serde_json::to_writer_pretty(io::stdout(), &summary)?;
        }
        Some("input-source-resolution-fragments") => {
            let input: EngineInputV2 = serde_json::from_str(&stdin)?;
            let summary = summarize_source_resolution_fragments_input(&input);
            serde_json::to_writer_pretty(io::stdout(), &summary)?;
        }
        Some("input-source-resolution-candidates") => {
            let input: EngineInputV2 = serde_json::from_str(&stdin)?;
            let summary = summarize_source_resolution_candidates_input(&input);
            serde_json::to_writer_pretty(io::stdout(), &summary)?;
        }
        Some("input-source-resolution-evaluator-candidates") => {
            let input: EngineInputV2 = serde_json::from_str(&stdin)?;
            let summary = summarize_source_resolution_evaluator_candidates_input(&input);
            serde_json::to_writer_pretty(io::stdout(), &summary)?;
        }
        Some("input-source-resolution-canonical-candidate") => {
            let input: EngineInputV2 = serde_json::from_str(&stdin)?;
            let summary = summarize_source_resolution_canonical_candidate_bundle_input(&input);
            serde_json::to_writer_pretty(io::stdout(), &summary)?;
        }
        Some("input-source-resolution-canonical-producer") => {
            let input: EngineInputV2 = serde_json::from_str(&stdin)?;
            let summary = summarize_source_resolution_canonical_producer_signal_input(&input);
            serde_json::to_writer_pretty(io::stdout(), &summary)?;
        }
        Some("input-source-resolution-match-fragments") => {
            let input: EngineInputV2 = serde_json::from_str(&stdin)?;
            let summary = summarize_source_resolution_match_fragments_input(&input);
            serde_json::to_writer_pretty(io::stdout(), &summary)?;
        }
        Some("input-source-resolution-query-fragments") => {
            let input: EngineInputV2 = serde_json::from_str(&stdin)?;
            let summary = summarize_source_resolution_query_fragments_input(&input);
            serde_json::to_writer_pretty(io::stdout(), &summary)?;
        }
        Some(other) => {
            return Err(format!("unsupported engine-shadow-runner mode: {other}").into());
        }
    }

    Ok(())
}

fn summarize(payload: ShadowPayloadV0) -> ShadowSummaryV0 {
    let mut query_kind_counts = BTreeMap::new();
    let mut expression_value_domain_kinds = BTreeMap::new();
    let mut expression_value_constraint_kinds = BTreeMap::new();
    let mut expression_constraint_detail_counts = ConstraintDetailCounts::default();
    let mut expression_value_certainty_shapes = BTreeMap::new();
    let mut expression_selector_certainty_shapes = BTreeMap::new();
    let mut resolution_value_constraint_kinds = BTreeMap::new();
    let mut resolution_constraint_detail_counts = ConstraintDetailCounts::default();
    let mut resolution_value_certainty_shapes = BTreeMap::new();
    let mut resolution_selector_certainty_shapes = BTreeMap::new();
    let mut selector_usage_referenced_count = 0usize;
    let mut selector_usage_unreferenced_count = 0usize;
    let mut selector_usage_total_references = 0usize;
    let mut selector_usage_direct_references = 0usize;
    let mut selector_usage_editable_direct_references = 0usize;
    let mut selector_usage_exact_references = 0usize;
    let mut selector_usage_inferred_or_better_references = 0usize;
    let mut selector_usage_expanded_count = 0usize;
    let mut selector_usage_style_dependency_count = 0usize;
    let input = payload.input;
    let output = payload.output;
    let type_fact_summary = summarize_type_fact_input(&input);
    let expected_expression_ids: std::collections::BTreeSet<String> = input
        .sources
        .iter()
        .flat_map(|source| source.document.class_expressions.iter())
        .map(|expression| expression.id.clone())
        .collect();
    let expected_selector_usage_ids: std::collections::BTreeSet<String> = input
        .styles
        .iter()
        .flat_map(|style| style.document.selectors.iter())
        .filter(|selector| selector.view_kind == "canonical")
        .filter_map(|selector| selector.canonical_name.as_ref())
        .map(|name| name.to_string())
        .collect();
    let mut expression_semantics_ids = std::collections::BTreeSet::new();
    let mut resolution_ids = std::collections::BTreeSet::new();
    let mut selector_usage_ids = std::collections::BTreeSet::new();
    let expected_expression_semantics_count: usize = input
        .sources
        .iter()
        .map(|source| source.document.class_expressions.len())
        .sum();
    let expected_source_expression_resolution_count = expected_expression_semantics_count;
    let expected_selector_usage_count: usize = input
        .styles
        .iter()
        .map(|style| {
            style
                .document
                .selectors
                .iter()
                .filter(|selector| selector.view_kind == "canonical")
                .count()
        })
        .sum();
    let expected_total_query_count = expected_expression_semantics_count
        + expected_source_expression_resolution_count
        + expected_selector_usage_count;

    for query in &output.query_results {
        match query {
            QueryResultV2::ExpressionSemantics { query_id, payload } => {
                *query_kind_counts
                    .entry("expression-semantics".to_string())
                    .or_insert(0) += 1;
                expression_semantics_ids.insert(query_id.clone());
                *expression_value_domain_kinds
                    .entry(payload.value_domain_kind.clone())
                    .or_insert(0) += 1;

                if let Some(constraint_kind) = &payload.value_constraint_kind {
                    *expression_value_constraint_kinds
                        .entry(constraint_kind.clone())
                        .or_insert(0) += 1;
                }
                collect_constraint_detail_counts(
                    &mut expression_constraint_detail_counts,
                    ConstraintDetailInput {
                        prefix: payload.value_prefix.as_ref(),
                        suffix: payload.value_suffix.as_ref(),
                        min_len: payload.value_min_len,
                        max_len: payload.value_max_len,
                        char_must: payload.value_char_must.as_ref(),
                        char_may: payload.value_char_may.as_ref(),
                        may_include_other_chars: payload.value_may_include_other_chars,
                    },
                );

                if let Some(shape_kind) = &payload.value_certainty_shape_kind {
                    *expression_value_certainty_shapes
                        .entry(shape_kind.clone())
                        .or_insert(0) += 1;
                }

                if let Some(shape_kind) = &payload.selector_certainty_shape_kind {
                    *expression_selector_certainty_shapes
                        .entry(shape_kind.clone())
                        .or_insert(0) += 1;
                }
            }
            QueryResultV2::SourceExpressionResolution { query_id, payload } => {
                *query_kind_counts
                    .entry("source-expression-resolution".to_string())
                    .or_insert(0) += 1;
                resolution_ids.insert(query_id.clone());

                if let Some(constraint_kind) = &payload.value_certainty_constraint_kind {
                    *resolution_value_constraint_kinds
                        .entry(constraint_kind.clone())
                        .or_insert(0) += 1;
                }
                collect_constraint_detail_counts(
                    &mut resolution_constraint_detail_counts,
                    ConstraintDetailInput {
                        prefix: payload.value_prefix.as_ref(),
                        suffix: payload.value_suffix.as_ref(),
                        min_len: payload.value_min_len,
                        max_len: payload.value_max_len,
                        char_must: payload.value_char_must.as_ref(),
                        char_may: payload.value_char_may.as_ref(),
                        may_include_other_chars: payload.value_may_include_other_chars,
                    },
                );

                if let Some(shape_kind) = &payload.value_certainty_shape_kind {
                    *resolution_value_certainty_shapes
                        .entry(shape_kind.clone())
                        .or_insert(0) += 1;
                }

                if let Some(shape_kind) = &payload.selector_certainty_shape_kind {
                    *resolution_selector_certainty_shapes
                        .entry(shape_kind.clone())
                        .or_insert(0) += 1;
                }
            }
            QueryResultV2::SelectorUsage { query_id, payload } => {
                *query_kind_counts
                    .entry("selector-usage".to_string())
                    .or_insert(0) += 1;
                selector_usage_ids.insert(query_id.clone());

                selector_usage_total_references += payload.total_references;
                selector_usage_direct_references += payload.direct_reference_count;
                selector_usage_editable_direct_references +=
                    payload.editable_direct_reference_count;
                selector_usage_exact_references += payload.exact_reference_count;
                selector_usage_inferred_or_better_references +=
                    payload.inferred_or_better_reference_count;

                if payload.has_expanded_references {
                    selector_usage_expanded_count += 1;
                }
                if payload.has_style_dependency_references {
                    selector_usage_style_dependency_count += 1;
                }
                if payload.has_any_references {
                    selector_usage_referenced_count += 1;
                } else {
                    selector_usage_unreferenced_count += 1;
                }
            }
        }
    }

    let matched_expression_query_pairs = expected_expression_ids
        .iter()
        .filter(|id| expression_semantics_ids.contains(*id) && resolution_ids.contains(*id))
        .count();
    let missing_expression_semantics_count = expected_expression_ids
        .iter()
        .filter(|id| !expression_semantics_ids.contains(*id))
        .count();
    let missing_source_expression_resolution_count = expected_expression_ids
        .iter()
        .filter(|id| !resolution_ids.contains(*id))
        .count();
    let unexpected_expression_semantics_count = expression_semantics_ids
        .iter()
        .filter(|id| !expected_expression_ids.contains(*id))
        .count();
    let unexpected_source_expression_resolution_count = resolution_ids
        .iter()
        .filter(|id| !expected_expression_ids.contains(*id))
        .count();
    let matched_selector_usage_count = expected_selector_usage_ids
        .iter()
        .filter(|id| selector_usage_ids.contains(*id))
        .count();
    let missing_selector_usage_count = expected_selector_usage_ids
        .iter()
        .filter(|id| !selector_usage_ids.contains(*id))
        .count();
    let unexpected_selector_usage_count = selector_usage_ids
        .iter()
        .filter(|id| !expected_selector_usage_ids.contains(*id))
        .count();

    ShadowSummaryV0 {
        schema_version: "0",
        input_version: type_fact_summary.input_version,
        source_count: input.sources.len(),
        style_count: input.styles.len(),
        type_fact_count: type_fact_summary.type_fact_count,
        distinct_fact_files: type_fact_summary.distinct_fact_files,
        by_kind: type_fact_summary.by_kind,
        constrained_kinds: type_fact_summary.constrained_kinds,
        finite_value_count: type_fact_summary.finite_value_count,
        query_result_count: output.query_results.len(),
        query_kind_counts,
        expression_value_domain_kinds,
        expression_value_constraint_kinds,
        expression_constraint_detail_counts,
        expression_value_certainty_shapes,
        expression_selector_certainty_shapes,
        resolution_value_constraint_kinds,
        resolution_constraint_detail_counts,
        resolution_value_certainty_shapes,
        resolution_selector_certainty_shapes,
        selector_usage_referenced_count,
        selector_usage_unreferenced_count,
        selector_usage_total_references,
        selector_usage_direct_references,
        selector_usage_editable_direct_references,
        selector_usage_exact_references,
        selector_usage_inferred_or_better_references,
        selector_usage_expanded_count,
        selector_usage_style_dependency_count,
        expected_expression_semantics_count,
        expected_source_expression_resolution_count,
        expected_selector_usage_count,
        expected_total_query_count,
        matched_expression_query_pairs,
        missing_expression_semantics_count,
        missing_source_expression_resolution_count,
        unexpected_expression_semantics_count,
        unexpected_source_expression_resolution_count,
        matched_selector_usage_count,
        missing_selector_usage_count,
        unexpected_selector_usage_count,
        rewrite_plan_count: output.rewrite_plans.len(),
        checker_warning_count: output.checker_report.summary.warnings,
        checker_hint_count: output.checker_report.summary.hints,
        checker_total_findings: output.checker_report.summary.total,
    }
}

fn collect_constraint_detail_counts(
    counts: &mut ConstraintDetailCounts,
    details: ConstraintDetailInput<'_>,
) {
    if details.prefix.is_some() {
        counts.prefix_count += 1;
    }
    if details.suffix.is_some() {
        counts.suffix_count += 1;
    }
    if let Some(value) = details.min_len {
        counts.min_len_count += 1;
        counts.min_len_sum += value;
    }
    if let Some(value) = details.max_len {
        counts.max_len_count += 1;
        counts.max_len_sum += value;
    }
    if let Some(value) = details.char_must {
        counts.char_must_count += 1;
        counts.char_must_len_sum += value.len();
    }
    if let Some(value) = details.char_may {
        counts.char_may_count += 1;
        counts.char_may_len_sum += value.len();
    }
    if details.may_include_other_chars == Some(true) {
        counts.may_include_other_chars_count += 1;
    }
}

struct ConstraintDetailInput<'a> {
    prefix: Option<&'a String>,
    suffix: Option<&'a String>,
    min_len: Option<usize>,
    max_len: Option<usize>,
    char_must: Option<&'a String>,
    char_may: Option<&'a String>,
    may_include_other_chars: Option<bool>,
}
