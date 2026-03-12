# design

## Goal
- 定义 VS Code 插件与 Python 调度器的模块边界
- 定义状态读取、命令触发、结果展示的输入输出
- 定义首版可验证架构，避免插件演化成新的状态机

## Architecture

### UI Layer
- VS Code command palette commands
- status bar item
- notification / quick pick / output channel
- file open helpers for `memory.md`、`startup-prompt.md`、`session-N-prompt.md`

### Runtime Layer
- extension activation
- workspace workflow detection
- command handlers
- integrated terminal launch

### Driver Layer
- TypeScript wrapper for calling Python CLI
- argument construction
- stdout / stderr collection
- JSON result parsing

### Workflow Truth Layer
- `memory.md` is the only state source
- `startup-prompt.md` is the mandatory entry prompt
- `run-vibecoding-loop.py` remains the orchestration engine

## Rules
- 先分层，后结论
- 先证据，后汇总
- 插件不保存 workflow 真相状态
- 插件不能绕过 `startup-prompt.md` 推进 Session
- 插件不能绕过 `memory.md` 自己决定 next session
- Python core + VS Code UI shell 是固定推荐架构

## Responsibility Boundary

### VS Code Extension Owns
- workspace 内 workflow 文件存在性检查
- 用户命令入口
- 调用 Python driver
- 把结果投射为状态栏、通知、输出面板
- 打开相关文件与终端

### Python Driver Owns
- 读取 `memory.md`
- 校验 `Session Status`
- 判断 `ready` / `blocked` / `done`
- 输出 `next_session`、`next_session_prompt`
- 记录 loop log

### Explicitly Not Owned By Extension
- session routing truth
- next session advancement policy
- memory schema truth
- test gate truth
- chat continuation policy

## Primary States
- `ready`: 允许启动 fresh session，但仍必须从 `startup-prompt.md` 进入
- `blocked`: 当前不能推进，插件只提示原因并引导打开 `memory.md`
- `done`: workflow 已结束
- `invalid`: 文件缺失、脚本异常、JSON 输出不合法

## Key Interaction Flows

### Flow A: Refresh Status
1. 用户执行 `VibeCoding: Refresh Workflow Status`
2. 插件确认当前 workspace 包含最小 workflow 文件
3. 插件调用 Python driver 的 inspect mode
4. Python 返回 machine-readable result
5. 插件更新状态栏与输出面板

### Flow B: Prepare Fresh Session
1. 用户执行 `VibeCoding: Prepare Fresh Session`
2. 插件调用 Python driver
3. 若结果为 `ready`，插件展示：
- `next_session`
- `next_session_prompt`
- `startup-prompt.md`
4. 插件提供动作：
- 打开 `startup-prompt.md`
- 打开 `memory.md`
- 在 terminal 启动 runner

### Flow C: Blocked State
1. Python 返回 `blocked`
2. 插件显示阻塞原因和关键字段
3. 插件推荐动作是打开 `memory.md`
4. 插件不展示“进入下一 Session”类快捷动作

## Command Design
- `VibeCoding: Refresh Workflow Status`
- `VibeCoding: Open Memory`
- `VibeCoding: Open Startup Prompt`
- `VibeCoding: Open Next Session Prompt`
- `VibeCoding: Prepare Fresh Session`
- `VibeCoding: Start Runner In Terminal`
- `VibeCoding: Open Loop Log`
- `VibeCoding: Configure Python Driver Path`

## Status Bar Design
- 文案建议：
- `Vibe: S3 | ready`
- `Vibe: S3 | blocked`
- `Vibe: done`

- hover 建议展示：
- `last_completed_session`
- `last_completed_session_tests`
- `next_session`
- `next_session_prompt`
- `session_gate`
- last refresh time

- 点击行为：
- 打开 quick pick 或直接触发 `Prepare Fresh Session`

## Driver Interface Proposal

### Input
- `project_root`
- `action`
- `runner_cmd`
- `dry_run`
- `print_startup`
- `json`

### Output
- `status`
- `inputs`
- `artifacts`
- `checks`
- `risks`
- `next_action`

### Required Payload Fields
- `session_gate`
- `next_session`
- `next_session_prompt`
- `last_completed_session`
- `last_completed_session_tests`
- `startup_prompt_path`
- `memory_path`
- `loop_log_path`
- `message`

## Data Contract Guidance
- 插件不要自己重新解析 markdown 作为主路径。
- 插件应优先消费 Python 返回的 JSON。
- 若要做 fallback markdown parse，也只能用于“提示文件缺失/格式异常”，不能作为推进依据。

## Validation Path
- 结构校验：workspace 文件完整
- 命令校验：插件能正常调用 Python
- 输出校验：JSON 字段齐全且状态正确
- UX 校验：`blocked` 时没有误导动作，`ready` 时始终引导用户回到 `startup-prompt.md`

## Current Implementation Snapshot

### Completed Sessions
- Session 0 到 Session 10 已落地。

### Current Source Layout
- `vscode-ext/src/driver/`
- `vscode-ext/src/workspace/`
- `vscode-ext/src/ui/`
- `vscode-ext/src/extension.ts`

### Implemented Commands
- `Refresh Workflow Status`
- `Open Memory`
- `Open Startup Prompt`
- `Open Next Session Prompt`
- `Prepare Fresh Session`
- `Start Runner In Terminal`
- `Open Loop Log`
- `Configure Python Driver Path`

### Current Runtime Behavior
- workflow 探测依赖 `startup-prompt.md` 与 `memory.md` 存在性。
- next session prompt 解析只依赖 Python driver 的 JSON 返回。
- terminal runner 启动前会再次走 `prepare` 校验。
- 错误态通过 output channel + status bar + actionable message 收口。
- extension 激活后会注册 terminal lifecycle handler 与 workflow polling。
- polling timer 与 listener 的清理统一通过 `context.subscriptions` 管理；独立 Node 集成脚本必须在 `finally` 中执行 teardown，避免脚本打印 `passed` 后仍因 open handle 挂起。

### Verified Evidence
- Session 8 已通过真实 workflow fixture + mock VS Code API 的整链路 smoke。
- Session 9 已通过边界回归样例验证：
- `blocked`
- bad python path
- missing runner template
- invalid JSON driver
- missing workflow file
- Session 10 已完成文档收尾。
- Session 11 已通过双 workflow 真实业务场景 smoke。
- 2026-03-12 已重新执行编译与三组集成脚本验证，并确认 `smoke:session8`、`regression:session9`、`smoke:session11` 在写出报告后可自行退出，不再残留 polling timer 导致的挂起。
- 证据文件：
- `artifacts/session8-smoke-report.json`
- `artifacts/session9-regression-report.json`
- `artifacts/session11-real-scenario-report.json`
- `artifacts/session10-closeout-report.md`
