#!/usr/bin/env python3
"""Real HTTP HITL smoke test for the local LangGraph dev server."""

from __future__ import annotations

import json
import os
import shlex
import shutil
import sys
import tempfile
import time
import urllib.request
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
SRC_ROOT = REPO_ROOT / "src"
if str(SRC_ROOT) not in sys.path:
    sys.path.insert(0, str(SRC_ROOT))

FIXTURE_ROOT = REPO_ROOT / "integrations" / "vibecoding-vscode-extension" / "fixtures" / "session8-smoke-project"
MOCK_RUNNER = REPO_ROOT / "scripts" / "mock_langgraph_runner.py"
BASE_URL = os.environ.get("LANGGRAPH_BASE_URL", "http://127.0.0.1:2024")
ASSISTANT_ID = "vibecoding_workflow"

from vibecoding_langgraph.test_support import reset_langgraph_test_project


def post(path: str, payload: dict) -> dict:
    request = urllib.request.Request(
        BASE_URL + path,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request) as response:
        return json.load(response)


def get(path: str) -> dict:
    with urllib.request.urlopen(BASE_URL + path) as response:
        return json.load(response)


def has_interrupt(state: dict) -> bool:
    for task in state.get("tasks") or []:
        if isinstance(task, dict) and isinstance(task.get("interrupts"), list) and task["interrupts"]:
            return True
    return False


def build_command_template() -> str:
    return " ".join(
        [
            shlex.quote(sys.executable),
            shlex.quote(str(MOCK_RUNNER)),
            "--project-root",
            "{project_root}",
            "--next-session",
            "{next_session}",
            "--next-prompt",
            "{next_prompt}",
            "--final-session",
            "6",
        ]
    )


def wait_for_review_interrupt(thread_id: str, timeout_seconds: float = 30.0) -> dict:
    deadline = time.time() + timeout_seconds
    last_state = None
    while time.time() < deadline:
        state = get(f"/threads/{thread_id}/state")
        last_state = state
        if has_interrupt(state):
            return state
        time.sleep(0.5)
    raise AssertionError(f"Timed out waiting for review interrupt. last_state={json.dumps(last_state, ensure_ascii=False)}")


def wait_for_interrupt_clear(thread_id: str, timeout_seconds: float = 30.0) -> dict:
    deadline = time.time() + timeout_seconds
    last_state = None
    while time.time() < deadline:
        state = get(f"/threads/{thread_id}/state")
        last_state = state
        if not has_interrupt(state):
            return state
        time.sleep(0.5)
    raise AssertionError(f"Timed out waiting for resume completion. last_state={json.dumps(last_state, ensure_ascii=False)}")


def run_case(decision: str, reason: str | None = None) -> dict:
    with tempfile.TemporaryDirectory(prefix=f"vibe-langgraph-hitl-{decision}-") as temp_dir:
        project_root = Path(temp_dir) / "session8-smoke-project"
        shutil.copytree(FIXTURE_ROOT, project_root)
        reset_langgraph_test_project(project_root)

        thread = post("/threads", {})
        thread_id = thread["thread_id"]
        start_result = post(
            f"/threads/{thread_id}/runs",
            {
                "assistant_id": ASSISTANT_ID,
                "input": {
                    "project_root": str(project_root),
                    "runner_command_template": build_command_template(),
                    "approval_required": True,
                },
            },
        )

        interrupted_state = wait_for_review_interrupt(thread_id)
        resume_payload = {"decision": decision}
        if reason:
            resume_payload["reason"] = reason
        resume_result = post(
            f"/threads/{thread_id}/runs",
            {
                "assistant_id": ASSISTANT_ID,
                "command": {
                    "resume": resume_payload,
                },
            },
        )
        final_state = wait_for_interrupt_clear(thread_id)
        values = final_state["values"]
        memory_lines = project_root.joinpath("memory.md").read_text(encoding="utf-8").splitlines()

        return {
            "thread_id": thread_id,
            "initial_run_id": start_result.get("run_id"),
            "resume_run_id": resume_result.get("run_id"),
            "interrupt_next": interrupted_state.get("next"),
            "interrupt_task_names": [task.get("name") for task in interrupted_state.get("tasks") or [] if isinstance(task, dict)],
            "resume_status": resume_result.get("status"),
            "final_next": final_state.get("next"),
            "final_values": {
                "session_gate": values.get("session_gate"),
                "next_session": values.get("next_session"),
                "last_completed_session": values.get("last_completed_session"),
                "approval_decision": values.get("approval_decision"),
                "rejection_reason": values.get("rejection_reason"),
                "review_notes": values.get("review_notes"),
            },
            "memory_excerpt": memory_lines[:14],
        }


def assert_approve(result: dict) -> None:
    values = result["final_values"]
    memory_text = "\n".join(result["memory_excerpt"])
    assert result["interrupt_next"] == ["review_gate"], result
    assert result["final_next"] == [], result
    assert values["session_gate"] == "ready", result
    assert values["next_session"] == "6", result
    assert values["last_completed_session"] == "5", result
    assert values["approval_decision"] == "approve", result
    assert values["rejection_reason"] is None, result
    assert "- next_session: 6" in memory_text, result
    assert "- last_completed_session: 5" in memory_text, result


def assert_reject(result: dict) -> None:
    values = result["final_values"]
    memory_text = "\n".join(result["memory_excerpt"])
    assert result["interrupt_next"] == ["review_gate"], result
    assert result["final_next"] == [], result
    assert values["session_gate"] == "blocked", result
    assert values["next_session"] == "5", result
    assert values["last_completed_session"] == "4", result
    assert values["approval_decision"] == "reject", result
    assert values["rejection_reason"] == "need more tests", result
    assert "- next_session: 5" in memory_text, result
    assert "- last_completed_session: 4" in memory_text, result
    assert "- session_gate: blocked" in memory_text, result
    assert "- review_notes: need more tests" in memory_text, result


def main() -> int:
    ok = get("/ok")
    assert ok == {"ok": True}, ok

    approve_result = run_case("approve")
    reject_result = run_case("reject", "need more tests")

    assert_approve(approve_result)
    assert_reject(reject_result)

    print("LangGraph HITL HTTP smoke passed")
    print(
        json.dumps(
            {
                "approve": approve_result,
                "reject": reject_result,
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
