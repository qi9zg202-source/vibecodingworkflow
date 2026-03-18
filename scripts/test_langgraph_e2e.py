#!/usr/bin/env python3
"""End-to-end LangGraph smoke test with a deterministic mock runner."""

from __future__ import annotations

import json
import shlex
import shutil
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
SRC_ROOT = REPO_ROOT / "src"
if str(SRC_ROOT) not in sys.path:
    sys.path.insert(0, str(SRC_ROOT))

from vibecoding_langgraph.graph import graph
from vibecoding_langgraph.test_support import reset_langgraph_test_project

FIXTURE_ROOT = REPO_ROOT / "integrations" / "vibecoding-vscode-extension" / "fixtures" / "session8-smoke-project"
MOCK_RUNNER = REPO_ROOT / "scripts" / "mock_langgraph_runner.py"


def main() -> int:
    with tempfile.TemporaryDirectory(prefix="vibecoding-langgraph-e2e-") as temp_dir:
        project_root = Path(temp_dir) / "session8-smoke-project"
        shutil.copytree(FIXTURE_ROOT, project_root)
        reset_langgraph_test_project(project_root)
        loop_log = project_root / "outputs" / "session-logs" / "vibecoding-loop.jsonl"

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

        result = graph.invoke(
            {
                "project_root": str(project_root),
                "runner_command_template": command_template,
                "approval_required": False,
            }
        )

        log_lines = [
            json.loads(line)
            for line in loop_log.read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]

        session5_summary = project_root / "artifacts" / "session-5-summary.md"
        session6_summary = project_root / "artifacts" / "session-6-summary.md"
        session5_manifest = project_root / "artifacts" / "session-5-manifest.json"
        session6_manifest = project_root / "artifacts" / "session-6-manifest.json"

        assert result["current_phase"] == "development", result
        assert result["session_gate"] == "ready", result
        assert result["next_session"] == "6", result
        assert result["last_completed_session"] == "5", result
        assert result["last_completed_session_tests"] == "passed", result
        assert result["runner_result"]["runner"] == "custom", result
        assert result["runner_result"]["summary_exists"] is True, result
        assert Path(result["runner_result"]["manifest_path"]).resolve() == session5_manifest.resolve(), result
        assert session5_summary.exists()
        assert session5_manifest.exists()
        assert not session6_summary.exists()
        assert not session6_manifest.exists()
        assert len(log_lines) == 1, log_lines
        assert log_lines[0]["next_session"] == "5", log_lines
        assert log_lines[0]["summary_exists"] is True, log_lines

        print("LangGraph E2E passed")
        print(json.dumps(
            {
                "project_root": str(project_root),
                "loop_log_path": str(loop_log),
                "result": {
                    "current_phase": result["current_phase"],
                    "session_gate": result["session_gate"],
                    "last_completed_session": result["last_completed_session"],
                    "next_session": result["next_session"],
                    "log_entries": len(log_lines),
                },
            },
            ensure_ascii=False,
            indent=2,
        ))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
