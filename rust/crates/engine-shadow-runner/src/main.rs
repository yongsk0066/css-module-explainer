use std::collections::BTreeMap;
use std::io::{self, Read};

use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ShadowPayloadV0 {
    input: EngineInputV2,
    output: EngineOutputV2,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EngineInputV2 {
    version: String,
    sources: Vec<serde_json::Value>,
    styles: Vec<serde_json::Value>,
    type_facts: Vec<TypeFactEntryV2>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EngineOutputV2 {
    query_results: Vec<QueryResultV2>,
    rewrite_plans: Vec<serde_json::Value>,
    checker_report: CheckerReportV1,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct QueryResultV2 {
    kind: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CheckerReportV1 {
    summary: CheckerReportSummaryV1,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CheckerReportSummaryV1 {
    warnings: usize,
    hints: usize,
    total: usize,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TypeFactEntryV2 {
    file_path: String,
    expression_id: String,
    facts: StringTypeFactsV2,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StringTypeFactsV2 {
    kind: String,
    constraint_kind: Option<String>,
    values: Option<Vec<String>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ShadowSummaryV0 {
    schema_version: &'static str,
    input_version: String,
    source_count: usize,
    style_count: usize,
    type_fact_count: usize,
    distinct_fact_files: usize,
    by_kind: BTreeMap<String, usize>,
    constrained_kinds: BTreeMap<String, usize>,
    finite_value_count: usize,
    query_result_count: usize,
    query_kind_counts: BTreeMap<String, usize>,
    rewrite_plan_count: usize,
    checker_warning_count: usize,
    checker_hint_count: usize,
    checker_total_findings: usize,
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut stdin = String::new();
    io::stdin().read_to_string(&mut stdin)?;

    let payload: ShadowPayloadV0 = serde_json::from_str(&stdin)?;
    let summary = summarize(payload);
    serde_json::to_writer_pretty(io::stdout(), &summary)?;
    Ok(())
}

fn summarize(payload: ShadowPayloadV0) -> ShadowSummaryV0 {
    let mut by_kind = BTreeMap::new();
    let mut constrained_kinds = BTreeMap::new();
    let mut query_kind_counts = BTreeMap::new();
    let mut files = std::collections::BTreeSet::new();
    let mut finite_value_count = 0usize;
    let input = payload.input;
    let output = payload.output;

    for entry in &input.type_facts {
        let _ = &entry.expression_id;
        files.insert(entry.file_path.clone());
        *by_kind.entry(entry.facts.kind.clone()).or_insert(0) += 1;

        if let Some(values) = &entry.facts.values {
            finite_value_count += values.len();
        }

        if let Some(constraint_kind) = &entry.facts.constraint_kind {
            *constrained_kinds.entry(constraint_kind.clone()).or_insert(0) += 1;
        }
    }

    for query in &output.query_results {
        *query_kind_counts.entry(query.kind.clone()).or_insert(0) += 1;
    }

    ShadowSummaryV0 {
        schema_version: "0",
        input_version: input.version,
        source_count: input.sources.len(),
        style_count: input.styles.len(),
        type_fact_count: input.type_facts.len(),
        distinct_fact_files: files.len(),
        by_kind,
        constrained_kinds,
        finite_value_count,
        query_result_count: output.query_results.len(),
        query_kind_counts,
        rewrite_plan_count: output.rewrite_plans.len(),
        checker_warning_count: output.checker_report.summary.warnings,
        checker_hint_count: output.checker_report.summary.hints,
        checker_total_findings: output.checker_report.summary.total,
    }
}
