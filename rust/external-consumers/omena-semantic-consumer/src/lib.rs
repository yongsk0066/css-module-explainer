use engine_input_producers::{
    ClassExpressionInputV2, EngineInputV2, PositionV2, RangeV2, SourceAnalysisInputV2,
    SourceDocumentV2, StringTypeFactsV2, StyleAnalysisInputV2, StyleDocumentV2, StyleSelectorV2,
    TypeFactEntryV2,
};
use engine_style_parser::parse_style_module;
use omena_semantic::{StyleSemanticGraphSummaryV0, summarize_style_semantic_graph};

pub fn consume_style_semantic_graph() -> Option<StyleSemanticGraphSummaryV0> {
    let sheet = parse_style_module("Component.module.scss", ".button { &__icon {} }")?;
    Some(summarize_style_semantic_graph(&sheet, &sample_input()))
}

fn sample_input() -> EngineInputV2 {
    EngineInputV2 {
        version: "2".to_string(),
        sources: vec![SourceAnalysisInputV2 {
            document: SourceDocumentV2 {
                class_expressions: vec![ClassExpressionInputV2 {
                    id: "expr-button".to_string(),
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
                        name: "button__icon".to_string(),
                        view_kind: "canonical".to_string(),
                        canonical_name: Some("button__icon".to_string()),
                        range: range(0, 11, 0, 19),
                        nested_safety: Some("bemSuffixSafe".to_string()),
                        composes: None,
                        bem_suffix: None,
                    },
                ],
            },
        }],
        type_facts: vec![TypeFactEntryV2 {
            file_path: "/tmp/Component.tsx".to_string(),
            expression_id: "expr-button".to_string(),
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

#[cfg(test)]
mod tests {
    use super::consume_style_semantic_graph;
    use engine_style_parser::parse_style_module;
    use omena_semantic::summarize_style_semantic_boundary;
    use serde_json::json;

    #[test]
    fn consumes_omena_semantic_graph_boundary_from_external_crate() -> Result<(), String> {
        let graph = consume_style_semantic_graph()
            .ok_or_else(|| "expected style semantic graph".to_string())?;

        assert_eq!(graph.product, "omena-semantic.style-semantic-graph");
        assert_eq!(graph.selector_identity_engine.canonical_id_count, 2);
        assert_eq!(
            graph.source_input_evidence.reference_site_identity.status,
            "ready"
        );
        assert_eq!(graph.source_input_evidence.binding_origin.status, "ready");
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
    fn serializes_omena_semantic_graph_for_downstream_consumers() -> Result<(), String> {
        let graph = consume_style_semantic_graph()
            .ok_or_else(|| "expected style semantic graph".to_string())?;
        let value = serde_json::to_value(&graph).map_err(|error| error.to_string())?;

        assert_eq!(value["schemaVersion"], json!("0"));
        assert_eq!(
            value["product"],
            json!("omena-semantic.style-semantic-graph")
        );
        assert_eq!(
            value["promotionEvidence"]["blockingGaps"],
            json!([] as [String; 0])
        );
        assert_eq!(
            value["sourceInputEvidence"]["styleModuleEdge"]["status"],
            json!("ready")
        );
        Ok(())
    }

    #[test]
    fn keeps_legacy_boundary_summary_consumable() -> Result<(), String> {
        let sheet = parse_style_module("Component.module.scss", ".button { color: red; }")
            .ok_or_else(|| "expected stylesheet".to_string())?;
        let summary = summarize_style_semantic_boundary(&sheet);

        assert_eq!(summary.schema_version, "0");
        assert_eq!(
            summary
                .selector_identity_engine
                .canonical_ids
                .first()
                .map(|identity| identity.canonical_id.as_str()),
            Some("selector:button")
        );
        Ok(())
    }
}
