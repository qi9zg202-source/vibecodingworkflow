#!/bin/bash
set -euo pipefail

REPO_ROOT="/Users/beckliu/Documents/0agentproject2026/vibecodingworkflow"
DEMO_ROOT="$REPO_ROOT/demo/TSMC-fab-chiller-strategy"
MEMORY_PATH="$DEMO_ROOT/memory.md"
ARTIFACTS_DIR="$DEMO_ROOT/artifacts"
LOGS_DIR="$DEMO_ROOT/outputs/session-logs"
SPECS_DIR="$DEMO_ROOT/outputs/session-specs"
DRIVER="/opt/homebrew/bin/python3.11"
if [[ -x "$REPO_ROOT/.venv/bin/python" ]]; then
  DRIVER="$REPO_ROOT/.venv/bin/python"
fi
INSPECT_SCRIPT="$REPO_ROOT/scripts/archived/run-vibecoding-loop.py"

if [[ ! -f "$MEMORY_PATH" ]]; then
  echo "memory.md not found: $MEMORY_PATH" >&2
  exit 1
fi

if [[ ! -f "$INSPECT_SCRIPT" ]]; then
  echo "Driver not found: $INSPECT_SCRIPT" >&2
  exit 1
fi

mkdir -p "$ARTIFACTS_DIR" "$LOGS_DIR" "$SPECS_DIR"
touch "$LOGS_DIR/.gitkeep" "$SPECS_DIR/.gitkeep"

find "$ARTIFACTS_DIR" -maxdepth 1 -type f -name 'session-*' -delete
find "$LOGS_DIR" -maxdepth 1 -type f ! -name '.gitkeep' -delete
find "$SPECS_DIR" -maxdepth 1 -type f ! -name '.gitkeep' -delete

export MEMORY_PATH
"$DRIVER" <<'PY'
from pathlib import Path
import os
import re

memory_path = Path(os.environ["MEMORY_PATH"])
text = memory_path.read_text(encoding="utf-8")

updates = {
    "current_phase": "development",
    "last_completed_session": "0",
    "last_completed_session_tests": "passed",
    "next_session": "1",
    "next_session_prompt": "`session-1-prompt.md`",
    "session_gate": "ready",
}

for key, value in updates.items():
    pattern = re.compile(rf"^(- {re.escape(key)}:\s*).*$", re.MULTILINE)
    text, count = pattern.subn(lambda match, value=value: f"{match.group(1)}{value}", text, count=1)
    if count != 1:
        raise SystemExit(f"Missing memory status key: {key}")

session_artifacts_marker = "## Session Artifacts\n"
session_progress_marker = "## Session Progress Record\n"
next_entry_marker = "## Next Session Entry\n"

start = text.find(session_artifacts_marker)
mid = text.find(session_progress_marker)
end = text.find(next_entry_marker)
if start == -1 or mid == -1 or end == -1:
    raise SystemExit("Missing one of Session Artifacts / Session Progress Record / Next Session Entry blocks.")

replacement = (
    "## Session Artifacts\n"
    "- session_0_outputs: `CLAUDE.md`, `task.md`, `PRD.md`, `design.md`, `work-plan.md`, `memory.md`, `README.md`\n\n"
    "## Session Progress Record\n"
    "- 2026-03-16 Session 0:\n"
    "  - 完成内容：将 demo 重构为更贴近真实 Fab CUS 业务的测试项目，重写项目背景、业务范围、设计边界、Session 计划和下一轮完整测试要求，并清理旧运行产物\n"
    "  - 执行测试：文档完整性检查、workflow 状态检查、旧 artifacts / logs 重置检查\n"
    "  - 测试结果：`passed`\n"
    "  - 下一 Session 依赖：读取 `design.md`、`work-plan.md`，然后进入 `session-1-prompt.md`\n\n"
)

text = text[:start] + replacement + text[end:]
memory_path.write_text(text, encoding="utf-8")
PY

inspect_json="$("$DRIVER" "$INSPECT_SCRIPT" "$DEMO_ROOT" --action inspect --json)"

export INSPECT_JSON="$inspect_json"
"$DRIVER" <<'PY'
import json
import os

payload = json.loads(os.environ["INSPECT_JSON"])
assert payload["status"] == "ready", payload
assert payload["next_session"] == "1", payload
assert payload["next_session_prompt"] == "session-1-prompt.md", payload
assert payload["session_gate"] == "ready", payload
PY

find "$LOGS_DIR" -maxdepth 1 -type f ! -name '.gitkeep' -delete
find "$SPECS_DIR" -maxdepth 1 -type f ! -name '.gitkeep' -delete

echo "Demo reset complete."
echo "project_root=$DEMO_ROOT"
echo "status=ready"
echo "next_session=1"
echo "next_session_prompt=session-1-prompt.md"
