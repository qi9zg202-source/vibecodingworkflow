#!/usr/bin/env python3
"""Run the full LangGraph validation suite for this repository."""

from __future__ import annotations

import os
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
PYTHON = REPO_ROOT / ".venv" / "bin" / "python"
LANGGRAPH = REPO_ROOT / ".venv" / "bin" / "langgraph"
RESET_SCRIPT = REPO_ROOT / "scripts" / "reset-demo-stic-fab-cus.sh"
FIXTURE_RESET = REPO_ROOT / "scripts" / "reset-langgraph-test-data.sh"
HTTP_SMOKE = REPO_ROOT / "scripts" / "test_langgraph_http_smoke.py"
E2E_SMOKE = REPO_ROOT / "scripts" / "test_langgraph_e2e.py"
HITL_HTTP_SMOKE = REPO_ROOT / "scripts" / "test_langgraph_hitl_http.py"


def base_env(extra: dict[str, str] | None = None) -> dict[str, str]:
    env = os.environ.copy()
    env["PYTHONPATH"] = str(REPO_ROOT / "src")
    if extra:
        env.update(extra)
    return env


def run_step(name: str, cmd: list[str], env: dict[str, str] | None = None) -> None:
    print(f"[RUN] {name}")
    proc = subprocess.run(
        cmd,
        cwd=str(REPO_ROOT),
        env=env or base_env(),
        text=True,
        capture_output=True,
    )
    if proc.stdout:
        print(proc.stdout.rstrip())
    if proc.returncode != 0:
        if proc.stderr:
            print(proc.stderr.rstrip(), file=sys.stderr)
        raise SystemExit(proc.returncode)
    if proc.stderr:
        print(proc.stderr.rstrip())


def run_inline_python(name: str, code: str) -> None:
    run_step(name, [str(PYTHON), "-c", code])


def healthcheck(base_url: str) -> bool:
    try:
        with urllib.request.urlopen(base_url + "/ok", timeout=1) as response:
            return response.status == 200
    except (urllib.error.URLError, TimeoutError):
        return False


def reserve_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def ensure_server() -> tuple[str, subprocess.Popen[str] | None]:
    existing_url = os.environ.get("LANGGRAPH_BASE_URL", "http://127.0.0.1:2024")
    if healthcheck(existing_url):
        print(f"[INFO] Reusing existing LangGraph server at {existing_url}")
        return existing_url, None

    port = reserve_port()
    base_url = f"http://127.0.0.1:{port}"
    print(f"[INFO] Starting LangGraph dev server at {base_url}")
    proc = subprocess.Popen(
        [
            str(LANGGRAPH),
            "dev",
            "--config",
            str(REPO_ROOT / "langgraph.json"),
            "--host",
            "127.0.0.1",
            "--port",
            str(port),
            "--no-browser",
            "--no-reload",
        ],
        cwd=str(REPO_ROOT),
        env=base_env(),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    for _ in range(40):
        if healthcheck(base_url):
            return base_url, proc
        time.sleep(0.5)

    output = ""
    if proc.stdout is not None:
        output = proc.stdout.read()
    proc.terminate()
    raise RuntimeError(f"LangGraph dev server failed to start.\n{output}")


def main() -> int:
    if not PYTHON.exists():
        raise SystemExit(f"Missing Python runtime: {PYTHON}")
    if not LANGGRAPH.exists():
        raise SystemExit(f"Missing LangGraph CLI: {LANGGRAPH}")

    run_step("demo reset", [str(RESET_SCRIPT)])
    run_step("langgraph fixture reset", [str(FIXTURE_RESET)])
    try:
        run_inline_python(
            "graph import",
            "from vibecoding_langgraph.graph import graph; print(type(graph).__name__)",
        )
        run_inline_python(
            "sync invoke",
            (
                "from vibecoding_langgraph.graph import graph; "
                "fixture=r'/Users/beckliu/Documents/0agentproject2026/vibecodingworkflow/integrations/"
                "vibecoding-vscode-extension/fixtures/session8-smoke-project'; "
                "result=graph.invoke({'project_root': fixture, "
                "'runner_command_template': 'printf %s {next_session}\\\\|{next_prompt} > /tmp/vibe-langgraph-sync.txt'}); "
                "print(result['runner_result']['runner']); print(result['runner_result']['exit_code']); "
                "print(result['session_gate'])"
            ),
        )
        run_inline_python(
            "async invoke",
            "\n".join(
                [
                    "import asyncio",
                    "from vibecoding_langgraph.graph import graph",
                    "fixture=r'/Users/beckliu/Documents/0agentproject2026/vibecodingworkflow/integrations/vibecoding-vscode-extension/fixtures/session8-smoke-project'",
                    "async def main():",
                    "    result = await graph.ainvoke({",
                    "        'project_root': fixture,",
                    "        'runner_command_template': 'printf %s {next_session}\\\\|{next_prompt} > /tmp/vibe-langgraph-ainvoke.txt',",
                    "    })",
                    "    print(result['runner_result']['runner'])",
                    "    print(result['runner_result']['exit_code'])",
                    "    print(result['session_gate'])",
                    "asyncio.run(main())",
                ]
            ),
        )
        run_step(
            "unit tests",
            [str(PYTHON), "-m", "unittest", "discover", "-s", "tests", "-p", "test_*.py"],
        )
        run_step("e2e smoke", [str(PYTHON), str(E2E_SMOKE)])

        base_url, server_proc = ensure_server()
        try:
            run_step(
                "http smoke",
                [str(PYTHON), str(HTTP_SMOKE)],
                env=base_env({"LANGGRAPH_BASE_URL": base_url}),
            )
            run_step(
                "http hitl smoke",
                [str(PYTHON), str(HITL_HTTP_SMOKE)],
                env=base_env({"LANGGRAPH_BASE_URL": base_url}),
            )
        finally:
            if server_proc is not None:
                server_proc.terminate()
                try:
                    server_proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    server_proc.kill()
    finally:
        run_step("langgraph fixture reset (post suite)", [str(FIXTURE_RESET)])

    print("[PASS] LangGraph full suite completed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
