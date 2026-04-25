use engine_style_parser::{
    ParserBoundarySyntaxFactsV0, StyleSemanticFactsV0, Stylesheet, summarize_semantic_boundary,
};
use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StyleSemanticBoundarySummaryV0 {
    pub schema_version: &'static str,
    pub language: &'static str,
    pub parser_facts: ParserBoundarySyntaxFactsV0,
    pub semantic_facts: StyleSemanticFactsV0,
}

pub fn summarize_style_semantic_boundary(sheet: &Stylesheet) -> StyleSemanticBoundarySummaryV0 {
    let boundary = summarize_semantic_boundary(sheet);
    StyleSemanticBoundarySummaryV0 {
        schema_version: "0",
        language: boundary.language,
        parser_facts: boundary.parser_facts,
        semantic_facts: boundary.semantic_facts,
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
        summarize_parser_contract_facts, summarize_style_semantic_boundary,
        summarize_style_semantic_facts,
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
}
