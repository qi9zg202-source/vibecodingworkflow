#!/bin/bash -l
# launchd wrapper: 用登录 shell 激活 venv 再启动 langgraph。
# 不要直接执行这个文件，由 launchd plist 调用。

set -euo pipefail

WORKDIR="/Users/beckliu/Documents/0agentproject2026/vibecodingworkflow"
VENV_ACTIVATE="${WORKDIR}/.venv/bin/activate"

cd "$WORKDIR"

if [[ ! -f "$VENV_ACTIVATE" ]]; then
    echo "Python venv activate script not found: ${VENV_ACTIVATE}" >&2
    exit 1
fi

source "$VENV_ACTIVATE"
exec langgraph dev --host 0.0.0.0 --port 2024 --no-browser
