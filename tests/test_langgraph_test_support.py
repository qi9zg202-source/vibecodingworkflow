from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC_ROOT = ROOT / "src"
if str(SRC_ROOT) not in __import__("sys").path:
    __import__("sys").path.insert(0, str(SRC_ROOT))

from vibecoding_langgraph.test_support import reset_langgraph_test_project  # noqa: E402


class LangGraphTestSupportTests(unittest.TestCase):
    def test_reset_langgraph_test_project_restores_fixture_baseline(self) -> None:
        with tempfile.TemporaryDirectory(prefix="langgraph-reset-helper-") as temp_dir:
            project_root = Path(temp_dir)
            (project_root / "artifacts").mkdir(parents=True)
            (project_root / "outputs" / "session-logs").mkdir(parents=True)
            (project_root / "outputs" / "session-specs").mkdir(parents=True)
            (project_root / ".vibecoding").mkdir(parents=True)

            (project_root / "artifacts" / "session-5-summary.md").write_text("# summary\n", encoding="utf-8")
            (project_root / "artifacts" / "session-5-manifest.json").write_text("{}\n", encoding="utf-8")
            (project_root / "outputs" / "session-logs" / "vibecoding-loop.jsonl").write_text("{}\n", encoding="utf-8")
            (project_root / "outputs" / "session-specs" / "session-5-spec.json").write_text("{}\n", encoding="utf-8")
            (project_root / ".vibecoding" / "runner-state.sqlite").write_text("db", encoding="utf-8")
            (project_root / ".vibecoding" / "runner.log").write_text("log", encoding="utf-8")
            (project_root / "memory.md").write_text(
                "\n".join(
                    [
                        "# memory.md",
                        "",
                        "## Session Status",
                        "- current_phase: done",
                        "- last_completed_session: 6",
                        "- last_completed_session_tests: failed",
                        "- next_session: none",
                        "- next_session_prompt: none",
                        "- session_gate: blocked",
                        "- review_notes: drifted",
                        "",
                        "## Next Session Entry",
                        "- test",
                        "",
                    ]
                ),
                encoding="utf-8",
            )

            reset_langgraph_test_project(project_root)

            memory_text = (project_root / "memory.md").read_text(encoding="utf-8")
            self.assertIn("- current_phase: development", memory_text)
            self.assertIn("- last_completed_session: 4", memory_text)
            self.assertIn("- last_completed_session_tests: passed", memory_text)
            self.assertIn("- next_session: 5", memory_text)
            self.assertIn("- next_session_prompt: `session-5-prompt.md`", memory_text)
            self.assertIn("- session_gate: ready", memory_text)
            self.assertNotIn("review_notes", memory_text)
            self.assertFalse((project_root / "artifacts" / "session-5-summary.md").exists())
            self.assertFalse((project_root / "artifacts" / "session-5-manifest.json").exists())
            self.assertFalse((project_root / "outputs" / "session-logs" / "vibecoding-loop.jsonl").exists())
            self.assertFalse((project_root / "outputs" / "session-specs" / "session-5-spec.json").exists())
            self.assertFalse((project_root / ".vibecoding" / "runner-state.sqlite").exists())
            self.assertEqual((project_root / ".vibecoding" / "runner.log").read_text(encoding="utf-8"), "")


if __name__ == "__main__":
    unittest.main()
