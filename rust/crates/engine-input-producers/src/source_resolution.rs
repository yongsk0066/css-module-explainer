use std::collections::{BTreeMap, BTreeSet};

use crate::{
    EngineInputV2, SourceResolutionCandidateV0, SourceResolutionCandidatesV0,
    SourceResolutionFragmentV0, SourceResolutionFragmentsV0, SourceResolutionMatchFragmentV0,
    SourceResolutionMatchFragmentsV0, SourceResolutionPlanSummaryV0,
    SourceResolutionQueryFragmentV0, SourceResolutionQueryFragmentsV0, finite_values_for_facts,
    map_selector_certainty_shape_kind, map_value_certainty_shape_kind, resolve_selector_names,
};

pub fn summarize_source_resolution_candidates_input(
    input: &EngineInputV2,
) -> SourceResolutionCandidatesV0 {
    let mut expression_index = BTreeMap::new();
    let mut style_index = BTreeMap::new();

    for source in &input.sources {
        for expression in &source.document.class_expressions {
            expression_index.insert(expression.id.clone(), expression);
        }
    }

    for style in &input.styles {
        style_index.insert(style.file_path.clone(), style);
    }

    let mut candidates = Vec::new();

    for entry in &input.type_facts {
        let Some(expression) = expression_index.get(&entry.expression_id) else {
            continue;
        };
        let Some(style) = style_index.get(&expression.scss_module_path) else {
            continue;
        };
        let selector_names = resolve_selector_names(style, &entry.facts);
        let selector_certainty_shape_kind =
            map_selector_certainty_shape_kind(&entry.facts, selector_names.len());

        candidates.push(SourceResolutionCandidateV0 {
            query_id: entry.expression_id.clone(),
            expression_id: entry.expression_id.clone(),
            style_file_path: expression.scss_module_path.clone(),
            selector_names,
            finite_values: finite_values_for_facts(&entry.facts),
            selector_certainty_shape_kind,
            value_certainty_shape_kind: map_value_certainty_shape_kind(&entry.facts),
            selector_constraint_kind: entry.facts.constraint_kind.clone(),
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

    candidates.sort_by(|a, b| a.query_id.cmp(&b.query_id));

    SourceResolutionCandidatesV0 {
        schema_version: "0",
        input_version: input.version.clone(),
        candidates,
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

pub fn summarize_source_resolution_query_fragments_input(
    input: &EngineInputV2,
) -> SourceResolutionQueryFragmentsV0 {
    let mut fragments = Vec::new();

    for source in &input.sources {
        for expression in &source.document.class_expressions {
            fragments.push(SourceResolutionQueryFragmentV0 {
                query_id: expression.id.clone(),
                expression_id: expression.id.clone(),
                expression_kind: expression.kind.clone(),
                style_file_path: expression.scss_module_path.clone(),
            });
        }
    }

    fragments.sort_by(|a, b| a.query_id.cmp(&b.query_id));

    SourceResolutionQueryFragmentsV0 {
        schema_version: "0",
        input_version: input.version.clone(),
        fragments,
    }
}

pub fn summarize_source_resolution_match_fragments_input(
    input: &EngineInputV2,
) -> SourceResolutionMatchFragmentsV0 {
    let mut expression_index = BTreeMap::new();
    let mut style_index = BTreeMap::new();

    for source in &input.sources {
        for expression in &source.document.class_expressions {
            expression_index.insert(expression.id.clone(), expression);
        }
    }

    for style in &input.styles {
        style_index.insert(style.file_path.clone(), style);
    }

    let mut fragments = Vec::new();

    for entry in &input.type_facts {
        let Some(expression) = expression_index.get(&entry.expression_id) else {
            continue;
        };
        let Some(style) = style_index.get(&expression.scss_module_path) else {
            continue;
        };

        fragments.push(SourceResolutionMatchFragmentV0 {
            query_id: entry.expression_id.clone(),
            expression_id: entry.expression_id.clone(),
            style_file_path: expression.scss_module_path.clone(),
            selector_names: resolve_selector_names(style, &entry.facts),
            finite_values: finite_values_for_facts(&entry.facts),
        });
    }

    fragments.sort_by(|a, b| a.query_id.cmp(&b.query_id));

    SourceResolutionMatchFragmentsV0 {
        schema_version: "0",
        input_version: input.version.clone(),
        fragments,
    }
}

#[cfg(test)]
mod tests {
    use super::{
        summarize_source_resolution_candidates_input, summarize_source_resolution_fragments_input,
        summarize_source_resolution_match_fragments_input, summarize_source_resolution_plan_input,
        summarize_source_resolution_query_fragments_input,
    };
    use crate::test_support::sample_input;

    #[test]
    fn builds_source_resolution_fragment_from_type_fact() {
        let summary = summarize_source_resolution_fragments_input(&sample_input());

        assert_eq!(summary.fragments.len(), 2);
        let first = &summary.fragments[0];
        assert_eq!(first.query_id, "expr-1");
        assert_eq!(first.style_file_path, "/tmp/App.module.scss");
        assert_eq!(first.value_certainty_shape_kind, "constrained");
        assert_eq!(
            first.value_certainty_constraint_kind.as_deref(),
            Some("prefixSuffix")
        );

        let second = &summary.fragments[1];
        assert_eq!(second.query_id, "expr-2");
        assert_eq!(second.expression_id, "expr-2");
        assert_eq!(second.style_file_path, "/tmp/Card.module.scss");
        assert_eq!(second.value_certainty_shape_kind, "boundedFinite");
        assert!(second.value_certainty_constraint_kind.is_none());
    }

    #[test]
    fn builds_source_resolution_plan_from_input() {
        let summary = summarize_source_resolution_plan_input(&sample_input());

        assert_eq!(
            summary.planned_expression_ids,
            vec!["expr-1".to_string(), "expr-2".to_string()]
        );
        assert_eq!(
            summary.distinct_style_file_paths,
            vec![
                "/tmp/App.module.scss".to_string(),
                "/tmp/Card.module.scss".to_string()
            ]
        );
        assert_eq!(summary.symbol_ref_with_binding_count, 1);
        assert_eq!(summary.style_access_count, 1);
        assert_eq!(summary.style_access_path_depth_sum, 2);
    }

    #[test]
    fn builds_source_resolution_query_fragments_from_input() {
        let summary = summarize_source_resolution_query_fragments_input(&sample_input());

        assert_eq!(summary.fragments.len(), 2);
        let first = &summary.fragments[0];
        assert_eq!(first.query_id, "expr-1");
        assert_eq!(first.expression_id, "expr-1");
        assert_eq!(first.expression_kind, "symbolRef");
        assert_eq!(first.style_file_path, "/tmp/App.module.scss");

        let second = &summary.fragments[1];
        assert_eq!(second.query_id, "expr-2");
        assert_eq!(second.expression_kind, "styleAccess");
        assert_eq!(second.style_file_path, "/tmp/Card.module.scss");
    }

    #[test]
    fn builds_source_resolution_match_fragments_from_input() {
        let summary = summarize_source_resolution_match_fragments_input(&sample_input());

        assert_eq!(summary.fragments.len(), 2);
        let first = &summary.fragments[0];
        assert_eq!(first.query_id, "expr-1");
        assert_eq!(first.expression_id, "expr-1");
        assert_eq!(first.style_file_path, "/tmp/App.module.scss");
        assert_eq!(first.selector_names, vec!["btn-active".to_string()]);
        assert!(first.finite_values.is_none());

        let second = &summary.fragments[1];
        assert_eq!(second.query_id, "expr-2");
        assert_eq!(second.style_file_path, "/tmp/Card.module.scss");
        assert_eq!(second.selector_names, vec!["card-header".to_string()]);
        assert_eq!(
            second.finite_values,
            Some(vec!["card-header".to_string(), "card-body".to_string()])
        );
    }

    #[test]
    fn builds_source_resolution_candidates_from_input() {
        let summary = summarize_source_resolution_candidates_input(&sample_input());

        assert_eq!(summary.candidates.len(), 2);
        let first = &summary.candidates[0];
        assert_eq!(first.query_id, "expr-1");
        assert_eq!(first.expression_id, "expr-1");
        assert_eq!(first.style_file_path, "/tmp/App.module.scss");
        assert_eq!(first.selector_names, vec!["btn-active".to_string()]);
        assert_eq!(first.selector_certainty_shape_kind, "exact");
        assert_eq!(first.selector_constraint_kind.as_deref(), Some("prefixSuffix"));
        assert_eq!(first.value_certainty_shape_kind, "constrained");
        assert_eq!(
            first.value_certainty_constraint_kind.as_deref(),
            Some("prefixSuffix")
        );

        let second = &summary.candidates[1];
        assert_eq!(second.query_id, "expr-2");
        assert_eq!(second.selector_names, vec!["card-header".to_string()]);
        assert_eq!(second.selector_certainty_shape_kind, "exact");
        assert_eq!(second.value_certainty_shape_kind, "boundedFinite");
        assert_eq!(
            second.finite_values,
            Some(vec!["card-header".to_string(), "card-body".to_string()])
        );
    }
}
