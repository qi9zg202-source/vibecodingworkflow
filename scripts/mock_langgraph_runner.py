#!/usr/bin/env python3
"""Deterministic runner used by LangGraph smoke tests."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


def replace_status_line(text: str, key: str, value: str) -> str:
    pattern = re.compile(rf"^(- {re.escape(key)}:\s*).*$", re.MULTILINE)
    updated, count = pattern.subn(lambda match: f"{match.group(1)}{value}", text, count=1)
    if count != 1:
        raise ValueError(f"Missing memory status key: {key}")
    return updated


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-root", required=True)
    parser.add_argument("--next-session", required=True)
    parser.add_argument("--next-prompt", required=True)
    parser.add_argument("--final-session", type=int, required=True)
    args = parser.parse_args()

    project_root = Path(args.project_root).resolve()
    session_num = int(args.next_session)
    memory_path = project_root / "memory.md"
    artifacts_dir = project_root / "artifacts"
    artifacts_dir.mkdir(parents=True, exist_ok=True)

    summary_path = artifacts_dir / f"session-{session_num}-summary.md"
    summary_path.write_text(
        "\n".join(
            [
                f"# Session {session_num} Summary",
                "",
                "## Result",
                f"- Completed via mock LangGraph runner for session {session_num}.",
                "- Tests: passed",
                "",
            ]
        ),
        encoding="utf-8",
    )

    manifest_path = artifacts_dir / f"session-{session_num}-manifest.json"
    manifest_path.write_text(
        json.dumps(
            {
                "session": session_num,
                "status": "passed",
                "summary_path": str(summary_path),
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    memory_text = memory_path.read_text(encoding="utf-8")
    memory_text = replace_status_line(memory_text, "last_completed_session", str(session_num))
    memory_text = replace_status_line(memory_text, "last_completed_session_tests", "passed")

    if session_num >= args.final_session:
        memory_text = replace_status_line(memory_text, "current_phase", "done")
        memory_text = replace_status_line(memory_text, "next_session", "none")
        memory_text = replace_status_line(memory_text, "next_session_prompt", "none")
        memory_text = replace_status_line(memory_text, "session_gate", "done")
        next_prompt = "none"
    else:
        next_session = session_num + 1
        next_prompt = f"session-{next_session}-prompt.md"
        memory_text = replace_status_line(memory_text, "next_session", str(next_session))
        memory_text = replace_status_line(memory_text, "next_session_prompt", f"`{next_prompt}`")
        memory_text = replace_status_line(memory_text, "session_gate", "ready")

    memory_path.write_text(memory_text, encoding="utf-8")

    print(f"Session {session_num} complete")
    print("Tests: passed")
    print(f"Next: {next_prompt}")
    print("Start a fresh session before running the next startup-prompt.md")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
