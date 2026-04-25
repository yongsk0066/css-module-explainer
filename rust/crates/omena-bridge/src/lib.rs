use engine_input_producers::EngineInputV2;
use engine_style_parser::{ParserBoundarySyntaxFactsV0, StyleSemanticFactsV0, Stylesheet};
use omena_semantic::{SemanticPromotionEvidenceSummaryV0, SourceInputPromotionEvidenceSummaryV0};
use serde::Serialize;

pub use omena_semantic::StyleSemanticGraphSummaryV0;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OmenaBridgeBoundarySummaryV0 {
    pub schema_version: &'static str,
    pub product: &'static str,
    pub bridge_name: &'static str,
    pub delegated_graph_product: &'static str,
    pub delegated_source_evidence_product: &'static str,
    pub cme_coupled_surfaces: Vec<&'static str>,
    pub next_decoupling_targets: Vec<&'static str>,
}

pub fn summarize_omena_bridge_boundary() -> OmenaBridgeBoundarySummaryV0 {
    OmenaBridgeBoundarySummaryV0 {
        schema_version: "0",
        product: "omena-bridge.cme-semantic-bridge",
        bridge_name: "cme-semantic-bridge",
        delegated_graph_product: "omena-semantic.style-semantic-graph",
        delegated_source_evidence_product: "omena-semantic.source-input-evidence",
        cme_coupled_surfaces: vec![
            "EngineInputV2",
            "sourceInputEvidence",
            "selectorReferenceEngine",
            "promotionEvidenceWithSourceInput",
            "styleSemanticGraphFromSource",
        ],
        next_decoupling_targets: vec![
            "sourceInputEvidence",
            "selectorReferenceEngine",
            "promotionEvidenceWithSourceInput",
        ],
    }
}

pub fn summarize_omena_bridge_source_input_evidence(
    input: &EngineInputV2,
) -> SourceInputPromotionEvidenceSummaryV0 {
    omena_semantic::summarize_source_input_evidence(input)
}

pub fn summarize_omena_bridge_promotion_evidence_with_source_input(
    parser_facts: &ParserBoundarySyntaxFactsV0,
    semantic_facts: &StyleSemanticFactsV0,
    input: &EngineInputV2,
) -> SemanticPromotionEvidenceSummaryV0 {
    omena_semantic::summarize_semantic_promotion_evidence_with_source_input(
        parser_facts,
        semantic_facts,
        input,
    )
}

pub fn summarize_omena_bridge_style_semantic_graph(
    sheet: &Stylesheet,
    input: &EngineInputV2,
) -> StyleSemanticGraphSummaryV0 {
    omena_semantic::summarize_style_semantic_graph(sheet, input)
}

pub fn summarize_omena_bridge_style_semantic_graph_for_path(
    sheet: &Stylesheet,
    input: &EngineInputV2,
    style_path: Option<&str>,
) -> StyleSemanticGraphSummaryV0 {
    omena_semantic::summarize_style_semantic_graph_for_path(sheet, input, style_path)
}

pub fn summarize_omena_bridge_style_semantic_graph_from_source(
    style_path: &str,
    style_source: &str,
    input: &EngineInputV2,
) -> Option<StyleSemanticGraphSummaryV0> {
    omena_semantic::summarize_style_semantic_graph_from_source(style_path, style_source, input)
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
        summarize_omena_bridge_boundary, summarize_omena_bridge_source_input_evidence,
        summarize_omena_bridge_style_semantic_graph,
        summarize_omena_bridge_style_semantic_graph_from_source,
    };

    #[test]
    fn declares_cme_coupled_bridge_boundary() {
        let boundary = summarize_omena_bridge_boundary();

        assert_eq!(boundary.schema_version, "0");
        assert_eq!(boundary.product, "omena-bridge.cme-semantic-bridge");
        assert_eq!(
            boundary.delegated_graph_product,
            "omena-semantic.style-semantic-graph"
        );
        assert_eq!(
            boundary.delegated_source_evidence_product,
            "omena-semantic.source-input-evidence"
        );
        assert!(
            boundary
                .cme_coupled_surfaces
                .contains(&"promotionEvidenceWithSourceInput")
        );
        assert!(
            boundary
                .next_decoupling_targets
                .contains(&"sourceInputEvidence")
        );
    }

    #[test]
    fn exposes_source_input_evidence_through_bridge() {
        let evidence = summarize_omena_bridge_source_input_evidence(&sample_engine_input());

        assert_eq!(evidence.product, "omena-semantic.source-input-evidence");
        assert_eq!(evidence.reference_site_identity.status, "ready");
        assert_eq!(evidence.reference_site_identity.reference_site_count, 1);
        assert_eq!(evidence.certainty_reason.status, "ready");
        assert_eq!(evidence.binding_origin.status, "ready");
        assert!(evidence.blocking_gaps.is_empty());
    }

    #[test]
    fn exposes_style_semantic_graph_through_bridge() -> Result<(), String> {
        let sheet = parse_style_module("Component.module.scss", ".button { color: red; }")
            .ok_or_else(|| "SCSS module path should parse".to_string())?;
        let graph = summarize_omena_bridge_style_semantic_graph(&sheet, &sample_engine_input());

        assert_eq!(graph.product, "omena-semantic.style-semantic-graph");
        assert_eq!(graph.selector_reference_engine.selector_count, 1);
        assert_eq!(graph.selector_reference_engine.referenced_selector_count, 1);
        assert!(graph.promotion_evidence.blocking_gaps.is_empty());
        Ok(())
    }

    #[test]
    fn exposes_style_semantic_graph_from_source_through_bridge() -> Result<(), String> {
        let graph = summarize_omena_bridge_style_semantic_graph_from_source(
            "/tmp/Component.module.scss",
            ".button { color: red; }",
            &sample_engine_input(),
        )
        .ok_or_else(|| "bridge should parse SCSS module source".to_string())?;

        assert_eq!(graph.product, "omena-semantic.style-semantic-graph");
        assert_eq!(
            graph.selector_reference_engine.style_path,
            Some("/tmp/Component.module.scss".to_string())
        );
        assert_eq!(
            graph.source_input_evidence.reference_site_identity.status,
            "ready"
        );
        Ok(())
    }

    fn sample_engine_input() -> EngineInputV2 {
        EngineInputV2 {
            version: "2".to_string(),
            sources: vec![SourceAnalysisInputV2 {
                document: SourceDocumentV2 {
                    class_expressions: vec![ClassExpressionInputV2 {
                        id: "expr-literal".to_string(),
                        kind: "literal".to_string(),
                        scss_module_path: "/tmp/Component.module.scss".to_string(),
                        range: range(4, 12, 4, 18),
                        class_name: Some("button".to_string()),
                        root_binding_decl_id: None,
                        access_path: None,
                    }],
                },
            }],
            styles: vec![StyleAnalysisInputV2 {
                file_path: "/tmp/Component.module.scss".to_string(),
                document: StyleDocumentV2 {
                    selectors: vec![StyleSelectorV2 {
                        name: "button".to_string(),
                        view_kind: "canonical".to_string(),
                        canonical_name: Some("button".to_string()),
                        range: range(0, 1, 0, 7),
                        nested_safety: Some("flat".to_string()),
                        composes: None,
                        bem_suffix: None,
                    }],
                },
            }],
            type_facts: vec![TypeFactEntryV2 {
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
            }],
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
