use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};

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

pub fn summarize_type_fact_input(input: &EngineInputV2) -> TypeFactInputSummaryV0 {
    let mut by_kind = BTreeMap::new();
    let mut constrained_kinds = BTreeMap::new();
    let mut files = BTreeSet::new();
    let mut finite_value_count = 0usize;

    for entry in &input.type_facts {
        let _ = &entry.expression_id;
        files.insert(entry.file_path.clone());
        *by_kind.entry(entry.facts.kind.clone()).or_insert(0) += 1;

        if let Some(values) = &entry.facts.values {
            finite_value_count += values.len();
        }

        if let Some(constraint_kind) = &entry.facts.constraint_kind {
            *constrained_kinds
                .entry(constraint_kind.clone())
                .or_insert(0) += 1;
        }
    }

    TypeFactInputSummaryV0 {
        schema_version: "0",
        input_version: input.version.clone(),
        type_fact_count: input.type_facts.len(),
        distinct_fact_files: files.len(),
        by_kind,
        constrained_kinds,
        finite_value_count,
    }
}

pub fn summarize_query_plan_input(input: &EngineInputV2) -> QueryPlanSummaryV0 {
    let expression_ids: Vec<String> = input
        .sources
        .iter()
        .flat_map(|source| source.document.class_expressions.iter())
        .map(|expression| expression.id.clone())
        .collect();
    let selector_usage_ids: Vec<String> = input
        .styles
        .iter()
        .flat_map(|style| style.document.selectors.iter())
        .filter(|selector| selector.view_kind == "canonical")
        .filter_map(|selector| selector.canonical_name.as_ref())
        .cloned()
        .collect();

    QueryPlanSummaryV0 {
        schema_version: "0",
        input_version: input.version.clone(),
        total_query_count: expression_ids.len() * 2 + selector_usage_ids.len(),
        expression_semantics_ids: expression_ids.clone(),
        source_expression_resolution_ids: expression_ids,
        selector_usage_ids,
    }
}

pub fn summarize_expression_domain_plan_input(
    input: &EngineInputV2,
) -> ExpressionDomainPlanSummaryV0 {
    let mut planned_expression_ids = Vec::new();
    let mut value_domain_kinds = BTreeMap::new();
    let mut value_constraint_kinds = BTreeMap::new();
    let mut constraint_detail_counts = ConstraintDetailCounts::default();
    let mut finite_value_count = 0usize;

    for entry in &input.type_facts {
        planned_expression_ids.push(entry.expression_id.clone());
        *value_domain_kinds
            .entry(entry.facts.kind.clone())
            .or_insert(0) += 1;

        if let Some(values) = &entry.facts.values {
            finite_value_count += values.len();
        }

        if let Some(constraint_kind) = &entry.facts.constraint_kind {
            *value_constraint_kinds
                .entry(constraint_kind.clone())
                .or_insert(0) += 1;
        }

        collect_constraint_detail_counts(
            &mut constraint_detail_counts,
            ConstraintDetailInput {
                prefix: entry.facts.prefix.as_ref(),
                suffix: entry.facts.suffix.as_ref(),
                min_len: entry.facts.min_len,
                max_len: entry.facts.max_len,
                char_must: entry.facts.char_must.as_ref(),
                char_may: entry.facts.char_may.as_ref(),
                may_include_other_chars: entry.facts.may_include_other_chars,
            },
        );
    }

    ExpressionDomainPlanSummaryV0 {
        schema_version: "0",
        input_version: input.version.clone(),
        planned_expression_ids,
        value_domain_kinds,
        value_constraint_kinds,
        constraint_detail_counts,
        finite_value_count,
    }
}

pub fn summarize_selector_usage_plan_input(input: &EngineInputV2) -> SelectorUsagePlanSummaryV0 {
    let mut canonical_selector_names = Vec::new();
    let mut view_kind_counts = BTreeMap::new();
    let mut nested_safety_counts = BTreeMap::new();
    let mut composed_selector_count = 0usize;
    let mut total_composes_refs = 0usize;

    for style in &input.styles {
        for selector in &style.document.selectors {
            *view_kind_counts
                .entry(selector.view_kind.clone())
                .or_insert(0) += 1;

            if let Some(nested_safety) = &selector.nested_safety {
                *nested_safety_counts
                    .entry(nested_safety.clone())
                    .or_insert(0) += 1;
            }

            let composes_len = selector.composes.as_ref().map_or(0, Vec::len);
            if composes_len > 0 {
                composed_selector_count += 1;
                total_composes_refs += composes_len;
            }

            if selector.view_kind == "canonical"
                && let Some(canonical_name) = &selector.canonical_name
            {
                canonical_selector_names.push(canonical_name.clone());
            }
        }
    }

    SelectorUsagePlanSummaryV0 {
        schema_version: "0",
        input_version: input.version.clone(),
        canonical_selector_names,
        view_kind_counts,
        nested_safety_counts,
        composed_selector_count,
        total_composes_refs,
    }
}

pub fn summarize_source_resolution_plan_input(
    input: &EngineInputV2,
) -> SourceResolutionPlanSummaryV0 {
    let mut planned_expression_ids = Vec::new();
    let mut expression_kind_counts = BTreeMap::new();
    let mut distinct_style_file_paths = BTreeSet::new();
    let mut symbol_ref_with_binding_count = 0usize;
    let mut style_access_count = 0usize;
    let mut style_access_path_depth_sum = 0usize;

    for source in &input.sources {
        for expression in &source.document.class_expressions {
            planned_expression_ids.push(expression.id.clone());
            distinct_style_file_paths.insert(expression.scss_module_path.clone());
            *expression_kind_counts
                .entry(expression.kind.clone())
                .or_insert(0) += 1;

            if expression.kind == "symbolRef" && expression.root_binding_decl_id.is_some() {
                symbol_ref_with_binding_count += 1;
            }

            if expression.kind == "styleAccess" {
                style_access_count += 1;
                style_access_path_depth_sum += expression.access_path.as_ref().map_or(0, Vec::len);
            }
        }
    }

    SourceResolutionPlanSummaryV0 {
        schema_version: "0",
        input_version: input.version.clone(),
        planned_expression_ids,
        expression_kind_counts,
        distinct_style_file_paths: distinct_style_file_paths.into_iter().collect(),
        symbol_ref_with_binding_count,
        style_access_count,
        style_access_path_depth_sum,
    }
}

pub fn summarize_expression_semantics_fragments_input(
    input: &EngineInputV2,
) -> ExpressionSemanticsFragmentsV0 {
    let mut expression_index = BTreeMap::new();

    for source in &input.sources {
        for expression in &source.document.class_expressions {
            expression_index.insert(expression.id.clone(), expression);
        }
    }

    let mut fragments = Vec::new();

    for entry in &input.type_facts {
        let Some(expression) = expression_index.get(&entry.expression_id) else {
            continue;
        };

        fragments.push(ExpressionSemanticsFragmentV0 {
            query_id: entry.expression_id.clone(),
            expression_id: entry.expression_id.clone(),
            expression_kind: expression.kind.clone(),
            style_file_path: expression.scss_module_path.clone(),
            value_domain_kind: map_expression_value_domain_kind(&entry.facts),
            value_constraint_kind: entry.facts.constraint_kind.clone(),
            value_prefix: entry.facts.prefix.clone(),
            value_suffix: entry.facts.suffix.clone(),
            value_min_len: entry.facts.min_len,
            value_max_len: entry.facts.max_len,
            value_char_must: entry.facts.char_must.clone(),
            value_char_may: entry.facts.char_may.clone(),
            value_may_include_other_chars: entry.facts.may_include_other_chars,
        });
    }

    fragments.sort_by(|a, b| a.query_id.cmp(&b.query_id));

    ExpressionSemanticsFragmentsV0 {
        schema_version: "0",
        input_version: input.version.clone(),
        fragments,
    }
}

pub fn summarize_source_resolution_fragments_input(
    input: &EngineInputV2,
) -> SourceResolutionFragmentsV0 {
    let mut expression_index = BTreeMap::new();

    for source in &input.sources {
        for expression in &source.document.class_expressions {
            expression_index.insert(expression.id.clone(), expression);
        }
    }

    let mut fragments = Vec::new();

    for entry in &input.type_facts {
        let Some(expression) = expression_index.get(&entry.expression_id) else {
            continue;
        };

        fragments.push(SourceResolutionFragmentV0 {
            query_id: entry.expression_id.clone(),
            expression_id: entry.expression_id.clone(),
            style_file_path: expression.scss_module_path.clone(),
            value_certainty_shape_kind: map_value_certainty_shape_kind(&entry.facts),
            value_certainty_constraint_kind: entry.facts.constraint_kind.clone(),
            value_prefix: entry.facts.prefix.clone(),
            value_suffix: entry.facts.suffix.clone(),
            value_min_len: entry.facts.min_len,
            value_max_len: entry.facts.max_len,
            value_char_must: entry.facts.char_must.clone(),
            value_char_may: entry.facts.char_may.clone(),
            value_may_include_other_chars: entry.facts.may_include_other_chars,
        });
    }

    fragments.sort_by(|a, b| a.query_id.cmp(&b.query_id));

    SourceResolutionFragmentsV0 {
        schema_version: "0",
        input_version: input.version.clone(),
        fragments,
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

fn map_expression_value_domain_kind(facts: &StringTypeFactsV2) -> String {
    match facts.kind.as_str() {
        "unknown" => "none".to_string(),
        other => other.to_string(),
    }
}

fn map_value_certainty_shape_kind(facts: &StringTypeFactsV2) -> String {
    match facts.kind.as_str() {
        "exact" => "exact".to_string(),
        "finiteSet" => "boundedFinite".to_string(),
        "constrained" => "constrained".to_string(),
        _ => "unknown".to_string(),
    }
}
