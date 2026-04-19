use std::collections::{BTreeMap, BTreeSet};

use crate::{EngineInputV2, TypeFactInputSummaryV0};

pub fn summarize_type_fact_input(input: &EngineInputV2) -> TypeFactInputSummaryV0 {
    let mut by_kind = BTreeMap::new();
    let mut constrained_kinds = BTreeMap::new();
    let mut files = BTreeSet::new();
    let mut finite_value_count = 0usize;

    for entry in &input.type_facts {
        let _ = &entry.expression_id;
        files.insert(entry.file_path.clone());
        *by_kind.entry(entry.facts.kind.clone()).or_insert(0) += 1;

        if let Some(values) = &entry.facts.values {
            finite_value_count += values.len();
        }

        if let Some(constraint_kind) = &entry.facts.constraint_kind {
            *constrained_kinds
                .entry(constraint_kind.clone())
                .or_insert(0) += 1;
        }
    }

    TypeFactInputSummaryV0 {
        schema_version: "0",
        input_version: input.version.clone(),
        type_fact_count: input.type_facts.len(),
        distinct_fact_files: files.len(),
        by_kind,
        constrained_kinds,
        finite_value_count,
    }
}
