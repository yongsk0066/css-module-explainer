use std::io::{self, Read};

use engine_style_parser::{parse_style_module, summarize_parity_lite};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let Some(path) = std::env::args().nth(1) else {
        return Err("expected module file path argument".into());
    };
    let mut source = String::new();
    io::stdin().read_to_string(&mut source)?;
    let Some(sheet) = parse_style_module(&path, &source) else {
        return Err("unsupported style module path".into());
    };
    let summary = summarize_parity_lite(&sheet);
    serde_json::to_writer_pretty(io::stdout(), &summary)?;
    Ok(())
}
