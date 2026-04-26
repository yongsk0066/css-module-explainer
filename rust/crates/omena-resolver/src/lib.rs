use std::collections::{BTreeMap, BTreeSet};

use engine_input_producers::{
    EngineInputV2, SourceResolutionCanonicalProducerSignalV0, SourceResolutionQueryFragmentsV0,
    summarize_source_resolution_canonical_producer_signal_input,
    summarize_source_resolution_query_fragments_input,
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OmenaResolverBoundarySummaryV0 {
    pub schema_version: &'static str,
    pub product: &'static str,
    pub resolver_name: &'static str,
    pub input_version: String,
    pub delegated_source_resolution_products: Vec<&'static str>,
    pub resolver_owned_products: Vec<&'static str>,
    pub source_resolution_query_count: usize,
    pub source_resolution_candidate_count: usize,
    pub source_resolution_evaluator_candidate_count: usize,
    pub module_graph_module_count: usize,
    pub module_graph_source_expression_edge_count: usize,
    pub runtime_query_module_count: usize,
    pub runtime_query_ready_module_count: usize,
    pub ready_surfaces: Vec<&'static str>,
    pub cme_coupled_surfaces: Vec<&'static str>,
    pub next_decoupling_targets: Vec<&'static str>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OmenaResolverModuleGraphSummaryV0 {
    pub schema_version: String,
    pub product: String,
    pub input_version: String,
    pub module_count: usize,
    pub source_expression_edge_count: usize,
    pub type_fact_edge_count: usize,
    pub selector_count: usize,
    pub unresolved_type_fact_count: usize,
    pub modules: Vec<OmenaResolverModuleGraphModuleV0>,
    pub unresolved_type_fact_expression_ids: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OmenaResolverModuleGraphModuleV0 {
    pub style_file_path: String,
    pub source_expression_ids: Vec<String>,
    pub source_expression_kinds: Vec<String>,
    pub type_fact_expression_ids: Vec<String>,
    pub selector_names: Vec<String>,
    pub canonical_selector_names: Vec<String>,
    pub has_source_input: bool,
    pub has_style_input: bool,
    pub has_type_fact_input: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OmenaResolverRuntimeQueryBoundarySummaryV0 {
    pub schema_version: &'static str,
    pub product: &'static str,
    pub input_product: String,
    pub input_version: String,
    pub module_query_count: usize,
    pub fully_resolvable_module_count: usize,
    pub source_only_module_count: usize,
    pub style_only_module_count: usize,
    pub unresolved_type_fact_count: usize,
    pub runtime_capabilities: Vec<&'static str>,
    pub blocking_gaps: Vec<&'static str>,
    pub module_queries: Vec<OmenaResolverRuntimeModuleQueryV0>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OmenaResolverRuntimeModuleQueryV0 {
    pub style_file_path: String,
    pub source_expression_ids: Vec<String>,
    pub type_fact_expression_ids: Vec<String>,
    pub selector_names: Vec<String>,
    pub canonical_selector_names: Vec<String>,
    pub can_resolve_source_expressions: bool,
    pub can_check_type_fact_edges: bool,
    pub can_query_selector_names: bool,
    pub status: &'static str,
}

#[derive(Debug, Default)]
struct ModuleGraphAccumulator {
    source_expression_ids: BTreeSet<String>,
    source_expression_kinds: BTreeSet<String>,
    type_fact_expression_ids: BTreeSet<String>,
    selector_names: BTreeSet<String>,
    canonical_selector_names: BTreeSet<String>,
    has_source_input: bool,
    has_style_input: bool,
    has_type_fact_input: bool,
}

pub fn summarize_omena_resolver_boundary(input: &EngineInputV2) -> OmenaResolverBoundarySummaryV0 {
    let canonical_signal = summarize_omena_resolver_canonical_producer_signal(input);
    let module_graph = summarize_omena_resolver_module_graph_index(input);
    let runtime_query = summarize_omena_resolver_runtime_query_boundary(&module_graph);

    OmenaResolverBoundarySummaryV0 {
        schema_version: "0",
        product: "omena-resolver.boundary",
        resolver_name: "omena-resolver",
        input_version: input.version.clone(),
        delegated_source_resolution_products: vec![
            "engine-input-producers.source-resolution-query-fragments",
            "engine-input-producers.source-resolution-canonical-producer",
        ],
        resolver_owned_products: vec![
            "omena-resolver.module-graph-index",
            "omena-resolver.runtime-query-boundary",
        ],
        source_resolution_query_count: canonical_signal.canonical_bundle.query_fragments.len(),
        source_resolution_candidate_count: canonical_signal.canonical_bundle.candidates.len(),
        source_resolution_evaluator_candidate_count: canonical_signal
            .evaluator_candidates
            .results
            .len(),
        module_graph_module_count: module_graph.module_count,
        module_graph_source_expression_edge_count: module_graph.source_expression_edge_count,
        runtime_query_module_count: runtime_query.module_query_count,
        runtime_query_ready_module_count: runtime_query.fully_resolvable_module_count,
        ready_surfaces: vec![
            "resolverBoundarySummary",
            "resolverModuleGraphIndex",
            "resolverRuntimeQueryBoundary",
            "sourceResolutionQueryFragments",
            "sourceResolutionCanonicalProducerSignal",
        ],
        cme_coupled_surfaces: vec!["EngineInputV2", "producerSourceResolutionRows"],
        next_decoupling_targets: vec!["specifierResolutionRuntime", "tsconfigPathMapping"],
    }
}

pub fn summarize_omena_resolver_module_graph_index(
    input: &EngineInputV2,
) -> OmenaResolverModuleGraphSummaryV0 {
    let mut modules = BTreeMap::<String, ModuleGraphAccumulator>::new();
    let mut expression_to_style_path = BTreeMap::<String, String>::new();
    let mut source_expression_edge_count = 0usize;
    let mut type_fact_edge_count = 0usize;
    let mut selector_count = 0usize;
    let mut unresolved_type_fact_expression_ids = BTreeSet::<String>::new();

    for source in &input.sources {
        for expression in &source.document.class_expressions {
            source_expression_edge_count += 1;
            expression_to_style_path
                .insert(expression.id.clone(), expression.scss_module_path.clone());
            let module = modules
                .entry(expression.scss_module_path.clone())
                .or_default();
            module.has_source_input = true;
            module.source_expression_ids.insert(expression.id.clone());
            module
                .source_expression_kinds
                .insert(expression.kind.clone());
        }
    }

    for style in &input.styles {
        let module = modules.entry(style.file_path.clone()).or_default();
        module.has_style_input = true;
        for selector in &style.document.selectors {
            selector_count += 1;
            module.selector_names.insert(selector.name.clone());
            if let Some(canonical_name) = &selector.canonical_name {
                module
                    .canonical_selector_names
                    .insert(canonical_name.clone());
            }
        }
    }

    for type_fact in &input.type_facts {
        if let Some(style_file_path) = expression_to_style_path.get(&type_fact.expression_id) {
            type_fact_edge_count += 1;
            let module = modules.entry(style_file_path.clone()).or_default();
            module.has_type_fact_input = true;
            module
                .type_fact_expression_ids
                .insert(type_fact.expression_id.clone());
        } else {
            unresolved_type_fact_expression_ids.insert(type_fact.expression_id.clone());
        }
    }

    let modules = modules
        .into_iter()
        .map(
            |(style_file_path, module)| OmenaResolverModuleGraphModuleV0 {
                style_file_path,
                source_expression_ids: module.source_expression_ids.into_iter().collect(),
                source_expression_kinds: module.source_expression_kinds.into_iter().collect(),
                type_fact_expression_ids: module.type_fact_expression_ids.into_iter().collect(),
                selector_names: module.selector_names.into_iter().collect(),
                canonical_selector_names: module.canonical_selector_names.into_iter().collect(),
                has_source_input: module.has_source_input,
                has_style_input: module.has_style_input,
                has_type_fact_input: module.has_type_fact_input,
            },
        )
        .collect::<Vec<_>>();
    let unresolved_type_fact_expression_ids = unresolved_type_fact_expression_ids
        .into_iter()
        .collect::<Vec<_>>();

    OmenaResolverModuleGraphSummaryV0 {
        schema_version: "0".to_string(),
        product: "omena-resolver.module-graph-index".to_string(),
        input_version: input.version.clone(),
        module_count: modules.len(),
        source_expression_edge_count,
        type_fact_edge_count,
        selector_count,
        unresolved_type_fact_count: unresolved_type_fact_expression_ids.len(),
        modules,
        unresolved_type_fact_expression_ids,
    }
}

pub fn summarize_omena_resolver_runtime_query_boundary(
    module_graph: &OmenaResolverModuleGraphSummaryV0,
) -> OmenaResolverRuntimeQueryBoundarySummaryV0 {
    let module_queries = module_graph
        .modules
        .iter()
        .map(runtime_module_query_from_graph_module)
        .collect::<Vec<_>>();
    let fully_resolvable_module_count = module_queries
        .iter()
        .filter(|module| module.status == "ready")
        .count();
    let source_only_module_count = module_graph
        .modules
        .iter()
        .filter(|module| module.has_source_input && !module.has_style_input)
        .count();
    let style_only_module_count = module_graph
        .modules
        .iter()
        .filter(|module| module.has_style_input && !module.has_source_input)
        .count();
    let mut blocking_gaps = Vec::new();

    if module_graph.module_count == 0 {
        blocking_gaps.push("emptyModuleGraph");
    }
    if fully_resolvable_module_count < module_graph.module_count {
        blocking_gaps.push("partialModuleCoverage");
    }
    if module_graph.unresolved_type_fact_count > 0 {
        blocking_gaps.push("unresolvedTypeFactEdges");
    }

    OmenaResolverRuntimeQueryBoundarySummaryV0 {
        schema_version: "0",
        product: "omena-resolver.runtime-query-boundary",
        input_product: module_graph.product.clone(),
        input_version: module_graph.input_version.clone(),
        module_query_count: module_queries.len(),
        fully_resolvable_module_count,
        source_only_module_count,
        style_only_module_count,
        unresolved_type_fact_count: module_graph.unresolved_type_fact_count,
        runtime_capabilities: vec![
            "moduleLookupByStylePath",
            "sourceExpressionEdgeLookup",
            "typeFactEdgeLookup",
            "selectorNameLookup",
        ],
        blocking_gaps,
        module_queries,
    }
}

pub fn query_omena_resolver_runtime_module(
    module_graph: &OmenaResolverModuleGraphSummaryV0,
    style_file_path: &str,
) -> Option<OmenaResolverRuntimeModuleQueryV0> {
    module_graph
        .modules
        .iter()
        .find(|module| module.style_file_path == style_file_path)
        .map(runtime_module_query_from_graph_module)
}

fn runtime_module_query_from_graph_module(
    module: &OmenaResolverModuleGraphModuleV0,
) -> OmenaResolverRuntimeModuleQueryV0 {
    OmenaResolverRuntimeModuleQueryV0 {
        style_file_path: module.style_file_path.clone(),
        source_expression_ids: module.source_expression_ids.clone(),
        type_fact_expression_ids: module.type_fact_expression_ids.clone(),
        selector_names: module.selector_names.clone(),
        canonical_selector_names: module.canonical_selector_names.clone(),
        can_resolve_source_expressions: module.has_source_input && module.has_style_input,
        can_check_type_fact_edges: module.has_source_input && module.has_type_fact_input,
        can_query_selector_names: module.has_style_input,
        status: module_runtime_status(module),
    }
}

fn module_runtime_status(module: &OmenaResolverModuleGraphModuleV0) -> &'static str {
    if module.has_source_input && module.has_style_input && module.has_type_fact_input {
        "ready"
    } else if module.has_source_input && !module.has_style_input {
        "sourceOnly"
    } else if module.has_style_input && !module.has_source_input {
        "styleOnly"
    } else {
        "partial"
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
        query_omena_resolver_runtime_module, summarize_omena_resolver_boundary,
        summarize_omena_resolver_canonical_producer_signal,
        summarize_omena_resolver_module_graph_index, summarize_omena_resolver_query_fragments,
        summarize_omena_resolver_runtime_query_boundary,
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
        assert_eq!(summary.module_graph_module_count, 2);
        assert_eq!(summary.module_graph_source_expression_edge_count, 2);
        assert_eq!(summary.runtime_query_module_count, 2);
        assert_eq!(summary.runtime_query_ready_module_count, 2);
        assert!(
            summary
                .delegated_source_resolution_products
                .contains(&"engine-input-producers.source-resolution-canonical-producer")
        );
        assert!(
            summary
                .resolver_owned_products
                .contains(&"omena-resolver.module-graph-index")
        );
        assert!(
            summary
                .resolver_owned_products
                .contains(&"omena-resolver.runtime-query-boundary")
        );
        assert!(summary.ready_surfaces.contains(&"resolverModuleGraphIndex"));
        assert!(
            summary
                .ready_surfaces
                .contains(&"resolverRuntimeQueryBoundary")
        );
        assert!(
            summary
                .next_decoupling_targets
                .contains(&"tsconfigPathMapping")
        );
    }

    #[test]
    fn builds_resolver_module_graph_index_from_engine_input() {
        let input = sample_input();
        let summary = summarize_omena_resolver_module_graph_index(&input);

        assert_eq!(summary.schema_version, "0");
        assert_eq!(summary.product, "omena-resolver.module-graph-index");
        assert_eq!(summary.input_version, "2");
        assert_eq!(summary.module_count, 2);
        assert_eq!(summary.source_expression_edge_count, 2);
        assert_eq!(summary.type_fact_edge_count, 2);
        assert_eq!(summary.selector_count, 2);
        assert_eq!(summary.unresolved_type_fact_count, 0);
        assert!(summary.unresolved_type_fact_expression_ids.is_empty());

        let app = summary
            .modules
            .iter()
            .find(|module| module.style_file_path == "/tmp/App.module.scss");
        assert!(app.is_some());
        let Some(app) = app else {
            return;
        };
        assert_eq!(app.source_expression_ids, ["expr-1"]);
        assert_eq!(app.source_expression_kinds, ["symbolRef"]);
        assert_eq!(app.type_fact_expression_ids, ["expr-1"]);
        assert_eq!(app.selector_names, ["btn-active"]);
        assert_eq!(app.canonical_selector_names, ["btn-active"]);
        assert!(app.has_source_input);
        assert!(app.has_style_input);
        assert!(app.has_type_fact_input);

        let card = summary
            .modules
            .iter()
            .find(|module| module.style_file_path == "/tmp/Card.module.scss");
        assert!(card.is_some());
        let Some(card) = card else {
            return;
        };
        assert_eq!(card.source_expression_ids, ["expr-2"]);
        assert_eq!(card.source_expression_kinds, ["styleAccess"]);
        assert_eq!(card.type_fact_expression_ids, ["expr-2"]);
        assert_eq!(card.selector_names, ["card-header"]);
        assert_eq!(card.canonical_selector_names, ["card-header"]);
    }

    #[test]
    fn exposes_runtime_query_boundary_from_module_graph_index() {
        let input = sample_input();
        let module_graph = summarize_omena_resolver_module_graph_index(&input);
        let runtime_query = summarize_omena_resolver_runtime_query_boundary(&module_graph);

        assert_eq!(runtime_query.schema_version, "0");
        assert_eq!(
            runtime_query.product,
            "omena-resolver.runtime-query-boundary"
        );
        assert_eq!(
            runtime_query.input_product,
            "omena-resolver.module-graph-index"
        );
        assert_eq!(runtime_query.input_version, "2");
        assert_eq!(runtime_query.module_query_count, 2);
        assert_eq!(runtime_query.fully_resolvable_module_count, 2);
        assert_eq!(runtime_query.source_only_module_count, 0);
        assert_eq!(runtime_query.style_only_module_count, 0);
        assert_eq!(runtime_query.unresolved_type_fact_count, 0);
        assert!(runtime_query.blocking_gaps.is_empty());
        assert!(
            runtime_query
                .runtime_capabilities
                .contains(&"moduleLookupByStylePath")
        );

        let app = query_omena_resolver_runtime_module(&module_graph, "/tmp/App.module.scss");
        assert!(app.is_some());
        let Some(app) = app else {
            return;
        };
        assert_eq!(app.status, "ready");
        assert!(app.can_resolve_source_expressions);
        assert!(app.can_check_type_fact_edges);
        assert!(app.can_query_selector_names);
        assert_eq!(app.source_expression_ids, ["expr-1"]);
        assert_eq!(app.selector_names, ["btn-active"]);
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
