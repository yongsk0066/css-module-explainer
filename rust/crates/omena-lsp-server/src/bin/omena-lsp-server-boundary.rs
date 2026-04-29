fn main() -> Result<(), Box<dyn std::error::Error>> {
    let summary = omena_lsp_server::summarize_omena_lsp_server_boundary();
    serde_json::to_writer(std::io::stdout(), &summary)?;
    Ok(())
}
