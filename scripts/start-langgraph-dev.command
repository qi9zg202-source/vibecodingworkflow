#!/bin/bash
set -euo pipefail

PROJECT_ROOT="/Users/beckliu/Documents/0agentproject2026/vibecodingworkflow"
GHOSTTY_APP="/Applications/Ghostty.app"

if [[ ! -d "$GHOSTTY_APP" ]]; then
  echo "Ghostty not found at $GHOSTTY_APP" >&2
  exit 1
fi

LAUNCH_CMD="cd \"$PROJECT_ROOT\" && source .venv/bin/activate && langgraph dev --host 0.0.0.0 --port 2024 --no-browser; exec \$SHELL -l"

open -na "$GHOSTTY_APP" --args -e /bin/bash -lc "$LAUNCH_CMD"
