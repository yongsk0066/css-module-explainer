use std::collections::BTreeMap;

use crate::{
    EngineInputV2, SelectorUsageFragmentV0, SelectorUsageFragmentsV0, SelectorUsagePlanSummaryV0,
};

pub fn summarize_selector_usage_plan_input(input: &EngineInputV2) -> SelectorUsagePlanSummaryV0 {
    let mut canonical_selector_names = Vec::new();
    let mut view_kind_counts = BTreeMap::new();
    let mut nested_safety_counts = BTreeMap::new();
    let mut composed_selector_count = 0usize;
    let mut total_composes_refs = 0usize;

    for style in &input.styles {
        for selector in &style.document.selectors {
            *view_kind_counts
                .entry(selector.view_kind.clone())
                .or_insert(0) += 1;

            if let Some(nested_safety) = &selector.nested_safety {
                *nested_safety_counts
                    .entry(nested_safety.clone())
                    .or_insert(0) += 1;
            }

            let composes_len = selector.composes.as_ref().map_or(0, Vec::len);
            if composes_len > 0 {
                composed_selector_count += 1;
                total_composes_refs += composes_len;
            }

            if selector.view_kind == "canonical"
                && let Some(canonical_name) = &selector.canonical_name
            {
                canonical_selector_names.push(canonical_name.clone());
            }
        }
    }

    SelectorUsagePlanSummaryV0 {
        schema_version: "0",
        input_version: input.version.clone(),
        canonical_selector_names,
        view_kind_counts,
        nested_safety_counts,
        composed_selector_count,
        total_composes_refs,
    }
}

pub fn summarize_selector_usage_fragments_input(input: &EngineInputV2) -> SelectorUsageFragmentsV0 {
    let mut fragments = Vec::new();

    for style in &input.styles {
        for (ordinal, selector) in style.document.selectors.iter().enumerate() {
            fragments.push(SelectorUsageFragmentV0 {
                ordinal,
                view_kind: selector.view_kind.clone(),
                canonical_name: selector.canonical_name.clone(),
                nested_safety: selector.nested_safety.clone(),
                composes_count: selector.composes.as_ref().map_or(0, Vec::len),
            });
        }
    }

    SelectorUsageFragmentsV0 {
        schema_version: "0",
        input_version: input.version.clone(),
        fragments,
    }
}

#[cfg(test)]
mod tests {
    use super::{summarize_selector_usage_fragments_input, summarize_selector_usage_plan_input};
    use crate::test_support::sample_input;

    #[test]
    fn summarizes_selector_usage_universe() {
        let summary = summarize_selector_usage_plan_input(&sample_input());

        assert_eq!(
            summary.canonical_selector_names,
            vec!["btn-active".to_string(), "card-header".to_string()]
        );
        assert_eq!(summary.view_kind_counts.get("canonical"), Some(&2));
        assert_eq!(summary.view_kind_counts.get("nested"), Some(&1));
        assert_eq!(summary.nested_safety_counts.get("safe"), Some(&1));
        assert_eq!(summary.nested_safety_counts.get("unsafe"), Some(&1));
        assert_eq!(summary.nested_safety_counts.get("unknown"), Some(&1));
        assert_eq!(summary.composed_selector_count, 2);
        assert_eq!(summary.total_composes_refs, 3);
    }

    #[test]
    fn summarizes_selector_usage_fragments() {
        let summary = summarize_selector_usage_fragments_input(&sample_input());

        assert_eq!(summary.fragments.len(), 3);
        assert_eq!(summary.fragments[0].ordinal, 0);
        assert_eq!(summary.fragments[0].view_kind, "canonical");
        assert_eq!(
            summary.fragments[0].canonical_name.as_deref(),
            Some("btn-active")
        );
        assert_eq!(summary.fragments[0].nested_safety.as_deref(), Some("safe"));
        assert_eq!(summary.fragments[0].composes_count, 1);

        assert_eq!(summary.fragments[2].ordinal, 2);
        assert_eq!(summary.fragments[2].view_kind, "nested");
        assert!(summary.fragments[2].canonical_name.is_none());
        assert_eq!(
            summary.fragments[2].nested_safety.as_deref(),
            Some("unknown")
        );
        assert_eq!(summary.fragments[2].composes_count, 2);
    }
}
