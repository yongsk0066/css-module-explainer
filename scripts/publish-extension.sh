#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

# Load local release credentials if present.
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

CHANNEL="${RELEASE_CHANNEL:-stable}"
PUBLISH_MARKETPLACE="${PUBLISH_MARKETPLACE:-true}"
PUBLISH_OPENVSX="${PUBLISH_OPENVSX:-true}"

PACKAGE_ARGS=(--no-dependencies)
PUBLISH_ARGS=(--no-dependencies)

if [ "$CHANNEL" = "preview" ]; then
  PACKAGE_ARGS+=(--pre-release)
  PUBLISH_ARGS+=(--pre-release)
fi

./scripts/release.sh
pnpm check
pnpm test
pnpm build
pnpm check:packaged-engine-shadow-runner

rm -f ./*.vsix
pnpm exec vsce package "${PACKAGE_ARGS[@]}"
VSIX_FILE="$(ls -1 ./*.vsix | head -n 1)"
pnpm check:packaged-selected-query-default

if [ "$PUBLISH_MARKETPLACE" = "true" ]; then
  pnpm exec vsce publish "${PUBLISH_ARGS[@]}"
fi

if [ "$PUBLISH_OPENVSX" = "true" ]; then
  pnpm exec ovsx publish "$VSIX_FILE" --skip-duplicate
fi
