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
import re
import shlex
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Optional


STATUS_KEYS = {
    "current_phase",
    "last_completed_session",
    "last_completed_session_tests",
    "next_session",
    "next_session_prompt",
    "session_gate",
}

SCHEMA_VERSION = "1.0"
EXIT_OK = 0
EXIT_BLOCKED = 2
EXIT_INVALID = 3
EXIT_RUNNER_FAILED = 4


class WorkflowError(Exception):
    def __init__(self, message: str, error_code: str, exit_code: int = EXIT_INVALID, details: Optional[Dict[str, Any]] = None):
        super().__init__(message)
        self.message = message
        self.error_code = error_code
        self.exit_code = exit_code
        self.details = details or {}


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
            "Available placeholders: {project_root}, {startup_prompt}, {task_path}, "
            "{previous_summary}, {next_session}, {next_prompt}, {next_session_spec}"
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
    parser.add_argument(
        "--json",
        action="store_true",
        help="Emit a single JSON result object to stdout for machine consumption.",
    )
    parser.add_argument(
        "--action",
        choices=["auto", "inspect", "prepare", "run"],
        default="auto",
        help=(
            "Driver mode. "
            "'inspect' only checks status, 'prepare' prepares a fresh session without execution, "
            "'run' executes the runner command, and 'auto' preserves the legacy behavior."
        ),
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
        raise WorkflowError(
            message=f"memory.md missing required Session Status keys: {missing_str}",
            error_code="memory_missing_status_keys",
            details={"missing_keys": sorted(missing)},
        )

    return SessionStatus(**values)


def ensure_files(project_root: Path) -> Dict[str, Path]:
    files = {
        "startup_prompt": project_root / "startup-prompt.md",
        "memory": project_root / "memory.md",
        "task": project_root / "task.md",
    }
    missing = [str(path) for path in files.values() if not path.exists()]
    if missing:
        details: Dict[str, Any] = {"missing_paths": missing}
        if str(files["task"]) in missing:
            migration_script = Path(__file__).resolve().parent / "migrate-vibecoding-project.sh"
            details["migration_required"] = True
            details["migration_command"] = f"{shlex.quote(str(migration_script))} {shlex.quote(str(project_root))}"
        raise WorkflowError(
            message=f"Missing required workflow files: {', '.join(missing)}",
            error_code="missing_required_files",
            details=details,
        )
    return files


def default_loop_log(project_root: Path) -> Path:
    return project_root / "outputs" / "session-logs" / "vibecoding-loop.jsonl"


def resolve_previous_session_summary_path(project_root: Path, session_status: SessionStatus) -> Optional[Path]:
    try:
        last_completed_session = int(session_status.last_completed_session)
    except ValueError:
        return None

    if last_completed_session <= 0:
        return None

    summary_path = project_root / "artifacts" / f"session-{last_completed_session}-summary.md"
    return summary_path if summary_path.exists() else None


def expected_session_summary_path(project_root: Path, session_status: SessionStatus) -> Optional[Path]:
    if session_status.next_session == "none":
        return None
    return project_root / "artifacts" / f"session-{session_status.next_session}-summary.md"


def default_next_session_spec_path(project_root: Path, session_status: SessionStatus) -> Optional[Path]:
    if session_status.next_session == "none":
        return None
    return project_root / "outputs" / "session-specs" / f"session-{session_status.next_session}-spec.json"


def parse_task_title(task_path: Path) -> Optional[str]:
    text = task_path.read_text(encoding="utf-8")
    in_title = False
    for raw in text.splitlines():
        line = raw.rstrip()
        if line.strip() == "## Title":
            in_title = True
            continue
        if in_title and line.startswith("## "):
            break
        if not in_title:
            continue
        stripped = line.strip()
        if stripped:
            return stripped.lstrip("-").strip()
    return None


def log_event(log_path: Path, payload: Dict[str, object]) -> None:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with log_path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(payload, ensure_ascii=False) + "\n")


def build_runner_command(
    template: str,
    project_root: Path,
    files: Dict[str, Path],
    status: SessionStatus,
) -> str:
    previous_summary_path = resolve_previous_session_summary_path(project_root, status)
    next_session_spec_path = default_next_session_spec_path(project_root, status)
    return template.format(
        project_root=str(project_root),
        startup_prompt=str(files["startup_prompt"]),
        task_path=str(files["task"]),
        previous_summary=str(previous_summary_path) if previous_summary_path else "",
        next_session=status.next_session,
        next_prompt=status.next_session_prompt,
        next_session_spec=str(next_session_spec_path) if next_session_spec_path else "",
    )


def run_command(command: str) -> int:
    proc = subprocess.run(command, shell=True)
    return proc.returncode


def resolve_effective_action(args: argparse.Namespace) -> str:
    if args.action != "auto":
        return args.action
    return "run" if args.runner_cmd else "prepare"


def build_result(
    *,
    args: argparse.Namespace,
    project_root: Path,
    files: Optional[Dict[str, Path]],
    loop_log: Path,
    effective_action: str,
    status_name: str,
    message: str,
    session_status: Optional[SessionStatus] = None,
    startup_text: Optional[str] = None,
    runner_command: Optional[str] = None,
    runner_exit_code: Optional[int] = None,
    error: Optional[WorkflowError] = None,
) -> Dict[str, Any]:
    startup_prompt_path = str(files["startup_prompt"]) if files else str(project_root / "startup-prompt.md")
    memory_path = str(files["memory"]) if files else str(project_root / "memory.md")
    task_path = str(files["task"]) if files else str(project_root / "task.md")
    next_prompt_path = None
    previous_summary_path = None
    next_session_spec_path = None
    expected_summary_path = None
    task_title = None
    if session_status:
        next_prompt_path = str(project_root / session_status.next_session_prompt)
        previous_summary = resolve_previous_session_summary_path(project_root, session_status)
        next_session_spec = default_next_session_spec_path(project_root, session_status)
        expected_summary = expected_session_summary_path(project_root, session_status)
        previous_summary_path = str(previous_summary) if previous_summary else None
        next_session_spec_path = str(next_session_spec) if next_session_spec else None
        expected_summary_path = str(expected_summary) if expected_summary else None
    if files and files["task"].exists():
        task_title = parse_task_title(files["task"])

    result: Dict[str, Any] = {
        "schema_version": SCHEMA_VERSION,
        "task": {
            "path": task_path,
            "title": task_title,
        },
        "status": status_name,
        "message": message,
        "exit_code": error.exit_code if error else (
            EXIT_RUNNER_FAILED if status_name == "runner_failed" else
            EXIT_BLOCKED if status_name == "blocked" else
            EXIT_OK
        ),
        "requested_action": args.action,
        "effective_action": effective_action,
        "project_root": str(project_root),
        "session_gate": session_status.session_gate if session_status else None,
        "next_session": session_status.next_session if session_status else None,
        "next_session_prompt": session_status.next_session_prompt if session_status else None,
        "last_completed_session": session_status.last_completed_session if session_status else None,
        "last_completed_session_tests": session_status.last_completed_session_tests if session_status else None,
        "inputs": {
            "project_root": str(project_root),
            "requested_action": args.action,
            "effective_action": effective_action,
            "runner_cmd_provided": bool(args.runner_cmd),
            "dry_run": args.dry_run,
            "print_startup": args.print_startup,
            "json": args.json,
        },
        "artifacts": {
            "task_path": task_path,
            "startup_prompt_path": startup_prompt_path,
            "memory_path": memory_path,
            "loop_log_path": str(loop_log),
            "next_session_prompt_path": next_prompt_path,
            "previous_session_summary_path": previous_summary_path,
            "next_session_spec_path": next_session_spec_path,
            "expected_session_summary_path": expected_summary_path,
            "runner_command": runner_command,
            "startup_prompt_contents": startup_text if args.print_startup else None,
        },
        "checks": {
            "current_phase": session_status.current_phase if session_status else None,
            "session_gate": session_status.session_gate if session_status else None,
            "next_session": session_status.next_session if session_status else None,
            "next_session_prompt": session_status.next_session_prompt if session_status else None,
            "last_completed_session": session_status.last_completed_session if session_status else None,
            "last_completed_session_tests": session_status.last_completed_session_tests if session_status else None,
            "has_previous_session_summary": previous_summary_path is not None,
            "may_advance": session_status.may_advance if session_status else None,
            "is_done": session_status.is_done if session_status else None,
        },
        "risks": [],
        "next_action": {
            "type": "none",
            "message": message,
        },
        "error": None,
    }

    if status_name == "ready":
        if effective_action == "prepare":
            result["next_action"] = {
                "type": "start_fresh_session",
                "message": "Start a fresh session with startup-prompt.md, task.md, and the next session prompt.",
            }
        else:
            result["next_action"] = {
                "type": "open_startup_prompt",
                "message": "Start a fresh session and enter through startup-prompt.md after reading task.md and any previous session summary.",
            }
    elif status_name == "blocked":
        result["next_action"] = {
            "type": "review_memory",
            "message": "Open memory.md and resolve the blocked session state before continuing.",
        }
        result["risks"].append("Session advancement is blocked by memory.md session_gate or next_session.")
    elif status_name == "done":
        result["next_action"] = {
            "type": "workflow_complete",
            "message": "Workflow is complete. No new session should be started.",
        }
    elif status_name == "dry_run":
        result["next_action"] = {
            "type": "review_runner_command",
            "message": "Review the rendered runner command before executing a fresh session.",
        }
    elif status_name == "runner_finished":
        result["next_action"] = {
            "type": "wait_for_session_completion",
            "message": "Wait for the launched session to finish and update memory.md before continuing.",
        }
    elif status_name == "runner_failed":
        result["next_action"] = {
            "type": "inspect_runner_failure",
            "message": "Review the runner command failure and retry after fixing the external runner.",
        }
        result["risks"].append("The external runner exited with a non-zero code.")
    elif status_name == "invalid":
        result["next_action"] = {
            "type": "fix_driver_input",
            "message": "Fix the workflow files or driver arguments before retrying.",
        }
        result["risks"].append("Driver contract could not be satisfied because required inputs are invalid.")

    if error:
        result["error"] = {
            "code": error.error_code,
            "message": error.message,
            "details": error.details,
        }

    if runner_exit_code is not None:
        result["runner_exit_code"] = runner_exit_code

    return result


def build_log_payload(result: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "schema_version": result["schema_version"],
        "project_root": result["project_root"],
        "task": result["task"],
        "requested_action": result["requested_action"],
        "effective_action": result["effective_action"],
        "status": result["status"],
        "message": result["message"],
        "session_gate": result["session_gate"],
        "next_session": result["next_session"],
        "next_session_prompt": result["next_session_prompt"],
        "last_completed_session": result["last_completed_session"],
        "last_completed_session_tests": result["last_completed_session_tests"],
        "runner_exit_code": result.get("runner_exit_code"),
        "error": result["error"],
    }


def build_next_session_spec(
    project_root: Path,
    files: Dict[str, Path],
    session_status: SessionStatus,
    result: Dict[str, Any],
) -> Dict[str, Any]:
    return {
        "schema_version": SCHEMA_VERSION,
        "project_root": str(project_root),
        "task": result["task"],
        "session_status": {
            "current_phase": session_status.current_phase,
            "last_completed_session": session_status.last_completed_session,
            "last_completed_session_tests": session_status.last_completed_session_tests,
            "next_session": session_status.next_session,
            "next_session_prompt": session_status.next_session_prompt,
            "session_gate": session_status.session_gate,
        },
        "paths": {
            "task_path": str(files["task"]),
            "startup_prompt_path": str(files["startup_prompt"]),
            "memory_path": str(files["memory"]),
            "next_session_prompt_path": result["artifacts"]["next_session_prompt_path"],
            "previous_session_summary_path": result["artifacts"]["previous_session_summary_path"],
            "expected_session_summary_path": result["artifacts"]["expected_session_summary_path"],
        },
        "instructions": {
            "must_read": [
                str(files["task"]),
                str(files["startup_prompt"]),
                str(files["memory"]),
            ],
            "read_previous_summary_first": result["artifacts"]["previous_session_summary_path"] is not None,
            "write_summary_before_memory_update": True,
        },
    }


def persist_next_session_spec(
    project_root: Path,
    files: Dict[str, Path],
    session_status: Optional[SessionStatus],
    result: Dict[str, Any],
) -> None:
    if not session_status:
        return
    spec_path = default_next_session_spec_path(project_root, session_status)
    if spec_path is None:
        return
    spec_payload = build_next_session_spec(project_root, files, session_status, result)
    spec_path.parent.mkdir(parents=True, exist_ok=True)
    spec_path.write_text(json.dumps(spec_payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def emit_result(args: argparse.Namespace, result: Dict[str, Any], startup_text: Optional[str] = None, runner_command: Optional[str] = None) -> int:
    if args.json:
        print(json.dumps(result, ensure_ascii=False))
        return int(result["exit_code"])

    status_name = result["status"]
    if status_name == "done":
        print("Workflow is complete. No new session should be started.")
    elif status_name == "blocked":
        print("Workflow is not ready to advance.")
        print(f"session_gate={result['session_gate']}")
        print(f"next_session={result['next_session']}")
    elif status_name == "ready" and result["effective_action"] == "prepare":
        if startup_text and args.print_startup:
            print(startup_text)
        print("Fresh session should now be started with:")
        print(result["artifacts"]["startup_prompt_path"])
        print(f"task_path={result['artifacts']['task_path']}")
        if result["artifacts"]["previous_session_summary_path"]:
            print(f"previous_session_summary={result['artifacts']['previous_session_summary_path']}")
        print(f"next_session={result['next_session']}")
        print(f"next_session_prompt={result['next_session_prompt']}")
        if result["artifacts"]["next_session_spec_path"]:
            print(f"next_session_spec={result['artifacts']['next_session_spec_path']}")
    elif status_name == "ready":
        print("Workflow is ready for a fresh session.")
        print(f"task_path={result['artifacts']['task_path']}")
        if result["artifacts"]["previous_session_summary_path"]:
            print(f"previous_session_summary={result['artifacts']['previous_session_summary_path']}")
        print(f"next_session={result['next_session']}")
        print(f"next_session_prompt={result['next_session_prompt']}")
        if result["artifacts"]["next_session_spec_path"]:
            print(f"next_session_spec={result['artifacts']['next_session_spec_path']}")
    elif status_name == "dry_run":
        print(runner_command or "")
    elif status_name == "runner_failed":
        print(result["message"])
    elif status_name == "invalid":
        print(result["message"])

    return int(result["exit_code"])


def main() -> int:
    args = parse_args()
    project_root = Path(args.project_root).expanduser().resolve()
    loop_log = Path(args.loop_log).expanduser().resolve() if args.loop_log else default_loop_log(project_root)
    effective_action = resolve_effective_action(args)

    try:
        if effective_action == "run" and not args.runner_cmd:
            raise WorkflowError(
                message="runner_cmd is required when action=run.",
                error_code="missing_runner_command",
            )

        files = ensure_files(project_root)
        status = parse_memory(files["memory"])

        if status.is_done and effective_action != "run":
            result = build_result(
                args=args,
                project_root=project_root,
                files=files,
                loop_log=loop_log,
                effective_action=effective_action,
                status_name="done",
                message="Workflow is complete. No new session should be started.",
                session_status=status,
            )
            persist_next_session_spec(project_root, files, status, result)
            log_event(loop_log, build_log_payload(result))
            return emit_result(args, result)

        if not status.may_advance and effective_action != "run":
            result = build_result(
                args=args,
                project_root=project_root,
                files=files,
                loop_log=loop_log,
                effective_action=effective_action,
                status_name="blocked",
                message="Workflow is not ready to advance.",
                session_status=status,
            )
            persist_next_session_spec(project_root, files, status, result)
            log_event(loop_log, build_log_payload(result))
            return emit_result(args, result)

        startup_text = files["startup_prompt"].read_text(encoding="utf-8")

        if effective_action == "inspect":
            result = build_result(
                args=args,
                project_root=project_root,
                files=files,
                loop_log=loop_log,
                effective_action=effective_action,
                status_name="ready",
                message="Workflow is ready for a fresh session.",
                session_status=status,
                startup_text=startup_text,
            )
            persist_next_session_spec(project_root, files, status, result)
            log_event(loop_log, build_log_payload(result))
            return emit_result(args, result, startup_text=startup_text)

        if effective_action == "prepare":
            result = build_result(
                args=args,
                project_root=project_root,
                files=files,
                loop_log=loop_log,
                effective_action=effective_action,
                status_name="ready",
                message="Fresh session handoff is prepared.",
                session_status=status,
                startup_text=startup_text,
            )
            persist_next_session_spec(project_root, files, status, result)
            log_event(loop_log, build_log_payload(result))
            return emit_result(args, result, startup_text=startup_text)

        command = build_runner_command(args.runner_cmd, project_root, files, status)

        if args.dry_run:
            result = build_result(
                args=args,
                project_root=project_root,
                files=files,
                loop_log=loop_log,
                effective_action=effective_action,
                status_name="dry_run",
                message="Runner command rendered without execution.",
                session_status=status,
                startup_text=startup_text,
                runner_command=command,
            )
            persist_next_session_spec(project_root, files, status, result)
            log_event(loop_log, build_log_payload(result))
            return emit_result(args, result, startup_text=startup_text, runner_command=command)

        rc = run_command(command)
        result = build_result(
            args=args,
            project_root=project_root,
            files=files,
            loop_log=loop_log,
            effective_action=effective_action,
            status_name="runner_finished" if rc == 0 else "runner_failed",
            message="Runner command completed successfully." if rc == 0 else "Runner command failed.",
            session_status=status,
            startup_text=startup_text,
            runner_command=command,
            runner_exit_code=rc,
        )
        persist_next_session_spec(project_root, files, status, result)
        log_event(loop_log, build_log_payload(result))
        return rc if not args.json else emit_result(args, result)
    except WorkflowError as err:
        result = build_result(
            args=args,
            project_root=project_root,
            files=None,
            loop_log=loop_log,
            effective_action=effective_action,
            status_name="invalid",
            message=err.message,
            error=err,
        )
        log_event(loop_log, build_log_payload(result))
        return emit_result(args, result)


if __name__ == "__main__":
    sys.exit(main())
