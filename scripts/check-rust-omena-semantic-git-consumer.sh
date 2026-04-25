#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
fixture_dir="${repo_root}/rust/external-consumers/omena-semantic-git-consumer"
target_dir="${repo_root}/rust/target"

dependency_line_for() {
  local dependency_name="$1"
  grep "^${dependency_name} = " "${fixture_dir}/Cargo.toml"
}

repo_url_from_line() {
  sed -E 's/.*git = "([^"]+)".*/\1/'
}

repo_ref_from_line() {
  sed -E 's/.*rev = "([^"]+)".*/\1/'
}

input_dependency_line="$(dependency_line_for "engine-input-producers")"
parser_dependency_line="$(dependency_line_for "engine-style-parser")"
semantic_dependency_line="$(dependency_line_for "omena-semantic")"

default_input_repo_url="$(printf '%s\n' "${input_dependency_line}" | repo_url_from_line)"
default_input_repo_ref="$(printf '%s\n' "${input_dependency_line}" | repo_ref_from_line)"
default_parser_repo_url="$(printf '%s\n' "${parser_dependency_line}" | repo_url_from_line)"
default_parser_repo_ref="$(printf '%s\n' "${parser_dependency_line}" | repo_ref_from_line)"
default_semantic_repo_url="$(printf '%s\n' "${semantic_dependency_line}" | repo_url_from_line)"
default_semantic_repo_ref="$(printf '%s\n' "${semantic_dependency_line}" | repo_ref_from_line)"

input_repo_url="${ENGINE_INPUT_PRODUCERS_GIT_REPO:-${default_input_repo_url}}"
input_repo_ref="${ENGINE_INPUT_PRODUCERS_GIT_REF:-${default_input_repo_ref}}"
parser_repo_url="${ENGINE_STYLE_PARSER_GIT_REPO:-${default_parser_repo_url}}"
parser_repo_ref="${ENGINE_STYLE_PARSER_GIT_REF:-${default_parser_repo_ref}}"
semantic_repo_url="${OMENA_SEMANTIC_GIT_REPO:-${default_semantic_repo_url}}"
semantic_repo_ref="${OMENA_SEMANTIC_GIT_REF:-${default_semantic_repo_ref}}"

if [[ "${input_repo_url}" == "${default_input_repo_url}" &&
  "${input_repo_ref}" == "${default_input_repo_ref}" &&
  "${parser_repo_url}" == "${default_parser_repo_url}" &&
  "${parser_repo_ref}" == "${default_parser_repo_ref}" &&
  "${semantic_repo_url}" == "${default_semantic_repo_url}" &&
  "${semantic_repo_ref}" == "${default_semantic_repo_ref}" ]]; then
  manifest_path="${fixture_dir}/Cargo.toml"
else
  temp_dir="$(mktemp -d)"
  trap 'rm -rf "${temp_dir}"' EXIT
  mkdir -p "${temp_dir}/src"
  cp -R "${fixture_dir}/src/." "${temp_dir}/src/"
  cat > "${temp_dir}/Cargo.toml" <<EOF
[workspace]
members = ["."]
resolver = "2"

[package]
name = "omena-semantic-git-consumer-check"
version = "0.1.0"
edition = "2024"
license = "MIT"
publish = false

[dependencies]
engine-input-producers = { package = "omena-engine-input-producers", git = "${input_repo_url}", rev = "${input_repo_ref}" }
engine-style-parser = { package = "omena-engine-style-parser", git = "${parser_repo_url}", rev = "${parser_repo_ref}" }
omena-semantic = { git = "${semantic_repo_url}", rev = "${semantic_repo_ref}" }
serde_json = "1.0"
EOF
  manifest_path="${temp_dir}/Cargo.toml"
fi

printf 'checking omena-semantic repo via git dependency\n'
printf '  input repo:    %s\n' "${input_repo_url}"
printf '  input ref:     %s\n' "${input_repo_ref}"
printf '  parser repo:   %s\n' "${parser_repo_url}"
printf '  parser ref:    %s\n' "${parser_repo_ref}"
printf '  semantic repo: %s\n' "${semantic_repo_url}"
printf '  semantic ref:  %s\n' "${semantic_repo_ref}"
printf '  fixture: %s\n' "${manifest_path}"

CARGO_TARGET_DIR="${target_dir}" RUSTUP_TOOLCHAIN=stable cargo test --manifest-path "${manifest_path}" -p omena-semantic-git-consumer-check
CARGO_TARGET_DIR="${target_dir}" RUSTUP_TOOLCHAIN=stable cargo check --manifest-path "${manifest_path}" -p omena-semantic-git-consumer-check
CARGO_TARGET_DIR="${target_dir}" RUSTUP_TOOLCHAIN=stable cargo clippy --manifest-path "${manifest_path}" -p omena-semantic-git-consumer-check --all-targets --all-features -- -D warnings
