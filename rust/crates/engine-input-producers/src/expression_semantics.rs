use std::collections::BTreeMap;

use crate::{
    EngineInputV2, ExpressionSemanticsFragmentV0, ExpressionSemanticsFragmentsV0,
    ExpressionSemanticsMatchFragmentV0, ExpressionSemanticsMatchFragmentsV0,
    ExpressionSemanticsQueryFragmentV0, ExpressionSemanticsQueryFragmentsV0,
    finite_values_for_facts, map_expression_value_domain_kind, resolve_selector_names,
};

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

pub fn summarize_expression_semantics_query_fragments_input(
    input: &EngineInputV2,
) -> ExpressionSemanticsQueryFragmentsV0 {
    let mut fragments = Vec::new();

    for source in &input.sources {
        for expression in &source.document.class_expressions {
            fragments.push(ExpressionSemanticsQueryFragmentV0 {
                query_id: expression.id.clone(),
                expression_id: expression.id.clone(),
                expression_kind: expression.kind.clone(),
                style_file_path: expression.scss_module_path.clone(),
            });
        }
    }

    fragments.sort_by(|a, b| a.query_id.cmp(&b.query_id));

    ExpressionSemanticsQueryFragmentsV0 {
        schema_version: "0",
        input_version: input.version.clone(),
        fragments,
    }
}

pub fn summarize_expression_semantics_match_fragments_input(
    input: &EngineInputV2,
) -> ExpressionSemanticsMatchFragmentsV0 {
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

        let selector_names = resolve_selector_names(style, &entry.facts);
        let finite_values = finite_values_for_facts(&entry.facts);
        let candidate_names = finite_values
            .clone()
            .unwrap_or_else(|| selector_names.clone());

        fragments.push(ExpressionSemanticsMatchFragmentV0 {
            query_id: entry.expression_id.clone(),
            expression_id: entry.expression_id.clone(),
            style_file_path: expression.scss_module_path.clone(),
            selector_names,
            candidate_names,
            finite_values,
        });
    }

    fragments.sort_by(|a, b| a.query_id.cmp(&b.query_id));

    ExpressionSemanticsMatchFragmentsV0 {
        schema_version: "0",
        input_version: input.version.clone(),
        fragments,
    }
}
#[cfg(test)]
mod tests {
    use super::{
        summarize_expression_semantics_fragments_input,
        summarize_expression_semantics_match_fragments_input,
        summarize_expression_semantics_query_fragments_input,
    };
    use crate::test_support::sample_input;

    #[test]
    fn builds_expression_semantics_fragment_from_type_fact() {
        let summary = summarize_expression_semantics_fragments_input(&sample_input());

        assert_eq!(summary.fragments.len(), 2);
        let fragment = &summary.fragments[0];
        assert_eq!(fragment.query_id, "expr-1");
        assert_eq!(fragment.expression_id, "expr-1");
        assert_eq!(fragment.expression_kind, "symbolRef");
        assert_eq!(fragment.style_file_path, "/tmp/App.module.scss");
        assert_eq!(fragment.value_domain_kind, "constrained");
        assert_eq!(
            fragment.value_constraint_kind.as_deref(),
            Some("prefixSuffix")
        );
        assert_eq!(fragment.value_prefix.as_deref(), Some("btn-"));
        assert_eq!(fragment.value_suffix.as_deref(), Some("-active"));
        assert_eq!(fragment.value_min_len, Some(10));

        let second = &summary.fragments[1];
        assert_eq!(second.query_id, "expr-2");
        assert_eq!(second.value_domain_kind, "finiteSet");
    }

    #[test]
    fn builds_expression_semantics_query_fragments_from_input() {
        let summary = summarize_expression_semantics_query_fragments_input(&sample_input());

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
    fn builds_expression_semantics_match_fragments_from_input() {
        let summary = summarize_expression_semantics_match_fragments_input(&sample_input());

        assert_eq!(summary.fragments.len(), 2);
        let first = &summary.fragments[0];
        assert_eq!(first.query_id, "expr-1");
        assert_eq!(first.expression_id, "expr-1");
        assert_eq!(first.style_file_path, "/tmp/App.module.scss");
        assert_eq!(first.selector_names, vec!["btn-active".to_string()]);
        assert_eq!(first.candidate_names, vec!["btn-active".to_string()]);
        assert!(first.finite_values.is_none());

        let second = &summary.fragments[1];
        assert_eq!(second.query_id, "expr-2");
        assert_eq!(second.selector_names, vec!["card-header".to_string()]);
        assert_eq!(
            second.candidate_names,
            vec!["card-header".to_string(), "card-body".to_string()]
        );
        assert_eq!(
            second.finite_values,
            Some(vec!["card-header".to_string(), "card-body".to_string()])
        );
    }
}
