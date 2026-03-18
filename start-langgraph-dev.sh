#!/bin/bash
# LangGraph Dev Server 守护进程管理脚本
# 使用 nohup + PID 文件守护，崩溃后可通过 start 重新拉起
#
# 用法:
#   ./start-langgraph-dev.sh          # 启动（已在运行则跳过）
#   ./start-langgraph-dev.sh stop     # 停止
#   ./start-langgraph-dev.sh restart  # 重启
#   ./start-langgraph-dev.sh status   # 查看状态
#   ./start-langgraph-dev.sh log      # 查看日志（tail -f）

WORKDIR="/Users/beckliu/Documents/0agentproject2026/vibecodingworkflow"
LOG_DIR="${WORKDIR}/.vibecoding"
PID_FILE="${LOG_DIR}/langgraph.pid"
STDOUT_LOG="${LOG_DIR}/langgraph-stdout.log"
STDERR_LOG="${LOG_DIR}/langgraph-stderr.log"
LAUNCHD_STDOUT_LOG="${LOG_DIR}/langgraph-launchd-stdout.log"
LAUNCHD_STDERR_LOG="${LOG_DIR}/langgraph-launchd-stderr.log"
LAUNCHD_LABEL="com.beckliu.langgraph.dev"
LAUNCH_AGENTS_DIR="${HOME}/Library/LaunchAgents"
LAUNCHD_PLIST="${LAUNCH_AGENTS_DIR}/${LAUNCHD_LABEL}.plist"
LAUNCHD_DOMAIN="gui/$(id -u)"
LAUNCHD_WRAPPER="${WORKDIR}/scripts/langgraph-daemon-wrapper.sh"
PORT=2024

mkdir -p "$LOG_DIR"

_pid_running() {
    local pid="$1"
    [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

_read_pid() {
    [[ -f "$PID_FILE" ]] && cat "$PID_FILE"
}

_is_running() {
    _pid_running "$(_read_pid)"
}

_is_launchd_loaded() {
    launchctl print "${LAUNCHD_DOMAIN}/${LAUNCHD_LABEL}" >/dev/null 2>&1
}

_is_launchd_running() {
    [[ -n "$(_launchd_pid)" ]]
}

_launchd_bootout() {
    launchctl bootout "$LAUNCHD_DOMAIN" "$LAUNCHD_PLIST" >/dev/null 2>&1 || true
}

_launchd_pid() {
    launchctl print "${LAUNCHD_DOMAIN}/${LAUNCHD_LABEL}" 2>/dev/null | awk -F'= ' '/pid = / {print $2; exit}'
}

_pid_started_at_epoch_ms() {
    local pid="$1"
    if [[ -z "$pid" || ! -f "$PID_FILE" ]]; then
        return
    fi
    stat -f %m "$PID_FILE" 2>/dev/null | awk '{print $1 * 1000}'
}

_status_json() {
    local pid=""
    local launchd_pid=""
    local manager="unknown"
    local lifecycle="offline"
    local pid_source="none"
    local launchd_loaded="false"
    local autostart_installed="false"
    local started_at_epoch_ms=""

    if [[ -f "$LAUNCHD_PLIST" ]]; then
        autostart_installed="true"
    fi

    if _is_launchd_loaded; then
        launchd_loaded="true"
        launchd_pid="$(_launchd_pid)"
        if [[ -n "$launchd_pid" ]]; then
            manager="launchd"
            pid="$launchd_pid"
            pid_source="launchd"
        fi
    fi

    if _is_running; then
        pid="$(_read_pid)"
        pid_source="pid_file"
        if [[ "$manager" == "unknown" ]]; then
            manager="nohup"
        fi
    fi

    if curl -sf "http://localhost:${PORT}/ok" >/dev/null 2>&1; then
        lifecycle="online"
        if [[ "$manager" == "unknown" ]]; then
            manager="manual"
            pid_source="unknown"
        fi
    elif [[ -n "$pid" ]]; then
        lifecycle="starting"
    fi

    started_at_epoch_ms="$(_pid_started_at_epoch_ms "$pid")"

    python3 - \
        "http://localhost:${PORT}" \
        "$PORT" \
        "$manager" \
        "$lifecycle" \
        "$pid" \
        "$pid_source" \
        "$launchd_pid" \
        "$WORKDIR" \
        "$PID_FILE" \
        "$STDOUT_LOG" \
        "$STDERR_LOG" \
        "$LAUNCHD_STDOUT_LOG" \
        "$LAUNCHD_STDERR_LOG" \
        "$LAUNCHD_LABEL" \
        "$LAUNCHD_PLIST" \
        "$launchd_loaded" \
        "$autostart_installed" \
        "$started_at_epoch_ms" <<'PY'
import json
import sys

server_url, port, manager, lifecycle, pid, pid_source, launchd_pid, workdir, pid_file, stdout_log, stderr_log, launchd_stdout_log, launchd_stderr_log, launchd_label, launchd_plist, launchd_loaded, autostart_installed, started_at_epoch_ms = sys.argv[1:]

def as_int(value: str):
    value = value.strip()
    if not value:
        return None
    try:
        return int(value)
    except ValueError:
        return None

payload = {
    "server_url": server_url,
    "port": as_int(port),
    "manager": manager,
    "lifecycle": lifecycle,
    "pid": as_int(pid),
    "pid_source": pid_source or None,
    "launchd_pid": as_int(launchd_pid),
    "workdir": workdir,
    "pid_file": pid_file,
    "stdout_log": stdout_log,
    "stderr_log": stderr_log,
    "launchd_stdout_log": launchd_stdout_log,
    "launchd_stderr_log": launchd_stderr_log,
    "launchd_label": launchd_label,
    "launchd_plist": launchd_plist,
    "launchd_loaded": launchd_loaded == "true",
    "autostart_installed": autostart_installed == "true",
    "started_at_epoch_ms": as_int(started_at_epoch_ms),
    "summary": f"{lifecycle} | daemon={manager}" + (f" | pid={pid}" if pid else ""),
}
print(json.dumps(payload, ensure_ascii=False))
PY
}

_render_launchd_plist() {
    mkdir -p "$LAUNCH_AGENTS_DIR"
    cat > "$LAUNCHD_PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LAUNCHD_LABEL}</string>
  <key>WorkingDirectory</key>
  <string>${WORKDIR}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${LAUNCHD_WRAPPER}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${LAUNCHD_STDOUT_LOG}</string>
  <key>StandardErrorPath</key>
  <string>${LAUNCHD_STDERR_LOG}</string>
</dict>
</plist>
EOF
}

_do_start() {
    cd "$WORKDIR" || exit 1
    source .venv/bin/activate

    nohup langgraph dev \
        --host 0.0.0.0 \
        --port "$PORT" \
        --no-browser \
        >> "$STDOUT_LOG" 2>> "$STDERR_LOG" &

    echo $! > "$PID_FILE"
    echo $!
}

cmd="${1:-start}"

case "$cmd" in
  start)
    if _is_running; then
        echo "✅ LangGraph server 已在运行 PID=$(_read_pid)  http://localhost:${PORT}"
        exit 0
    fi
    echo "▶ 启动 LangGraph server..."
    pid=$(_do_start)
    # 等待最多 15s 确认服务上线
    for i in $(seq 1 15); do
        sleep 1
        if curl -sf "http://localhost:${PORT}/ok" &>/dev/null; then
            echo "✅ LangGraph server 已就绪 PID=${pid}  http://localhost:${PORT}"
            echo "   日志: ${STDOUT_LOG}"
            exit 0
        fi
        if ! _pid_running "$pid"; then
            echo "❌ 进程已退出，请查看日志: ${STDERR_LOG}"
            tail -20 "$STDERR_LOG"
            exit 1
        fi
    done
    echo "⚠️  进程已启动 PID=${pid}，但 15s 内未响应 /ok，请查看日志"
    ;;

  stop)
    pid=$(_read_pid)
    if _pid_running "$pid"; then
        kill "$pid"
        rm -f "$PID_FILE"
        echo "⏹ LangGraph server 已停止 (PID=${pid})"
    else
        rm -f "$PID_FILE"
        echo "LangGraph server 未在运行"
    fi
    ;;

  restart)
    "$0" stop
    sleep 1
    "$0" start
    ;;

  autostart-install)
    mkdir -p "$LOG_DIR"
    if [[ ! -x "$LAUNCHD_WRAPPER" ]]; then
        echo "❌ launchd wrapper 不可执行: ${LAUNCHD_WRAPPER}"
        exit 1
    fi
    _render_launchd_plist
    if _is_running; then
        echo "ℹ️ 检测到 nohup 版 LangGraph server，先停止后切换到 launchd..."
        "$0" stop
    fi
    _launchd_bootout
    launchctl bootstrap "$LAUNCHD_DOMAIN" "$LAUNCHD_PLIST"
    launchctl enable "${LAUNCHD_DOMAIN}/${LAUNCHD_LABEL}" >/dev/null 2>&1 || true
    launchctl kickstart -k "${LAUNCHD_DOMAIN}/${LAUNCHD_LABEL}"
    for i in $(seq 1 15); do
        sleep 1
        if curl -sf "http://localhost:${PORT}/ok" &>/dev/null; then
            server_pid=$(_read_pid)
            echo "✅ 已安装开机自启动并启动 LangGraph server PID=${server_pid:-unknown}  http://localhost:${PORT}"
            echo "   plist: ${LAUNCHD_PLIST}"
            echo "   日志: ${LAUNCHD_STDOUT_LOG}"
            exit 0
        fi
    done
    echo "⚠️ 已安装开机自启动，但 15s 内未响应 /ok，请查看日志: ${LAUNCHD_STDERR_LOG}"
    exit 1
    ;;

  autostart-uninstall)
    _launchd_bootout
    rm -f "$LAUNCHD_PLIST"
    echo "⏹ 已移除开机自启动: ${LAUNCHD_LABEL}"
    ;;

  autostart-restart)
    if [[ ! -f "$LAUNCHD_PLIST" ]]; then
        echo "❌ 尚未安装开机自启动，先执行: $0 autostart-install"
        exit 1
    fi
    launchctl kickstart -k "${LAUNCHD_DOMAIN}/${LAUNCHD_LABEL}"
    echo "🔄 已重启 launchd 服务: ${LAUNCHD_LABEL}"
    ;;

  autostart-status)
    if [[ ! -f "$LAUNCHD_PLIST" ]]; then
        echo "⏹ 未安装开机自启动"
        exit 0
    fi
    if _is_launchd_running; then
        if curl -sf "http://localhost:${PORT}/ok" &>/dev/null; then
            echo "✅ 开机自启动已安装；当前 LangGraph server 运行中  http://localhost:${PORT}"
        else
            echo "⚠️ 开机自启动已加载，但 /ok 未响应，请查看日志: ${LAUNCHD_STDERR_LOG}"
        fi
    elif _is_launchd_loaded; then
        echo "ℹ️ 开机自启动已安装；当前 launchd job 未运行，下次登录会自动拉起"
    else
        echo "⚠️ 已存在 plist，但 launchd 当前未加载: ${LAUNCHD_PLIST}"
    fi
    ;;

  autostart-log)
    echo "=== launchd 实时日志 (Ctrl+C 退出) ==="
    tail -f "$LAUNCHD_STDOUT_LOG" "$LAUNCHD_STDERR_LOG" 2>/dev/null
    ;;

  status)
    pid=$(_read_pid)
    if _pid_running "$pid"; then
        if curl -sf "http://localhost:${PORT}/ok" &>/dev/null; then
            echo "✅ 运行中 PID=${pid}  http://localhost:${PORT}"
        else
            echo "⚠️  进程存在 PID=${pid}，但 /ok 未响应（可能正在启动）"
        fi
    else
        echo "⏹ 未运行"
    fi
    ;;

  status-json)
    _status_json
    ;;

  log)
    echo "=== 实时日志 (Ctrl+C 退出) ==="
    tail -f "$STDOUT_LOG" "$STDERR_LOG" 2>/dev/null
    ;;

  *)
    echo "用法: $0 [start|stop|restart|status|status-json|log|autostart-install|autostart-uninstall|autostart-restart|autostart-status|autostart-log]"
    exit 1
    ;;
esac
