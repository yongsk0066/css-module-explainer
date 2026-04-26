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
        AbstractClassValueV0, ExternalStringTypeFactsV0, abstract_class_value_from_facts,
        char_inclusion_class_value, enumerate_finite_class_values, finite_set_class_value,
        intersect_abstract_class_values, prefix_class_value, suffix_class_value,
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
    fn serializes_remote_domain_summary_for_downstream_consumers() -> Result<(), String> {
        let value =
            serde_json::to_value(omena_abstract_value::summarize_omena_abstract_value_domain())
                .map_err(|error| error.to_string())?;

        assert_eq!(value["schemaVersion"], json!("0"));
        assert_eq!(value["product"], json!("omena-abstract-value.domain"));
        assert_eq!(value["maxFiniteClassValues"], json!(8));
        Ok(())
    }
}
