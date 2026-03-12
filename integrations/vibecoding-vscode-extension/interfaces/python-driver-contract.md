# Python Driver Contract

## Scope
- 本文档定义 `run-vibecoding-loop.py` 在 Session 2 后提供给 VS Code 插件消费的稳定接口。
- 插件应优先消费 JSON 输出，不应自行把 markdown 解析结果当成推进依据。
- `memory.md` 仍然是唯一状态源，Python driver 仍然是唯一 orchestration engine。

## Driver Path
- 当前核心脚本：
- `/Users/beckliu/Documents/0agentproject2026/vibecodingworkflow/scripts/run-vibecoding-loop.py`

## CLI Inputs
- `project_root`
- `--action auto|inspect|prepare|run`
- `--runner-cmd <template>`
- `--loop-log <path>`
- `--dry-run`
- `--print-startup`
- `--json`

## Action Semantics
- `inspect`
- 只检查 workflow 状态，不执行 runner
- 成功时返回 `status=ready|blocked|done`

- `prepare`
- 读取 workflow 状态并准备 fresh-session handoff
- 不执行 runner
- 成功时仍返回 `status=ready`，由 `effective_action=prepare` 区分

- `run`
- 需要 `--runner-cmd`
- 在 workflow 可推进时执行外部 runner

- `auto`
- 兼容旧行为
- 有 `--runner-cmd` 时等价于 `run`
- 无 `--runner-cmd` 时等价于 `prepare`

## JSON Result Schema

### Top-Level Fields
- `schema_version`
- `status`
- `message`
- `exit_code`
- `requested_action`
- `effective_action`
- `project_root`
- `session_gate`
- `next_session`
- `next_session_prompt`
- `last_completed_session`
- `last_completed_session_tests`
- `inputs`
- `artifacts`
- `checks`
- `risks`
- `next_action`
- `error`
- `runner_exit_code` when applicable

### Status Values
- `ready`
- `blocked`
- `done`
- `dry_run`
- `runner_finished`
- `runner_failed`
- `invalid`

### inputs
- `project_root`
- `requested_action`
- `effective_action`
- `runner_cmd_provided`
- `dry_run`
- `print_startup`
- `json`

### artifacts
- `startup_prompt_path`
- `memory_path`
- `loop_log_path`
- `next_session_prompt_path`
- `runner_command`
- `startup_prompt_contents`

### checks
- `current_phase`
- `session_gate`
- `next_session`
- `next_session_prompt`
- `last_completed_session`
- `last_completed_session_tests`
- `may_advance`
- `is_done`

### next_action
- `type`
- `message`

### error
- `code`
- `message`
- `details`

## Workflow-State Rules
- `ready` 表示 workflow 允许 fresh session 继续，但仍必须通过 `startup-prompt.md` 进入。
- `blocked` 表示 `memory.md` 当前不允许推进，插件应引导用户查看 `memory.md`，不能展示误导推进动作。
- `done` 表示流程已结束。
- `invalid` 表示输入、文件、状态格式或调用方式不满足 contract。

## Exit Code Strategy
- `0`
- driver 成功完成，包括 `ready`、`done`、`dry_run`、`runner_finished`

- `2`
- workflow blocked

- `3`
- invalid input / invalid workflow state / missing files / bad contract usage

- `4`
- runner failed in JSON mode

## Error Codes
- `missing_required_files`
- `memory_missing_status_keys`
- `missing_runner_command`
- `python_not_found`
- `driver_invalid_json`
- `driver_invalid_payload`
- `driver_execution_failed`

## Example: inspect ready
```json
{
  "schema_version": "1.0",
  "status": "ready",
  "message": "Workflow is ready for a fresh session.",
  "exit_code": 0,
  "requested_action": "inspect",
  "effective_action": "inspect",
  "project_root": "/path/to/project",
  "session_gate": "ready",
  "next_session": "3",
  "next_session_prompt": "session-3-prompt.md",
  "last_completed_session": "2",
  "last_completed_session_tests": "passed",
  "inputs": {},
  "artifacts": {},
  "checks": {},
  "risks": [],
  "next_action": {
    "type": "open_startup_prompt",
    "message": "Start a fresh session and enter through startup-prompt.md."
  },
  "error": null
}
```

## Plugin Consumption Rules
- 状态栏只应以 `ready|blocked|done|invalid` 作为主 workflow 状态。
- `prepare` 不是新的 workflow 状态，而是 `effective_action=prepare` 的一种成功调用。
- `runner_finished` 和 `runner_failed` 属于运行结果，不应替代 workflow truth。
- 插件不能因为本地缓存而覆盖 `memory.md` 结果。

## Validation Status
- Session 8 已使用真实 workflow fixture 完成 smoke 联调。
- Session 9 已完成边界回归验证。
- Session 10 已完成收尾文档整理。
- Session 11 已完成双 workflow 真实场景验证。
- 2026-03-12 已重新执行插件编译、smoke、regression 与真实场景脚本，并确认测试宿主 teardown 已补齐，脚本不会在写出报告后残留 open handle。
- 已验证链路：
- `compile`
- `inspect`
- `prepare`
- `open memory`
- `open startup prompt`
- `open next session prompt`
- `open loop log`
- `start runner in terminal`
- 已验证边界：
- `blocked`
- `python_not_found`
- `driver_invalid_json`
- missing runner template
- missing workflow file
- 证据文件：
- `artifacts/session8-smoke-report.json`
- `artifacts/session9-regression-report.json`
- `artifacts/session11-real-scenario-report.json`
- `artifacts/session10-closeout-report.md`
