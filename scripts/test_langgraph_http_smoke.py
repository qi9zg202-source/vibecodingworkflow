#!/usr/bin/env python3
"""HTTP smoke test for the local LangGraph dev server."""

from __future__ import annotations

import json
import os
import shlex
import shutil
import sys
import tempfile
import urllib.request
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
SRC_ROOT = REPO_ROOT / "src"
if str(SRC_ROOT) not in sys.path:
    sys.path.insert(0, str(SRC_ROOT))

FIXTURE_ROOT = REPO_ROOT / "integrations" / "vibecoding-vscode-extension" / "fixtures" / "session8-smoke-project"
MOCK_RUNNER = REPO_ROOT / "scripts" / "mock_langgraph_runner.py"
BASE_URL = os.environ.get("LANGGRAPH_BASE_URL", "http://127.0.0.1:2024")

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


def main() -> int:
    ok = get("/ok")
    assert ok == {"ok": True}, ok

    with tempfile.TemporaryDirectory(prefix="vibe-langgraph-http-") as temp_dir:
        project_root = Path(temp_dir) / "session8-smoke-project"
        shutil.copytree(FIXTURE_ROOT, project_root)
        reset_langgraph_test_project(project_root)

        command_template = " ".join(
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

        thread = post("/threads", {})
        result = post(
            f"/threads/{thread['thread_id']}/runs/wait",
            {
                "assistant_id": "vibecoding_workflow",
                "input": {
                    "project_root": str(project_root),
                    "runner_command_template": command_template,
                    "approval_required": False,
                },
            },
        )
        state = get(f"/threads/{thread['thread_id']}/state")

        values = state["values"]
        assert result["session_gate"] == "ready", result
        assert result["next_session"] == "6", result
        assert result["last_completed_session"] == "5", result
        assert values["session_gate"] == "ready", values
        assert values["next_session"] == "6", values
        assert values["last_completed_session"] == "5", values

        print("LangGraph HTTP smoke passed")
        print(
            json.dumps(
                {
                    "thread_id": thread["thread_id"],
                    "project_root": str(project_root),
                    "result": {
                        "current_phase": values["current_phase"],
                        "session_gate": values["session_gate"],
                        "last_completed_session": values["last_completed_session"],
                        "next_session": values["next_session"],
                    },
                },
                ensure_ascii=False,
                indent=2,
            )
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
