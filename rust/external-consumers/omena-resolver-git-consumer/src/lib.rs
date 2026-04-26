use engine_input_producers::{
    ClassExpressionInputV2, EngineInputV2, PositionV2, RangeV2, SourceAnalysisInputV2,
    SourceDocumentV2, StringTypeFactsV2, StyleAnalysisInputV2, StyleDocumentV2, StyleSelectorV2,
    TypeFactEntryV2,
};
use omena_resolver::{OmenaResolverBoundarySummaryV0, summarize_omena_resolver_boundary};

pub fn consume_resolver_boundary() -> OmenaResolverBoundarySummaryV0 {
    summarize_omena_resolver_boundary(&sample_input())
}

fn sample_input() -> EngineInputV2 {
    EngineInputV2 {
        version: "2".to_string(),
        sources: vec![SourceAnalysisInputV2 {
            document: SourceDocumentV2 {
                class_expressions: vec![
                    ClassExpressionInputV2 {
                        id: "expr-1".to_string(),
                        kind: "symbolRef".to_string(),
                        scss_module_path: "/tmp/App.module.scss".to_string(),
                        range: range(4, 12, 4, 16),
                        class_name: None,
                        root_binding_decl_id: Some("decl-1".to_string()),
                        access_path: None,
                    },
                    ClassExpressionInputV2 {
                        id: "expr-2".to_string(),
                        kind: "styleAccess".to_string(),
                        scss_module_path: "/tmp/Card.module.scss".to_string(),
                        range: range(6, 9, 6, 20),
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
                        range: range(1, 1, 1, 12),
                        nested_safety: Some("safe".to_string()),
                        composes: None,
                        bem_suffix: None,
                    }],
                },
            },
            StyleAnalysisInputV2 {
                file_path: "/tmp/Card.module.scss".to_string(),
                document: StyleDocumentV2 {
                    selectors: vec![StyleSelectorV2 {
                        name: "card-header".to_string(),
                        view_kind: "canonical".to_string(),
                        canonical_name: Some("card-header".to_string()),
                        range: range(3, 1, 3, 13),
                        nested_safety: Some("unsafe".to_string()),
                        composes: None,
                        bem_suffix: None,
                    }],
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
    use super::{consume_resolver_boundary, sample_input};
    use omena_resolver::summarize_omena_resolver_query_fragments;
    use serde_json::json;

    #[test]
    fn consumes_remote_resolver_boundary_via_git_dependency() {
        let boundary = consume_resolver_boundary();

        assert_eq!(boundary.product, "omena-resolver.boundary");
        assert_eq!(boundary.resolver_name, "omena-resolver");
        assert_eq!(boundary.source_resolution_query_count, 2);
        assert_eq!(boundary.source_resolution_candidate_count, 2);
        assert!(
            boundary
                .ready_surfaces
                .contains(&"sourceResolutionCanonicalProducerSignal")
        );
    }

    #[test]
    fn consumes_remote_query_fragment_wrapper() {
        let fragments = summarize_omena_resolver_query_fragments(&sample_input());

        assert_eq!(fragments.input_version, "2");
        assert_eq!(fragments.fragments.len(), 2);
        assert_eq!(fragments.fragments[0].query_id, "expr-1");
        assert_eq!(
            fragments.fragments[1].style_file_path,
            "/tmp/Card.module.scss"
        );
    }

    #[test]
    fn serializes_remote_canonical_producer_signal_for_consumers() -> Result<(), String> {
        let signal =
            omena_resolver::summarize_omena_resolver_canonical_producer_signal(&sample_input());
        let value = serde_json::to_value(&signal).map_err(|error| error.to_string())?;

        assert_eq!(value["schemaVersion"], json!("0"));
        assert_eq!(
            value["canonicalBundle"]["queryFragments"][0]["queryId"],
            json!("expr-1")
        );
        assert_eq!(
            value["canonicalBundle"]["candidates"]
                .as_array()
                .map(Vec::len),
            Some(2)
        );
        assert_eq!(
            value["evaluatorCandidates"]["results"]
                .as_array()
                .map(Vec::len),
            Some(2)
        );
        Ok(())
    }
}
