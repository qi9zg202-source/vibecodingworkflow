#!/bin/bash
set -e
VSCODE_EXT=~/.vscode/extensions/beckliu.vibecoding-vscode-extension-0.1.10

cd "$(dirname "$0")/vscode-ext"
echo "▶ Compiling..."
/usr/local/bin/node node_modules/typescript/bin/tsc -p ./
echo "▶ Syncing to $VSCODE_EXT..."
cp -r out/ "$VSCODE_EXT/out/"
echo "✅ Done. Reload VSCode window to apply changes."
