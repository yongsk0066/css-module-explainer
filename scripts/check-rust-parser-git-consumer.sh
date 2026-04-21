#!/usr/bin/env bash
set -euo pipefail

repo_url="${ENGINE_STYLE_PARSER_GIT_REPO:-https://github.com/omenien/omena-engine-style-parser.git}"
repo_ref="${ENGINE_STYLE_PARSER_GIT_REF:-71f3cd2}"
temp_dir="$(mktemp -d)"
trap 'rm -rf "${temp_dir}"' EXIT

mkdir -p "${temp_dir}/consumer/src"

cat > "${temp_dir}/Cargo.toml" <<EOF
[workspace]
members = ["consumer"]
resolver = "2"

[workspace.package]
version = "0.1.0"
edition = "2024"
license = "MIT"
publish = false

[workspace.lints.rust]
unsafe_code = "deny"

[workspace.lints.clippy]
dbg_macro = "warn"
todo = "warn"
unwrap_used = "warn"
expect_used = "warn"
panic = "warn"
EOF

cat > "${temp_dir}/consumer/Cargo.toml" <<EOF
[package]
name = "engine-style-parser-git-consumer-check"
version.workspace = true
edition.workspace = true
license.workspace = true
publish.workspace = true

[lints]
workspace = true

[dependencies]
engine-style-parser = { git = "${repo_url}", rev = "${repo_ref}" }
serde_json = "1.0"
EOF

cat > "${temp_dir}/consumer/src/lib.rs" <<'EOF'
use engine_style_parser::{
    parse_style_module, summarize_parser_canonical_producer_signal, ParserCanonicalProducerSignalV0,
};

pub fn consume_parser_canonical_signal(
    file_path: &str,
    source: &str,
) -> Option<ParserCanonicalProducerSignalV0> {
    let stylesheet = parse_style_module(file_path, source)?;
    Some(summarize_parser_canonical_producer_signal(&stylesheet))
}

#[cfg(test)]
mod tests {
    use super::consume_parser_canonical_signal;
    use serde_json::json;

    #[test]
    fn consumes_remote_parser_repo_via_git_dependency() -> Result<(), String> {
        let source = r#"
@value primary: red;
@keyframes fade { from { opacity: 0; } to { opacity: 1; } }

.button {
  color: primary;
  animation: fade 1s ease;
}
"#;

        let signal = consume_parser_canonical_signal("Button.module.scss", source)
            .ok_or_else(|| "expected stylesheet".to_string())?;

        assert_eq!(
            signal.canonical_candidate.css_modules_intermediate.selectors.names,
            vec!["button"]
        );
        assert_eq!(
            signal.canonical_candidate.css_modules_intermediate.values.decl_names,
            vec!["primary"]
        );
        assert_eq!(
            signal.canonical_candidate.css_modules_intermediate.keyframes.names,
            vec!["fade"]
        );

        let candidate = signal
            .evaluator_candidates
            .results
            .iter()
            .find(|candidate| candidate.selector_name == "button")
            .ok_or_else(|| "expected button candidate".to_string())?;
        assert!(candidate.has_value_refs);
        assert!(candidate.has_animation_ref);
        Ok(())
    }

    #[test]
    fn serializes_remote_parser_output_for_downstream_consumers() -> Result<(), String> {
        let source = ".card { composes: base from \"./base.module.scss\"; }";
        let signal = consume_parser_canonical_signal("Card.module.scss", source)
            .ok_or_else(|| "expected stylesheet".to_string())?;
        let value = serde_json::to_value(&signal).map_err(|error| error.to_string())?;

        assert!(value["schemaVersion"].as_str().is_some());
        assert_eq!(
            value["canonicalCandidate"]["cssModulesIntermediate"]["composes"]["importSources"],
            json!(["./base.module.scss"])
        );
        assert_eq!(
            value["evaluatorCandidates"]["results"][0]["hasImportedComposes"],
            json!(true)
        );
        Ok(())
    }
}
EOF

printf 'checking remote parser repo via git dependency\n'
printf '  repo: %s\n' "${repo_url}"
printf '  ref:  %s\n' "${repo_ref}"

RUSTUP_TOOLCHAIN=stable cargo test --manifest-path "${temp_dir}/Cargo.toml" -p engine-style-parser-git-consumer-check
RUSTUP_TOOLCHAIN=stable cargo check --manifest-path "${temp_dir}/Cargo.toml" -p engine-style-parser-git-consumer-check
RUSTUP_TOOLCHAIN=stable cargo clippy --manifest-path "${temp_dir}/Cargo.toml" -p engine-style-parser-git-consumer-check --all-targets --all-features -- -D warnings
