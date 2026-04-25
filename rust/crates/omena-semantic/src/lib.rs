use engine_style_parser::{
    ParserBoundarySyntaxFactsV0, StyleSemanticFactsV0, Stylesheet, summarize_semantic_boundary,
};
use serde::Serialize;

mod evidence;
mod lossless_cst;
mod selector_identity;

pub use evidence::{
    SemanticPromotionEvidenceItemV0, SemanticPromotionEvidenceSummaryV0,
    summarize_semantic_promotion_evidence,
};
pub use lossless_cst::{
    LosslessCstConsumerReadinessV0, LosslessCstContractV0, LosslessCstSpanInvariantsV0,
    summarize_lossless_cst_contract,
};
pub use selector_identity::{
    SelectorCanonicalIdentityV0, SelectorIdentityEngineSummaryV0, SelectorIdentityRewriteSafetyV0,
    summarize_selector_identity_engine,
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

pub fn summarize_style_semantic_facts(sheet: &Stylesheet) -> StyleSemanticFactsV0 {
    summarize_style_semantic_boundary(sheet).semantic_facts
}

pub fn summarize_parser_contract_facts(sheet: &Stylesheet) -> ParserBoundarySyntaxFactsV0 {
    summarize_style_semantic_boundary(sheet).parser_facts
}

#[cfg(test)]
mod tests {
    use engine_style_parser::parse_style_module;

    use super::{
        summarize_lossless_cst_contract, summarize_parser_contract_facts,
        summarize_selector_identity_engine, summarize_semantic_promotion_evidence,
        summarize_style_semantic_boundary, summarize_style_semantic_facts,
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
}
