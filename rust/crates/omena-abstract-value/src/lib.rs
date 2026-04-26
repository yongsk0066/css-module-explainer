use std::collections::BTreeSet;

use serde::Serialize;

pub const MAX_FINITE_CLASS_VALUES: usize = 8;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AbstractValueDomainSummaryV0 {
    pub schema_version: &'static str,
    pub product: &'static str,
    pub domain_kinds: Vec<&'static str>,
    pub max_finite_class_values: usize,
    pub selector_projection_certainties: Vec<&'static str>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum AbstractClassValueV0 {
    Bottom,
    Exact {
        value: String,
    },
    FiniteSet {
        values: Vec<String>,
    },
    Prefix {
        prefix: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        provenance: Option<AbstractClassValueProvenanceV0>,
    },
    Suffix {
        suffix: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        provenance: Option<AbstractClassValueProvenanceV0>,
    },
    PrefixSuffix {
        prefix: String,
        suffix: String,
        min_length: usize,
        #[serde(skip_serializing_if = "Option::is_none")]
        provenance: Option<AbstractClassValueProvenanceV0>,
    },
    CharInclusion {
        must_chars: String,
        may_chars: String,
        #[serde(skip_serializing_if = "is_false")]
        may_include_other_chars: bool,
        #[serde(skip_serializing_if = "Option::is_none")]
        provenance: Option<AbstractClassValueProvenanceV0>,
    },
    Composite {
        #[serde(skip_serializing_if = "Option::is_none")]
        prefix: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        suffix: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        min_length: Option<usize>,
        must_chars: String,
        may_chars: String,
        #[serde(skip_serializing_if = "is_false")]
        may_include_other_chars: bool,
        #[serde(skip_serializing_if = "Option::is_none")]
        provenance: Option<AbstractClassValueProvenanceV0>,
    },
    Top,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum AbstractClassValueProvenanceV0 {
    FiniteSetWideningChars,
    FiniteSetWideningComposite,
    PrefixJoinLcp,
    SuffixJoinLcs,
    PrefixSuffixJoin,
    CompositeJoin,
    CompositeConcat,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CompositeClassValueInputV0 {
    pub prefix: Option<String>,
    pub suffix: Option<String>,
    pub min_length: Option<usize>,
    pub must_chars: String,
    pub may_chars: String,
    pub may_include_other_chars: bool,
    pub provenance: Option<AbstractClassValueProvenanceV0>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SelectorProjectionCertaintyV0 {
    Exact,
    Inferred,
    Possible,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AbstractSelectorProjectionV0 {
    pub selector_names: Vec<String>,
    pub certainty: SelectorProjectionCertaintyV0,
}

pub fn summarize_omena_abstract_value_domain() -> AbstractValueDomainSummaryV0 {
    AbstractValueDomainSummaryV0 {
        schema_version: "0",
        product: "omena-abstract-value.domain",
        domain_kinds: vec![
            "bottom",
            "exact",
            "finiteSet",
            "prefix",
            "suffix",
            "prefixSuffix",
            "charInclusion",
            "composite",
            "top",
        ],
        max_finite_class_values: MAX_FINITE_CLASS_VALUES,
        selector_projection_certainties: vec!["exact", "inferred", "possible"],
    }
}

pub fn bottom_class_value() -> AbstractClassValueV0 {
    AbstractClassValueV0::Bottom
}

pub fn top_class_value() -> AbstractClassValueV0 {
    AbstractClassValueV0::Top
}

pub fn exact_class_value(value: impl Into<String>) -> AbstractClassValueV0 {
    AbstractClassValueV0::Exact {
        value: value.into(),
    }
}

pub fn finite_set_class_value<I, S>(values: I) -> AbstractClassValueV0
where
    I: IntoIterator<Item = S>,
    S: Into<String>,
{
    let normalized = normalize_values(values);
    match normalized.len() {
        0 => bottom_class_value(),
        1 => exact_class_value(normalized[0].clone()),
        2..=MAX_FINITE_CLASS_VALUES => AbstractClassValueV0::FiniteSet { values: normalized },
        _ => widen_large_finite_set(&normalized),
    }
}

pub fn prefix_class_value(
    prefix: impl Into<String>,
    provenance: Option<AbstractClassValueProvenanceV0>,
) -> AbstractClassValueV0 {
    AbstractClassValueV0::Prefix {
        prefix: prefix.into(),
        provenance,
    }
}

pub fn suffix_class_value(
    suffix: impl Into<String>,
    provenance: Option<AbstractClassValueProvenanceV0>,
) -> AbstractClassValueV0 {
    AbstractClassValueV0::Suffix {
        suffix: suffix.into(),
        provenance,
    }
}

pub fn prefix_suffix_class_value(
    prefix: impl Into<String>,
    suffix: impl Into<String>,
    min_length: Option<usize>,
    provenance: Option<AbstractClassValueProvenanceV0>,
) -> AbstractClassValueV0 {
    let prefix = prefix.into();
    let suffix = suffix.into();
    if prefix.is_empty() && suffix.is_empty() {
        return top_class_value();
    }
    if prefix.is_empty() {
        return suffix_class_value(suffix, provenance);
    }
    if suffix.is_empty() {
        return prefix_class_value(prefix, provenance);
    }

    AbstractClassValueV0::PrefixSuffix {
        min_length: min_length
            .unwrap_or(prefix.len() + suffix.len())
            .max(prefix.len() + suffix.len()),
        prefix,
        suffix,
        provenance,
    }
}

pub fn char_inclusion_class_value(
    must_chars: impl Into<String>,
    may_chars: impl Into<String>,
    provenance: Option<AbstractClassValueProvenanceV0>,
    may_include_other_chars: bool,
) -> AbstractClassValueV0 {
    let must_chars = normalize_char_set(must_chars.into());
    let may_chars = normalize_char_set(format!("{}{}", may_chars.into(), must_chars));

    if may_include_other_chars && must_chars.is_empty() {
        return top_class_value();
    }
    if !may_include_other_chars && may_chars.is_empty() {
        return top_class_value();
    }

    AbstractClassValueV0::CharInclusion {
        must_chars,
        may_chars,
        may_include_other_chars,
        provenance,
    }
}

pub fn composite_class_value(input: CompositeClassValueInputV0) -> AbstractClassValueV0 {
    let prefix = input.prefix.unwrap_or_default();
    let suffix = input.suffix.unwrap_or_default();
    let edge_chars = char_set_for_string(format!("{prefix}{suffix}"));
    let must_chars = normalize_char_set(format!("{}{}", input.must_chars, edge_chars));
    let may_chars = normalize_char_set(format!("{}{}", input.may_chars, must_chars));
    let has_char_info =
        !must_chars.is_empty() || (!input.may_include_other_chars && !may_chars.is_empty());

    if !has_char_info {
        return prefix_suffix_class_value(prefix, suffix, input.min_length, input.provenance);
    }
    if prefix.is_empty() && suffix.is_empty() {
        return char_inclusion_class_value(
            must_chars,
            may_chars,
            input.provenance,
            input.may_include_other_chars,
        );
    }

    let guaranteed_distinct_char_count = must_chars.chars().count();
    let edge_min_length = prefix.len() + suffix.len();
    let min_length = input
        .min_length
        .map(|value| value.max(edge_min_length))
        .or(Some(edge_min_length))
        .map(|value| value.max(guaranteed_distinct_char_count));

    AbstractClassValueV0::Composite {
        prefix: (!prefix.is_empty()).then_some(prefix),
        suffix: (!suffix.is_empty()).then_some(suffix),
        min_length,
        must_chars,
        may_chars,
        may_include_other_chars: input.may_include_other_chars,
        provenance: input.provenance,
    }
}

pub fn enumerate_finite_class_values(value: &AbstractClassValueV0) -> Option<Vec<String>> {
    match value {
        AbstractClassValueV0::Bottom => Some(Vec::new()),
        AbstractClassValueV0::Exact { value } => Some(vec![value.clone()]),
        AbstractClassValueV0::FiniteSet { values } => Some(values.clone()),
        _ => None,
    }
}

pub fn project_abstract_value_selectors(
    value: &AbstractClassValueV0,
    selector_universe: &[String],
) -> AbstractSelectorProjectionV0 {
    let selector_names = resolve_abstract_value_selectors(value, selector_universe);
    let certainty =
        derive_selector_projection_certainty(value, selector_names.len(), selector_universe.len());

    AbstractSelectorProjectionV0 {
        selector_names,
        certainty,
    }
}

pub fn resolve_abstract_value_selectors(
    value: &AbstractClassValueV0,
    selector_universe: &[String],
) -> Vec<String> {
    match value {
        AbstractClassValueV0::Bottom => Vec::new(),
        AbstractClassValueV0::Exact { value } => find_selectors(selector_universe, value),
        AbstractClassValueV0::FiniteSet { values } => unique_selector_names(
            values
                .iter()
                .flat_map(|value| find_selectors(selector_universe, value)),
        ),
        AbstractClassValueV0::Prefix { prefix, .. } => selector_universe
            .iter()
            .filter(|selector| selector.starts_with(prefix))
            .cloned()
            .collect(),
        AbstractClassValueV0::Suffix { suffix, .. } => selector_universe
            .iter()
            .filter(|selector| selector.ends_with(suffix))
            .cloned()
            .collect(),
        AbstractClassValueV0::PrefixSuffix { prefix, suffix, .. } => selector_universe
            .iter()
            .filter(|selector| selector.starts_with(prefix) && selector.ends_with(suffix))
            .cloned()
            .collect(),
        AbstractClassValueV0::CharInclusion {
            must_chars,
            may_chars,
            may_include_other_chars,
            ..
        } => selector_universe
            .iter()
            .filter(|selector| {
                matches_char_constraints(selector, must_chars, may_chars, *may_include_other_chars)
            })
            .cloned()
            .collect(),
        AbstractClassValueV0::Composite {
            prefix,
            suffix,
            min_length,
            must_chars,
            may_chars,
            may_include_other_chars,
            ..
        } => selector_universe
            .iter()
            .filter(|selector| {
                min_length.is_none_or(|min_length| selector.len() >= min_length)
                    && prefix
                        .as_ref()
                        .is_none_or(|prefix| selector.starts_with(prefix))
                    && suffix
                        .as_ref()
                        .is_none_or(|suffix| selector.ends_with(suffix))
                    && matches_char_constraints(
                        selector,
                        must_chars,
                        may_chars,
                        *may_include_other_chars,
                    )
            })
            .cloned()
            .collect(),
        AbstractClassValueV0::Top => selector_universe.to_vec(),
    }
}

pub fn derive_selector_projection_certainty(
    value: &AbstractClassValueV0,
    matched_selector_count: usize,
    selector_universe_count: usize,
) -> SelectorProjectionCertaintyV0 {
    match value {
        AbstractClassValueV0::Bottom => SelectorProjectionCertaintyV0::Possible,
        AbstractClassValueV0::Exact { .. } => {
            if matched_selector_count == 1 {
                SelectorProjectionCertaintyV0::Exact
            } else {
                SelectorProjectionCertaintyV0::Possible
            }
        }
        AbstractClassValueV0::FiniteSet { values } => {
            if values.is_empty() || matched_selector_count == 0 {
                SelectorProjectionCertaintyV0::Possible
            } else if matched_selector_count == values.len() {
                SelectorProjectionCertaintyV0::Exact
            } else {
                SelectorProjectionCertaintyV0::Inferred
            }
        }
        AbstractClassValueV0::Prefix { .. }
        | AbstractClassValueV0::Suffix { .. }
        | AbstractClassValueV0::PrefixSuffix { .. }
        | AbstractClassValueV0::CharInclusion { .. }
        | AbstractClassValueV0::Composite { .. } => {
            if matched_selector_count == 0 {
                SelectorProjectionCertaintyV0::Possible
            } else if matched_selector_count == selector_universe_count {
                SelectorProjectionCertaintyV0::Exact
            } else {
                SelectorProjectionCertaintyV0::Inferred
            }
        }
        AbstractClassValueV0::Top => SelectorProjectionCertaintyV0::Possible,
    }
}

fn widen_large_finite_set(values: &[String]) -> AbstractClassValueV0 {
    let prefix = meaningful_longest_common_prefix(values);
    let suffix = meaningful_longest_common_suffix(values);
    let (must_chars, may_chars) = char_inclusion_from_finite_values(values);

    if !prefix.is_empty() || !suffix.is_empty() {
        return composite_class_value(CompositeClassValueInputV0 {
            prefix: (!prefix.is_empty()).then_some(prefix),
            suffix: (!suffix.is_empty()).then_some(suffix),
            min_length: values.iter().map(String::len).min(),
            must_chars,
            may_chars,
            may_include_other_chars: false,
            provenance: Some(AbstractClassValueProvenanceV0::FiniteSetWideningComposite),
        });
    }

    char_inclusion_class_value(
        must_chars,
        may_chars,
        Some(AbstractClassValueProvenanceV0::FiniteSetWideningChars),
        false,
    )
}

fn normalize_values<I, S>(values: I) -> Vec<String>
where
    I: IntoIterator<Item = S>,
    S: Into<String>,
{
    values
        .into_iter()
        .map(Into::into)
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect()
}

fn normalize_char_set(chars: impl AsRef<str>) -> String {
    chars
        .as_ref()
        .chars()
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect()
}

fn union_char_sets(left: &str, right: &str) -> String {
    normalize_char_set(format!("{left}{right}"))
}

fn intersect_char_sets(left: &str, right: &str) -> String {
    let right_set = right.chars().collect::<BTreeSet<_>>();
    left.chars()
        .filter(|char| right_set.contains(char))
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect()
}

fn char_set_for_string(value: impl AsRef<str>) -> String {
    normalize_char_set(value)
}

fn char_inclusion_from_finite_values(values: &[String]) -> (String, String) {
    let mut sets = values.iter().map(char_set_for_string);
    let Some(first) = sets.next() else {
        return (String::new(), String::new());
    };

    sets.fold((first.clone(), first), |(must_chars, may_chars), next| {
        (
            intersect_char_sets(&must_chars, &next),
            union_char_sets(&may_chars, &next),
        )
    })
}

fn longest_common_prefix(values: &[String]) -> String {
    let Some(first) = values.first() else {
        return String::new();
    };
    let mut prefix = first.clone();

    for value in values.iter().skip(1) {
        let mut match_length = 0usize;
        for (left, right) in prefix.chars().zip(value.chars()) {
            if left != right {
                break;
            }
            match_length += left.len_utf8();
        }
        prefix.truncate(match_length);
        if prefix.is_empty() {
            break;
        }
    }

    prefix
}

fn meaningful_longest_common_prefix(values: &[String]) -> String {
    let prefix = longest_common_prefix(values);
    if prefix.is_empty() || !is_meaningful_class_prefix(&prefix, values) {
        return String::new();
    }
    prefix
}

fn longest_common_suffix(values: &[String]) -> String {
    let reversed = values
        .iter()
        .map(|value| value.chars().rev().collect::<String>())
        .collect::<Vec<_>>();
    longest_common_prefix(&reversed)
        .chars()
        .rev()
        .collect::<String>()
}

fn meaningful_longest_common_suffix(values: &[String]) -> String {
    let suffix = longest_common_suffix(values);
    if suffix.is_empty() || !is_meaningful_class_suffix(&suffix, values) {
        return String::new();
    }
    suffix
}

fn is_meaningful_class_prefix(prefix: &str, values: &[String]) -> bool {
    if prefix.is_empty() {
        return false;
    }
    if ends_at_class_boundary(prefix) {
        return true;
    }
    values.iter().all(|value| {
        value.len() == prefix.len()
            || value[prefix.len()..]
                .chars()
                .next()
                .is_some_and(is_class_boundary_char)
    })
}

fn is_meaningful_class_suffix(suffix: &str, values: &[String]) -> bool {
    if suffix.is_empty() {
        return false;
    }
    if starts_at_class_boundary(suffix) {
        return true;
    }
    values.iter().all(|value| {
        if value.len() == suffix.len() {
            return true;
        }
        value[..value.len() - suffix.len()]
            .chars()
            .next_back()
            .is_some_and(is_class_boundary_char)
    })
}

fn ends_at_class_boundary(value: &str) -> bool {
    value
        .chars()
        .next_back()
        .is_some_and(is_class_boundary_char)
}

fn starts_at_class_boundary(value: &str) -> bool {
    value.chars().next().is_some_and(is_class_boundary_char)
}

fn is_class_boundary_char(char: char) -> bool {
    char == '-' || char == '_'
}

fn find_selectors(selector_universe: &[String], value: &str) -> Vec<String> {
    selector_universe
        .iter()
        .filter(|selector| selector.as_str() == value)
        .cloned()
        .collect()
}

fn unique_selector_names<I>(values: I) -> Vec<String>
where
    I: IntoIterator<Item = String>,
{
    values
        .into_iter()
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect()
}

fn matches_char_constraints(
    value: &str,
    must_chars: &str,
    may_chars: &str,
    may_include_other_chars: bool,
) -> bool {
    let value_chars = value.chars().collect::<BTreeSet<_>>();
    let must_chars = must_chars.chars().collect::<BTreeSet<_>>();
    if !must_chars.iter().all(|char| value_chars.contains(char)) {
        return false;
    }
    if may_include_other_chars {
        return true;
    }
    let may_chars = may_chars.chars().collect::<BTreeSet<_>>();
    value_chars.iter().all(|char| may_chars.contains(char))
}

fn is_false(value: &bool) -> bool {
    !value
}

#[cfg(test)]
mod tests {
    use super::{
        AbstractClassValueProvenanceV0, AbstractClassValueV0, CompositeClassValueInputV0,
        MAX_FINITE_CLASS_VALUES, SelectorProjectionCertaintyV0, char_inclusion_class_value,
        composite_class_value, derive_selector_projection_certainty, exact_class_value,
        finite_set_class_value, prefix_class_value, prefix_suffix_class_value,
        project_abstract_value_selectors, summarize_omena_abstract_value_domain,
    };

    #[test]
    fn summarizes_domain_boundary_contract() {
        let summary = summarize_omena_abstract_value_domain();

        assert_eq!(summary.schema_version, "0");
        assert_eq!(summary.product, "omena-abstract-value.domain");
        assert_eq!(summary.max_finite_class_values, MAX_FINITE_CLASS_VALUES);
        assert!(summary.domain_kinds.contains(&"exact"));
        assert!(summary.domain_kinds.contains(&"composite"));
        assert!(
            summary
                .selector_projection_certainties
                .contains(&"inferred")
        );
    }

    #[test]
    fn normalizes_finite_sets_to_bottom_exact_or_sorted_unique_values() {
        assert_eq!(
            finite_set_class_value(Vec::<String>::new()),
            AbstractClassValueV0::Bottom
        );
        assert_eq!(
            finite_set_class_value(["button"]),
            exact_class_value("button")
        );
        assert_eq!(
            finite_set_class_value(["card", "button", "card"]),
            AbstractClassValueV0::FiniteSet {
                values: vec!["button".to_string(), "card".to_string()]
            }
        );
    }

    #[test]
    fn widens_large_finite_sets_to_composite_when_edges_survive() {
        let values = (0..=MAX_FINITE_CLASS_VALUES)
            .map(|index| format!("btn-{index}-active"))
            .collect::<Vec<_>>();

        let value = finite_set_class_value(values);

        assert_eq!(
            value,
            AbstractClassValueV0::Composite {
                prefix: Some("btn-".to_string()),
                suffix: Some("-active".to_string()),
                min_length: Some("btn-0-active".len()),
                must_chars: "-abceintv".to_string(),
                may_chars: "-012345678abceintv".to_string(),
                may_include_other_chars: false,
                provenance: Some(AbstractClassValueProvenanceV0::FiniteSetWideningComposite),
            }
        );
    }

    #[test]
    fn builds_char_inclusion_and_composite_values_with_normalized_chars() {
        assert_eq!(
            char_inclusion_class_value(
                "ba",
                "cad",
                Some(AbstractClassValueProvenanceV0::FiniteSetWideningChars),
                false,
            ),
            AbstractClassValueV0::CharInclusion {
                must_chars: "ab".to_string(),
                may_chars: "abcd".to_string(),
                may_include_other_chars: false,
                provenance: Some(AbstractClassValueProvenanceV0::FiniteSetWideningChars),
            }
        );

        assert_eq!(
            composite_class_value(CompositeClassValueInputV0 {
                prefix: Some("btn-".to_string()),
                suffix: Some("-active".to_string()),
                min_length: None,
                must_chars: "z".to_string(),
                may_chars: "za".to_string(),
                may_include_other_chars: true,
                provenance: None,
            }),
            AbstractClassValueV0::Composite {
                prefix: Some("btn-".to_string()),
                suffix: Some("-active".to_string()),
                min_length: Some("btn--active".len()),
                must_chars: "-abceintvz".to_string(),
                may_chars: "-abceintvz".to_string(),
                may_include_other_chars: true,
                provenance: None,
            }
        );
    }

    #[test]
    fn projects_exact_and_finite_values_into_selector_universe() {
        let selectors = selector_universe(["button", "card", "link"]);

        let exact = project_abstract_value_selectors(&exact_class_value("button"), &selectors);
        assert_eq!(exact.selector_names, vec!["button".to_string()]);
        assert_eq!(exact.certainty, SelectorProjectionCertaintyV0::Exact);

        let finite = project_abstract_value_selectors(
            &finite_set_class_value(["button", "missing"]),
            &selectors,
        );
        assert_eq!(finite.selector_names, vec!["button".to_string()]);
        assert_eq!(finite.certainty, SelectorProjectionCertaintyV0::Inferred);
    }

    #[test]
    fn projects_constrained_values_into_selector_universe() {
        let selectors = selector_universe(["btn-primary", "btn-secondary", "card", "link-active"]);

        let prefix = project_abstract_value_selectors(
            &prefix_class_value("btn-", Some(AbstractClassValueProvenanceV0::PrefixJoinLcp)),
            &selectors,
        );
        assert_eq!(
            prefix.selector_names,
            vec!["btn-primary".to_string(), "btn-secondary".to_string()]
        );
        assert_eq!(prefix.certainty, SelectorProjectionCertaintyV0::Inferred);

        let edge = project_abstract_value_selectors(
            &prefix_suffix_class_value("btn-", "primary", None, None),
            &selectors,
        );
        assert_eq!(edge.selector_names, vec!["btn-primary".to_string()]);
        assert_eq!(edge.certainty, SelectorProjectionCertaintyV0::Inferred);

        let chars = project_abstract_value_selectors(
            &char_inclusion_class_value("ac", "acdr", None, false),
            &selectors,
        );
        assert_eq!(chars.selector_names, vec!["card".to_string()]);
        assert_eq!(chars.certainty, SelectorProjectionCertaintyV0::Inferred);
    }

    #[test]
    fn derives_projection_certainty_from_domain_and_selector_coverage() {
        assert_eq!(
            derive_selector_projection_certainty(&AbstractClassValueV0::Bottom, 0, 3),
            SelectorProjectionCertaintyV0::Possible
        );
        assert_eq!(
            derive_selector_projection_certainty(&prefix_class_value("btn-", None), 3, 3,),
            SelectorProjectionCertaintyV0::Exact
        );
        assert_eq!(
            derive_selector_projection_certainty(&AbstractClassValueV0::Top, 3, 3),
            SelectorProjectionCertaintyV0::Possible
        );
    }

    fn selector_universe(values: impl IntoIterator<Item = &'static str>) -> Vec<String> {
        values.into_iter().map(str::to_string).collect()
    }
}
