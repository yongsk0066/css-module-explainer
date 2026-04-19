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

pub use expression_domain::summarize_expression_domain_fragments_input;
pub use expression_domain::summarize_expression_domain_plan_input;
pub use expression_semantics::summarize_expression_semantics_candidates_input;
pub use expression_semantics::summarize_expression_semantics_fragments_input;
pub use expression_semantics::summarize_expression_semantics_match_fragments_input;
pub use expression_semantics::summarize_expression_semantics_query_fragments_input;
pub use query_plan::summarize_query_plan_input;
pub use selector_usage::summarize_selector_usage_fragments_input;
pub use selector_usage::summarize_selector_usage_plan_input;
pub use selector_usage::summarize_selector_usage_query_fragments_input;
pub use source_resolution::summarize_source_resolution_candidates_input;
pub use source_resolution::summarize_source_resolution_fragments_input;
pub use source_resolution::summarize_source_resolution_match_fragments_input;
pub use source_resolution::summarize_source_resolution_plan_input;
pub use source_resolution::summarize_source_resolution_query_fragments_input;
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
    pub file_path: String,
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
    pub name: String,
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
pub struct ExpressionDomainFragmentV0 {
    pub expression_id: String,
    pub file_path: String,
    pub value_domain_kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value_constraint_kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value_prefix: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value_suffix: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value_min_len: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value_max_len: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value_char_must: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value_char_may: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value_may_include_other_chars: Option<bool>,
    pub finite_value_count: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExpressionDomainFragmentsV0 {
    pub schema_version: &'static str,
    pub input_version: String,
    pub fragments: Vec<ExpressionDomainFragmentV0>,
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
pub struct SelectorUsageFragmentV0 {
    pub ordinal: usize,
    pub view_kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub canonical_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub nested_safety: Option<String>,
    pub composes_count: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectorUsageFragmentsV0 {
    pub schema_version: &'static str,
    pub input_version: String,
    pub fragments: Vec<SelectorUsageFragmentV0>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectorUsageQueryFragmentV0 {
    pub query_id: String,
    pub canonical_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub nested_safety: Option<String>,
    pub composes_count: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectorUsageQueryFragmentsV0 {
    pub schema_version: &'static str,
    pub input_version: String,
    pub fragments: Vec<SelectorUsageQueryFragmentV0>,
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
pub struct SourceResolutionQueryFragmentV0 {
    pub query_id: String,
    pub expression_id: String,
    pub expression_kind: String,
    pub style_file_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceResolutionQueryFragmentsV0 {
    pub schema_version: &'static str,
    pub input_version: String,
    pub fragments: Vec<SourceResolutionQueryFragmentV0>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceResolutionMatchFragmentV0 {
    pub query_id: String,
    pub expression_id: String,
    pub style_file_path: String,
    pub selector_names: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub finite_values: Option<Vec<String>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceResolutionMatchFragmentsV0 {
    pub schema_version: &'static str,
    pub input_version: String,
    pub fragments: Vec<SourceResolutionMatchFragmentV0>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceResolutionCandidateV0 {
    pub query_id: String,
    pub expression_id: String,
    pub style_file_path: String,
    pub selector_names: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub finite_values: Option<Vec<String>>,
    pub value_certainty_shape_kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value_certainty_constraint_kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value_prefix: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value_suffix: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value_min_len: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value_max_len: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value_char_must: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value_char_may: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value_may_include_other_chars: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceResolutionCandidatesV0 {
    pub schema_version: &'static str,
    pub input_version: String,
    pub candidates: Vec<SourceResolutionCandidateV0>,
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
pub struct ExpressionSemanticsQueryFragmentV0 {
    pub query_id: String,
    pub expression_id: String,
    pub expression_kind: String,
    pub style_file_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExpressionSemanticsQueryFragmentsV0 {
    pub schema_version: &'static str,
    pub input_version: String,
    pub fragments: Vec<ExpressionSemanticsQueryFragmentV0>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExpressionSemanticsMatchFragmentV0 {
    pub query_id: String,
    pub expression_id: String,
    pub style_file_path: String,
    pub selector_names: Vec<String>,
    pub candidate_names: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub finite_values: Option<Vec<String>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExpressionSemanticsMatchFragmentsV0 {
    pub schema_version: &'static str,
    pub input_version: String,
    pub fragments: Vec<ExpressionSemanticsMatchFragmentV0>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExpressionSemanticsCandidateV0 {
    pub query_id: String,
    pub expression_id: String,
    pub expression_kind: String,
    pub style_file_path: String,
    pub selector_names: Vec<String>,
    pub candidate_names: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub finite_values: Option<Vec<String>>,
    pub value_domain_kind: String,
    pub selector_certainty_shape_kind: String,
    pub value_certainty_shape_kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub selector_constraint_kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value_certainty_constraint_kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value_constraint_kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value_prefix: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value_suffix: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value_min_len: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value_max_len: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value_char_must: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value_char_may: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value_may_include_other_chars: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExpressionSemanticsCandidatesV0 {
    pub schema_version: &'static str,
    pub input_version: String,
    pub candidates: Vec<ExpressionSemanticsCandidateV0>,
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

pub(crate) fn map_selector_certainty_shape_kind(
    facts: &StringTypeFactsV2,
    matched_selector_count: usize,
) -> String {
    if matched_selector_count == 0 {
        return "unknown".to_string();
    }

    match facts.kind.as_str() {
        "unknown" | "top" => "unknown".to_string(),
        "constrained" => "exact".to_string(),
        "exact" | "finiteSet" => "exact".to_string(),
        _ => "unknown".to_string(),
    }
}

pub(crate) fn finite_values_for_facts(facts: &StringTypeFactsV2) -> Option<Vec<String>> {
    match facts.kind.as_str() {
        "exact" | "finiteSet" => facts.values.clone(),
        _ => None,
    }
}

pub(crate) fn resolve_selector_names(
    style: &StyleAnalysisInputV2,
    facts: &StringTypeFactsV2,
) -> Vec<String> {
    match facts.kind.as_str() {
        "unknown" => Vec::new(),
        "top" => canonical_selector_names(style),
        "exact" | "finiteSet" => {
            let mut names = Vec::new();
            for value in facts.values.as_ref().into_iter().flatten() {
                push_canonical_match(style, value, &mut names);
            }
            names
        }
        "constrained" => resolve_constrained_selector_names(style, facts),
        _ => Vec::new(),
    }
}

fn resolve_constrained_selector_names(
    style: &StyleAnalysisInputV2,
    facts: &StringTypeFactsV2,
) -> Vec<String> {
    let mut names = Vec::new();

    for selector in &style.document.selectors {
        if !matches_selector_constraints(selector, facts) {
            continue;
        }
        let canonical_name = canonical_name_for_selector(style, selector);
        if let Some(canonical_name) = canonical_name
            && !names.contains(&canonical_name)
        {
            names.push(canonical_name);
        }
    }

    names
}

fn matches_selector_constraints(selector: &StyleSelectorV2, facts: &StringTypeFactsV2) -> bool {
    match facts.constraint_kind.as_deref() {
        Some("prefix") => facts
            .prefix
            .as_ref()
            .is_some_and(|prefix| selector.name.starts_with(prefix)),
        Some("suffix") => facts
            .suffix
            .as_ref()
            .is_some_and(|suffix| selector.name.ends_with(suffix)),
        Some("prefixSuffix") => {
            let prefix_ok = facts
                .prefix
                .as_ref()
                .is_none_or(|prefix| selector.name.starts_with(prefix));
            let suffix_ok = facts
                .suffix
                .as_ref()
                .is_none_or(|suffix| selector.name.ends_with(suffix));
            let min_len_ok = facts
                .min_len
                .is_none_or(|min_len| selector.name.len() >= min_len);
            let max_len_ok = facts
                .max_len
                .is_none_or(|max_len| selector.name.len() <= max_len);
            prefix_ok && suffix_ok && min_len_ok && max_len_ok
        }
        Some("charInclusion") => matches_char_constraints(
            &selector.name,
            facts.char_must.as_deref().unwrap_or(""),
            facts.char_may.as_deref().unwrap_or(""),
            facts.may_include_other_chars.unwrap_or(false),
        ),
        Some("composite") => {
            let prefix_ok = facts
                .prefix
                .as_ref()
                .is_none_or(|prefix| selector.name.starts_with(prefix));
            let suffix_ok = facts
                .suffix
                .as_ref()
                .is_none_or(|suffix| selector.name.ends_with(suffix));
            let min_len_ok = facts
                .min_len
                .is_none_or(|min_len| selector.name.len() >= min_len);
            let max_len_ok = facts
                .max_len
                .is_none_or(|max_len| selector.name.len() <= max_len);
            prefix_ok
                && suffix_ok
                && min_len_ok
                && max_len_ok
                && matches_char_constraints(
                    &selector.name,
                    facts.char_must.as_deref().unwrap_or(""),
                    facts.char_may.as_deref().unwrap_or(""),
                    facts.may_include_other_chars.unwrap_or(false),
                )
        }
        _ => false,
    }
}

fn matches_char_constraints(
    value: &str,
    must_chars: &str,
    may_chars: &str,
    may_include_other_chars: bool,
) -> bool {
    let value_chars: std::collections::BTreeSet<char> = value.chars().collect();
    let must_set: std::collections::BTreeSet<char> = must_chars.chars().collect();
    let may_set: std::collections::BTreeSet<char> = may_chars.chars().collect();

    if must_set.iter().any(|char| !value_chars.contains(char)) {
        return false;
    }
    if !may_include_other_chars && value_chars.iter().any(|char| !may_set.contains(char)) {
        return false;
    }
    true
}

fn push_canonical_match(style: &StyleAnalysisInputV2, view_name: &str, names: &mut Vec<String>) {
    if let Some(canonical_name) = canonical_name_for_view_name(style, view_name)
        && !names.contains(&canonical_name)
    {
        names.push(canonical_name);
    }
}

fn canonical_selector_names(style: &StyleAnalysisInputV2) -> Vec<String> {
    let mut names = Vec::new();
    for selector in &style.document.selectors {
        if selector.view_kind == "canonical"
            && let Some(canonical_name) = selector.canonical_name.clone()
            && !names.contains(&canonical_name)
        {
            names.push(canonical_name);
        }
    }
    names
}

fn canonical_name_for_selector(
    style: &StyleAnalysisInputV2,
    selector: &StyleSelectorV2,
) -> Option<String> {
    canonical_name_for_view_name(style, &selector.name)
}

fn canonical_name_for_view_name(style: &StyleAnalysisInputV2, view_name: &str) -> Option<String> {
    let matched = style
        .document
        .selectors
        .iter()
        .find(|selector| selector.name == view_name)?;
    let canonical = style.document.selectors.iter().find(|selector| {
        selector.view_kind == "canonical" && selector.canonical_name == matched.canonical_name
    });
    canonical
        .and_then(|selector| selector.canonical_name.clone())
        .or_else(|| matched.canonical_name.clone())
        .or_else(|| Some(matched.name.clone()))
}
