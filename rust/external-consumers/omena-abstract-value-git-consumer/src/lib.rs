use omena_abstract_value::{
    ExternalStringTypeFactsV0, abstract_class_value_from_facts, project_abstract_value_selectors,
    summarize_omena_abstract_value_domain,
};

pub fn consume_domain_summary_product() -> &'static str {
    summarize_omena_abstract_value_domain().product
}

pub fn consume_prefix_suffix_projection() -> Vec<String> {
    let facts = ExternalStringTypeFactsV0 {
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
    };
    let abstract_value = abstract_class_value_from_facts(&facts);
    let selectors = vec![
        "btn-active".to_string(),
        "card".to_string(),
        "btn-ghost-active".to_string(),
    ];
    project_abstract_value_selectors(&abstract_value, &selectors).selector_names
}

#[cfg(test)]
mod tests {
    use super::{consume_domain_summary_product, consume_prefix_suffix_projection};
    use omena_abstract_value::{
        AbstractClassValueV0, ClassValueFlowGraphV0, ClassValueFlowNodeV0,
        ClassValueFlowTransferV0, ExternalStringTypeFactsV0, OneCfaCallSiteFlowInputV0,
        abstract_class_value_from_facts, analyze_class_value_flow,
        analyze_one_cfa_call_site_flows, char_inclusion_class_value,
        enumerate_finite_class_values, exact_class_value, finite_set_class_value,
        intersect_abstract_class_values, join_abstract_class_values, prefix_class_value,
        reduced_abstract_class_value_from_facts,
        reduced_class_value_derivation_from_facts, reduced_value_domain_kind_from_facts,
        suffix_class_value, summarize_omena_abstract_value_flow_analysis,
        value_certainty_shape_kind_from_facts,
    };
    use serde_json::json;

    #[test]
    fn consumes_remote_abstract_value_domain_via_git_dependency() {
        assert_eq!(
            consume_domain_summary_product(),
            "omena-abstract-value.domain"
        );
        assert_eq!(
            consume_prefix_suffix_projection(),
            vec!["btn-active".to_string(), "btn-ghost-active".to_string()]
        );
    }

    #[test]
    fn consumes_finite_set_normalization_contract() -> Result<(), String> {
        let value = finite_set_class_value(["card", "button", "card"]);
        let values = enumerate_finite_class_values(&value)
            .ok_or_else(|| "expected finite values".to_string())?;

        assert_eq!(values, vec!["button".to_string(), "card".to_string()]);
        Ok(())
    }

    #[test]
    fn consumes_external_facts_mapping_contract() {
        let facts = ExternalStringTypeFactsV0 {
            kind: "finiteSet".to_string(),
            constraint_kind: None,
            values: Some(vec!["button".to_string(), "card".to_string()]),
            prefix: None,
            suffix: None,
            min_len: None,
            max_len: None,
            char_must: None,
            char_may: None,
            may_include_other_chars: None,
        };

        let abstract_value = abstract_class_value_from_facts(&facts);
        assert!(matches!(
            abstract_value,
            AbstractClassValueV0::FiniteSet { .. }
        ));
        assert_eq!(
            value_certainty_shape_kind_from_facts(&facts),
            "boundedFinite"
        );
    }

    #[test]
    fn consumes_reduced_external_facts_mapping_contract() {
        let facts = ExternalStringTypeFactsV0 {
            kind: "finiteSet".to_string(),
            constraint_kind: Some("prefix".to_string()),
            values: Some(vec!["btn-primary".to_string(), "card".to_string()]),
            prefix: Some("btn-".to_string()),
            suffix: None,
            min_len: None,
            max_len: None,
            char_must: None,
            char_may: None,
            may_include_other_chars: None,
        };

        assert_eq!(reduced_abstract_class_value_from_facts(&facts), {
            AbstractClassValueV0::Exact {
                value: "btn-primary".to_string(),
            }
        });
        assert_eq!(reduced_value_domain_kind_from_facts(&facts), "exact");
    }

    #[test]
    fn consumes_reduced_derivation_contract() {
        let facts = ExternalStringTypeFactsV0 {
            kind: "finiteSet".to_string(),
            constraint_kind: Some("prefix".to_string()),
            values: Some(vec!["btn-primary".to_string(), "card".to_string()]),
            prefix: Some("btn-".to_string()),
            suffix: None,
            min_len: None,
            max_len: None,
            char_must: None,
            char_may: None,
            may_include_other_chars: None,
        };

        let derivation = reduced_class_value_derivation_from_facts(&facts);

        assert_eq!(derivation.schema_version, "0");
        assert_eq!(
            derivation.product,
            "omena-abstract-value.reduced-class-value-derivation"
        );
        assert_eq!(derivation.input_fact_kind, "finiteSet");
        assert_eq!(derivation.input_constraint_kind.as_deref(), Some("prefix"));
        assert_eq!(derivation.input_value_count, 2);
        assert_eq!(derivation.reduced_kind, "exact");
        assert_eq!(derivation.steps[1].operation, "intersectConstraint");
        assert_eq!(derivation.steps[1].result_kind, "exact");
    }

    #[test]
    fn consumes_reduced_product_intersection_contract() {
        let finite = finite_set_class_value(["btn-primary", "card", "btn-secondary"]);
        let prefix = prefix_class_value("btn-", None);

        assert_eq!(
            intersect_abstract_class_values(&finite, &prefix),
            AbstractClassValueV0::FiniteSet {
                values: vec!["btn-primary".to_string(), "btn-secondary".to_string()]
            }
        );

        let edge = intersect_abstract_class_values(
            &prefix_class_value("btn-", None),
            &suffix_class_value("-active", None),
        );
        let reduced = intersect_abstract_class_values(
            &edge,
            &char_inclusion_class_value("ab", "-abceintv", None, false),
        );

        assert_eq!(
            reduced,
            AbstractClassValueV0::Composite {
                prefix: Some("btn-".to_string()),
                suffix: Some("-active".to_string()),
                min_length: Some("btn--active".len()),
                must_chars: "-abceintv".to_string(),
                may_chars: "-abceintv".to_string(),
                may_include_other_chars: false,
                provenance: Some(
                    omena_abstract_value::AbstractClassValueProvenanceV0::CompositeJoin
                ),
            }
        );
    }

    #[test]
    fn consumes_flow_analysis_contract() {
        let summary = summarize_omena_abstract_value_flow_analysis();
        assert_eq!(summary.product, "omena-abstract-value.flow-analysis");
        assert_eq!(summary.context_sensitivity, "1-cfa");
        assert!(summary.analysis_scopes.contains(&"callSiteBatch"));

        assert_eq!(
            join_abstract_class_values(
                &exact_class_value("btn-primary"),
                &exact_class_value("card")
            ),
            AbstractClassValueV0::FiniteSet {
                values: vec!["btn-primary".to_string(), "card".to_string()]
            }
        );

        let analysis = analyze_class_value_flow(&ClassValueFlowGraphV0 {
            context_key: Some("consumer:render@primary".to_string()),
            nodes: vec![
                flow_assign_node("then", "btn-primary"),
                flow_assign_node("else", "card"),
                ClassValueFlowNodeV0 {
                    id: "merge".to_string(),
                    predecessors: vec!["then".to_string(), "else".to_string()],
                    transfer: ClassValueFlowTransferV0::Join,
                },
            ],
        });

        assert_eq!(analysis.product, "omena-abstract-value.flow-analysis");
        assert!(analysis.converged);
        assert_eq!(
            analysis
                .nodes
                .iter()
                .find(|node| node.id == "merge")
                .map(|node| &node.value),
            Some(&AbstractClassValueV0::FiniteSet {
                values: vec!["btn-primary".to_string(), "card".to_string()]
            })
        );
    }

    #[test]
    fn consumes_one_cfa_call_site_flow_contract() {
        let analysis = analyze_one_cfa_call_site_flows(&[
            OneCfaCallSiteFlowInputV0 {
                callee_key: "variantClass".to_string(),
                call_site_id: "Button.tsx:10".to_string(),
                graph: flow_exit_graph("btn-primary"),
                exit_node_id: "exit".to_string(),
            },
            OneCfaCallSiteFlowInputV0 {
                callee_key: "variantClass".to_string(),
                call_site_id: "Card.tsx:20".to_string(),
                graph: flow_exit_graph("btn-secondary"),
                exit_node_id: "exit".to_string(),
            },
        ]);

        assert_eq!(
            analysis.product,
            "omena-abstract-value.one-cfa-call-site-flow"
        );
        assert_eq!(analysis.context_sensitivity, "1-cfa");
        assert_eq!(analysis.call_site_count, 2);
        assert_eq!(analysis.callee_count, 1);
        assert_eq!(
            analysis.entries[0].context_key,
            "variantClass@Button.tsx:10"
        );
        assert_eq!(analysis.entries[0].derivation.steps[0].operation, "contextFromCallSite");
        assert_eq!(
            analysis.callee_summaries[0].joined_exit_value,
            AbstractClassValueV0::FiniteSet {
                values: vec!["btn-primary".to_string(), "btn-secondary".to_string()]
            }
        );
    }

    #[test]
    fn serializes_remote_domain_summary_for_downstream_consumers() -> Result<(), String> {
        let value =
            serde_json::to_value(omena_abstract_value::summarize_omena_abstract_value_domain())
                .map_err(|error| error.to_string())?;

        assert_eq!(value["schemaVersion"], json!("0"));
        assert_eq!(value["product"], json!("omena-abstract-value.domain"));
        assert_eq!(value["maxFiniteClassValues"], json!(8));
        Ok(())
    }

    fn flow_assign_node(id: &str, value: &str) -> ClassValueFlowNodeV0 {
        ClassValueFlowNodeV0 {
            id: id.to_string(),
            predecessors: Vec::new(),
            transfer: ClassValueFlowTransferV0::AssignFacts(ExternalStringTypeFactsV0 {
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
            }),
        }
    }

    fn flow_exit_graph(value: &str) -> ClassValueFlowGraphV0 {
        ClassValueFlowGraphV0 {
            context_key: None,
            nodes: vec![
                flow_assign_node("input", value),
                ClassValueFlowNodeV0 {
                    id: "exit".to_string(),
                    predecessors: vec!["input".to_string()],
                    transfer: ClassValueFlowTransferV0::Join,
                },
            ],
        }
    }
}
