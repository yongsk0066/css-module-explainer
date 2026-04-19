use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

mod expression_domain;
mod expression_semantics;
mod query_plan;
mod selector_usage;
mod source_resolution;
#[cfg(test)]
mod test_support;
mod type_facts;

pub use expression_domain::summarize_expression_domain_plan_input;
pub use expression_semantics::summarize_expression_semantics_fragments_input;
pub use query_plan::summarize_query_plan_input;
pub use selector_usage::summarize_selector_usage_plan_input;
pub use source_resolution::summarize_source_resolution_fragments_input;
pub use source_resolution::summarize_source_resolution_plan_input;
pub use type_facts::summarize_type_fact_input;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineInputV2 {
    pub version: String,
    pub sources: Vec<SourceAnalysisInputV2>,
    pub styles: Vec<StyleAnalysisInputV2>,
    pub type_facts: Vec<TypeFactEntryV2>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceAnalysisInputV2 {
    pub document: SourceDocumentV2,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceDocumentV2 {
    pub class_expressions: Vec<ClassExpressionInputV2>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClassExpressionInputV2 {
    pub id: String,
    pub kind: String,
    pub scss_module_path: String,
    pub root_binding_decl_id: Option<String>,
    pub access_path: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StyleAnalysisInputV2 {
    pub document: StyleDocumentV2,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StyleDocumentV2 {
    pub selectors: Vec<StyleSelectorV2>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StyleSelectorV2 {
    pub view_kind: String,
    pub canonical_name: Option<String>,
    pub nested_safety: Option<String>,
    pub composes: Option<Vec<serde_json::Value>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TypeFactEntryV2 {
    pub file_path: String,
    pub expression_id: String,
    pub facts: StringTypeFactsV2,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StringTypeFactsV2 {
    pub kind: String,
    pub constraint_kind: Option<String>,
    pub values: Option<Vec<String>>,
    pub prefix: Option<String>,
    pub suffix: Option<String>,
    pub min_len: Option<usize>,
    pub max_len: Option<usize>,
    pub char_must: Option<String>,
    pub char_may: Option<String>,
    pub may_include_other_chars: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TypeFactInputSummaryV0 {
    pub schema_version: &'static str,
    pub input_version: String,
    pub type_fact_count: usize,
    pub distinct_fact_files: usize,
    pub by_kind: BTreeMap<String, usize>,
    pub constrained_kinds: BTreeMap<String, usize>,
    pub finite_value_count: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryPlanSummaryV0 {
    schema_version: &'static str,
    input_version: String,
    expression_semantics_ids: Vec<String>,
    source_expression_resolution_ids: Vec<String>,
    selector_usage_ids: Vec<String>,
    total_query_count: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExpressionDomainPlanSummaryV0 {
    schema_version: &'static str,
    input_version: String,
    planned_expression_ids: Vec<String>,
    value_domain_kinds: BTreeMap<String, usize>,
    value_constraint_kinds: BTreeMap<String, usize>,
    constraint_detail_counts: ConstraintDetailCounts,
    finite_value_count: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectorUsagePlanSummaryV0 {
    schema_version: &'static str,
    input_version: String,
    canonical_selector_names: Vec<String>,
    view_kind_counts: BTreeMap<String, usize>,
    nested_safety_counts: BTreeMap<String, usize>,
    composed_selector_count: usize,
    total_composes_refs: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceResolutionPlanSummaryV0 {
    schema_version: &'static str,
    input_version: String,
    planned_expression_ids: Vec<String>,
    expression_kind_counts: BTreeMap<String, usize>,
    distinct_style_file_paths: Vec<String>,
    symbol_ref_with_binding_count: usize,
    style_access_count: usize,
    style_access_path_depth_sum: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExpressionSemanticsFragmentV0 {
    query_id: String,
    expression_id: String,
    expression_kind: String,
    style_file_path: String,
    value_domain_kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    value_constraint_kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    value_prefix: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    value_suffix: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    value_min_len: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    value_max_len: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    value_char_must: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    value_char_may: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    value_may_include_other_chars: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExpressionSemanticsFragmentsV0 {
    schema_version: &'static str,
    input_version: String,
    fragments: Vec<ExpressionSemanticsFragmentV0>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceResolutionFragmentV0 {
    query_id: String,
    expression_id: String,
    style_file_path: String,
    value_certainty_shape_kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    value_certainty_constraint_kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    value_prefix: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    value_suffix: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    value_min_len: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    value_max_len: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    value_char_must: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    value_char_may: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    value_may_include_other_chars: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceResolutionFragmentsV0 {
    schema_version: &'static str,
    input_version: String,
    fragments: Vec<SourceResolutionFragmentV0>,
}

#[derive(Debug, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ConstraintDetailCounts {
    pub prefix_count: usize,
    pub suffix_count: usize,
    pub min_len_count: usize,
    pub min_len_sum: usize,
    pub max_len_count: usize,
    pub max_len_sum: usize,
    pub char_must_count: usize,
    pub char_must_len_sum: usize,
    pub char_may_count: usize,
    pub char_may_len_sum: usize,
    pub may_include_other_chars_count: usize,
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

pub(crate) struct ConstraintDetailInput<'a> {
    pub(crate) prefix: Option<&'a String>,
    pub(crate) suffix: Option<&'a String>,
    pub(crate) min_len: Option<usize>,
    pub(crate) max_len: Option<usize>,
    pub(crate) char_must: Option<&'a String>,
    pub(crate) char_may: Option<&'a String>,
    pub(crate) may_include_other_chars: Option<bool>,
}

pub(crate) fn map_expression_value_domain_kind(facts: &StringTypeFactsV2) -> String {
    match facts.kind.as_str() {
        "unknown" => "none".to_string(),
        other => other.to_string(),
    }
}

pub(crate) fn map_value_certainty_shape_kind(facts: &StringTypeFactsV2) -> String {
    match facts.kind.as_str() {
        "exact" => "exact".to_string(),
        "finiteSet" => "boundedFinite".to_string(),
        "constrained" => "constrained".to_string(),
        _ => "unknown".to_string(),
    }
}
