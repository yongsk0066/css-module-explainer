use std::io::{self, Read};

use engine_input_producers::EngineInputV2;
use engine_style_parser::parse_style_module;
use omena_semantic::{summarize_style_semantic_graph, summarize_theory_observation_contract};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TheoryObservationContractInput {
    style_path: String,
    style_source: String,
    engine_input: EngineInputV2,
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut input_json = String::new();
    io::stdin().read_to_string(&mut input_json)?;
    let input: TheoryObservationContractInput = serde_json::from_str(&input_json)?;
    let Some(sheet) = parse_style_module(&input.style_path, &input.style_source) else {
        return Err("unsupported style module path".into());
    };
    let graph = summarize_style_semantic_graph(&sheet, &input.engine_input);
    let summary = summarize_theory_observation_contract(&graph);
    serde_json::to_writer_pretty(io::stdout(), &summary)?;
    Ok(())
}
