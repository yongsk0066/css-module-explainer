use std::collections::BTreeMap;

use crate::{
    EngineInputV2, ExpressionSemanticsFragmentV0, ExpressionSemanticsFragmentsV0,
    map_expression_value_domain_kind,
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

#[cfg(test)]
mod tests {
    use super::summarize_expression_semantics_fragments_input;
    use crate::{
        ClassExpressionInputV2, EngineInputV2, SourceAnalysisInputV2, SourceDocumentV2,
        StringTypeFactsV2, StyleAnalysisInputV2, StyleDocumentV2, TypeFactEntryV2,
    };

    fn sample_input() -> EngineInputV2 {
        EngineInputV2 {
            version: "2".to_string(),
            sources: vec![SourceAnalysisInputV2 {
                document: SourceDocumentV2 {
                    class_expressions: vec![ClassExpressionInputV2 {
                        id: "expr-1".to_string(),
                        kind: "symbolRef".to_string(),
                        scss_module_path: "/tmp/App.module.scss".to_string(),
                        root_binding_decl_id: Some("decl-1".to_string()),
                        access_path: None,
                    }],
                },
            }],
            styles: vec![StyleAnalysisInputV2 {
                document: StyleDocumentV2 { selectors: vec![] },
            }],
            type_facts: vec![TypeFactEntryV2 {
                file_path: "/tmp/App.tsx".to_string(),
                expression_id: "expr-1".to_string(),
                facts: StringTypeFactsV2 {
                    kind: "constrained".to_string(),
                    constraint_kind: Some("prefixSuffix".to_string()),
                    values: None,
                    prefix: Some("btn-".to_string()),
                    suffix: Some("-active".to_string()),
                    min_len: Some(10),
                    max_len: None,
                    char_must: None,
                    char_may: None,
                    may_include_other_chars: None,
                },
            }],
        }
    }

    #[test]
    fn builds_expression_semantics_fragment_from_type_fact() {
        let summary = summarize_expression_semantics_fragments_input(&sample_input());

        assert_eq!(summary.fragments.len(), 1);
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
    }
}
