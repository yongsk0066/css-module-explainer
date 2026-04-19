use std::collections::BTreeMap;

use crate::{
    ConstraintDetailCounts, ConstraintDetailInput, EngineInputV2, ExpressionDomainPlanSummaryV0,
    collect_constraint_detail_counts,
};

pub fn summarize_expression_domain_plan_input(
    input: &EngineInputV2,
) -> ExpressionDomainPlanSummaryV0 {
    let mut planned_expression_ids = Vec::new();
    let mut value_domain_kinds = BTreeMap::new();
    let mut value_constraint_kinds = BTreeMap::new();
    let mut constraint_detail_counts = ConstraintDetailCounts::default();
    let mut finite_value_count = 0usize;

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
    }

    ExpressionDomainPlanSummaryV0 {
        schema_version: "0",
        input_version: input.version.clone(),
        planned_expression_ids,
        value_domain_kinds,
        value_constraint_kinds,
        constraint_detail_counts,
        finite_value_count,
    }
}
