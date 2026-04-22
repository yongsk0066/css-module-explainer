use std::collections::{BTreeMap, BTreeSet};
use std::path::{Component, Path, PathBuf};

use crate::{
    EngineInputV2, SelectorUsageCandidateV0, SelectorUsageCandidatesV0,
    SelectorUsageCanonicalCandidateBundleV0, SelectorUsageCanonicalProducerSignalV0,
    SelectorUsageEvaluatorCandidatePayloadV0, SelectorUsageEvaluatorCandidateV0,
    SelectorUsageEvaluatorCandidatesV0, SelectorUsageFragmentV0, SelectorUsageFragmentsV0,
    SelectorUsagePlanSummaryV0, SelectorUsageQueryFragmentV0, SelectorUsageQueryFragmentsV0,
    canonical_selector_count, map_selector_certainty, resolve_selector_names,
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

pub fn summarize_selector_usage_query_fragments_input(
    input: &EngineInputV2,
) -> SelectorUsageQueryFragmentsV0 {
    let mut fragments = Vec::new();

    for style in &input.styles {
        for selector in &style.document.selectors {
            if selector.view_kind != "canonical" {
                continue;
            }
            let Some(canonical_name) = &selector.canonical_name else {
                continue;
            };
            fragments.push(SelectorUsageQueryFragmentV0 {
                query_id: canonical_name.clone(),
                canonical_name: canonical_name.clone(),
                nested_safety: selector.nested_safety.clone(),
                composes_count: selector.composes.as_ref().map_or(0, Vec::len),
            });
        }
    }

    fragments.sort_by(|a, b| a.query_id.cmp(&b.query_id));

    SelectorUsageQueryFragmentsV0 {
        schema_version: "0",
        input_version: input.version.clone(),
        fragments,
    }
}

#[derive(Default, Clone)]
struct SelectorUsageAggregate {
    total_references: usize,
    direct_reference_count: usize,
    editable_direct_reference_count: usize,
    exact_reference_count: usize,
    inferred_or_better_reference_count: usize,
    has_expanded_references: bool,
}

struct SelectorUsageInputRows {
    query_fragments: Vec<SelectorUsageQueryFragmentV0>,
    fragments: Vec<SelectorUsageFragmentV0>,
    candidates: Vec<SelectorUsageCandidateV0>,
    evaluator_candidates: Vec<SelectorUsageEvaluatorCandidateV0>,
}

pub fn summarize_selector_usage_candidates_input(
    input: &EngineInputV2,
) -> SelectorUsageCandidatesV0 {
    let rows = collect_selector_usage_input_rows(input);

    SelectorUsageCandidatesV0 {
        schema_version: "0",
        input_version: input.version.clone(),
        candidates: rows.candidates,
    }
}

pub fn summarize_selector_usage_evaluator_candidates_input(
    input: &EngineInputV2,
) -> SelectorUsageEvaluatorCandidatesV0 {
    let rows = collect_selector_usage_input_rows(input);

    SelectorUsageEvaluatorCandidatesV0 {
        schema_version: "0",
        input_version: input.version.clone(),
        results: rows.evaluator_candidates,
    }
}

pub fn summarize_selector_usage_canonical_candidate_bundle_input(
    input: &EngineInputV2,
) -> SelectorUsageCanonicalCandidateBundleV0 {
    let rows = collect_selector_usage_input_rows(input);

    SelectorUsageCanonicalCandidateBundleV0 {
        schema_version: "0",
        input_version: input.version.clone(),
        query_fragments: rows.query_fragments,
        fragments: rows.fragments,
        candidates: rows.candidates,
    }
}

pub fn summarize_selector_usage_canonical_producer_signal_input(
    input: &EngineInputV2,
) -> SelectorUsageCanonicalProducerSignalV0 {
    let rows = collect_selector_usage_input_rows(input);
    let input_version = input.version.clone();

    SelectorUsageCanonicalProducerSignalV0 {
        schema_version: "0",
        input_version: input_version.clone(),
        canonical_bundle: SelectorUsageCanonicalCandidateBundleV0 {
            schema_version: "0",
            input_version: input_version.clone(),
            query_fragments: rows.query_fragments.clone(),
            fragments: rows.fragments.clone(),
            candidates: rows.candidates.clone(),
        },
        evaluator_candidates: SelectorUsageEvaluatorCandidatesV0 {
            schema_version: "0",
            input_version,
            results: rows.evaluator_candidates,
        },
    }
}

fn collect_selector_usage_input_rows(input: &EngineInputV2) -> SelectorUsageInputRows {
    let mut expression_index = BTreeMap::new();
    let mut style_index = BTreeMap::new();
    let mut canonical_by_file = BTreeMap::<String, BTreeSet<String>>::new();

    for source in &input.sources {
        for expression in &source.document.class_expressions {
            expression_index.insert(expression.id.clone(), expression);
        }
    }

    for style in &input.styles {
        style_index.insert(style.file_path.clone(), style);
        let names = canonical_by_file
            .entry(style.file_path.clone())
            .or_default();
        for selector in &style.document.selectors {
            if selector.view_kind != "canonical" {
                continue;
            }
            if let Some(canonical_name) = &selector.canonical_name {
                names.insert(canonical_name.clone());
            }
        }
    }

    let mut source_counts = BTreeMap::<(String, String), SelectorUsageAggregate>::new();

    for entry in &input.type_facts {
        let Some(expression) = expression_index.get(&entry.expression_id) else {
            continue;
        };
        let Some(style) = style_index.get(&expression.scss_module_path) else {
            continue;
        };

        let selector_names = resolve_selector_names(style, &entry.facts);
        if selector_names.is_empty() {
            continue;
        }

        let selector_certainty = map_selector_certainty(
            &entry.facts,
            selector_names.len(),
            canonical_selector_count(style),
        );
        let is_direct_source = matches!(expression.kind.as_str(), "literal" | "styleAccess");

        for selector_name in selector_names {
            let counts = source_counts
                .entry((expression.scss_module_path.clone(), selector_name))
                .or_default();
            counts.total_references += 1;
            if is_direct_source {
                counts.direct_reference_count += 1;
                counts.editable_direct_reference_count += 1;
            } else {
                counts.has_expanded_references = true;
            }
            match selector_certainty.as_str() {
                "exact" => {
                    counts.exact_reference_count += 1;
                    counts.inferred_or_better_reference_count += 1;
                }
                "inferred" => {
                    counts.inferred_or_better_reference_count += 1;
                }
                _ => {}
            }
        }
    }

    let incoming_style_dependencies = build_incoming_style_dependencies(input, &canonical_by_file);

    let fragments = summarize_selector_usage_fragments_input(input).fragments;
    let mut query_fragments = summarize_selector_usage_query_fragments_input(input).fragments;
    query_fragments.sort_by(|a, b| a.query_id.cmp(&b.query_id));

    let mut candidates = Vec::new();
    let mut evaluator_candidates = Vec::new();

    for style in &input.styles {
        for selector in &style.document.selectors {
            if selector.view_kind != "canonical" {
                continue;
            }
            let Some(canonical_name) = &selector.canonical_name else {
                continue;
            };

            let mut counts = source_counts
                .remove(&(style.file_path.clone(), canonical_name.clone()))
                .unwrap_or_default();
            let style_dependency_count = count_incoming_style_dependencies(
                &incoming_style_dependencies,
                &style.file_path,
                canonical_name,
            );

            counts.total_references += style_dependency_count;
            counts.direct_reference_count += style_dependency_count;
            counts.exact_reference_count += style_dependency_count;
            counts.inferred_or_better_reference_count += style_dependency_count;

            let has_style_dependency_references = style_dependency_count > 0;
            let has_any_references = counts.total_references > 0;

            let candidate = SelectorUsageCandidateV0 {
                query_id: canonical_name.clone(),
                canonical_name: canonical_name.clone(),
                file_path: style.file_path.clone(),
                total_references: counts.total_references,
                direct_reference_count: counts.direct_reference_count,
                editable_direct_reference_count: counts.editable_direct_reference_count,
                exact_reference_count: counts.exact_reference_count,
                inferred_or_better_reference_count: counts.inferred_or_better_reference_count,
                has_expanded_references: counts.has_expanded_references,
                has_style_dependency_references,
                has_any_references,
            };

            candidates.push(candidate.clone());
            evaluator_candidates.push(SelectorUsageEvaluatorCandidateV0 {
                kind: "selector-usage",
                file_path: style.file_path.clone(),
                query_id: canonical_name.clone(),
                payload: SelectorUsageEvaluatorCandidatePayloadV0 {
                    canonical_name: canonical_name.clone(),
                    total_references: candidate.total_references,
                    direct_reference_count: candidate.direct_reference_count,
                    editable_direct_reference_count: candidate.editable_direct_reference_count,
                    exact_reference_count: candidate.exact_reference_count,
                    inferred_or_better_reference_count: candidate
                        .inferred_or_better_reference_count,
                    has_expanded_references: candidate.has_expanded_references,
                    has_style_dependency_references: candidate.has_style_dependency_references,
                    has_any_references: candidate.has_any_references,
                },
            });
        }
    }

    candidates.sort_by(|a, b| {
        a.file_path
            .cmp(&b.file_path)
            .then(a.query_id.cmp(&b.query_id))
    });
    evaluator_candidates.sort_by(|a, b| {
        a.file_path
            .cmp(&b.file_path)
            .then(a.query_id.cmp(&b.query_id))
    });

    SelectorUsageInputRows {
        query_fragments,
        fragments,
        candidates,
        evaluator_candidates,
    }
}

fn build_incoming_style_dependencies(
    input: &EngineInputV2,
    canonical_by_file: &BTreeMap<String, BTreeSet<String>>,
) -> BTreeMap<(String, String), BTreeSet<(String, String)>> {
    let mut incoming = BTreeMap::<(String, String), BTreeSet<(String, String)>>::new();

    for style in &input.styles {
        for selector in &style.document.selectors {
            if selector.view_kind != "canonical" {
                continue;
            }
            let Some(incoming_canonical_name) = &selector.canonical_name else {
                continue;
            };
            let Some(composes) = &selector.composes else {
                continue;
            };

            for compose in composes {
                let Some(class_names) = compose
                    .get("classNames")
                    .and_then(|value| value.as_array())
                    .map(|values| {
                        values
                            .iter()
                            .filter_map(|value| value.as_str().map(ToString::to_string))
                            .collect::<Vec<_>>()
                    })
                else {
                    continue;
                };
                if class_names.is_empty() {
                    continue;
                }
                if compose
                    .get("fromGlobal")
                    .and_then(|value| value.as_bool())
                    .unwrap_or(false)
                {
                    continue;
                }

                let target_file = compose
                    .get("from")
                    .and_then(|value| value.as_str())
                    .map(|from| normalize_joined_path(&style.file_path, from))
                    .unwrap_or_else(|| style.file_path.clone());

                let Some(target_names) = canonical_by_file.get(&target_file) else {
                    continue;
                };

                for class_name in class_names {
                    if !target_names.contains(&class_name) {
                        continue;
                    }
                    incoming
                        .entry((target_file.clone(), class_name))
                        .or_default()
                        .insert((style.file_path.clone(), incoming_canonical_name.clone()));
                }
            }
        }
    }

    incoming
}

fn count_incoming_style_dependencies(
    incoming: &BTreeMap<(String, String), BTreeSet<(String, String)>>,
    file_path: &str,
    canonical_name: &str,
) -> usize {
    let mut seen = BTreeSet::<(String, String)>::new();
    collect_incoming_style_dependencies(
        incoming,
        &(file_path.to_string(), canonical_name.to_string()),
        &mut seen,
    );
    seen.len()
}

fn collect_incoming_style_dependencies(
    incoming: &BTreeMap<(String, String), BTreeSet<(String, String)>>,
    key: &(String, String),
    seen: &mut BTreeSet<(String, String)>,
) {
    let Some(entries) = incoming.get(key) else {
        return;
    };
    for entry in entries {
        if seen.insert(entry.clone()) {
            collect_incoming_style_dependencies(incoming, entry, seen);
        }
    }
}

fn normalize_joined_path(base_file_path: &str, relative_from: &str) -> String {
    let base_dir = Path::new(base_file_path)
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_default();
    let joined = base_dir.join(relative_from);
    let mut normalized = PathBuf::new();

    for component in joined.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                normalized.pop();
            }
            other => normalized.push(other.as_os_str()),
        }
    }

    normalized.to_string_lossy().into_owned()
}

#[cfg(test)]
mod tests {
    use super::{
        summarize_selector_usage_candidates_input,
        summarize_selector_usage_canonical_candidate_bundle_input,
        summarize_selector_usage_canonical_producer_signal_input,
        summarize_selector_usage_evaluator_candidates_input,
        summarize_selector_usage_fragments_input, summarize_selector_usage_plan_input,
        summarize_selector_usage_query_fragments_input,
    };
    use crate::test_support::sample_input;
    use serde_json::json;

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

        assert_eq!(summary.fragments[2].ordinal, 1);
        assert_eq!(summary.fragments[2].view_kind, "nested");
        assert_eq!(
            summary.fragments[2].canonical_name.as_deref(),
            Some("card-header")
        );
        assert_eq!(
            summary.fragments[2].nested_safety.as_deref(),
            Some("unknown")
        );
        assert_eq!(summary.fragments[2].composes_count, 2);
    }

    #[test]
    fn summarizes_selector_usage_query_fragments() {
        let summary = summarize_selector_usage_query_fragments_input(&sample_input());

        assert_eq!(summary.fragments.len(), 2);
        assert_eq!(summary.fragments[0].query_id, "btn-active");
        assert_eq!(summary.fragments[0].canonical_name, "btn-active");
        assert_eq!(summary.fragments[0].nested_safety.as_deref(), Some("safe"));
        assert_eq!(summary.fragments[0].composes_count, 1);

        assert_eq!(summary.fragments[1].query_id, "card-header");
        assert_eq!(summary.fragments[1].canonical_name, "card-header");
        assert_eq!(
            summary.fragments[1].nested_safety.as_deref(),
            Some("unsafe")
        );
        assert_eq!(summary.fragments[1].composes_count, 0);
    }

    #[test]
    fn summarizes_selector_usage_candidates() {
        let mut input = sample_input();
        input.styles[0].document.selectors[0].composes = Some(vec![json!({
            "classNames": ["card-header"],
            "from": "./Card.module.scss"
        })]);

        let summary = summarize_selector_usage_candidates_input(&input);

        assert_eq!(summary.candidates.len(), 2);
        let app = &summary.candidates[0];
        assert_eq!(app.file_path, "/tmp/App.module.scss");
        assert_eq!(app.query_id, "btn-active");
        assert_eq!(app.total_references, 1);
        assert_eq!(app.direct_reference_count, 0);
        assert_eq!(app.editable_direct_reference_count, 0);
        assert_eq!(app.exact_reference_count, 1);
        assert_eq!(app.inferred_or_better_reference_count, 1);
        assert!(app.has_expanded_references);
        assert!(!app.has_style_dependency_references);
        assert!(app.has_any_references);

        let card = &summary.candidates[1];
        assert_eq!(card.file_path, "/tmp/Card.module.scss");
        assert_eq!(card.query_id, "card-header");
        assert_eq!(card.total_references, 2);
        assert_eq!(card.direct_reference_count, 2);
        assert_eq!(card.editable_direct_reference_count, 1);
        assert_eq!(card.exact_reference_count, 1);
        assert_eq!(card.inferred_or_better_reference_count, 2);
        assert!(!card.has_expanded_references);
        assert!(card.has_style_dependency_references);
        assert!(card.has_any_references);
    }

    #[test]
    fn summarizes_selector_usage_evaluator_candidates() {
        let summary = summarize_selector_usage_evaluator_candidates_input(&sample_input());

        assert_eq!(summary.results.len(), 2);
        assert_eq!(summary.results[0].kind, "selector-usage");
        assert_eq!(summary.results[0].file_path, "/tmp/App.module.scss");
        assert_eq!(summary.results[0].query_id, "btn-active");
    }

    #[test]
    fn summarizes_selector_usage_canonical_candidate_bundle() {
        let summary = summarize_selector_usage_canonical_candidate_bundle_input(&sample_input());

        assert_eq!(summary.query_fragments.len(), 2);
        assert_eq!(summary.fragments.len(), 3);
        assert_eq!(summary.candidates.len(), 2);
    }

    #[test]
    fn summarizes_selector_usage_canonical_producer_signal() {
        let summary = summarize_selector_usage_canonical_producer_signal_input(&sample_input());

        assert_eq!(summary.canonical_bundle.candidates.len(), 2);
        assert_eq!(summary.evaluator_candidates.results.len(), 2);
        assert_eq!(
            summary.evaluator_candidates.results[0].query_id,
            "btn-active"
        );
    }
}
