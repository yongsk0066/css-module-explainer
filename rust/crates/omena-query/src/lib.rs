use engine_input_producers::{
    EngineInputV2, ExpressionSemanticsQueryFragmentsV0, SelectorUsageQueryFragmentsV0,
    SourceResolutionQueryFragmentsV0, summarize_expression_semantics_query_fragments_input,
    summarize_selector_usage_query_fragments_input,
    summarize_source_resolution_query_fragments_input,
};
use omena_abstract_value::{AbstractValueDomainSummaryV0, summarize_omena_abstract_value_domain};
use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OmenaQueryBoundarySummaryV0 {
    pub schema_version: &'static str,
    pub product: &'static str,
    pub query_engine_name: &'static str,
    pub input_version: String,
    pub abstract_value_domain: AbstractValueDomainSummaryV0,
    pub delegated_fragment_products: Vec<&'static str>,
    pub expression_semantics_query_count: usize,
    pub source_resolution_query_count: usize,
    pub selector_usage_query_count: usize,
    pub total_query_count: usize,
    pub ready_surfaces: Vec<&'static str>,
    pub cme_coupled_surfaces: Vec<&'static str>,
    pub next_decoupling_targets: Vec<&'static str>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OmenaQueryFragmentBundleV0 {
    pub schema_version: &'static str,
    pub product: &'static str,
    pub input_version: String,
    pub expression_semantics: ExpressionSemanticsQueryFragmentsV0,
    pub source_resolution: SourceResolutionQueryFragmentsV0,
    pub selector_usage: SelectorUsageQueryFragmentsV0,
}

pub fn summarize_omena_query_boundary(input: &EngineInputV2) -> OmenaQueryBoundarySummaryV0 {
    let fragment_bundle = summarize_omena_query_fragment_bundle(input);
    let expression_semantics_query_count = fragment_bundle.expression_semantics.fragments.len();
    let source_resolution_query_count = fragment_bundle.source_resolution.fragments.len();
    let selector_usage_query_count = fragment_bundle.selector_usage.fragments.len();

    OmenaQueryBoundarySummaryV0 {
        schema_version: "0",
        product: "omena-query.boundary",
        query_engine_name: "omena-query",
        input_version: input.version.clone(),
        abstract_value_domain: summarize_omena_abstract_value_domain(),
        delegated_fragment_products: vec![
            "engine-input-producers.expression-semantics-query-fragments",
            "engine-input-producers.source-resolution-query-fragments",
            "engine-input-producers.selector-usage-query-fragments",
        ],
        expression_semantics_query_count,
        source_resolution_query_count,
        selector_usage_query_count,
        total_query_count: expression_semantics_query_count
            + source_resolution_query_count
            + selector_usage_query_count,
        ready_surfaces: vec![
            "queryFragmentBundle",
            "abstractValueProjectionContract",
            "queryBoundarySummary",
        ],
        cme_coupled_surfaces: vec!["EngineInputV2", "producerQueryFragments"],
        next_decoupling_targets: vec!["queryEvaluationRuntime", "selectedQueryBackendAdapter"],
    }
}

pub fn summarize_omena_query_fragment_bundle(input: &EngineInputV2) -> OmenaQueryFragmentBundleV0 {
    OmenaQueryFragmentBundleV0 {
        schema_version: "0",
        product: "omena-query.fragment-bundle",
        input_version: input.version.clone(),
        expression_semantics: summarize_expression_semantics_query_fragments_input(input),
        source_resolution: summarize_source_resolution_query_fragments_input(input),
        selector_usage: summarize_selector_usage_query_fragments_input(input),
    }
}

#[cfg(test)]
mod tests {
    use engine_input_producers::{
        ClassExpressionInputV2, EngineInputV2, PositionV2, RangeV2, SourceAnalysisInputV2,
        SourceDocumentV2, StringTypeFactsV2, StyleAnalysisInputV2, StyleDocumentV2,
        StyleSelectorV2, TypeFactEntryV2,
    };

    use super::{summarize_omena_query_boundary, summarize_omena_query_fragment_bundle};

    #[test]
    fn summarizes_query_boundary_over_producer_fragments() {
        let input = sample_input();
        let summary = summarize_omena_query_boundary(&input);

        assert_eq!(summary.schema_version, "0");
        assert_eq!(summary.product, "omena-query.boundary");
        assert_eq!(summary.query_engine_name, "omena-query");
        assert_eq!(summary.input_version, "2");
        assert_eq!(
            summary.abstract_value_domain.product,
            "omena-abstract-value.domain"
        );
        assert_eq!(summary.expression_semantics_query_count, 2);
        assert_eq!(summary.source_resolution_query_count, 2);
        assert_eq!(summary.selector_usage_query_count, 2);
        assert_eq!(summary.total_query_count, 6);
        assert!(
            summary
                .ready_surfaces
                .contains(&"abstractValueProjectionContract")
        );
        assert!(
            summary
                .cme_coupled_surfaces
                .contains(&"producerQueryFragments")
        );
    }

    #[test]
    fn bundles_expression_source_and_selector_query_fragments() {
        let input = sample_input();
        let bundle = summarize_omena_query_fragment_bundle(&input);

        assert_eq!(bundle.schema_version, "0");
        assert_eq!(bundle.product, "omena-query.fragment-bundle");
        assert_eq!(bundle.input_version, "2");
        assert_eq!(bundle.expression_semantics.fragments.len(), 2);
        assert_eq!(bundle.expression_semantics.fragments[0].query_id, "expr-1");
        assert_eq!(bundle.source_resolution.fragments.len(), 2);
        assert_eq!(bundle.source_resolution.fragments[1].query_id, "expr-2");
        assert_eq!(bundle.selector_usage.fragments.len(), 2);
        assert_eq!(bundle.selector_usage.fragments[0].query_id, "btn-active");
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
