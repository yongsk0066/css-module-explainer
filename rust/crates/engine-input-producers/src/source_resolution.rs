use std::collections::BTreeMap;

use crate::{
    EngineInputV2, SourceResolutionFragmentV0, SourceResolutionFragmentsV0,
    map_value_certainty_shape_kind,
};

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
    use super::summarize_source_resolution_fragments_input;
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
                        id: "expr-2".to_string(),
                        kind: "styleAccess".to_string(),
                        scss_module_path: "/tmp/Card.module.scss".to_string(),
                        root_binding_decl_id: None,
                        access_path: Some(vec!["card".to_string(), "header".to_string()]),
                    }],
                },
            }],
            styles: vec![StyleAnalysisInputV2 {
                document: StyleDocumentV2 { selectors: vec![] },
            }],
            type_facts: vec![TypeFactEntryV2 {
                file_path: "/tmp/Card.tsx".to_string(),
                expression_id: "expr-2".to_string(),
                facts: StringTypeFactsV2 {
                    kind: "finiteSet".to_string(),
                    constraint_kind: None,
                    values: Some(vec!["card-header".to_string(), "card-body".to_string()]),
                    prefix: None,
                    suffix: None,
                    min_len: None,
                    max_len: None,
                    char_must: None,
                    char_may: None,
                    may_include_other_chars: None,
                },
            }],
        }
    }

    #[test]
    fn builds_source_resolution_fragment_from_type_fact() {
        let summary = summarize_source_resolution_fragments_input(&sample_input());

        assert_eq!(summary.fragments.len(), 1);
        let fragment = &summary.fragments[0];
        assert_eq!(fragment.query_id, "expr-2");
        assert_eq!(fragment.expression_id, "expr-2");
        assert_eq!(fragment.style_file_path, "/tmp/Card.module.scss");
        assert_eq!(fragment.value_certainty_shape_kind, "boundedFinite");
        assert!(fragment.value_certainty_constraint_kind.is_none());
    }
}
