use engine_input_producers::EngineInputV2;
use engine_style_parser::{
    ParserBoundarySyntaxFactsV0, StyleSemanticFactsV0, Stylesheet, summarize_semantic_boundary,
};
use serde::Serialize;

mod evidence;
mod lossless_cst;
mod observation;
mod selector_identity;
mod source_evidence;

pub use evidence::{
    SemanticPromotionEvidenceItemV0, SemanticPromotionEvidenceSummaryV0,
    summarize_semantic_promotion_evidence, summarize_semantic_promotion_evidence_with_source_input,
};
pub use lossless_cst::{
    LosslessCstConsumerReadinessV0, LosslessCstContractV0, LosslessCstSpanInvariantsV0,
    summarize_lossless_cst_contract,
};
pub use observation::{
    SelectorIdentityObservationV0, SemanticCouplingBoundaryObservationV0,
    SemanticGraphDownstreamReadinessV0, SourceEvidenceObservationV0, TheoryObservationContractV0,
    TheoryObservationHarnessInput, TheoryObservationHarnessSummaryV0,
    summarize_theory_observation_contract, summarize_theory_observation_harness,
};
pub use selector_identity::{
    SelectorCanonicalIdentityV0, SelectorIdentityEngineSummaryV0, SelectorIdentityRewriteSafetyV0,
    summarize_selector_identity_engine,
};
pub use source_evidence::{
    BindingOriginEvidenceV0, CertaintyReasonEvidenceV0, ReferenceSiteIdentityEvidenceV0,
    SourceInputPromotionEvidenceSummaryV0, StyleModuleEdgeEvidenceV0,
    ValueDomainExplanationEvidenceV0, summarize_source_input_evidence,
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StyleSemanticBoundarySummaryV0 {
    pub schema_version: &'static str,
    pub language: &'static str,
    pub parser_facts: ParserBoundarySyntaxFactsV0,
    pub semantic_facts: StyleSemanticFactsV0,
    pub selector_identity_engine: SelectorIdentityEngineSummaryV0,
    pub promotion_evidence: SemanticPromotionEvidenceSummaryV0,
    pub lossless_cst_contract: LosslessCstContractV0,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StyleSemanticGraphSummaryV0 {
    pub schema_version: &'static str,
    pub product: &'static str,
    pub language: &'static str,
    pub parser_facts: ParserBoundarySyntaxFactsV0,
    pub semantic_facts: StyleSemanticFactsV0,
    pub selector_identity_engine: SelectorIdentityEngineSummaryV0,
    pub source_input_evidence: SourceInputPromotionEvidenceSummaryV0,
    pub promotion_evidence: SemanticPromotionEvidenceSummaryV0,
    pub lossless_cst_contract: LosslessCstContractV0,
}

pub fn summarize_style_semantic_boundary(sheet: &Stylesheet) -> StyleSemanticBoundarySummaryV0 {
    let boundary = summarize_semantic_boundary(sheet);
    let parser_facts = boundary.parser_facts;
    let semantic_facts = boundary.semantic_facts;
    let selector_identity_engine =
        summarize_selector_identity_engine(&semantic_facts.selector_identity);
    let promotion_evidence = summarize_semantic_promotion_evidence(&parser_facts, &semantic_facts);
    let lossless_cst_contract = summarize_lossless_cst_contract(&parser_facts.lossless_cst);

    StyleSemanticBoundarySummaryV0 {
        schema_version: "0",
        language: boundary.language,
        parser_facts,
        semantic_facts,
        selector_identity_engine,
        promotion_evidence,
        lossless_cst_contract,
    }
}

pub fn summarize_style_semantic_graph(
    sheet: &Stylesheet,
    input: &EngineInputV2,
) -> StyleSemanticGraphSummaryV0 {
    let boundary = summarize_semantic_boundary(sheet);
    let parser_facts = boundary.parser_facts;
    let semantic_facts = boundary.semantic_facts;
    let selector_identity_engine =
        summarize_selector_identity_engine(&semantic_facts.selector_identity);
    let source_input_evidence = summarize_source_input_evidence(input);
    let promotion_evidence = summarize_semantic_promotion_evidence_with_source_input(
        &parser_facts,
        &semantic_facts,
        input,
    );
    let lossless_cst_contract = summarize_lossless_cst_contract(&parser_facts.lossless_cst);

    StyleSemanticGraphSummaryV0 {
        schema_version: "0",
        product: "omena-semantic.style-semantic-graph",
        language: boundary.language,
        parser_facts,
        semantic_facts,
        selector_identity_engine,
        source_input_evidence,
        promotion_evidence,
        lossless_cst_contract,
    }
}

pub fn summarize_style_semantic_facts(sheet: &Stylesheet) -> StyleSemanticFactsV0 {
    summarize_style_semantic_boundary(sheet).semantic_facts
}

pub fn summarize_parser_contract_facts(sheet: &Stylesheet) -> ParserBoundarySyntaxFactsV0 {
    summarize_style_semantic_boundary(sheet).parser_facts
}

#[cfg(test)]
mod tests {
    use engine_input_producers::{
        ClassExpressionInputV2, EngineInputV2, PositionV2, RangeV2, SourceAnalysisInputV2,
        SourceDocumentV2, StringTypeFactsV2, StyleAnalysisInputV2, StyleDocumentV2,
        StyleSelectorV2, TypeFactEntryV2,
    };
    use engine_style_parser::parse_style_module;

    use super::{
        TheoryObservationHarnessInput, summarize_lossless_cst_contract,
        summarize_parser_contract_facts, summarize_selector_identity_engine,
        summarize_semantic_promotion_evidence,
        summarize_semantic_promotion_evidence_with_source_input, summarize_source_input_evidence,
        summarize_style_semantic_boundary, summarize_style_semantic_facts,
        summarize_style_semantic_graph, summarize_theory_observation_contract,
        summarize_theory_observation_harness,
    };

    #[test]
    fn exposes_semantic_summary_without_hiding_parser_contract_facts() -> Result<(), String> {
        let sheet = parse_style_module(
            "Component.module.scss",
            r#"
@use "./tokens" as tokens;
$local: red;

@mixin tone($value) {
  color: $value;
}

.button {
  color: $local;
  @include tone(tokens.$accent);

  &__icon {
    animation: pulse 1s;
  }
}

@keyframes pulse {
  from { opacity: 0; }
  to { opacity: 1; }
}
"#,
        )
        .ok_or_else(|| "SCSS module path should parse".to_string())?;

        let summary = summarize_style_semantic_boundary(&sheet);

        assert_eq!(summary.schema_version, "0");
        assert_eq!(summary.language, "scss");
        assert!(
            summary
                .parser_facts
                .lossless_cst
                .all_token_spans_within_source
        );
        assert!(
            summary
                .parser_facts
                .lossless_cst
                .all_node_spans_within_source
        );
        assert_eq!(
            summary.parser_facts.sass.module_use_sources,
            vec!["./tokens".to_string()]
        );
        assert_eq!(
            summary.semantic_facts.selector_identity.canonical_names,
            vec!["button".to_string(), "button__icon".to_string()]
        );
        assert_eq!(summary.selector_identity_engine.canonical_id_count, 2);
        assert_eq!(
            summary
                .selector_identity_engine
                .canonical_ids
                .iter()
                .map(|identity| identity.canonical_id.as_str())
                .collect::<Vec<_>>(),
            vec!["selector:button", "selector:button__icon"]
        );
        assert!(
            summary
                .selector_identity_engine
                .rewrite_safety
                .all_canonical_ids_rewrite_safe
        );
        assert_eq!(
            summary
                .semantic_facts
                .selector_identity
                .bem_suffix_safe_names,
            vec!["button__icon".to_string()]
        );
        assert_eq!(
            summary
                .semantic_facts
                .sass
                .selectors_with_resolved_variable_refs_names,
            vec!["button".to_string()]
        );
        assert_eq!(
            summary
                .semantic_facts
                .sass
                .selectors_with_resolved_mixin_includes_names,
            vec!["button".to_string()]
        );
        assert!(
            summary
                .lossless_cst_contract
                .span_invariants
                .byte_span_contract_ready
        );
        assert_eq!(
            summary.promotion_evidence.blocking_gaps,
            vec!["referenceSiteIdentity", "certaintyReason"]
        );
        Ok(())
    }

    #[test]
    fn offers_narrow_semantic_and_parser_contract_accessors() -> Result<(), String> {
        let sheet = parse_style_module(
            "Component.module.scss",
            r#"
$color: red;

.button {
  color: $color;
}
"#,
        )
        .ok_or_else(|| "SCSS module path should parse".to_string())?;

        let parser_facts = summarize_parser_contract_facts(&sheet);
        let semantic_facts = summarize_style_semantic_facts(&sheet);

        assert_eq!(parser_facts.selectors.names, vec!["button".to_string()]);
        assert_eq!(
            parser_facts.sass.variable_decl_names,
            vec!["color".to_string()]
        );
        assert_eq!(
            semantic_facts
                .sass
                .selectors_with_resolved_variable_refs_names,
            vec!["button".to_string()]
        );
        assert!(
            semantic_facts
                .sass
                .selectors_with_unresolved_variable_refs_names
                .is_empty()
        );
        Ok(())
    }

    #[test]
    fn exposes_selector_identity_as_dedicated_semantic_sub_engine() -> Result<(), String> {
        let sheet = parse_style_module(
            "Component.module.scss",
            r#"
.button {
  &__icon {}
  &.active {}
}
"#,
        )
        .ok_or_else(|| "SCSS module path should parse".to_string())?;

        let semantic_facts = summarize_style_semantic_facts(&sheet);
        let selector_identity =
            summarize_selector_identity_engine(&semantic_facts.selector_identity);

        assert_eq!(
            selector_identity.product,
            "omena-semantic.selector-identity"
        );
        assert_eq!(
            selector_identity
                .canonical_ids
                .iter()
                .map(|identity| {
                    (
                        identity.canonical_id.as_str(),
                        identity.identity_kind,
                        identity.rewrite_safety,
                    )
                })
                .collect::<Vec<_>>(),
            vec![
                ("selector:active", "localClass", "blocked"),
                ("selector:button", "localClass", "safe"),
                ("selector:button__icon", "bemSuffix", "safe")
            ]
        );
        assert_eq!(
            selector_identity.rewrite_safety.blocked_canonical_ids,
            vec!["selector:active".to_string()]
        );
        assert_eq!(
            selector_identity.rewrite_safety.blockers,
            vec!["nested-expansion"]
        );
        Ok(())
    }

    #[test]
    fn exposes_promotion_evidence_gaps_without_hiding_ready_contracts() -> Result<(), String> {
        let sheet = parse_style_module(
            "Component.module.scss",
            r#"
@use "./tokens" as tokens;

.button {
  color: tokens.$accent;
}
"#,
        )
        .ok_or_else(|| "SCSS module path should parse".to_string())?;

        let parser_facts = summarize_parser_contract_facts(&sheet);
        let semantic_facts = summarize_style_semantic_facts(&sheet);
        let evidence = summarize_semantic_promotion_evidence(&parser_facts, &semantic_facts);

        assert_eq!(evidence.product, "omena-semantic.promotion-evidence");
        assert_eq!(
            evidence
                .items
                .iter()
                .find(|item| item.evidence == "selectorCanonicalId")
                .map(|item| item.status),
            Some("ready")
        );
        assert_eq!(
            evidence
                .items
                .iter()
                .find(|item| item.evidence == "sourceSpan")
                .map(|item| item.status),
            Some("ready")
        );
        assert_eq!(
            evidence
                .items
                .iter()
                .find(|item| item.evidence == "referenceSiteIdentity")
                .map(|item| item.status),
            Some("gap")
        );
        assert_eq!(
            evidence.next_priorities,
            vec!["referenceSiteIdentity", "certaintyReason", "bindingOrigin"]
        );
        Ok(())
    }

    #[test]
    fn exposes_lossless_cst_contract_for_precise_consumers() -> Result<(), String> {
        let sheet = parse_style_module("Component.module.scss", ".button { color: red; }")
            .ok_or_else(|| "SCSS module path should parse".to_string())?;

        let parser_facts = summarize_parser_contract_facts(&sheet);
        let contract = summarize_lossless_cst_contract(&parser_facts.lossless_cst);

        assert_eq!(contract.product, "omena-semantic.lossless-cst-contract");
        assert!(contract.span_invariants.byte_span_contract_ready);
        assert!(contract.consumer_readiness.precise_rename_base_ready);
        assert!(contract.consumer_readiness.formatter_base_ready);
        assert!(!contract.consumer_readiness.recovery_diagnostics_observed);
        Ok(())
    }

    #[test]
    fn exposes_source_input_evidence_for_reference_identity_and_certainty_reasons() {
        let evidence = summarize_source_input_evidence(&sample_engine_input());

        assert_eq!(evidence.product, "omena-semantic.source-input-evidence");
        assert_eq!(evidence.reference_site_identity.status, "ready");
        assert_eq!(evidence.reference_site_identity.reference_site_count, 2);
        assert_eq!(
            evidence.reference_site_identity.direct_reference_site_count,
            1
        );
        assert_eq!(
            evidence
                .reference_site_identity
                .expanded_reference_site_count,
            1
        );
        assert_eq!(
            evidence.reference_site_identity.editable_direct_site_count,
            1
        );
        assert_eq!(evidence.certainty_reason.status, "ready");
        assert_eq!(evidence.certainty_reason.expression_count, 2);
        assert_eq!(evidence.certainty_reason.exact_count, 1);
        assert_eq!(evidence.certainty_reason.inferred_count, 1);
        assert_eq!(evidence.binding_origin.status, "ready");
        assert_eq!(evidence.binding_origin.expression_count, 2);
        assert_eq!(evidence.binding_origin.direct_class_name_count, 1);
        assert_eq!(evidence.binding_origin.root_binding_count, 1);
        assert_eq!(
            evidence
                .binding_origin
                .expression_kind_counts
                .get("literal"),
            Some(&1)
        );
        assert_eq!(evidence.style_module_edge.status, "ready");
        assert_eq!(evidence.style_module_edge.source_style_edge_count, 2);
        assert_eq!(evidence.style_module_edge.distinct_style_module_count, 1);
        assert_eq!(
            evidence.style_module_edge.missing_style_document_edge_count,
            0
        );
        assert_eq!(evidence.value_domain_explanation.status, "ready");
        assert_eq!(evidence.value_domain_explanation.expression_count, 2);
        assert_eq!(evidence.value_domain_explanation.exact_expression_count, 1);
        assert_eq!(
            evidence
                .value_domain_explanation
                .constrained_expression_count,
            1
        );
        assert_eq!(evidence.value_domain_explanation.finite_value_count, 1);
        assert_eq!(
            evidence
                .certainty_reason
                .reason_counts
                .get("single selector matched"),
            Some(&1)
        );
        assert_eq!(
            evidence
                .certainty_reason
                .reason_counts
                .get("constrained runtime shape matched a bounded selector set"),
            Some(&1)
        );
    }

    #[test]
    fn source_input_evidence_upgrades_promotion_evidence_gaps() -> Result<(), String> {
        let sheet = parse_style_module("Component.module.scss", ".button { color: red; }")
            .ok_or_else(|| "SCSS module path should parse".to_string())?;
        let parser_facts = summarize_parser_contract_facts(&sheet);
        let semantic_facts = summarize_style_semantic_facts(&sheet);
        let evidence = summarize_semantic_promotion_evidence_with_source_input(
            &parser_facts,
            &semantic_facts,
            &sample_engine_input(),
        );

        assert_eq!(
            evidence
                .items
                .iter()
                .find(|item| item.evidence == "referenceSiteIdentity")
                .map(|item| item.status),
            Some("ready")
        );
        assert_eq!(
            evidence
                .items
                .iter()
                .find(|item| item.evidence == "bindingOrigin")
                .map(|item| item.status),
            Some("ready")
        );
        assert_eq!(
            evidence
                .items
                .iter()
                .find(|item| item.evidence == "styleModuleEdge")
                .map(|item| item.status),
            Some("ready")
        );
        assert_eq!(
            evidence
                .items
                .iter()
                .find(|item| item.evidence == "valueDomainExplanation")
                .map(|item| item.status),
            Some("ready")
        );
        assert_eq!(
            evidence
                .items
                .iter()
                .find(|item| item.evidence == "certaintyReason")
                .map(|item| item.status),
            Some("ready")
        );
        assert!(evidence.blocking_gaps.is_empty());
        assert!(evidence.next_priorities.is_empty());
        Ok(())
    }

    #[test]
    fn exposes_style_semantic_graph_with_source_backed_promotion_evidence() -> Result<(), String> {
        let sheet = parse_style_module("Component.module.scss", ".button { color: red; }")
            .ok_or_else(|| "SCSS module path should parse".to_string())?;
        let graph = summarize_style_semantic_graph(&sheet, &sample_engine_input());

        assert_eq!(graph.product, "omena-semantic.style-semantic-graph");
        assert_eq!(graph.language, "scss");
        assert_eq!(graph.source_input_evidence.binding_origin.status, "ready");
        assert_eq!(
            graph
                .promotion_evidence
                .items
                .iter()
                .filter(|item| item.status == "gap")
                .count(),
            0
        );
        assert!(graph.promotion_evidence.blocking_gaps.is_empty());
        assert!(
            graph
                .lossless_cst_contract
                .span_invariants
                .byte_span_contract_ready
        );
        Ok(())
    }

    #[test]
    fn theory_observation_harness_reports_ready_semantic_graph() -> Result<(), String> {
        let sheet = parse_style_module(
            "Component.module.scss",
            ".button { &__icon { color: red; } }",
        )
        .ok_or_else(|| "SCSS module path should parse".to_string())?;
        let graph = summarize_style_semantic_graph(&sheet, &sample_engine_input());
        let observation = summarize_theory_observation_harness(&graph);

        assert_eq!(
            observation.product,
            "omena-semantic.theory-observation-harness"
        );
        assert_eq!(
            observation.graph_product,
            "omena-semantic.style-semantic-graph"
        );
        assert_eq!(observation.selector_identity.status, "ready");
        assert_eq!(observation.selector_identity.observed_selector_count, 2);
        assert_eq!(
            observation.selector_identity.rewrite_blocked_selector_count,
            0
        );
        assert!(observation.selector_identity.rename_safe);
        assert_eq!(observation.source_evidence.status, "ready");
        assert_eq!(observation.source_evidence.reference_site_count, 2);
        assert_eq!(
            observation
                .source_evidence
                .certainty_reason_counts
                .get("single selector matched"),
            Some(&1)
        );
        assert_eq!(observation.downstream_readiness.status, "ready");
        assert!(observation.downstream_readiness.downstream_check_ready);
        assert!(observation.downstream_readiness.precise_rename_ready);
        assert_eq!(observation.coupling_boundary.generic_observation_count, 3);
        assert_eq!(
            observation.coupling_boundary.cme_coupled_observation_count,
            2
        );
        assert_eq!(
            observation.coupling_boundary.split_recommendation,
            "keep-integrated-observe-boundary"
        );
        assert!(observation.blocking_gaps.is_empty());
        assert_eq!(
            observation.next_priorities,
            vec!["externalCorpus", "traitDogfooding"]
        );

        let contract = summarize_theory_observation_contract(&graph);
        assert_eq!(
            contract.product,
            "omena-semantic.theory-observation-contract"
        );
        assert_eq!(
            contract.observation_product,
            "omena-semantic.theory-observation-harness"
        );
        assert!(contract.ready);
        assert_eq!(contract.selector_identity_status, "ready");
        assert_eq!(contract.source_evidence_status, "ready");
        assert_eq!(contract.downstream_readiness_status, "ready");
        assert!(contract.blocking_gaps.is_empty());
        assert_eq!(contract, graph.summarize_theory_observation_contract());
        Ok(())
    }

    #[test]
    fn theory_observation_harness_marks_rewrite_blockers_without_hiding_graph_readiness()
    -> Result<(), String> {
        let sheet = parse_style_module(
            "Component.module.scss",
            r#"
.button {
  &.active {}
}
"#,
        )
        .ok_or_else(|| "SCSS module path should parse".to_string())?;
        let graph = summarize_style_semantic_graph(&sheet, &sample_engine_input());
        let observation = summarize_theory_observation_harness(&graph);

        assert_eq!(observation.selector_identity.status, "partial");
        assert_eq!(
            observation.selector_identity.rewrite_blocked_selector_count,
            1
        );
        assert_eq!(
            observation.selector_identity.blockers,
            vec!["nested-expansion"]
        );
        assert!(observation.downstream_readiness.downstream_check_ready);
        assert!(!observation.downstream_readiness.precise_rename_ready);
        assert_eq!(observation.downstream_readiness.status, "partial");
        assert_eq!(
            observation.blocking_gaps,
            vec!["selectorRewriteSafety", "downstreamReadiness"]
        );

        let contract = graph.summarize_theory_observation_contract();
        assert!(!contract.ready);
        assert_eq!(
            contract.blocking_gaps,
            vec!["selectorRewriteSafety", "downstreamReadiness"]
        );
        Ok(())
    }

    #[test]
    fn theory_observation_harness_exposes_cme_coupling_gaps() -> Result<(), String> {
        let sheet = parse_style_module("Component.module.scss", ".button { color: red; }")
            .ok_or_else(|| "SCSS module path should parse".to_string())?;
        let graph = summarize_style_semantic_graph(&sheet, &empty_engine_input());
        let observation = summarize_theory_observation_harness(&graph);

        assert_eq!(observation.selector_identity.status, "ready");
        assert_eq!(observation.source_evidence.status, "gap");
        assert_eq!(observation.source_evidence.reference_site_count, 0);
        assert_eq!(
            observation
                .source_evidence
                .explainable_certainty_reason_count,
            0
        );
        assert_eq!(observation.downstream_readiness.status, "gap");
        assert_eq!(
            observation.blocking_gaps,
            vec!["sourceEvidence", "downstreamReadiness"]
        );
        assert_eq!(
            observation.coupling_boundary.generic_surfaces,
            vec![
                "parserSemanticFacts",
                "selectorIdentity",
                "losslessCstContract"
            ]
        );
        assert_eq!(
            observation.coupling_boundary.cme_coupled_surfaces,
            vec!["sourceInputEvidence", "promotionEvidenceWithSourceInput"]
        );
        Ok(())
    }

    fn sample_engine_input() -> EngineInputV2 {
        EngineInputV2 {
            version: "2".to_string(),
            sources: vec![SourceAnalysisInputV2 {
                document: SourceDocumentV2 {
                    class_expressions: vec![
                        ClassExpressionInputV2 {
                            id: "expr-literal".to_string(),
                            kind: "literal".to_string(),
                            scss_module_path: "/tmp/Component.module.scss".to_string(),
                            range: range(4, 12, 4, 18),
                            class_name: Some("button".to_string()),
                            root_binding_decl_id: None,
                            access_path: None,
                        },
                        ClassExpressionInputV2 {
                            id: "expr-prefix".to_string(),
                            kind: "symbolRef".to_string(),
                            scss_module_path: "/tmp/Component.module.scss".to_string(),
                            range: range(5, 12, 5, 24),
                            class_name: None,
                            root_binding_decl_id: Some("decl-prefix".to_string()),
                            access_path: None,
                        },
                    ],
                },
            }],
            styles: vec![StyleAnalysisInputV2 {
                file_path: "/tmp/Component.module.scss".to_string(),
                document: StyleDocumentV2 {
                    selectors: vec![
                        StyleSelectorV2 {
                            name: "button".to_string(),
                            view_kind: "canonical".to_string(),
                            canonical_name: Some("button".to_string()),
                            range: range(0, 1, 0, 7),
                            nested_safety: Some("flat".to_string()),
                            composes: None,
                            bem_suffix: None,
                        },
                        StyleSelectorV2 {
                            name: "button--primary".to_string(),
                            view_kind: "canonical".to_string(),
                            canonical_name: Some("button--primary".to_string()),
                            range: range(1, 1, 1, 16),
                            nested_safety: Some("flat".to_string()),
                            composes: None,
                            bem_suffix: None,
                        },
                    ],
                },
            }],
            type_facts: vec![
                TypeFactEntryV2 {
                    file_path: "/tmp/Component.tsx".to_string(),
                    expression_id: "expr-literal".to_string(),
                    facts: StringTypeFactsV2 {
                        kind: "exact".to_string(),
                        constraint_kind: None,
                        values: Some(vec!["button".to_string()]),
                        prefix: None,
                        suffix: None,
                        min_len: None,
                        max_len: None,
                        char_must: None,
                        char_may: None,
                        may_include_other_chars: None,
                    },
                },
                TypeFactEntryV2 {
                    file_path: "/tmp/Component.tsx".to_string(),
                    expression_id: "expr-prefix".to_string(),
                    facts: StringTypeFactsV2 {
                        kind: "constrained".to_string(),
                        constraint_kind: Some("prefix".to_string()),
                        values: None,
                        prefix: Some("button--".to_string()),
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

    fn empty_engine_input() -> EngineInputV2 {
        EngineInputV2 {
            version: "2".to_string(),
            sources: Vec::new(),
            styles: Vec::new(),
            type_facts: Vec::new(),
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
