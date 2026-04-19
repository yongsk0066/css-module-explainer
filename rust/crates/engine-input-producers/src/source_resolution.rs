use std::collections::{BTreeMap, BTreeSet};

use crate::{
    EngineInputV2, SourceResolutionFragmentV0, SourceResolutionFragmentsV0,
    SourceResolutionPlanSummaryV0, map_value_certainty_shape_kind,
};

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

#[cfg(test)]
mod tests {
    use super::{
        summarize_source_resolution_fragments_input, summarize_source_resolution_plan_input,
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
}
