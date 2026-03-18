#!/bin/bash
set -euo pipefail

REPO_ROOT="/Users/beckliu/Documents/0agentproject2026/vibecodingworkflow"
DRIVER="/opt/homebrew/bin/python3.11"
if [[ -x "$REPO_ROOT/.venv/bin/python" ]]; then
  DRIVER="$REPO_ROOT/.venv/bin/python"
fi

TARGET_ROOT="${1:-$REPO_ROOT/integrations/vibecoding-vscode-extension/fixtures/session8-smoke-project}"

PYTHONPATH="$REPO_ROOT/src${PYTHONPATH:+:$PYTHONPATH}" \
  "$DRIVER" -m vibecoding_langgraph.test_support --project-root "$TARGET_ROOT"
