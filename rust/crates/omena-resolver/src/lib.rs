use engine_input_producers::{
    EngineInputV2, SourceResolutionCanonicalProducerSignalV0, SourceResolutionQueryFragmentsV0,
    summarize_source_resolution_canonical_producer_signal_input,
    summarize_source_resolution_query_fragments_input,
};
use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OmenaResolverBoundarySummaryV0 {
    pub schema_version: &'static str,
    pub product: &'static str,
    pub resolver_name: &'static str,
    pub input_version: String,
    pub delegated_source_resolution_products: Vec<&'static str>,
    pub source_resolution_query_count: usize,
    pub source_resolution_candidate_count: usize,
    pub source_resolution_evaluator_candidate_count: usize,
    pub ready_surfaces: Vec<&'static str>,
    pub cme_coupled_surfaces: Vec<&'static str>,
    pub next_decoupling_targets: Vec<&'static str>,
}

pub fn summarize_omena_resolver_boundary(input: &EngineInputV2) -> OmenaResolverBoundarySummaryV0 {
    let canonical_signal = summarize_omena_resolver_canonical_producer_signal(input);

    OmenaResolverBoundarySummaryV0 {
        schema_version: "0",
        product: "omena-resolver.boundary",
        resolver_name: "omena-resolver",
        input_version: input.version.clone(),
        delegated_source_resolution_products: vec![
            "engine-input-producers.source-resolution-query-fragments",
            "engine-input-producers.source-resolution-canonical-producer",
        ],
        source_resolution_query_count: canonical_signal.canonical_bundle.query_fragments.len(),
        source_resolution_candidate_count: canonical_signal.canonical_bundle.candidates.len(),
        source_resolution_evaluator_candidate_count: canonical_signal
            .evaluator_candidates
            .results
            .len(),
        ready_surfaces: vec![
            "resolverBoundarySummary",
            "sourceResolutionQueryFragments",
            "sourceResolutionCanonicalProducerSignal",
        ],
        cme_coupled_surfaces: vec!["EngineInputV2", "producerSourceResolutionRows"],
        next_decoupling_targets: vec![
            "specifierResolutionRuntime",
            "moduleGraphIndex",
            "tsconfigPathMapping",
        ],
    }
}

pub fn summarize_omena_resolver_query_fragments(
    input: &EngineInputV2,
) -> SourceResolutionQueryFragmentsV0 {
    summarize_source_resolution_query_fragments_input(input)
}

pub fn summarize_omena_resolver_canonical_producer_signal(
    input: &EngineInputV2,
) -> SourceResolutionCanonicalProducerSignalV0 {
    summarize_source_resolution_canonical_producer_signal_input(input)
}

#[cfg(test)]
mod tests {
    use engine_input_producers::{
        ClassExpressionInputV2, EngineInputV2, PositionV2, RangeV2, SourceAnalysisInputV2,
        SourceDocumentV2, StringTypeFactsV2, StyleAnalysisInputV2, StyleDocumentV2,
        StyleSelectorV2, TypeFactEntryV2,
    };

    use super::{
        summarize_omena_resolver_boundary, summarize_omena_resolver_canonical_producer_signal,
        summarize_omena_resolver_query_fragments,
    };

    #[test]
    fn summarizes_resolver_boundary_over_source_resolution_products() {
        let input = sample_input();
        let summary = summarize_omena_resolver_boundary(&input);

        assert_eq!(summary.schema_version, "0");
        assert_eq!(summary.product, "omena-resolver.boundary");
        assert_eq!(summary.resolver_name, "omena-resolver");
        assert_eq!(summary.input_version, "2");
        assert_eq!(summary.source_resolution_query_count, 2);
        assert_eq!(summary.source_resolution_candidate_count, 2);
        assert_eq!(summary.source_resolution_evaluator_candidate_count, 2);
        assert!(
            summary
                .delegated_source_resolution_products
                .contains(&"engine-input-producers.source-resolution-canonical-producer")
        );
        assert!(
            summary
                .ready_surfaces
                .contains(&"sourceResolutionCanonicalProducerSignal")
        );
        assert!(
            summary
                .next_decoupling_targets
                .contains(&"tsconfigPathMapping")
        );
    }

    #[test]
    fn exposes_stable_query_fragment_and_canonical_producer_wrappers() {
        let input = sample_input();

        let query_fragments = summarize_omena_resolver_query_fragments(&input);
        assert_eq!(query_fragments.schema_version, "0");
        assert_eq!(query_fragments.input_version, "2");
        assert_eq!(query_fragments.fragments.len(), 2);
        assert_eq!(query_fragments.fragments[0].query_id, "expr-1");
        assert_eq!(
            query_fragments.fragments[1].style_file_path,
            "/tmp/Card.module.scss"
        );

        let canonical_signal = summarize_omena_resolver_canonical_producer_signal(&input);
        assert_eq!(canonical_signal.schema_version, "0");
        assert_eq!(canonical_signal.input_version, "2");
        assert_eq!(canonical_signal.canonical_bundle.query_fragments.len(), 2);
        assert_eq!(canonical_signal.canonical_bundle.candidates.len(), 2);
        assert_eq!(canonical_signal.evaluator_candidates.results.len(), 2);
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
}
