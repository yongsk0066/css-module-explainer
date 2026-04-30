use engine_input_producers::{
    ClassExpressionInputV2, EngineInputV2, PositionV2, RangeV2, SourceAnalysisInputV2,
    SourceDocumentV2, StringTypeFactsV2, StyleAnalysisInputV2, StyleDocumentV2, StyleSelectorV2,
    TypeFactEntryV2,
};
use omena_resolver::{
    OmenaResolverBoundarySummaryV0, OmenaResolverModuleGraphSummaryV0,
    OmenaResolverRuntimeQueryBoundarySummaryV0, OmenaResolverSourceResolutionRuntimeIndexV0,
    summarize_omena_resolver_boundary, summarize_omena_resolver_module_graph_index,
    summarize_omena_resolver_runtime_query_boundary,
    summarize_omena_resolver_source_resolution_runtime,
};

pub fn consume_resolver_boundary() -> OmenaResolverBoundarySummaryV0 {
    summarize_omena_resolver_boundary(&sample_input())
}

pub fn consume_resolver_module_graph() -> OmenaResolverModuleGraphSummaryV0 {
    summarize_omena_resolver_module_graph_index(&sample_input())
}

pub fn consume_resolver_runtime_query_boundary() -> OmenaResolverRuntimeQueryBoundarySummaryV0 {
    summarize_omena_resolver_runtime_query_boundary(&consume_resolver_module_graph())
}

pub fn consume_resolver_source_resolution_runtime() -> OmenaResolverSourceResolutionRuntimeIndexV0 {
    summarize_omena_resolver_source_resolution_runtime(&sample_input())
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
    use super::{
        consume_resolver_boundary, consume_resolver_module_graph,
        consume_resolver_runtime_query_boundary, consume_resolver_source_resolution_runtime,
        sample_input,
    };
    use omena_resolver::{
        query_omena_resolver_runtime_module, query_omena_resolver_source_expression,
        summarize_omena_resolver_module_graph_index, summarize_omena_resolver_query_fragments,
    };
    use serde_json::json;

    #[test]
    fn consumes_remote_resolver_boundary_via_git_dependency() {
        let boundary = consume_resolver_boundary();

        assert_eq!(boundary.product, "omena-resolver.boundary");
        assert_eq!(boundary.resolver_name, "omena-resolver");
        assert_eq!(boundary.source_resolution_query_count, 2);
        assert_eq!(boundary.source_resolution_candidate_count, 2);
        assert_eq!(boundary.module_graph_module_count, 2);
        assert_eq!(boundary.module_graph_source_expression_edge_count, 2);
        assert_eq!(boundary.runtime_query_module_count, 2);
        assert_eq!(boundary.runtime_query_ready_module_count, 2);
        assert_eq!(boundary.source_resolution_runtime_expression_count, 2);
        assert_eq!(
            boundary.source_resolution_runtime_resolved_expression_count,
            2
        );
        assert!(
            boundary
                .resolver_owned_products
                .contains(&"omena-resolver.module-graph-index")
        );
        assert!(
            boundary
                .resolver_owned_products
                .contains(&"omena-resolver.runtime-query-boundary")
        );
        assert!(
            boundary
                .resolver_owned_products
                .contains(&"omena-resolver.source-resolution-runtime-index")
        );
        assert!(
            boundary
                .ready_surfaces
                .contains(&"resolverModuleGraphIndex")
        );
        assert!(
            boundary
                .ready_surfaces
                .contains(&"resolverSourceResolutionRuntimeIndex")
        );
    }

    #[test]
    fn consumes_remote_resolver_module_graph_via_git_dependency() {
        let module_graph = consume_resolver_module_graph();

        assert_eq!(module_graph.product, "omena-resolver.module-graph-index");
        assert_eq!(module_graph.module_count, 2);
        assert_eq!(module_graph.source_expression_edge_count, 2);
        assert_eq!(module_graph.type_fact_edge_count, 2);
        assert_eq!(module_graph.selector_count, 2);
        assert_eq!(module_graph.unresolved_type_fact_count, 0);

        let app = module_graph
            .modules
            .iter()
            .find(|module| module.style_file_path == "/tmp/App.module.scss");
        assert!(app.is_some());
        let Some(app) = app else {
            return;
        };

        assert_eq!(app.source_expression_ids, ["expr-1"]);
        assert_eq!(app.type_fact_expression_ids, ["expr-1"]);
        assert_eq!(app.selector_names, ["btn-active"]);
    }

    #[test]
    fn consumes_remote_resolver_runtime_query_boundary_via_git_dependency() {
        let runtime_query = consume_resolver_runtime_query_boundary();

        assert_eq!(
            runtime_query.product,
            "omena-resolver.runtime-query-boundary"
        );
        assert_eq!(
            runtime_query.input_product,
            "omena-resolver.module-graph-index"
        );
        assert_eq!(runtime_query.module_query_count, 2);
        assert_eq!(runtime_query.fully_resolvable_module_count, 2);
        assert_eq!(runtime_query.unresolved_type_fact_count, 0);
        assert!(runtime_query.blocking_gaps.is_empty());
        assert!(
            runtime_query
                .runtime_capabilities
                .contains(&"moduleLookupByStylePath")
        );

        let module_graph = summarize_omena_resolver_module_graph_index(&sample_input());
        let app = query_omena_resolver_runtime_module(&module_graph, "/tmp/App.module.scss");
        assert!(app.is_some());
        let Some(app) = app else {
            return;
        };
        assert_eq!(app.status, "ready");
        assert!(app.can_resolve_source_expressions);
        assert!(app.can_check_type_fact_edges);
        assert!(app.can_query_selector_names);
    }

    #[test]
    fn consumes_remote_source_resolution_runtime_via_git_dependency() {
        let runtime_index = consume_resolver_source_resolution_runtime();

        assert_eq!(
            runtime_index.product,
            "omena-resolver.source-resolution-runtime-index"
        );
        assert_eq!(runtime_index.expression_count, 2);
        assert_eq!(runtime_index.resolved_expression_count, 2);
        assert_eq!(runtime_index.unresolved_expression_count, 0);
        assert!(runtime_index.blocking_gaps.is_empty());

        let app = query_omena_resolver_source_expression(&runtime_index, "expr-1");
        assert!(app.is_some());
        let Some(app) = app else {
            return;
        };
        assert_eq!(app.status, "resolved");
        assert_eq!(app.expression_kind, "symbolRef");
        assert_eq!(app.selector_names, ["btn-active"]);
        assert_eq!(app.selector_certainty_shape_kind, "exact");
        assert!(app.can_resolve_source_expression);
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
