use crate::{
    EngineInputV2, SourceSideCanonicalProducerSignalV0,
    summarize_expression_semantics_canonical_producer_signal_input,
    summarize_source_resolution_canonical_producer_signal_input,
};

pub fn summarize_source_side_canonical_producer_signal_input(
    input: &EngineInputV2,
) -> SourceSideCanonicalProducerSignalV0 {
    SourceSideCanonicalProducerSignalV0 {
        schema_version: "0",
        input_version: input.version.clone(),
        expression_semantics: summarize_expression_semantics_canonical_producer_signal_input(input),
        source_resolution: summarize_source_resolution_canonical_producer_signal_input(input),
    }
}

#[cfg(test)]
mod tests {
    use crate::source_side::summarize_source_side_canonical_producer_signal_input;
    use crate::test_support::sample_input;

    #[test]
    fn builds_source_side_canonical_producer_signal() {
        let summary = summarize_source_side_canonical_producer_signal_input(&sample_input());

        assert_eq!(summary.schema_version, "0");
        assert_eq!(summary.input_version, "2");
        assert_eq!(
            summary
                .expression_semantics
                .canonical_bundle
                .candidates
                .len(),
            2
        );
        assert_eq!(
            summary
                .expression_semantics
                .evaluator_candidates
                .results
                .len(),
            2
        );
        assert_eq!(
            summary.source_resolution.canonical_bundle.candidates.len(),
            2
        );
        assert_eq!(
            summary.source_resolution.evaluator_candidates.results.len(),
            2
        );
    }
}
