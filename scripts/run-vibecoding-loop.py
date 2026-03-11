#!/usr/bin/env python3
"""
Fresh-session orchestration prototype for vibe coding workflows.

This script does not implement vendor-specific chat automation. Instead, it acts
as an external session driver:

1. read memory.md
2. decide whether a next session may run
3. prepare the startup prompt input for a fresh session
4. optionally execute a caller-provided command template
5. log the loop state

The caller can connect this script to any chat runner, terminal launcher, or
future agent API without changing the workflow files.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shlex
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional


STATUS_KEYS = {
    "current_phase",
    "last_completed_session",
    "last_completed_session_tests",
    "next_session",
    "next_session_prompt",
    "session_gate",
}


@dataclass
class SessionStatus:
    current_phase: str
    last_completed_session: str
    last_completed_session_tests: str
    next_session: str
    next_session_prompt: str
    session_gate: str

    @property
    def is_done(self) -> bool:
        return self.next_session == "none" and self.session_gate == "done"

    @property
    def may_advance(self) -> bool:
        return self.session_gate == "ready" and self.next_session != "none"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Drive a vibe coding workflow by launching one fresh session at a time."
    )
    parser.add_argument("project_root", help="Workflow project root containing startup-prompt.md and memory.md")
    parser.add_argument(
        "--runner-cmd",
        help=(
            "Optional command template for starting a fresh session. "
            "Available placeholders: {project_root}, {startup_prompt}, {next_session}, {next_prompt}"
        ),
    )
    parser.add_argument(
        "--loop-log",
        help="Optional path for JSONL loop logs. Defaults to outputs/session-logs/vibecoding-loop.jsonl",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would be executed without running the runner command.",
    )
    parser.add_argument(
        "--print-startup",
        action="store_true",
        help="Print the startup prompt contents before returning.",
    )
    return parser.parse_args()


def parse_memory(memory_path: Path) -> SessionStatus:
    text = memory_path.read_text(encoding="utf-8")
    in_status = False
    values: Dict[str, str] = {}
    for raw in text.splitlines():
        line = raw.rstrip()
        if line.strip() == "## Session Status":
            in_status = True
            continue
        if in_status and line.startswith("## "):
            break
        if not in_status:
            continue
        match = re.match(r"^- ([a-z_]+):\s*(.*)$", line.strip())
        if not match:
            continue
        key, value = match.groups()
        if key in STATUS_KEYS:
            values[key] = value.strip().strip("`")

    missing = STATUS_KEYS - values.keys()
    if missing:
        missing_str = ", ".join(sorted(missing))
        raise SystemExit(f"memory.md missing required Session Status keys: {missing_str}")

    return SessionStatus(**values)


def ensure_files(project_root: Path) -> Dict[str, Path]:
    files = {
        "startup_prompt": project_root / "startup-prompt.md",
        "memory": project_root / "memory.md",
    }
    missing = [str(path) for path in files.values() if not path.exists()]
    if missing:
        raise SystemExit(f"Missing required workflow files: {', '.join(missing)}")
    return files


def default_loop_log(project_root: Path) -> Path:
    return project_root / "outputs" / "session-logs" / "vibecoding-loop.jsonl"


def log_event(log_path: Path, payload: Dict[str, object]) -> None:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with log_path.open("a", encoding="utf-8") as fh:
      fh.write(json.dumps(payload, ensure_ascii=False) + "\n")


def build_runner_command(
    template: str,
    project_root: Path,
    startup_prompt: Path,
    status: SessionStatus,
) -> str:
    return template.format(
        project_root=str(project_root),
        startup_prompt=str(startup_prompt),
        next_session=status.next_session,
        next_prompt=status.next_session_prompt,
    )


def run_command(command: str) -> int:
    proc = subprocess.run(command, shell=True)
    return proc.returncode


def main() -> int:
    args = parse_args()
    project_root = Path(args.project_root).expanduser().resolve()
    files = ensure_files(project_root)
    status = parse_memory(files["memory"])
    loop_log = Path(args.loop_log).expanduser().resolve() if args.loop_log else default_loop_log(project_root)

    event = {
        "project_root": str(project_root),
        "next_session": status.next_session,
        "next_session_prompt": status.next_session_prompt,
        "session_gate": status.session_gate,
        "last_completed_session": status.last_completed_session,
        "last_completed_session_tests": status.last_completed_session_tests,
        "action": "inspect",
    }

    if status.is_done:
        event["result"] = "done"
        log_event(loop_log, event)
        print("Workflow is complete. No new session should be started.")
        return 0

    if not status.may_advance:
        event["result"] = "blocked"
        log_event(loop_log, event)
        print("Workflow is not ready to advance.")
        print(f"session_gate={status.session_gate}")
        print(f"next_session={status.next_session}")
        return 2

    startup_text = files["startup_prompt"].read_text(encoding="utf-8")
    event["result"] = "ready"

    if args.print_startup:
        print(startup_text)

    if not args.runner_cmd:
        event["action"] = "prepared_only"
        log_event(loop_log, event)
        print("Fresh session should now be started with:")
        print(str(files["startup_prompt"]))
        print(f"next_session={status.next_session}")
        print(f"next_session_prompt={status.next_session_prompt}")
        return 0

    command = build_runner_command(args.runner_cmd, project_root, files["startup_prompt"], status)
    event["action"] = "runner_command"
    event["runner_command"] = command

    if args.dry_run:
        event["result"] = "dry_run"
        log_event(loop_log, event)
        print(command)
        return 0

    rc = run_command(command)
    event["runner_exit_code"] = rc
    event["result"] = "runner_finished" if rc == 0 else "runner_failed"
    log_event(loop_log, event)
    return rc


if __name__ == "__main__":
    sys.exit(main())
