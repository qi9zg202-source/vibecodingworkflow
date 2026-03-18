from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
SRC_ROOT = ROOT / "src"
if str(SRC_ROOT) not in __import__("sys").path:
    __import__("sys").path.insert(0, str(SRC_ROOT))

from vibecoding_langgraph.graph import (  # noqa: E402
    WorkflowRunInput,
    build_runner_input,
    collect_outputs,
    graph,
    load_workflow_state,
    persist_workflow_files,
    review_gate,
    route_next,
    run_session_task,
)


FIXTURE_ROOT = (
    ROOT
    / "integrations"
    / "vibecoding-vscode-extension"
    / "fixtures"
    / "session8-smoke-project"
)
MOCK_RUNNER = ROOT / "scripts" / "mock_langgraph_runner.py"


class LangGraphRuntimeTests(unittest.TestCase):
    def test_graph_input_schema_exposes_only_run_inputs(self) -> None:
        self.assertIs(graph.builder.input_schema, WorkflowRunInput)
        self.assertEqual(
            set(graph.builder.input_schema.__annotations__.keys()),
            {
                "project_root",
                "runner_command_template",
                "runner_command_env",
                "preferred_runner",
                "approval_required",
            },
        )

    def test_load_workflow_state_blocks_when_memory_missing_keys(self) -> None:
        with tempfile.TemporaryDirectory(prefix="langgraph-missing-memory-") as temp_dir:
            project_root = Path(temp_dir)
            (project_root / "memory.md").write_text(
                "## Session Status\n- current_phase: development\n",
                encoding="utf-8",
            )
            result = load_workflow_state({"project_root": str(project_root)})
            self.assertEqual(result["session_gate"], "blocked")
            self.assertEqual(result["next_session"], "none")
            self.assertIn("missing keys", result["load_error"])

    def test_build_runner_input_resolves_workflow_paths(self) -> None:
        with tempfile.TemporaryDirectory(prefix="langgraph-build-input-") as temp_dir:
            project_root = Path(temp_dir)
            startup = project_root / "startup-prompt.md"
            session_prompt = project_root / "session-3-prompt.md"
            task_path = project_root / "task.md"
            startup.write_text("startup", encoding="utf-8")
            session_prompt.write_text("session", encoding="utf-8")
            task_path.write_text("## Title\n- Demo Task\n", encoding="utf-8")

            result = build_runner_input(
                {
                    "project_root": str(project_root),
                    "next_session": "3",
                    "next_session_prompt": "session-3-prompt.md",
                    "previous_summary_path": str(project_root / "artifacts" / "session-2-summary.md"),
                    "runner_command_env": {"DEMO_ENV": "1"},
                }
            )

            payload = result["runner_payload"]
            self.assertEqual(Path(payload["startup_prompt_path"]).resolve(), startup.resolve())
            self.assertEqual(Path(payload["session_prompt_path"]).resolve(), session_prompt.resolve())
            self.assertEqual(Path(payload["task_path"]).resolve(), task_path.resolve())
            self.assertEqual(payload["runner_command_env"], {"DEMO_ENV": "1"})
            self.assertTrue(result["approval_required"])

    def test_run_session_task_custom_template_injects_environment(self) -> None:
        with tempfile.TemporaryDirectory(prefix="langgraph-custom-runner-") as temp_dir:
            project_root = Path(temp_dir)
            output_path = project_root / "runner-env.txt"
            state = {
                "project_root": str(project_root),
                "next_session": "2",
                "runner_payload": {
                    "runner_command_template": (
                        "python3 -c \"import os, pathlib, sys; "
                        "pathlib.Path(sys.argv[1]).write_text(os.environ['TEST_VALUE'], encoding='utf-8')\" "
                        "{project_root}/runner-env.txt"
                    ),
                    "runner_command_env": {"TEST_VALUE": "codex-ready"},
                    "next_session": "2",
                    "next_session_prompt": "session-2-prompt.md",
                },
            }
            result = run_session_task(state)
            self.assertEqual(result["runner_result"]["runner"], "custom")
            self.assertEqual(result["runner_result"]["exit_code"], 0)
            self.assertEqual(output_path.read_text(encoding="utf-8"), "codex-ready")

    def test_run_session_task_returns_dry_run_when_no_cli_available(self) -> None:
        with tempfile.TemporaryDirectory(prefix="langgraph-no-cli-") as temp_dir:
            project_root = Path(temp_dir)
            with mock.patch("shutil.which", return_value=None):
                result = run_session_task({"project_root": str(project_root), "next_session": "1"})
            self.assertEqual(result["runner_result"]["runner"], "none")
            self.assertTrue(result["runner_result"]["skipped"])
            self.assertEqual(result["runner_result"]["exit_code"], -1)

    def test_run_session_task_uses_codex_exec_with_workspace_root(self) -> None:
        with tempfile.TemporaryDirectory(prefix="langgraph-codex-runner-") as temp_dir:
            project_root = Path(temp_dir)
            startup = project_root / "startup-prompt.md"
            session_prompt = project_root / "session-4-prompt.md"
            startup.write_text("Follow startup instructions.", encoding="utf-8")
            session_prompt.write_text("Execute session 4.", encoding="utf-8")

            def fake_which(binary: str) -> str | None:
                if binary == "claude":
                    return "/Users/demo/.local/bin/claude"
                if binary == "codex":
                    return "/Applications/Codex.app/Contents/Resources/codex"
                return None

            with mock.patch("shutil.which", side_effect=fake_which):
                with mock.patch(
                    "vibecoding_langgraph.graph._run_runner_subprocess",
                    return_value={
                        "exit_code": 0,
                        "stdout": "ok",
                        "stderr": "",
                        "timed_out": False,
                        "timeout_seconds": 900,
                    },
                ) as run_mock:
                    result = run_session_task(
                        {
                            "project_root": str(project_root),
                            "next_session": "4",
                            "preferred_runner": "codex",
                            "runner_payload": {
                                "startup_prompt_path": str(startup),
                                "session_prompt_path": str(session_prompt),
                                "next_session": "4",
                            },
                        }
                    )

            self.assertEqual(result["runner_result"]["runner"], "codex")
            self.assertEqual(result["runner_result"]["requested_runner"], "codex")
            cmd = run_mock.call_args.args[0]
            self.assertEqual(cmd[:4], ["codex", "exec", "-c", "mcp_servers.chrome-devtools.enabled=false"])
            self.assertEqual(cmd[4], "-C")
            self.assertEqual(Path(cmd[5]).resolve(), project_root.resolve())
            self.assertEqual(cmd[6:], ["--sandbox", "workspace-write", "--skip-git-repo-check", "-"])
            self.assertEqual(run_mock.call_args.kwargs["cwd"].resolve(), project_root.resolve())
            self.assertIn("当前 next_session: 4", run_mock.call_args.kwargs["input_text"])
            self.assertIn(str(session_prompt), run_mock.call_args.kwargs["input_text"])
            self.assertIn("Execute session 4.", run_mock.call_args.kwargs["input_text"])

    def test_run_session_task_auto_prefers_codex_when_both_clis_exist(self) -> None:
        with tempfile.TemporaryDirectory(prefix="langgraph-auto-prefers-codex-") as temp_dir:
            project_root = Path(temp_dir)
            startup = project_root / "startup-prompt.md"
            session_prompt = project_root / "session-1-prompt.md"
            startup.write_text("Follow startup instructions.", encoding="utf-8")
            session_prompt.write_text("Execute session 1.", encoding="utf-8")

            def fake_which(binary: str) -> str | None:
                if binary == "codex":
                    return "/Applications/Codex.app/Contents/Resources/codex"
                if binary == "claude":
                    return "/Users/demo/.local/bin/claude"
                return None

            with mock.patch("shutil.which", side_effect=fake_which):
                with mock.patch(
                    "vibecoding_langgraph.graph._run_runner_subprocess",
                    return_value={
                        "exit_code": 0,
                        "stdout": "ok",
                        "stderr": "",
                        "timed_out": False,
                        "timeout_seconds": 900,
                    },
                ) as run_mock:
                    result = run_session_task(
                        {
                            "project_root": str(project_root),
                            "next_session": "1",
                            "runner_payload": {
                                "startup_prompt_path": str(startup),
                                "session_prompt_path": str(session_prompt),
                                "next_session": "1",
                            },
                        }
                    )

            self.assertEqual(result["runner_result"]["runner"], "codex")
            self.assertEqual(result["runner_result"]["requested_runner"], "auto")
            cmd = run_mock.call_args.args[0]
            self.assertEqual(cmd[:4], ["codex", "exec", "-c", "mcp_servers.chrome-devtools.enabled=false"])
            self.assertEqual(cmd[4], "-C")

    def test_run_session_task_uses_claude_plan_mode_and_default_model(self) -> None:
        with tempfile.TemporaryDirectory(prefix="langgraph-claude-runner-") as temp_dir:
            project_root = Path(temp_dir)
            startup = project_root / "startup-prompt.md"
            session_prompt = project_root / "session-1-prompt.md"
            startup.write_text("工作目录切到 __PROJECT_ROOT__", encoding="utf-8")
            session_prompt.write_text("Execute session 1.", encoding="utf-8")

            def fake_which(binary: str) -> str | None:
                if binary == "claude":
                    return "/Users/demo/.local/bin/claude"
                return None

            with mock.patch("shutil.which", side_effect=fake_which):
                with mock.patch(
                    "vibecoding_langgraph.graph._run_runner_subprocess",
                    return_value={
                        "exit_code": 0,
                        "stdout": "ok",
                        "stderr": "",
                        "timed_out": False,
                        "timeout_seconds": 900,
                    },
                ) as run_mock:
                    result = run_session_task(
                        {
                            "project_root": str(project_root),
                            "next_session": "1",
                            "preferred_runner": "claude",
                            "runner_payload": {
                                "startup_prompt_path": str(startup),
                                "session_prompt_path": str(session_prompt),
                                "next_session": "1",
                            },
                        }
                    )

            self.assertEqual(result["runner_result"]["runner"], "claude")
            self.assertEqual(result["runner_result"]["requested_runner"], "claude")
            cmd = run_mock.call_args.args[0]
            self.assertEqual(
                cmd[:6],
                ["claude", "--model", "opusplan", "--permission-mode", "plan", "-p"],
            )
            self.assertEqual(cmd[-2], "--add-dir")
            self.assertEqual(Path(cmd[-1]).resolve(), project_root.resolve())
            self.assertEqual(run_mock.call_args.kwargs["cwd"].resolve(), project_root.resolve())
            self.assertIn(str(project_root), cmd[6])

    def test_run_session_task_requested_codex_does_not_fallback_to_claude(self) -> None:
        with tempfile.TemporaryDirectory(prefix="langgraph-codex-missing-") as temp_dir:
            project_root = Path(temp_dir)

            def fake_which(binary: str) -> str | None:
                if binary == "claude":
                    return "/Users/demo/.local/bin/claude"
                return None

            with mock.patch("shutil.which", side_effect=fake_which):
                result = run_session_task(
                    {
                        "project_root": str(project_root),
                        "next_session": "1",
                        "preferred_runner": "codex",
                    }
                )

            self.assertEqual(result["runner_result"]["runner"], "none")
            self.assertTrue(result["runner_result"]["skipped"])
            self.assertEqual(result["runner_result"]["requested_runner"], "codex")
            self.assertIn("Preferred runner 'codex' not found", result["runner_result"]["reason"])

    def test_run_session_task_reports_timeout_metadata(self) -> None:
        with tempfile.TemporaryDirectory(prefix="langgraph-timeout-runner-") as temp_dir:
            project_root = Path(temp_dir)
            with mock.patch.dict(os.environ, {"VIBECODING_LANGGRAPH_RUNNER_TIMEOUT_SECONDS": "7"}):
                with mock.patch(
                    "vibecoding_langgraph.graph._run_runner_subprocess",
                    return_value={
                        "exit_code": 124,
                        "stdout": "partial",
                        "stderr": "timed out",
                        "timed_out": True,
                        "timeout_seconds": 7,
                    },
                ):
                    result = run_session_task(
                        {
                            "project_root": str(project_root),
                            "next_session": "1",
                            "runner_payload": {
                                "startup_prompt_path": None,
                                "session_prompt_path": None,
                                "next_session": "1",
                            },
                        }
                    )

        self.assertEqual(result["runner_result"]["exit_code"], 124)
        self.assertTrue(result["runner_result"]["timed_out"])
        self.assertEqual(result["runner_result"]["timeout_seconds"], 7)

    def test_collect_outputs_reads_summary_manifest_and_post_memory(self) -> None:
        with tempfile.TemporaryDirectory(prefix="langgraph-collect-outputs-") as temp_dir:
            project_root = Path(temp_dir)
            artifacts_dir = project_root / "artifacts"
            artifacts_dir.mkdir(parents=True)
            summary_path = artifacts_dir / "session-2-summary.md"
            manifest_path = artifacts_dir / "session-2-manifest.json"
            summary_path.write_text("# Summary\n", encoding="utf-8")
            manifest_path.write_text('{"status": "passed"}\n', encoding="utf-8")
            (project_root / "memory.md").write_text(
                "\n".join(
                    [
                        "## Session Status",
                        "- current_phase: development",
                        "- last_completed_session: 2",
                        "- last_completed_session_tests: passed",
                        "- next_session: 3",
                        "- next_session_prompt: `session-3-prompt.md`",
                        "- session_gate: ready",
                    ]
                ),
                encoding="utf-8",
            )

            result = collect_outputs(
                {
                    "project_root": str(project_root),
                    "next_session": "2",
                    "expected_summary_path": str(summary_path),
                    "runner_result": {"runner": "custom", "exit_code": 0},
                }
            )

            self.assertTrue(result["runner_result"]["summary_exists"])
            self.assertEqual(Path(result["runner_result"]["summary_path"]).resolve(), summary_path.resolve())
            self.assertEqual(Path(result["runner_result"]["manifest_path"]).resolve(), manifest_path.resolve())
            self.assertEqual(result["runner_result"]["post_memory"]["next_session"], "3")

    def test_review_gate_reject_restores_memory_and_writes_review_notes(self) -> None:
        with tempfile.TemporaryDirectory(prefix="langgraph-review-reject-") as temp_dir:
            project_root = Path(temp_dir)
            memory_path = project_root / "memory.md"
            memory_path.write_text(
                "\n".join(
                    [
                        "## Session Status",
                        "- current_phase: development",
                        "- last_completed_session: 5",
                        "- last_completed_session_tests: passed",
                        "- next_session: 6",
                        "- next_session_prompt: `session-6-prompt.md`",
                        "- session_gate: ready",
                    ]
                )
                + "\n",
                encoding="utf-8",
            )

            # Simulate a runner that already advanced memory to session 7 before customer rejection.
            memory_path.write_text(
                memory_path.read_text(encoding="utf-8")
                .replace("- last_completed_session: 5", "- last_completed_session: 6")
                .replace("- next_session: 6", "- next_session: 7")
                .replace("- next_session_prompt: `session-6-prompt.md`", "- next_session_prompt: `session-7-prompt.md`"),
                encoding="utf-8",
            )

            with mock.patch("vibecoding_langgraph.graph.interrupt", return_value={"decision": "reject", "reason": "need more tests"}):
                result = review_gate(
                    {
                        "project_root": str(project_root),
                        "current_phase": "development",
                        "last_completed_session": "5",
                        "last_completed_session_tests": "passed",
                        "next_session": "6",
                        "next_session_prompt": "session-6-prompt.md",
                        "session_gate": "ready",
                        "approval_required": True,
                        "runner_payload": {
                            "session_prompt_path": str(project_root / "session-6-prompt.md"),
                        },
                        "runner_result": {
                            "exit_code": 0,
                            "skipped": False,
                            "summary_exists": True,
                        },
                    }
                )

            memory_text = memory_path.read_text(encoding="utf-8")
            self.assertEqual(result["approval_decision"], "reject")
            self.assertEqual(result["session_gate"], "blocked")
            self.assertIn("- last_completed_session: 5", memory_text)
            self.assertIn("- next_session: 6", memory_text)
            self.assertIn("- next_session_prompt: `session-6-prompt.md`", memory_text)
            self.assertIn("- session_gate: blocked", memory_text)
            self.assertIn("- review_notes: need more tests", memory_text)

    def test_review_gate_allows_timeout_candidate_summary(self) -> None:
        with tempfile.TemporaryDirectory(prefix="langgraph-review-timeout-candidate-") as temp_dir:
            project_root = Path(temp_dir)
            session_prompt = project_root / "session-1-prompt.md"
            session_prompt.write_text("memory 更新：\n- `last_completed_session: 1`\n", encoding="utf-8")

            with mock.patch(
                "vibecoding_langgraph.graph.interrupt",
                return_value={"decision": "approve"},
            ) as interrupt_mock:
                result = review_gate(
                    {
                        "project_root": str(project_root),
                        "next_session": "1",
                        "approval_required": True,
                        "runner_payload": {
                            "session_prompt_path": str(session_prompt),
                        },
                        "runner_result": {
                            "exit_code": 124,
                            "skipped": False,
                            "summary_exists": True,
                            "summary_path": str(project_root / "artifacts" / "session-1-summary.md"),
                        },
                    }
                )

            self.assertEqual(result["approval_decision"], "approve")
            interrupt_mock.assert_called_once()

    def test_persist_workflow_files_updates_memory_for_approved_timeout_candidate(self) -> None:
        with tempfile.TemporaryDirectory(prefix="langgraph-persist-approved-timeout-") as temp_dir:
            project_root = Path(temp_dir)
            memory_path = project_root / "memory.md"
            task_path = project_root / "task.md"
            session_prompt = project_root / "session-1-prompt.md"
            summary_path = project_root / "artifacts" / "session-1-summary.md"
            summary_path.parent.mkdir(parents=True, exist_ok=True)
            summary_path.write_text("# Summary\n", encoding="utf-8")
            task_path.write_text("## Title\n- Persist Locator Demo\n", encoding="utf-8")
            memory_path.write_text(
                "\n".join(
                    [
                        "## Session Status",
                        "- current_phase: development",
                        "- last_completed_session: 0",
                        "- last_completed_session_tests: passed",
                        "- next_session: 1",
                        "- next_session_prompt: `session-1-prompt.md`",
                        "- session_gate: ready",
                        "- review_notes: stale reject note",
                    ]
                )
                + "\n",
                encoding="utf-8",
            )
            session_prompt.write_text(
                "\n".join(
                    [
                        "本次只做 Session 1。",
                        "",
                        "memory 更新：",
                        "- `last_completed_session: 1`",
                        "- `next_session: 2`",
                        "- `next_session_prompt: session-2-prompt.md`",
                        "- `session_gate: ready`",
                    ]
                )
                + "\n",
                encoding="utf-8",
            )

            state = {
                "project_root": str(project_root),
                "current_phase": "development",
                "last_completed_session": "0",
                "last_completed_session_tests": "passed",
                "next_session": "1",
                "next_session_prompt": "session-1-prompt.md",
                "session_gate": "ready",
                "approval_required": True,
                "approval_decision": "approve",
                "runner_payload": {
                    "session_prompt_path": str(session_prompt),
                },
                "runner_result": {
                    "run_id": "timeout-candidate",
                    "exit_code": 124,
                    "skipped": False,
                    "summary_exists": True,
                    "summary_path": str(summary_path),
                    "post_memory": {
                        "current_phase": "development",
                        "last_completed_session": "0",
                        "last_completed_session_tests": "passed",
                        "next_session": "1",
                        "next_session_prompt": "session-1-prompt.md",
                        "session_gate": "ready",
                    },
                },
            }

            persisted = persist_workflow_files(
                state,
                {
                    "configurable": {
                        "thread_id": "thread-history-1",
                        "checkpoint_id": "checkpoint-history-1",
                        "parent_checkpoint_id": "checkpoint-history-0",
                    }
                },
            )
            routed = route_next({**state, **persisted})
            memory_text = memory_path.read_text(encoding="utf-8")
            loop_log = project_root / "outputs" / "session-logs" / "vibecoding-loop.jsonl"
            loop_log_lines = [
                json.loads(line)
                for line in loop_log.read_text(encoding="utf-8").splitlines()
                if line.strip()
            ]
            self.assertEqual(len(loop_log_lines), 1)
            loop_entry = loop_log_lines[0]

            self.assertIn("- last_completed_session: 1", memory_text)
            self.assertIn("- last_completed_session_tests: passed", memory_text)
            self.assertIn("- next_session: 2", memory_text)
            self.assertIn("- next_session_prompt: `session-2-prompt.md`", memory_text)
            self.assertNotIn("- review_notes: stale reject note", memory_text)
            self.assertIsNone(persisted["review_notes"])
            self.assertIsNone(persisted["rejection_reason"])
            self.assertEqual(loop_entry["thread_id"], "thread-history-1")
            self.assertEqual(loop_entry["checkpoint_id"], "checkpoint-history-1")
            self.assertEqual(loop_entry["parent_checkpoint_id"], "checkpoint-history-0")
            self.assertEqual(loop_entry["session_number"], 1)
            self.assertEqual(loop_entry["session_prompt"], "session-1-prompt.md")
            self.assertEqual(loop_entry["session_prompt_path"], str(session_prompt))
            self.assertEqual(loop_entry["approval_required"], True)
            self.assertEqual(loop_entry["approval_decision"], "approve")
            self.assertIsNotNone(loop_entry["recorded_at"])
            self.assertEqual(routed["session_gate"], "ready")
            self.assertEqual(routed["last_completed_session"], "1")
            self.assertEqual(routed["next_session"], "2")

    def test_route_next_blocks_when_runner_does_not_advance_memory(self) -> None:
        result = route_next(
            {
                "session_gate": "ready",
                "next_session": "5",
                "runner_result": {
                    "exit_code": 0,
                    "skipped": False,
                    "post_memory": {
                        "session_gate": "ready",
                        "next_session": "5",
                    },
                },
            }
        )
        self.assertEqual(result["session_gate"], "blocked")
        self.assertEqual(result["next_session"], "5")

    def test_graph_e2e_advances_only_one_session_per_run(self) -> None:
        with tempfile.TemporaryDirectory(prefix="langgraph-graph-e2e-") as temp_dir:
            project_root = Path(temp_dir) / "session8-smoke-project"
            shutil.copytree(FIXTURE_ROOT, project_root)
            for session_num in (5, 6):
                for suffix in ("summary.md", "manifest.json"):
                    path = project_root / "artifacts" / f"session-{session_num}-{suffix}"
                    if path.exists():
                        path.unlink()
            loop_log = project_root / "outputs" / "session-logs" / "vibecoding-loop.jsonl"
            if loop_log.exists():
                loop_log.unlink()

            command_template = " ".join(
                [
                    "python3",
                    str(MOCK_RUNNER),
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

            self.assertEqual(result["current_phase"], "development")
            self.assertEqual(result["session_gate"], "ready")
            self.assertEqual(result["last_completed_session"], "5")
            self.assertEqual(result["next_session"], "6")
            self.assertEqual(result["runner_result"]["summary_exists"], True)
            self.assertTrue((project_root / "artifacts" / "session-5-summary.md").exists())
            self.assertTrue((project_root / "artifacts" / "session-5-manifest.json").exists())
            self.assertFalse((project_root / "artifacts" / "session-6-summary.md").exists())
            self.assertFalse((project_root / "artifacts" / "session-6-manifest.json").exists())


if __name__ == "__main__":
    unittest.main()
