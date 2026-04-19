use std::collections::BTreeMap;

use crate::{EngineInputV2, SelectorUsagePlanSummaryV0};

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
