"""
VibeCoding Workflow LangGraph execution graph.

8-node orchestration runtime replacing run-vibecoding-loop.py.
Each session is executed as a subprocess (fresh context) per the fresh-context principle.
LangGraph manages state, checkpoints, HITL interrupts, and cross-day resumption.
memory.md remains the single business truth source.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import shlex
import signal
import subprocess
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from langchain_core.runnables import RunnableConfig
from langgraph.graph import StateGraph, END
from langgraph.types import interrupt
from typing_extensions import TypedDict


# ---------------------------------------------------------------------------
# Constants (from run-vibecoding-loop.py contract)
# ---------------------------------------------------------------------------

STATUS_KEYS = {
    "current_phase",
    "last_completed_session",
    "last_completed_session_tests",
    "next_session",
    "next_session_prompt",
    "session_gate",
}

VALID_PHASES = {"design", "development", "done"}
VALID_SESSION_GATES = {"ready", "blocked", "in_progress", "done"}
VALID_TEST_RESULTS = {"n/a", "passed", "failed", "blocked"}
VALID_RUNNER_PREFERENCES = {"auto", "claude", "codex"}

SCHEMA_VERSION = "1.0"
DEFAULT_RUNNER_TIMEOUT_SECONDS = 900
CLAUDE_DEFAULT_MODEL = "opusplan"
CODEX_DISABLE_DEFAULT_MCP = "mcp_servers.chrome-devtools.enabled=false"


# ---------------------------------------------------------------------------
# WorkflowRuntimeState — TypedDict per langgraph-runtime-contract.md
# ---------------------------------------------------------------------------

class WorkflowRunInput(TypedDict, total=False):
    """User-provided run input surfaced in Studio / HTTP run requests."""

    project_root: str
    runner_command_template: Optional[str]
    runner_command_env: Optional[Dict[str, str]]
    preferred_runner: Optional[str]
    approval_required: bool


class WorkflowRuntimeState(TypedDict, total=False):
    # Input: provided by caller when triggering a run
    project_root: str
    runner_command_template: Optional[str]
    runner_command_env: Optional[Dict[str, str]]
    preferred_runner: Optional[str]

    # Loaded from memory.md / task.md
    task_title: Optional[str]
    current_phase: str
    next_session: str
    next_session_prompt: str
    last_completed_session: str
    last_completed_session_tests: str
    session_gate: str

    # Resolved file paths
    previous_summary_path: Optional[str]
    expected_summary_path: Optional[str]

    # Runner assembly
    runner_payload: Optional[Dict[str, Any]]

    # Runner execution result
    runner_result: Optional[Dict[str, Any]]

    # HITL
    approval_required: bool
    approval_decision: Optional[str]
    rejection_reason: Optional[str]
    review_notes: Optional[str]

    # Internal: load error message (if memory.md parse failed)
    load_error: Optional[str]

    # Internal: run_id for idempotency (sha1 of project_root + next_session + timestamp)
    run_id: Optional[str]


# ---------------------------------------------------------------------------
# Helpers (adapted from run-vibecoding-loop.py)
# ---------------------------------------------------------------------------

def _parse_memory(memory_path: Path) -> Dict[str, str]:
    """Parse the ## Session Status block from memory.md."""
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
    return values


def _parse_task_title(task_path: Path) -> Optional[str]:
    """Extract title from ## Title section of task.md."""
    if not task_path.exists():
        return None
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


def _resolve_previous_summary(project_root: Path, last_completed: str) -> Optional[str]:
    try:
        last = int(last_completed)
    except ValueError:
        return None
    if last <= 0:
        return None
    path = project_root / "artifacts" / f"session-{last}-summary.md"
    return str(path) if path.exists() else None


def _expected_summary_path(project_root: Path, next_session: str) -> Optional[str]:
    if next_session == "none":
        return None
    return str(project_root / "artifacts" / f"session-{next_session}-summary.md")


def _default_loop_log(project_root: Path) -> Path:
    return project_root / "outputs" / "session-logs" / "vibecoding-loop.jsonl"


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _log_event(log_path: Path, payload: Dict[str, Any]) -> None:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with log_path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(payload, ensure_ascii=False) + "\n")


def _make_run_id(project_root: str, next_session: str) -> str:
    raw = f"{project_root}:{next_session}:{int(time.time())}"
    return hashlib.sha1(raw.encode()).hexdigest()[:16]


def _resolve_task_identifier(project_root: Path) -> str:
    return _parse_task_title(project_root / "task.md") or project_root.name


def _build_thread_id(project_root: Path, task_identifier: str) -> str:
    digest = hashlib.sha1(f"{project_root}:{task_identifier}".encode()).digest()
    bytes_ = bytearray(digest[:16])
    bytes_[6] = (bytes_[6] & 0x0F) | 0x50
    bytes_[8] = (bytes_[8] & 0x3F) | 0x80
    return str(uuid.UUID(bytes=bytes(bytes_)))


def _coerce_optional_string(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _coerce_optional_int(value: Any) -> Optional[int]:
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _resolve_runtime_locator(project_root: Path, config: Optional[RunnableConfig]) -> Dict[str, Optional[str]]:
    task_identifier = _resolve_task_identifier(project_root)
    default_thread_id = _build_thread_id(project_root, task_identifier)

    configurable: Dict[str, Any] = {}
    if isinstance(config, dict):
        raw_configurable = config.get("configurable")
        if isinstance(raw_configurable, dict):
            configurable = raw_configurable

    return {
        "thread_id": _coerce_optional_string(configurable.get("thread_id")) or default_thread_id,
        "checkpoint_id": _coerce_optional_string(configurable.get("checkpoint_id")),
        "checkpoint_ns": _coerce_optional_string(configurable.get("checkpoint_ns")),
        "parent_checkpoint_id": _coerce_optional_string(configurable.get("parent_checkpoint_id")),
    }


def _write_memory_field(memory_path: Path, updates: Dict[str, str]) -> None:
    """
    Idempotently update fields inside the ## Session Status block of memory.md.
    Writes each key atomically using line-by-line replacement.
    """
    text = memory_path.read_text(encoding="utf-8")
    lines = text.splitlines(keepends=True)
    in_status = False
    updated_keys: set = set()

    new_lines: List[str] = []
    for line in lines:
        stripped = line.rstrip()
        if stripped.strip() == "## Session Status":
            in_status = True
            new_lines.append(line)
            continue
        if in_status and stripped.startswith("## "):
            in_status = False
        if in_status:
            match = re.match(r"^(- )([a-z_]+)(:\s*)(.*)$", stripped)
            if match:
                prefix, key, sep, _ = match.groups()
                if key in updates:
                    new_lines.append(f"{prefix}{key}{sep}{updates[key]}\n")
                    updated_keys.add(key)
                    continue
        new_lines.append(line)

    memory_path.write_text("".join(new_lines), encoding="utf-8")


def _upsert_memory_field(memory_path: Path, key: str, value: str, *, after_key: str = "session_gate") -> None:
    """Insert or replace a field inside the ## Session Status block."""
    text = memory_path.read_text(encoding="utf-8")
    lines = text.splitlines(keepends=True)
    in_status = False
    inserted = False
    found = False
    new_lines: List[str] = []

    for line in lines:
        stripped = line.rstrip()
        if stripped.strip() == "## Session Status":
            in_status = True
            new_lines.append(line)
            continue
        if in_status and stripped.startswith("## "):
            if not found and not inserted:
                new_lines.append(f"- {key}: {value}\n")
                inserted = True
            in_status = False
        if in_status:
            match = re.match(r"^(- )([a-z_]+)(:\s*)(.*)$", stripped)
            if match:
                prefix, existing_key, sep, _ = match.groups()
                if existing_key == key:
                    new_lines.append(f"{prefix}{existing_key}{sep}{value}\n")
                    found = True
                    continue
                new_lines.append(line)
                if existing_key == after_key and not found and not inserted:
                    new_lines.append(f"- {key}: {value}\n")
                    inserted = True
                continue
        new_lines.append(line)

    memory_path.write_text("".join(new_lines), encoding="utf-8")


def _remove_memory_field(memory_path: Path, key: str) -> None:
    """Remove a field from the ## Session Status block if it exists."""
    text = memory_path.read_text(encoding="utf-8")
    lines = text.splitlines(keepends=True)
    in_status = False
    new_lines: List[str] = []

    for line in lines:
        stripped = line.rstrip()
        if stripped.strip() == "## Session Status":
            in_status = True
            new_lines.append(line)
            continue
        if in_status and stripped.startswith("## "):
            in_status = False
        if in_status:
            match = re.match(r"^(- )([a-z_]+)(:\s*)(.*)$", stripped)
            if match and match.group(2) == key:
                continue
        new_lines.append(line)

    memory_path.write_text("".join(new_lines), encoding="utf-8")


def _format_runner_command(template: str, values: Dict[str, Optional[str]]) -> str:
    """
    Expand a shell command template with workflow-specific placeholders.
    Values are shell-quoted so templates can safely embed file paths.
    """
    safe_values = {
        key: shlex.quote("" if value is None else str(value))
        for key, value in values.items()
    }
    return template.format_map(safe_values)


def _parse_session_prompt_memory_updates(session_prompt_path: Optional[str]) -> Dict[str, str]:
    """Extract the `memory 更新` block from a session prompt."""
    if not session_prompt_path:
        return {}

    path = Path(session_prompt_path)
    if not path.exists():
        return {}

    text = path.read_text(encoding="utf-8")
    in_block = False
    updates: Dict[str, str] = {}

    for raw in text.splitlines():
        line = raw.strip()
        if not in_block:
            if line.lower().startswith("memory update") or line.startswith("memory 更新"):
                in_block = True
            continue

        if not line:
            continue
        if re.match(r"^[A-Za-z\u4e00-\u9fff].*：$", line):
            break

        match = re.match(r"^- `?([a-z_]+):\s*([^`]+)`?$", line)
        if not match:
            continue
        key, value = match.groups()
        updates[key] = value.strip()

    return updates


def _runner_has_reviewable_candidate(runner_result: Dict[str, Any]) -> bool:
    return bool(runner_result.get("summary_exists")) and not runner_result.get("skipped", False)


def _runner_failure_requires_block(state: WorkflowRuntimeState) -> bool:
    runner_result = state.get("runner_result") or {}
    exit_code = runner_result.get("exit_code", -1)
    skipped = runner_result.get("skipped", False)
    if skipped or exit_code in (0, -1):
        return False

    if not _runner_has_reviewable_candidate(runner_result):
        return True

    if not state.get("approval_required", True):
        return False

    return state.get("approval_decision") in (None, "reject")


def _tail_text(value: Optional[str], limit: int = 2000) -> str:
    if not value:
        return ""
    return value[-limit:]


def _normalize_runner_preference(value: Optional[str]) -> str:
    if value is None:
        return "auto"
    normalized = str(value).strip().lower()
    return normalized or "auto"


def _select_runner_bin(preference: Optional[str]) -> tuple[Optional[str], Optional[str]]:
    import shutil

    normalized = _normalize_runner_preference(preference)
    if normalized not in VALID_RUNNER_PREFERENCES:
        return None, f"Invalid preferred runner: {normalized!r}. Expected one of auto/claude/codex."

    if normalized != "auto":
        if shutil.which(normalized):
            return normalized, None
        return None, f"Preferred runner {normalized!r} not found in PATH."

    if shutil.which("codex"):
        return "codex", None
    if shutil.which("claude"):
        return "claude", None
    return None, "No runner CLI (codex/claude) found in PATH. Dry-run mode."


def _build_runner_prompt(
    project_root: str,
    startup_prompt_path: Optional[str],
    session_prompt_path: Optional[str],
    next_session_num: str,
    previous_summary_path: Optional[str] = None,
    last_completed_session: Optional[str] = None,
) -> str:
    """Build a consistent prompt for Claude/Codex session execution."""
    def render_prompt(path: Optional[str], fallback: str) -> str:
        if path and Path(path).exists():
            text = Path(path).read_text(encoding="utf-8")
        else:
            text = fallback
        return text.replace("__PROJECT_ROOT__", project_root)

    if startup_prompt_path and Path(startup_prompt_path).exists():
        startup_content = render_prompt(
            startup_prompt_path,
            "Read memory.md and execute next session per workflow contract.",
        )
    else:
        startup_content = "Read memory.md and execute next session per workflow contract."

    # Inject previous session summary if available
    previous_context = ""
    if previous_summary_path and Path(previous_summary_path).exists():
        try:
            summary_content = Path(previous_summary_path).read_text(encoding="utf-8")
            previous_context = f"\n\n---\n## 上一个 Session 的总结\n"
            if last_completed_session:
                previous_context += f"Session {last_completed_session} 已完成，以下是总结内容：\n\n"
            previous_context += f"{summary_content}\n"
        except Exception:
            pass  # Silently skip if read fails

    session_instruction = (
        f"\n\n---\n## 本次执行目标\n"
        f"- 当前 project_root: {project_root}\n"
        f"- 当前 next_session: {next_session_num}\n"
    )
    if session_prompt_path and Path(session_prompt_path).exists():
        session_instruction += (
            f"- 请读取并执行: {session_prompt_path}\n\n"
            "## 当前 Session Prompt\n"
            f"{render_prompt(session_prompt_path, '')}\n"
        )

    return startup_content + previous_context + session_instruction


def _resolve_runner_timeout_seconds() -> int:
    raw_value = os.getenv("VIBECODING_LANGGRAPH_RUNNER_TIMEOUT_SECONDS", "").strip()
    if not raw_value:
        return DEFAULT_RUNNER_TIMEOUT_SECONDS
    try:
        value = int(raw_value)
    except ValueError:
        return DEFAULT_RUNNER_TIMEOUT_SECONDS
    return value if value > 0 else DEFAULT_RUNNER_TIMEOUT_SECONDS


def _terminate_process_group(proc: subprocess.Popen[str]) -> None:
    try:
        os.killpg(proc.pid, signal.SIGTERM)
    except ProcessLookupError:
        return

    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(proc.pid, signal.SIGKILL)
        except ProcessLookupError:
            return
        proc.wait(timeout=5)


def _run_runner_subprocess(
    cmd: List[str],
    *,
    cwd: Path,
    env: Optional[Dict[str, str]] = None,
    input_text: Optional[str] = None,
    timeout_seconds: int,
) -> Dict[str, Any]:
    proc = subprocess.Popen(
        cmd,
        stdin=subprocess.PIPE if input_text is not None else None,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        cwd=str(cwd),
        env=env,
        start_new_session=True,
    )
    try:
        stdout, stderr = proc.communicate(input=input_text, timeout=timeout_seconds)
    except subprocess.TimeoutExpired as exc:
        _terminate_process_group(proc)
        stdout, stderr = proc.communicate()
        return {
            "exit_code": 124,
            "stdout": _tail_text(exc.stdout if isinstance(exc.stdout, str) else stdout),
            "stderr": _tail_text(exc.stderr if isinstance(exc.stderr, str) else stderr),
            "timed_out": True,
            "timeout_seconds": timeout_seconds,
        }

    return {
        "exit_code": proc.returncode,
        "stdout": _tail_text(stdout),
        "stderr": _tail_text(stderr),
        "timed_out": False,
        "timeout_seconds": timeout_seconds,
    }


# ---------------------------------------------------------------------------
# Node 1: load_workflow_state
# ---------------------------------------------------------------------------

def load_workflow_state(state: WorkflowRuntimeState) -> Dict[str, Any]:
    """
    Read memory.md / task.md / design.md / work-plan.md.
    Construct WorkflowRuntimeState fields from the parsed content.
    """
    project_root = Path(state.get("project_root", ".")).resolve()
    memory_path = project_root / "memory.md"

    if not memory_path.exists():
        return {
            "load_error": f"memory.md not found at {memory_path}",
            "session_gate": "blocked",
            "current_phase": "unknown",
            "next_session": "none",
            "next_session_prompt": "",
            "last_completed_session": "0",
            "last_completed_session_tests": "blocked",
        }

    values = _parse_memory(memory_path)
    missing = STATUS_KEYS - values.keys()
    if missing:
        return {
            "load_error": f"memory.md missing keys: {', '.join(sorted(missing))}",
            "session_gate": "blocked",
            "current_phase": "unknown",
            "next_session": "none",
            "next_session_prompt": "",
            "last_completed_session": "0",
            "last_completed_session_tests": "blocked",
        }

    phase = values.get("current_phase", "unknown")
    if phase not in VALID_PHASES:
        return {
            "load_error": f"Invalid current_phase: {phase!r}",
            "session_gate": "blocked",
            "current_phase": phase,
            "next_session": values.get("next_session", "none"),
            "next_session_prompt": values.get("next_session_prompt", ""),
            "last_completed_session": values.get("last_completed_session", "0"),
            "last_completed_session_tests": values.get(
                "last_completed_session_tests", "blocked"
            ),
        }

    gate = values.get("session_gate", "blocked")
    if gate not in VALID_SESSION_GATES:
        return {
            "load_error": f"Invalid session_gate: {gate!r}",
            "session_gate": "blocked",
            "current_phase": phase,
            "next_session": values.get("next_session", "none"),
            "next_session_prompt": values.get("next_session_prompt", ""),
            "last_completed_session": values.get("last_completed_session", "0"),
            "last_completed_session_tests": values.get("last_completed_session_tests", "blocked"),
        }

    test_result = values.get("last_completed_session_tests", "blocked")
    if test_result not in VALID_TEST_RESULTS:
        return {
            "load_error": f"Invalid last_completed_session_tests: {test_result!r}",
            "session_gate": "blocked",
            "current_phase": phase,
            "next_session": values.get("next_session", "none"),
            "next_session_prompt": values.get("next_session_prompt", ""),
            "last_completed_session": values.get("last_completed_session", "0"),
            "last_completed_session_tests": test_result,
        }

    task_path = project_root / "task.md"
    task_title = _parse_task_title(task_path)

    last_completed = values.get("last_completed_session", "0")
    next_session = values.get("next_session", "none")

    previous_summary = _resolve_previous_summary(project_root, last_completed)
    expected_summary = _expected_summary_path(project_root, next_session)

    return {
        "load_error": None,
        "task_title": task_title,
        "current_phase": phase,
        "next_session": next_session,
        "next_session_prompt": values["next_session_prompt"],
        "last_completed_session": last_completed,
        "last_completed_session_tests": test_result,
        "session_gate": gate,
        "previous_summary_path": previous_summary,
        "expected_summary_path": expected_summary,
        "runner_result": None,
        "approval_decision": None,
        "rejection_reason": None,
        "run_id": None,
    }


# ---------------------------------------------------------------------------
# Node 2: select_session
# ---------------------------------------------------------------------------

def select_session(state: WorkflowRuntimeState) -> Dict[str, Any]:
    """
    Inspect session_gate and determine routing:
    - ready   → proceed to build_runner_input
    - done    → route to END
    - blocked / in_progress → will be routed to interrupt by conditional edge
    """
    gate = state.get("session_gate", "blocked")
    next_session = state.get("next_session", "none")

    # done check: gate=done OR next_session=none with gate=done
    if gate == "done" or (next_session == "none" and gate == "done"):
        return {"session_gate": "done"}

    # Propagate current gate without modification — routing handled by edges
    return {"session_gate": gate}


# ---------------------------------------------------------------------------
# Node 3: build_runner_input
# ---------------------------------------------------------------------------

def build_runner_input(state: WorkflowRuntimeState) -> Dict[str, Any]:
    """
    Assemble the runner payload: paths to startup-prompt, session-N-prompt,
    previous summary, task.md, and the runner command template output.
    """
    project_root = Path(state.get("project_root", ".")).resolve()
    next_session = state.get("next_session", "none")
    next_session_prompt = state.get("next_session_prompt", "")

    startup_prompt_path = project_root / "startup-prompt.md"
    session_prompt_path = project_root / next_session_prompt if next_session_prompt else None
    task_path = project_root / "task.md"
    previous_summary = state.get("previous_summary_path")

    # Runner completion must be explicitly reviewed before workflow truth advances.
    approval_required = state.get("approval_required", True)
    runner_command_template = state.get("runner_command_template") or os.getenv(
        "VIBECODING_LANGGRAPH_RUNNER_CMD"
    )
    runner_command_env = state.get("runner_command_env")

    runner_payload: Dict[str, Any] = {
        "project_root": str(project_root),
        "startup_prompt_path": str(startup_prompt_path) if startup_prompt_path.exists() else None,
        "session_prompt_path": str(session_prompt_path) if (session_prompt_path and session_prompt_path.exists()) else (str(session_prompt_path) if session_prompt_path else None),
        "task_path": str(task_path) if task_path.exists() else None,
        "previous_summary_path": previous_summary,
        "next_session": next_session,
        "next_session_prompt": next_session_prompt,
        "approval_required": approval_required,
        "runner_command_template": runner_command_template,
        "runner_command_env": runner_command_env,
    }

    return {
        "runner_payload": runner_payload,
        "approval_required": approval_required,
    }


# ---------------------------------------------------------------------------
# Node 4: review_gate
# ---------------------------------------------------------------------------

def review_gate(state: WorkflowRuntimeState) -> Dict[str, Any]:
    """
    Post-run HITL gate.
    Interrupt after runner outputs are collected, then resume on approve/reject.
    """
    runner_result = state.get("runner_result") or {}
    exit_code = runner_result.get("exit_code", -1)
    skipped = runner_result.get("skipped", False)

    if not state.get("approval_required", True):
        return {}
    if not skipped and exit_code not in (0, -1) and not _runner_has_reviewable_candidate(runner_result):
        return {}

    runner_payload = state.get("runner_payload") or {}
    decision = interrupt({
        "type": "session_review",
        "stage": "post_run_review",
        "next_session": state.get("next_session"),
        "session_prompt_path": runner_payload.get("session_prompt_path"),
        "expected_summary_path": state.get("expected_summary_path"),
        "summary_exists": runner_result.get("summary_exists", False),
        "summary_path": runner_result.get("summary_path"),
        "manifest_path": runner_result.get("manifest_path"),
        "runner_exit_code": runner_result.get("exit_code"),
        "message": "Runner finished. Approve to persist workflow advancement, or reject to restore the current session.",
    })

    approval_decision = decision.get("decision") if isinstance(decision, dict) else str(decision)
    rejection_reason = decision.get("reason") if isinstance(decision, dict) else None

    if approval_decision != "reject":
        return {
            "approval_decision": approval_decision,
            "rejection_reason": rejection_reason,
        }

    project_root = Path(state.get("project_root", ".")).resolve()
    memory_path = project_root / "memory.md"
    if memory_path.exists():
        next_session_prompt = state.get("next_session_prompt", "")
        prompt_value = "none" if next_session_prompt in {"", "none"} else f"`{next_session_prompt}`"
        _write_memory_field(
            memory_path,
            {
                "current_phase": state.get("current_phase", "development"),
                "last_completed_session": state.get("last_completed_session", "0"),
                "last_completed_session_tests": state.get("last_completed_session_tests", "blocked"),
                "next_session": state.get("next_session", "none"),
                "next_session_prompt": prompt_value,
                "session_gate": "blocked",
            },
        )
        if rejection_reason:
            _upsert_memory_field(memory_path, "review_notes", rejection_reason)

    return {
        "approval_decision": approval_decision,
        "rejection_reason": rejection_reason,
        "review_notes": rejection_reason,
        "session_gate": "blocked",
    }


# ---------------------------------------------------------------------------
# Node 5: run_session_task
# ---------------------------------------------------------------------------

def run_session_task(state: WorkflowRuntimeState) -> Dict[str, Any]:
    """
    Execute the runner subprocess (Claude Code / Codex CLI) with fresh context.
    Idempotent: generates a run_id and skips execution if result already present.
    """
    # Generate run_id for idempotency
    project_root_str = state.get("project_root", ".")
    next_session = state.get("next_session", "none")
    run_id = state.get("run_id") or _make_run_id(project_root_str, next_session)

    # Check if already executed (idempotency: if runner_result has same run_id)
    existing = state.get("runner_result") or {}
    if existing.get("run_id") == run_id:
        return {"run_id": run_id}

    runner_payload = state.get("runner_payload") or {}
    project_root = Path(project_root_str).resolve()
    timeout_seconds = _resolve_runner_timeout_seconds()

    startup_prompt_path = runner_payload.get("startup_prompt_path")
    runner_command_template = runner_payload.get("runner_command_template")
    runner_command_env = runner_payload.get("runner_command_env") or {}
    if not isinstance(runner_command_env, dict):
        runner_command_env = {}

    if runner_command_template:
        started_at = _utc_now_iso()
        command = _format_runner_command(
            str(runner_command_template),
            {
                "project_root": str(project_root),
                "startup_prompt_path": startup_prompt_path,
                "session_prompt_path": runner_payload.get("session_prompt_path"),
                "task_path": runner_payload.get("task_path"),
                "previous_summary_path": runner_payload.get("previous_summary_path"),
                "next_session": runner_payload.get("next_session"),
                "next_prompt": runner_payload.get("next_session_prompt"),
            },
        )
        env = os.environ.copy()
        env.update({str(key): str(value) for key, value in runner_command_env.items()})
        proc = _run_runner_subprocess(
            ["/bin/bash", "-lc", command],
            cwd=project_root,
            env=env,
            timeout_seconds=timeout_seconds,
        )
        ended_at = _utc_now_iso()
        runner_result = {
            "run_id": run_id,
            "runner": "custom",
            "exit_code": proc["exit_code"],
            "skipped": False,
            "command": command,
            "stdout": proc["stdout"],
            "stderr": proc["stderr"],
            "timed_out": proc["timed_out"],
            "timeout_seconds": proc["timeout_seconds"],
            "started_at": started_at,
            "ended_at": ended_at,
        }
        return {"runner_result": runner_result, "run_id": run_id}

    preferred_runner = state.get("preferred_runner") or os.getenv("VIBECODING_LANGGRAPH_RUNNER")
    runner_bin, runner_reason = _select_runner_bin(preferred_runner)

    if runner_bin is None:
        # No CLI available — record as dry-run result
        recorded_at = _utc_now_iso()
        runner_result = {
            "run_id": run_id,
            "runner": "none",
            "exit_code": -1,
            "skipped": True,
            "reason": runner_reason,
            "requested_runner": _normalize_runner_preference(preferred_runner),
            "command": None,
            "started_at": recorded_at,
            "ended_at": recorded_at,
        }
        return {"runner_result": runner_result, "run_id": run_id}

    session_prompt_path = runner_payload.get("session_prompt_path")
    next_session_num = runner_payload.get("next_session", "?")
    previous_summary_path = runner_payload.get("previous_summary_path")
    last_completed_session = state.get("last_completed_session")
    prompt = _build_runner_prompt(
        str(project_root),
        startup_prompt_path,
        session_prompt_path,
        str(next_session_num),
        previous_summary_path,
        last_completed_session,
    )

    if runner_bin == "claude":
        started_at = _utc_now_iso()
        cmd = [
            runner_bin,
            "--model", CLAUDE_DEFAULT_MODEL,
            "--permission-mode", "plan",
            "-p", prompt,
            "--add-dir", str(project_root),
        ]
        proc = _run_runner_subprocess(cmd, cwd=project_root, timeout_seconds=timeout_seconds)
    else:
        # codex exec runs non-interactively; pass the prompt via stdin and set the workspace root.
        started_at = _utc_now_iso()
        cmd = [
            runner_bin,
            "exec",
            "-c", CODEX_DISABLE_DEFAULT_MCP,
            "-C", str(project_root),
            "--sandbox", "workspace-write",
            "--skip-git-repo-check",
            "-",
        ]
        proc = _run_runner_subprocess(
            cmd,
            cwd=project_root,
            input_text=prompt,
            timeout_seconds=timeout_seconds,
        )
    ended_at = _utc_now_iso()
    runner_result = {
        "run_id": run_id,
        "runner": runner_bin,
        "requested_runner": _normalize_runner_preference(preferred_runner),
        "exit_code": proc["exit_code"],
        "skipped": False,
        "command": " ".join(cmd),
        "stdout": proc["stdout"],
        "stderr": proc["stderr"],
        "timed_out": proc["timed_out"],
        "timeout_seconds": proc["timeout_seconds"],
        "started_at": started_at,
        "ended_at": ended_at,
    }
    return {"runner_result": runner_result, "run_id": run_id}


# ---------------------------------------------------------------------------
# Node 6: collect_outputs
# ---------------------------------------------------------------------------

def collect_outputs(state: WorkflowRuntimeState) -> Dict[str, Any]:
    """
    Check for session-N-summary.md and session-N-manifest.json.
    Re-read memory.md to get the latest test results.
    """
    project_root = Path(state.get("project_root", ".")).resolve()
    next_session = state.get("next_session", "none")
    expected_summary = state.get("expected_summary_path")

    summary_exists = bool(expected_summary and Path(expected_summary).exists())

    manifest_path = None
    if next_session != "none":
        candidate = project_root / "artifacts" / f"session-{next_session}-manifest.json"
        if candidate.exists():
            manifest_path = str(candidate)

    memory_path = project_root / "memory.md"
    post_memory: Dict[str, str] = {}
    if memory_path.exists():
        post_memory = _parse_memory(memory_path)

    return {
        "runner_result": {
            **(state.get("runner_result") or {}),
            "summary_exists": summary_exists,
            "summary_path": expected_summary if summary_exists else None,
            "manifest_path": manifest_path,
            "post_memory": post_memory,
        }
    }


# ---------------------------------------------------------------------------
# Node 7: persist_workflow_files
# ---------------------------------------------------------------------------

def persist_workflow_files(
    state: WorkflowRuntimeState,
    config: Optional[RunnableConfig] = None,
) -> Dict[str, Any]:
    """
    Idempotently write the loop log (JSONL append).
    memory.md is updated by the runner itself; this node only logs.
    If memory.md was not updated by the runner, it records the loop event.
    """
    project_root = Path(state.get("project_root", ".")).resolve()
    loop_log = _default_loop_log(project_root)
    memory_path = project_root / "memory.md"

    runner_result = state.get("runner_result") or {}
    run_id = state.get("run_id") or runner_result.get("run_id", "unknown")
    approval_decision = state.get("approval_decision")
    runtime_locator = _resolve_runtime_locator(project_root, config)
    runner_payload = state.get("runner_payload") or {}
    session_number = _coerce_optional_int(state.get("next_session"))
    recorded_at = _utc_now_iso()

    if approval_decision == "approve" and _runner_has_reviewable_candidate(runner_result) and memory_path.exists():
        post_memory = runner_result.get("post_memory") or {}
        prompt_updates = _parse_session_prompt_memory_updates(
            runner_payload.get("session_prompt_path")
        )
        if prompt_updates:
            prompt_updates.setdefault("current_phase", state.get("current_phase", "development"))
            prompt_updates.setdefault("last_completed_session_tests", "passed")
            next_session_prompt = prompt_updates.get("next_session_prompt")
            if next_session_prompt:
                prompt_updates["next_session_prompt"] = (
                    "none" if next_session_prompt == "none" else f"`{next_session_prompt}`"
                )
            if post_memory.get("next_session") == state.get("next_session") or not post_memory:
                _write_memory_field(memory_path, prompt_updates)
        _remove_memory_field(memory_path, "review_notes")
        refreshed_memory = _parse_memory(memory_path)
        runner_result = {
            **runner_result,
            "post_memory": refreshed_memory,
        }

    payload: Dict[str, Any] = {
        "schema_version": SCHEMA_VERSION,
        "run_id": run_id,
        "project_root": str(project_root),
        "task_title": state.get("task_title"),
        "current_phase": state.get("current_phase"),
        "next_session": state.get("next_session"),
        "next_session_prompt": state.get("next_session_prompt"),
        "last_completed_session": state.get("last_completed_session"),
        "last_completed_session_tests": state.get("last_completed_session_tests"),
        "session_gate": state.get("session_gate"),
        "session_number": session_number,
        "session_prompt": state.get("next_session_prompt"),
        "session_prompt_path": runner_payload.get("session_prompt_path"),
        "approval_decision": state.get("approval_decision"),
        "approval_required": state.get("approval_required"),
        "runner_exit_code": runner_result.get("exit_code"),
        "runner_skipped": runner_result.get("skipped", False),
        "summary_exists": runner_result.get("summary_exists", False),
        "manifest_path": runner_result.get("manifest_path"),
        "thread_id": runtime_locator["thread_id"],
        "checkpoint_id": runtime_locator["checkpoint_id"],
        "checkpoint_ns": runtime_locator["checkpoint_ns"],
        "parent_checkpoint_id": runtime_locator["parent_checkpoint_id"],
        "started_at": runner_result.get("started_at"),
        "ended_at": runner_result.get("ended_at"),
        "recorded_at": recorded_at,
    }

    _log_event(loop_log, payload)

    result = {
        "run_id": run_id,
        "runner_result": runner_result,
    }
    if approval_decision == "approve":
        result["review_notes"] = None
        result["rejection_reason"] = None
    return result


# ---------------------------------------------------------------------------
# Node 8: route_next
# ---------------------------------------------------------------------------

def route_next(state: WorkflowRuntimeState) -> Dict[str, Any]:
    """
    Determine the next action after a session run.
    Returns updated state; routing is handled by conditional edges.
    """
    runner_result = state.get("runner_result") or {}
    exit_code = runner_result.get("exit_code", -1)
    skipped = runner_result.get("skipped", False)

    post_memory = runner_result.get("post_memory") or {}
    post_gate = post_memory.get("session_gate", state.get("session_gate", "blocked"))
    post_next = post_memory.get("next_session", state.get("next_session", "none"))
    pre_next = state.get("next_session", "none")

    # If runner failed (non-zero exit, not skipped), stop
    if _runner_failure_requires_block(state):
        return {
            "session_gate": "blocked",
            "next_session": pre_next,
        }

    # If runner succeeded but memory.md was NOT updated (next_session unchanged),
    # treat as blocked to prevent infinite loop — runner ran but didn't advance state
    if not skipped and exit_code == 0 and post_next == pre_next and post_gate == "ready":
        return {
            "session_gate": "blocked",
            "next_session": pre_next,
        }

    # Use post-run memory state
    return {
        "current_phase": post_memory.get("current_phase", state.get("current_phase", "unknown")),
        "session_gate": post_gate,
        "next_session": post_next,
        "next_session_prompt": post_memory.get(
            "next_session_prompt", state.get("next_session_prompt", "")
        ),
        "last_completed_session": post_memory.get(
            "last_completed_session", state.get("last_completed_session", "0")
        ),
        "last_completed_session_tests": post_memory.get(
            "last_completed_session_tests", state.get("last_completed_session_tests", "blocked")
        ),
    }


# ---------------------------------------------------------------------------
# Routing functions (conditional edges)
# ---------------------------------------------------------------------------

def _route_after_select(state: WorkflowRuntimeState) -> str:
    gate = state.get("session_gate", "blocked")
    error = state.get("load_error")
    if error:
        return END
    if gate == "done":
        return END
    if gate in ("blocked", "in_progress"):
        return END
    return "build_runner_input"


def _route_after_review(state: WorkflowRuntimeState) -> str:
    decision = state.get("approval_decision")
    if decision == "reject":
        return END
    return "persist_workflow_files"


def _route_after_route_next(state: WorkflowRuntimeState) -> str:
    gate = state.get("session_gate", "blocked")

    if gate == "done":
        return END
    if _runner_failure_requires_block(state):
        # Runner failed: stop, wait for human intervention
        return END
    return END


# ---------------------------------------------------------------------------
# Graph assembly
# ---------------------------------------------------------------------------

# Expose only true run inputs in Studio. Runtime-derived fields remain internal state.
_builder = StateGraph(WorkflowRuntimeState, input_schema=WorkflowRunInput)

_builder.add_node("load_workflow_state", load_workflow_state)
_builder.add_node("select_session", select_session)
_builder.add_node("build_runner_input", build_runner_input)
_builder.add_node("review_gate", review_gate)
_builder.add_node("run_session_task", run_session_task)
_builder.add_node("collect_outputs", collect_outputs)
_builder.add_node("persist_workflow_files", persist_workflow_files)
_builder.add_node("route_next", route_next)

# Linear edges
_builder.add_edge("__start__", "load_workflow_state")
_builder.add_edge("load_workflow_state", "select_session")
_builder.add_edge("build_runner_input", "run_session_task")
_builder.add_edge("run_session_task", "collect_outputs")
_builder.add_edge("collect_outputs", "review_gate")
_builder.add_edge("persist_workflow_files", "route_next")

# Conditional edges
_builder.add_conditional_edges(
    "select_session",
    _route_after_select,
    {
        "build_runner_input": "build_runner_input",
        "review_gate": "review_gate",
        END: END,
    },
)
_builder.add_conditional_edges(
    "review_gate",
    _route_after_review,
    {
        "persist_workflow_files": "persist_workflow_files",
        END: END,
    },
)
_builder.add_conditional_edges(
    "route_next",
    _route_after_route_next,
    {
        END: END,
    },
)

graph = _builder.compile(name="vibecoding_workflow")
