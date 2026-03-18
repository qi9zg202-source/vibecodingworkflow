"""Shared reset helpers for LangGraph test fixtures."""

from __future__ import annotations

import argparse
import re
from pathlib import Path
from typing import Iterable


LANGGRAPH_FIXTURE_BASELINE = {
    "current_phase": "development",
    "last_completed_session": "4",
    "last_completed_session_tests": "passed",
    "next_session": "5",
    "next_session_prompt": "`session-5-prompt.md`",
    "session_gate": "ready",
}

STATUS_HEADER = "## Session Status"


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def default_langgraph_fixture_root() -> Path:
    return (
        repo_root()
        / "integrations"
        / "vibecoding-vscode-extension"
        / "fixtures"
        / "session8-smoke-project"
    )


def _replace_status_field(text: str, key: str, value: str) -> str:
    pattern = re.compile(rf"^(- {re.escape(key)}:\s*).*$", re.MULTILINE)
    updated, count = pattern.subn(lambda match: f"{match.group(1)}{value}", text, count=1)
    if count != 1:
        raise ValueError(f"Missing memory status key: {key}")
    return updated


def _drop_status_fields(text: str, keys: Iterable[str]) -> str:
    key_set = set(keys)
    lines = text.splitlines()
    result: list[str] = []
    in_status = False

    for line in lines:
        stripped = line.strip()
        if stripped == STATUS_HEADER:
            in_status = True
            result.append(line)
            continue
        if in_status and line.startswith("## "):
            in_status = False
        if in_status:
            match = re.match(r"^- ([a-z_]+):\s*.*$", stripped)
            if match and match.group(1) in key_set:
                continue
        result.append(line)

    return "\n".join(result) + ("\n" if text.endswith("\n") else "")


def reset_langgraph_test_project(project_root: Path) -> Path:
    project_root = Path(project_root).resolve()

    artifacts_dir = project_root / "artifacts"
    logs_dir = project_root / "outputs" / "session-logs"
    specs_dir = project_root / "outputs" / "session-specs"
    state_dir = project_root / ".vibecoding"
    memory_path = project_root / "memory.md"

    for directory in (artifacts_dir, logs_dir, specs_dir, state_dir):
        directory.mkdir(parents=True, exist_ok=True)

    for keep_path in (artifacts_dir / ".gitkeep", logs_dir / ".gitkeep", specs_dir / ".gitkeep"):
        keep_path.touch(exist_ok=True)

    for path in artifacts_dir.glob("session-*-summary.md"):
        path.unlink()
    for path in artifacts_dir.glob("session-*-manifest.json"):
        path.unlink()

    for path in logs_dir.iterdir():
        if path.name != ".gitkeep":
            path.unlink()
    for path in specs_dir.iterdir():
        if path.name != ".gitkeep":
            path.unlink()

    runner_state = state_dir / "runner-state.sqlite"
    if runner_state.exists():
        runner_state.unlink()
    (state_dir / "runner.log").write_text("", encoding="utf-8")

    if not memory_path.exists():
        raise FileNotFoundError(f"memory.md not found: {memory_path}")

    memory_text = memory_path.read_text(encoding="utf-8")
    for key, value in LANGGRAPH_FIXTURE_BASELINE.items():
        memory_text = _replace_status_field(memory_text, key, value)
    memory_text = _drop_status_fields(memory_text, {"review_notes"})
    memory_path.write_text(memory_text, encoding="utf-8")

    return project_root


def main() -> int:
    parser = argparse.ArgumentParser(description="Reset the LangGraph test fixture to its clean baseline.")
    parser.add_argument(
        "--project-root",
        default=str(default_langgraph_fixture_root()),
        help="Path to the LangGraph workflow project to reset.",
    )
    args = parser.parse_args()

    project_root = reset_langgraph_test_project(Path(args.project_root))
    print("LangGraph test data reset complete.")
    print(f"project_root={project_root}")
    print("last_completed_session=4")
    print("next_session=5")
    print("next_session_prompt=session-5-prompt.md")
    print("session_gate=ready")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
