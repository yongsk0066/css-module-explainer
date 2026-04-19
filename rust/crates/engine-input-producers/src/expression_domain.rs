use std::collections::BTreeMap;

use crate::{
    ConstraintDetailCounts, ConstraintDetailInput, EngineInputV2, ExpressionDomainCandidateV0,
    ExpressionDomainCandidatesV0, ExpressionDomainCanonicalCandidateBundleV0,
    ExpressionDomainCanonicalProducerSignalV0, ExpressionDomainFragmentV0,
    ExpressionDomainFragmentsV0, ExpressionDomainPlanSummaryV0, collect_constraint_detail_counts,
};

struct ExpressionDomainInputRows {
    plan_summary: ExpressionDomainPlanSummaryV0,
    fragments: Vec<ExpressionDomainFragmentV0>,
    candidates: Vec<ExpressionDomainCandidateV0>,
}

fn collect_expression_domain_input_rows(input: &EngineInputV2) -> ExpressionDomainInputRows {
    let mut planned_expression_ids = Vec::new();
    let mut value_domain_kinds = BTreeMap::new();
    let mut value_constraint_kinds = BTreeMap::new();
    let mut constraint_detail_counts = ConstraintDetailCounts::default();
    let mut finite_value_count = 0usize;
    let mut fragments = Vec::new();
    let mut candidates = Vec::new();

    for entry in &input.type_facts {
        planned_expression_ids.push(entry.expression_id.clone());
        *value_domain_kinds
            .entry(entry.facts.kind.clone())
            .or_insert(0) += 1;

        if let Some(values) = &entry.facts.values {
            finite_value_count += values.len();
        }

        if let Some(constraint_kind) = &entry.facts.constraint_kind {
            *value_constraint_kinds
                .entry(constraint_kind.clone())
                .or_insert(0) += 1;
        }

        collect_constraint_detail_counts(
            &mut constraint_detail_counts,
            ConstraintDetailInput {
                prefix: entry.facts.prefix.as_ref(),
                suffix: entry.facts.suffix.as_ref(),
                min_len: entry.facts.min_len,
                max_len: entry.facts.max_len,
                char_must: entry.facts.char_must.as_ref(),
                char_may: entry.facts.char_may.as_ref(),
                may_include_other_chars: entry.facts.may_include_other_chars,
            },
        );

        let fragment = ExpressionDomainFragmentV0 {
            expression_id: entry.expression_id.clone(),
            file_path: entry.file_path.clone(),
            value_domain_kind: entry.facts.kind.clone(),
            value_constraint_kind: entry.facts.constraint_kind.clone(),
            value_prefix: entry.facts.prefix.clone(),
            value_suffix: entry.facts.suffix.clone(),
            value_min_len: entry.facts.min_len,
            value_max_len: entry.facts.max_len,
            value_char_must: entry.facts.char_must.clone(),
            value_char_may: entry.facts.char_may.clone(),
            value_may_include_other_chars: entry.facts.may_include_other_chars,
            finite_value_count: entry.facts.values.as_ref().map_or(0, Vec::len),
        };
        fragments.push(fragment.clone());
        candidates.push(ExpressionDomainCandidateV0 {
            expression_id: fragment.expression_id,
            file_path: fragment.file_path,
            value_domain_kind: fragment.value_domain_kind,
            value_constraint_kind: fragment.value_constraint_kind,
            value_prefix: fragment.value_prefix,
            value_suffix: fragment.value_suffix,
            value_min_len: fragment.value_min_len,
            value_max_len: fragment.value_max_len,
            value_char_must: fragment.value_char_must,
            value_char_may: fragment.value_char_may,
            value_may_include_other_chars: fragment.value_may_include_other_chars,
            finite_value_count: fragment.finite_value_count,
        });
    }

    fragments.sort_by(|a, b| a.expression_id.cmp(&b.expression_id));
    candidates.sort_by(|a, b| a.expression_id.cmp(&b.expression_id));

    ExpressionDomainInputRows {
        plan_summary: ExpressionDomainPlanSummaryV0 {
            schema_version: "0",
            input_version: input.version.clone(),
            planned_expression_ids,
            value_domain_kinds,
            value_constraint_kinds,
            constraint_detail_counts,
            finite_value_count,
        },
        fragments,
        candidates,
    }
}

pub fn summarize_expression_domain_plan_input(
    input: &EngineInputV2,
) -> ExpressionDomainPlanSummaryV0 {
    collect_expression_domain_input_rows(input).plan_summary
}

pub fn summarize_expression_domain_fragments_input(
    input: &EngineInputV2,
) -> ExpressionDomainFragmentsV0 {
    let rows = collect_expression_domain_input_rows(input);

    ExpressionDomainFragmentsV0 {
        schema_version: "0",
        input_version: input.version.clone(),
        fragments: rows.fragments,
    }
}

pub fn summarize_expression_domain_candidates_input(
    input: &EngineInputV2,
) -> ExpressionDomainCandidatesV0 {
    let rows = collect_expression_domain_input_rows(input);

    ExpressionDomainCandidatesV0 {
        schema_version: "0",
        input_version: input.version.clone(),
        candidates: rows.candidates,
    }
}

pub fn summarize_expression_domain_canonical_candidate_bundle_input(
    input: &EngineInputV2,
) -> ExpressionDomainCanonicalCandidateBundleV0 {
    let rows = collect_expression_domain_input_rows(input);

    ExpressionDomainCanonicalCandidateBundleV0 {
        schema_version: "0",
        input_version: input.version.clone(),
        plan_summary: rows.plan_summary,
        fragments: rows.fragments,
        candidates: rows.candidates,
    }
}

pub fn summarize_expression_domain_canonical_producer_signal_input(
    input: &EngineInputV2,
) -> ExpressionDomainCanonicalProducerSignalV0 {
    let rows = collect_expression_domain_input_rows(input);
    let input_version = input.version.clone();

    ExpressionDomainCanonicalProducerSignalV0 {
        schema_version: "0",
        input_version: input_version.clone(),
        canonical_bundle: ExpressionDomainCanonicalCandidateBundleV0 {
            schema_version: "0",
            input_version,
            plan_summary: rows.plan_summary,
            fragments: rows.fragments,
            candidates: rows.candidates,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::{
        summarize_expression_domain_candidates_input,
        summarize_expression_domain_canonical_candidate_bundle_input,
        summarize_expression_domain_canonical_producer_signal_input,
        summarize_expression_domain_fragments_input, summarize_expression_domain_plan_input,
    };
    use crate::test_support::sample_input;

    #[test]
    fn summarizes_expression_domain_counts() {
        let summary = summarize_expression_domain_plan_input(&sample_input());

        assert_eq!(
            summary.planned_expression_ids,
            vec!["expr-1".to_string(), "expr-2".to_string()]
        );
        assert_eq!(summary.value_domain_kinds.get("constrained"), Some(&1));
        assert_eq!(summary.value_domain_kinds.get("finiteSet"), Some(&1));
        assert_eq!(summary.value_constraint_kinds.get("prefixSuffix"), Some(&1));
        assert_eq!(summary.constraint_detail_counts.prefix_count, 1);
        assert_eq!(summary.constraint_detail_counts.suffix_count, 1);
        assert_eq!(summary.constraint_detail_counts.min_len_count, 1);
        assert_eq!(summary.finite_value_count, 2);
    }

    #[test]
    fn summarizes_expression_domain_fragments() {
        let summary = summarize_expression_domain_fragments_input(&sample_input());

        assert_eq!(summary.fragments.len(), 2);
        let first = &summary.fragments[0];
        assert_eq!(first.expression_id, "expr-1");
        assert_eq!(first.file_path, "/tmp/App.tsx");
        assert_eq!(first.value_domain_kind, "constrained");
        assert_eq!(first.value_constraint_kind.as_deref(), Some("prefixSuffix"));
        assert_eq!(first.value_prefix.as_deref(), Some("btn-"));
        assert_eq!(first.value_suffix.as_deref(), Some("-active"));
        assert_eq!(first.value_min_len, Some(10));
        assert_eq!(first.finite_value_count, 0);

        let second = &summary.fragments[1];
        assert_eq!(second.expression_id, "expr-2");
        assert_eq!(second.value_domain_kind, "finiteSet");
        assert_eq!(second.finite_value_count, 2);
    }

    #[test]
    fn summarizes_expression_domain_candidates() {
        let summary = summarize_expression_domain_candidates_input(&sample_input());

        assert_eq!(summary.candidates.len(), 2);
        assert_eq!(summary.candidates[0].expression_id, "expr-1");
        assert_eq!(summary.candidates[0].value_domain_kind, "constrained");
        assert_eq!(
            summary.candidates[0].value_constraint_kind.as_deref(),
            Some("prefixSuffix")
        );
        assert_eq!(summary.candidates[1].expression_id, "expr-2");
        assert_eq!(summary.candidates[1].finite_value_count, 2);
    }

    #[test]
    fn summarizes_expression_domain_canonical_candidate_bundle() {
        let summary = summarize_expression_domain_canonical_candidate_bundle_input(&sample_input());

        assert_eq!(summary.plan_summary.planned_expression_ids.len(), 2);
        assert_eq!(summary.fragments.len(), 2);
        assert_eq!(summary.candidates.len(), 2);
    }

    #[test]
    fn summarizes_expression_domain_canonical_producer_signal() {
        let summary = summarize_expression_domain_canonical_producer_signal_input(&sample_input());

        assert_eq!(summary.schema_version, "0");
        assert_eq!(summary.input_version, "2");
        assert_eq!(
            summary
                .canonical_bundle
                .plan_summary
                .planned_expression_ids
                .len(),
            2
        );
        assert_eq!(summary.canonical_bundle.fragments.len(), 2);
        assert_eq!(summary.canonical_bundle.candidates.len(), 2);
    }
}
