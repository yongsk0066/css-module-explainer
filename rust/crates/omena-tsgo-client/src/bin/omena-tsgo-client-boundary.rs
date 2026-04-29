use std::io;

use omena_tsgo_client::summarize_omena_tsgo_client_boundary;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let summary = summarize_omena_tsgo_client_boundary();
    serde_json::to_writer_pretty(io::stdout(), &summary)?;
    Ok(())
}
