use engine_style_parser::{
    ParserCanonicalProducerSignalV0, parse_style_module, summarize_parser_canonical_producer_signal,
};

pub fn consume_parser_canonical_signal(
    file_path: &str,
    source: &str,
) -> Option<ParserCanonicalProducerSignalV0> {
    let stylesheet = parse_style_module(file_path, source)?;
    Some(summarize_parser_canonical_producer_signal(&stylesheet))
}

#[cfg(test)]
mod tests {
    use super::consume_parser_canonical_signal;
    use serde_json::json;

    #[test]
    fn consumes_remote_parser_repo_via_git_dependency() -> Result<(), String> {
        let source = r#"
@value primary: red;
@keyframes fade { from { opacity: 0; } to { opacity: 1; } }

.button {
  color: primary;
  animation: fade 1s ease;
}
"#;

        let signal = consume_parser_canonical_signal("Button.module.scss", source)
            .ok_or_else(|| "expected stylesheet".to_string())?;

        assert_eq!(
            signal
                .canonical_candidate
                .css_modules_intermediate
                .selectors
                .names,
            vec!["button"]
        );
        assert_eq!(
            signal
                .canonical_candidate
                .css_modules_intermediate
                .values
                .decl_names,
            vec!["primary"]
        );
        assert_eq!(
            signal
                .canonical_candidate
                .css_modules_intermediate
                .keyframes
                .names,
            vec!["fade"]
        );

        let candidate = signal
            .evaluator_candidates
            .results
            .iter()
            .find(|candidate| candidate.selector_name == "button")
            .ok_or_else(|| "expected button candidate".to_string())?;
        assert!(candidate.has_value_refs);
        assert!(candidate.has_animation_ref);
        Ok(())
    }

    #[test]
    fn serializes_remote_parser_output_for_downstream_consumers() -> Result<(), String> {
        let source = ".card { composes: base from \"./base.module.scss\"; }";
        let signal = consume_parser_canonical_signal("Card.module.scss", source)
            .ok_or_else(|| "expected stylesheet".to_string())?;
        let value = serde_json::to_value(&signal).map_err(|error| error.to_string())?;

        assert!(value["schemaVersion"].as_str().is_some());
        assert_eq!(
            value["canonicalCandidate"]["cssModulesIntermediate"]["composes"]["importSources"],
            json!(["./base.module.scss"])
        );
        assert_eq!(
            value["evaluatorCandidates"]["results"][0]["hasImportedComposes"],
            json!(true)
        );
        Ok(())
    }
}
