use engine_input_producers::{
    ClassExpressionInputV2, EngineInputV2, PositionV2, RangeV2, SourceAnalysisInputV2,
    SourceDocumentV2, StringTypeFactsV2, StyleAnalysisInputV2, StyleDocumentV2, StyleSelectorV2,
    TypeFactEntryV2,
};

pub fn sample_input() -> EngineInputV2 {
    EngineInputV2 {
        version: "2".to_string(),
        sources: vec![SourceAnalysisInputV2 {
            document: SourceDocumentV2 {
                class_expressions: vec![
                    ClassExpressionInputV2 {
                        id: "expr-1".to_string(),
                        kind: "symbolRef".to_string(),
                        scss_module_path: "/tmp/App.module.scss".to_string(),
                        range: range(3, 12, 3, 22),
                        class_name: None,
                        root_binding_decl_id: Some("decl-1".to_string()),
                        access_path: None,
                    },
                    ClassExpressionInputV2 {
                        id: "expr-2".to_string(),
                        kind: "styleAccess".to_string(),
                        scss_module_path: "/tmp/Card.module.scss".to_string(),
                        range: range(8, 16, 8, 28),
                        class_name: Some("card-header".to_string()),
                        root_binding_decl_id: None,
                        access_path: Some(vec!["card".to_string(), "header".to_string()]),
                    },
                ],
            },
        }],
        styles: vec![
            StyleAnalysisInputV2 {
                file_path: "/tmp/App.module.scss".to_string(),
                document: StyleDocumentV2 {
                    selectors: vec![StyleSelectorV2 {
                        name: "btn-active".to_string(),
                        view_kind: "canonical".to_string(),
                        canonical_name: Some("btn-active".to_string()),
                        range: range(0, 1, 0, 11),
                        nested_safety: Some("safe".to_string()),
                        composes: Some(vec![serde_json::Value::Null]),
                        bem_suffix: None,
                    }],
                },
            },
            StyleAnalysisInputV2 {
                file_path: "/tmp/Card.module.scss".to_string(),
                document: StyleDocumentV2 {
                    selectors: vec![
                        StyleSelectorV2 {
                            name: "card-header".to_string(),
                            view_kind: "canonical".to_string(),
                            canonical_name: Some("card-header".to_string()),
                            range: range(0, 1, 0, 12),
                            nested_safety: Some("unsafe".to_string()),
                            composes: None,
                            bem_suffix: None,
                        },
                        StyleSelectorV2 {
                            name: "card-header:hover".to_string(),
                            view_kind: "nested".to_string(),
                            canonical_name: Some("card-header".to_string()),
                            range: range(2, 1, 2, 18),
                            nested_safety: Some("unknown".to_string()),
                            composes: Some(vec![serde_json::Value::Null, serde_json::Value::Null]),
                            bem_suffix: None,
                        },
                    ],
                },
            },
        ],
        type_facts: vec![
            TypeFactEntryV2 {
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
            },
            TypeFactEntryV2 {
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
            },
        ],
    }
}

fn range(
    start_line: usize,
    start_character: usize,
    end_line: usize,
    end_character: usize,
) -> RangeV2 {
    RangeV2 {
        start: PositionV2 {
            line: start_line,
            character: start_character,
        },
        end: PositionV2 {
            line: end_line,
            character: end_character,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::sample_input;
    use engine_input_producers::{
        StringTypeFactsV2, TypeFactEntryV2, summarize_expression_domain_flow_analysis_input,
        summarize_semantic_canonical_producer_signal_input,
        summarize_source_side_canonical_producer_signal_input,
    };
    use serde_json::json;

    #[test]
    fn consumes_remote_input_producers_repo_via_git_dependency() {
        let signal = summarize_source_side_canonical_producer_signal_input(&sample_input());

        assert_eq!(signal.schema_version, "0");
        assert_eq!(
            signal
                .canonical_bundle
                .expression_semantics
                .candidates
                .len(),
            2
        );
        assert_eq!(
            signal.canonical_bundle.source_resolution.candidates.len(),
            2
        );
        assert_eq!(
            signal
                .evaluator_candidates
                .expression_semantics
                .results
                .len(),
            2
        );
    }

    #[test]
    fn consumes_expression_domain_flow_analysis_contract() {
        let mut input = sample_input();
        input.type_facts = vec![
            exact_type_fact("expr-branch-a", "btn-primary"),
            exact_type_fact("expr-branch-b", "btn-secondary"),
            exact_type_fact("expr-branch-c", "card"),
        ];

        let summary = summarize_expression_domain_flow_analysis_input(&input);

        assert_eq!(
            summary.product,
            "engine-input-producers.expression-domain-flow-analysis"
        );
        assert_eq!(summary.analyses[0].analysis.context_sensitivity, "1-cfa");
        assert_eq!(
            summary.analyses[0]
                .analysis
                .nodes
                .iter()
                .find(|node| node.id == "file-merge")
                .map(|node| node.value_kind),
            Some("finiteSet")
        );
    }

    #[test]
    fn serializes_remote_semantic_signal_for_downstream_consumers() -> Result<(), String> {
        let signal = summarize_semantic_canonical_producer_signal_input(&sample_input());
        let value = serde_json::to_value(&signal).map_err(|error| error.to_string())?;

        assert_eq!(value["schemaVersion"], json!("0"));
        assert_eq!(
            value["canonicalBundle"]["sourceSide"]["expressionSemantics"]["candidates"][0]["selectorCertaintyShapeKind"],
            json!("exact")
        );
        assert_eq!(
            value["evaluatorCandidates"]["sourceSide"]["expressionSemantics"]["results"]
                .as_array()
                .map(|results| results.len()),
            Some(2)
        );
        assert_eq!(
            value["evaluatorCandidates"]["sourceSide"]["expressionSemantics"]["results"][0]["payload"]
                ["valueDomainDerivation"]["product"],
            json!("omena-abstract-value.reduced-class-value-derivation")
        );
        assert_eq!(
            value["evaluatorCandidates"]["sourceSide"]["expressionSemantics"]["results"][0]["payload"]
                ["valueDomainDerivation"]["reducedKind"],
            json!("prefixSuffix")
        );
        assert_eq!(
            value["evaluatorCandidates"]["expressionDomain"]["results"][0]["payload"]["valueDomainDerivation"]
                ["product"],
            json!("omena-abstract-value.reduced-class-value-derivation")
        );
        assert_eq!(
            value["evaluatorCandidates"]["expressionDomain"]["results"][0]["payload"]["valueDomainDerivation"]
                ["reducedKind"],
            json!("prefixSuffix")
        );
        Ok(())
    }

    fn exact_type_fact(expression_id: &str, value: &str) -> TypeFactEntryV2 {
        TypeFactEntryV2 {
            file_path: "/tmp/App.tsx".to_string(),
            expression_id: expression_id.to_string(),
            facts: StringTypeFactsV2 {
                kind: "exact".to_string(),
                constraint_kind: None,
                values: Some(vec![value.to_string()]),
                prefix: None,
                suffix: None,
                min_len: None,
                max_len: None,
                char_must: None,
                char_may: None,
                may_include_other_chars: None,
            },
        }
    }
}
