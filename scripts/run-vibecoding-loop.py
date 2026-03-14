#!/usr/bin/env python3
"""
Fresh-session orchestration driver for vibe coding workflows.

This script does not implement vendor-specific chat automation. Instead, it acts
as an external session driver:

1. read memory.md and validate all field values against the design contract
2. decide whether a next session may run (session_gate must be "ready")
3. prepare the startup prompt input for a fresh session
4. optionally execute a caller-provided command template
5. re-check memory.md after the runner exits
6. log the loop state to JSONL

Workflow contract (from memory.md and progress-loop.md):
- session_gate valid values  : ready | blocked | in_progress | done
- last_completed_session_tests valid values: passed | failed | blocked
- must_read order per session: memory.md → task.md → design.md → work-plan.md → previous summary
- startup-prompt.md is the entry point, not a context file to read directly
- after runner exits, driver must re-check memory.md

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
from typing import Any, Dict, List, Optional


STATUS_KEYS = {
    "current_phase",
    "last_completed_session",
    "last_completed_session_tests",
    "next_session",
    "next_session_prompt",
    "session_gate",
}

# Enum values enforced by the workflow contract (memory.md "Session Update Rule")
VALID_SESSION_GATES = {"ready", "blocked", "in_progress", "done"}
VALID_TEST_RESULTS = {"passed", "failed", "blocked"}

SCHEMA_VERSION = "1.0"
EXIT_OK = 0
EXIT_BLOCKED = 2
EXIT_INVALID = 3
EXIT_RUNNER_FAILED = 4


class WorkflowError(Exception):
    def __init__(
        self,
        message: str,
        error_code: str,
        exit_code: int = EXIT_INVALID,
        details: Optional[Dict[str, Any]] = None,
    ):
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
    def is_in_progress(self) -> bool:
        """session_gate is 'in_progress' — another session may already be running."""
        return self.session_gate == "in_progress"

    @property
    def may_advance(self) -> bool:
        return self.session_gate == "ready" and self.next_session != "none"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Drive a vibe coding workflow by launching one fresh session at a time."
    )
    parser.add_argument(
        "project_root",
        help="Workflow project root containing startup-prompt.md and memory.md",
    )
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
        raise WorkflowError(
            message=f"memory.md missing required Session Status keys: {', '.join(sorted(missing))}",
            error_code="memory_missing_status_keys",
            details={"missing_keys": sorted(missing)},
        )

    # Validate session_gate against the design contract enum
    gate = values["session_gate"]
    if gate not in VALID_SESSION_GATES:
        raise WorkflowError(
            message=(
                f"Invalid session_gate value '{gate}'. "
                f"Allowed: {', '.join(sorted(VALID_SESSION_GATES))}"
            ),
            error_code="invalid_session_gate",
            details={"value": gate, "allowed": sorted(VALID_SESSION_GATES)},
        )

    # Validate last_completed_session_tests against the design contract enum
    test_result = values["last_completed_session_tests"]
    if test_result not in VALID_TEST_RESULTS:
        raise WorkflowError(
            message=(
                f"Invalid last_completed_session_tests value '{test_result}'. "
                f"Allowed: {', '.join(sorted(VALID_TEST_RESULTS))}"
            ),
            error_code="invalid_test_result",
            details={"value": test_result, "allowed": sorted(VALID_TEST_RESULTS)},
        )

    return SessionStatus(**values)


def ensure_files(project_root: Path) -> Dict[str, Path]:
    """
    Returns a dict of validated file paths.

    Required files (hard error if missing):
        startup_prompt, memory, task

    Optional context files (included if present, per memory.md "Next Session Entry" read order):
        design, work_plan
    """
    required: Dict[str, Path] = {
        "startup_prompt": project_root / "startup-prompt.md",
        "memory": project_root / "memory.md",
        "task": project_root / "task.md",
    }
    missing = [str(path) for path in required.values() if not path.exists()]
    if missing:
        details: Dict[str, Any] = {"missing_paths": missing}
        if str(required["task"]) in missing:
            migration_script = Path(__file__).resolve().parent / "migrate-vibecoding-project.sh"
            details["migration_required"] = True
            details["migration_command"] = (
                f"{shlex.quote(str(migration_script))} {shlex.quote(str(project_root))}"
            )
        raise WorkflowError(
            message=f"Missing required workflow files: {', '.join(missing)}",
            error_code="missing_required_files",
            details=details,
        )

    files: Dict[str, Path] = dict(required)

    # Optional context files (read order per memory.md "Next Session Entry")
    for key, filename in [("design", "design.md"), ("work_plan", "work-plan.md")]:
        candidate = project_root / filename
        if candidate.exists():
            files[key] = candidate

    return files


def default_loop_log(project_root: Path) -> Path:
    return project_root / "outputs" / "session-logs" / "vibecoding-loop.jsonl"


def resolve_previous_session_summary_path(
    project_root: Path, session_status: SessionStatus
) -> Optional[Path]:
    try:
        last = int(session_status.last_completed_session)
    except ValueError:
        return None
    if last <= 0:
        return None
    path = project_root / "artifacts" / f"session-{last}-summary.md"
    return path if path.exists() else None


def expected_session_summary_path(
    project_root: Path, session_status: SessionStatus
) -> Optional[Path]:
    if session_status.next_session == "none":
        return None
    return project_root / "artifacts" / f"session-{session_status.next_session}-summary.md"


def default_next_session_spec_path(
    project_root: Path, session_status: SessionStatus
) -> Optional[Path]:
    if session_status.next_session == "none":
        return None
    return (
        project_root
        / "outputs"
        / "session-specs"
        / f"session-{session_status.next_session}-spec.json"
    )


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
    post_run_status: Optional[SessionStatus] = None,
    startup_text: Optional[str] = None,
    runner_command: Optional[str] = None,
    runner_exit_code: Optional[int] = None,
    error: Optional[WorkflowError] = None,
) -> Dict[str, Any]:
    startup_prompt_path = (
        str(files["startup_prompt"]) if files else str(project_root / "startup-prompt.md")
    )
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
        "exit_code": error.exit_code
        if error
        else (
            EXIT_RUNNER_FAILED
            if status_name == "runner_failed"
            else EXIT_BLOCKED
            if status_name in ("blocked", "in_progress")
            else EXIT_OK
        ),
        "requested_action": args.action,
        "effective_action": effective_action,
        "project_root": str(project_root),
        "session_gate": session_status.session_gate if session_status else None,
        "next_session": session_status.next_session if session_status else None,
        "next_session_prompt": session_status.next_session_prompt if session_status else None,
        "last_completed_session": session_status.last_completed_session if session_status else None,
        "last_completed_session_tests": (
            session_status.last_completed_session_tests if session_status else None
        ),
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
            "last_completed_session": (
                session_status.last_completed_session if session_status else None
            ),
            "last_completed_session_tests": (
                session_status.last_completed_session_tests if session_status else None
            ),
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

    # Post-run memory state (re-checked after runner exits per progress-loop.md "Automation Shape")
    if post_run_status:
        result["post_run_memory"] = {
            "session_gate": post_run_status.session_gate,
            "next_session": post_run_status.next_session,
            "last_completed_session": post_run_status.last_completed_session,
            "last_completed_session_tests": post_run_status.last_completed_session_tests,
            "current_phase": post_run_status.current_phase,
            "may_advance": post_run_status.may_advance,
            "is_done": post_run_status.is_done,
        }

    if status_name == "ready":
        if effective_action == "prepare":
            result["next_action"] = {
                "type": "start_fresh_session",
                "message": (
                    "Start a fresh session with startup-prompt.md, task.md, and the next session prompt."
                ),
            }
        else:
            result["next_action"] = {
                "type": "open_startup_prompt",
                "message": (
                    "Start a fresh session and enter through startup-prompt.md "
                    "after reading task.md and any previous session summary."
                ),
            }
    elif status_name == "blocked":
        result["next_action"] = {
            "type": "review_memory",
            "message": "Open memory.md and resolve the blocked session state before continuing.",
        }
        result["risks"].append(
            "Session advancement is blocked by memory.md session_gate or next_session."
        )
    elif status_name == "in_progress":
        result["next_action"] = {
            "type": "wait_for_session",
            "message": (
                "A session is currently in progress. "
                "Wait for it to complete and update memory.md before running the driver again."
            ),
        }
        result["risks"].append(
            "session_gate is 'in_progress' — another session may be running. "
            "Do not launch a second session."
        )
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
            "message": (
                "Wait for the launched session to finish and update memory.md before continuing."
            ),
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
        result["risks"].append(
            "Driver contract could not be satisfied because required inputs are invalid."
        )

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
    payload: Dict[str, Any] = {
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
    if "post_run_memory" in result:
        payload["post_run_memory"] = result["post_run_memory"]
    return payload


def build_next_session_spec(
    project_root: Path,
    files: Dict[str, Path],
    session_status: SessionStatus,
    result: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Build the machine-readable spec for the next fresh session.

    must_read order follows memory.md "Next Session Entry":
        1. memory.md
        2. task.md
        3. design.md   (if present)
        4. work-plan.md (if present)
        5. previous session summary (if exists — handled by read_previous_summary_first flag)

    startup-prompt.md is the orchestration entry point that triggers all reads,
    not a context file to be listed in must_read.
    """
    must_read: List[str] = [str(files["memory"]), str(files["task"])]
    if "design" in files:
        must_read.append(str(files["design"]))
    if "work_plan" in files:
        must_read.append(str(files["work_plan"]))

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
            "design_path": str(files["design"]) if "design" in files else None,
            "work_plan_path": str(files["work_plan"]) if "work_plan" in files else None,
            "next_session_prompt_path": result["artifacts"]["next_session_prompt_path"],
            "previous_session_summary_path": result["artifacts"]["previous_session_summary_path"],
            "expected_session_summary_path": result["artifacts"]["expected_session_summary_path"],
        },
        "instructions": {
            "entry_point": str(files["startup_prompt"]),
            "must_read": must_read,
            "read_previous_summary_first": (
                result["artifacts"]["previous_session_summary_path"] is not None
            ),
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
    spec_path.write_text(
        json.dumps(spec_payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def emit_result(
    args: argparse.Namespace,
    result: Dict[str, Any],
    startup_text: Optional[str] = None,
    runner_command: Optional[str] = None,
) -> int:
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
    elif status_name == "in_progress":
        print("A session is currently in progress. Do not launch a second session.")
        print(f"session_gate={result['session_gate']}")
        print(f"next_session={result['next_session']}")
    elif status_name == "ready" and result["effective_action"] == "prepare":
        if startup_text and args.print_startup:
            print(startup_text)
        print("Fresh session should now be started with:")
        print(result["artifacts"]["startup_prompt_path"])
        print(f"task_path={result['artifacts']['task_path']}")
        if result["artifacts"]["previous_session_summary_path"]:
            print(
                f"previous_session_summary={result['artifacts']['previous_session_summary_path']}"
            )
        print(f"next_session={result['next_session']}")
        print(f"next_session_prompt={result['next_session_prompt']}")
        if result["artifacts"]["next_session_spec_path"]:
            print(f"next_session_spec={result['artifacts']['next_session_spec_path']}")
    elif status_name == "ready":
        print("Workflow is ready for a fresh session.")
        print(f"task_path={result['artifacts']['task_path']}")
        if result["artifacts"]["previous_session_summary_path"]:
            print(
                f"previous_session_summary={result['artifacts']['previous_session_summary_path']}"
            )
        print(f"next_session={result['next_session']}")
        print(f"next_session_prompt={result['next_session_prompt']}")
        if result["artifacts"]["next_session_spec_path"]:
            print(f"next_session_spec={result['artifacts']['next_session_spec_path']}")
    elif status_name == "dry_run":
        print(runner_command or "")
    elif status_name in ("runner_failed", "invalid"):
        print(result["message"])

    # Show post-run memory state after runner exits (per progress-loop.md "Automation Shape")
    if "post_run_memory" in result:
        post = result["post_run_memory"]
        print(
            f"\n[post-run memory] session_gate={post['session_gate']} "
            f"next_session={post['next_session']} "
            f"tests={post['last_completed_session_tests']}"
        )

    return int(result["exit_code"])


def main() -> int:
    args = parse_args()
    project_root = Path(args.project_root).expanduser().resolve()
    loop_log = (
        Path(args.loop_log).expanduser().resolve()
        if args.loop_log
        else default_loop_log(project_root)
    )
    effective_action = resolve_effective_action(args)

    try:
        if effective_action == "run" and not args.runner_cmd:
            raise WorkflowError(
                message="runner_cmd is required when action=run.",
                error_code="missing_runner_command",
            )

        files = ensure_files(project_root)
        status = parse_memory(files["memory"])

        # ── Gate: workflow complete ──────────────────────────────────────────
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

        # ── Gate: session currently in progress (separate from blocked) ──────
        if status.is_in_progress and effective_action != "run":
            result = build_result(
                args=args,
                project_root=project_root,
                files=files,
                loop_log=loop_log,
                effective_action=effective_action,
                status_name="in_progress",
                message=(
                    "A session is currently in progress. "
                    "Do not launch a second session."
                ),
                session_status=status,
            )
            log_event(loop_log, build_log_payload(result))
            return emit_result(args, result)

        # ── Gate: blocked or tests failed ────────────────────────────────────
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

        # ── Action: inspect ──────────────────────────────────────────────────
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

        # ── Action: prepare ──────────────────────────────────────────────────
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

        # ── Action: run ──────────────────────────────────────────────────────
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

        # Re-check memory.md after runner exits (per progress-loop.md "Automation Shape")
        try:
            post_run_status: Optional[SessionStatus] = parse_memory(files["memory"])
        except WorkflowError:
            post_run_status = None

        result = build_result(
            args=args,
            project_root=project_root,
            files=files,
            loop_log=loop_log,
            effective_action=effective_action,
            status_name="runner_finished" if rc == 0 else "runner_failed",
            message=(
                "Runner command completed successfully." if rc == 0 else "Runner command failed."
            ),
            session_status=status,
            post_run_status=post_run_status,
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
