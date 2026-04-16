#!/usr/bin/env bash
# Sync SERVER_VERSION in server/adapter-vscode/src/composition-root.ts with the
# version in package.json. Call before `pnpm build` in release flow.
set -euo pipefail

cd "$(dirname "$0")/.."
VERSION=$(node -p "require('./package.json').version")

sed -i.bak -E "s/SERVER_VERSION = \"[^\"]+\"/SERVER_VERSION = \"$VERSION\"/" \
  server/adapter-vscode/src/composition-root.ts
rm server/adapter-vscode/src/composition-root.ts.bak

echo "Synced SERVER_VERSION to $VERSION"
