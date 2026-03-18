# design

> 2026-03-17 设计更新：本设计文档对齐“LangGraph 常驻服务 + 单 session 显式触发 + 每个 session 必须人工验收”的目标架构。

## Goal

- 定义 VS Code 插件与 LangGraph Local Server 的模块边界
- 定义状态读取、命令触发、结果展示的输入输出
- 防止插件演化成新的 workflow 状态机
- 明确客户验收在 LangGraph runtime 与 `memory.md` 之间的责任分割

## Architecture

### UI Layer

- VS Code command palette commands
- status bar item
- Dashboard as the primary workflow control plane
- LangSmith Studio deep-link as the secondary graph inspection surface
- notification / quick pick / output channel
- file open helpers for `memory.md`、`startup-prompt.md`、`session-N-prompt.md`、`work-plan.md`

### Runtime Layer

- extension activation
- workspace workflow detection
- command handlers
- LangGraph server health check
- LangGraph Local Server 常驻进程探测与重连提示
- integrated terminal launch（当前用于承载 runner 模板与启动入口，不再代表 Python driver fallback）

### Driver Layer

- 当前基线：TypeScript wrapper for LangGraph Local Server REST API
  - `GET /threads/{thread_id}/state`
  - `POST /threads/{thread_id}/runs`
  - `GET /threads/{thread_id}/runs/{run_id}`
  - `POST /threads/{thread_id}/runs/{run_id}/resume`
  - 兼容本机 `command.resume` 回退
- 历史 Python driver 只保留为归档对照，不再作为设计中的活跃实现层

### Workflow Truth Layer

- `memory.md` is the only business state source
- `startup-prompt.md` is the mandatory human entry prompt
- `task.md` / `PRD.md` / `design.md` 定义业务和技术约束
- `work-plan.md` / `session-N-prompt.md` 是可修订的执行计划
- 客户验收通过前，不得推进 `memory.md` 到下一个 session

### Business Truth Vs Runtime State

- `memory.md` answers: workflow 从业务角度官方推进到哪里，下一轮是否允许进入下一个 session
- LangGraph runtime answers: 当前这次执行跑到哪个节点，runner 是否完成，是否等待人工验收，能否 interrupt / resume
- 两层必须同时存在，但不能互相替代
- 插件只能展示和转发这两层状态，不能合并后自己发明新的推进真相

### Dashboard Vs Studio

- VS Code Dashboard is the primary operator surface for workflow actions
- LangSmith Studio is the secondary inspection/debug surface for LangGraph internals
- Dashboard should expose business-facing actions:
  - start current session
  - approve current session
  - reject current session
  - open `memory.md` / `startup-prompt.md` / current `session-N-prompt.md` / summary / loop log
- Studio should be used for runtime-facing inspection:
  - thread history
  - node traversal
  - checkpoint / state inspection
  - fork / re-run-from-checkpoint / interrupt debugging
- Studio must not be treated as the default business console for “Session N 是否推进”
- Dashboard may provide a contextual deep-link into Studio, but business approval semantics still belong to the workflow UI shell

## LangGraph Execution Graph

目标节点结构：

```text
START
  ↓
load_workflow_state      # 读 memory.md / task.md / design.md / work-plan.md
  ↓
select_session           # 判断 session_gate: ready / blocked / in_progress / done
  ↓
build_runner_input       # 组装 startup-prompt + session-N-prompt + previous summary
  ↓
pre_run_review_gate      # 可选：运行前人工确认
  ↓
run_session_task         # subprocess: claude / codex（新进程 = fresh context）
  ↓
collect_outputs          # 检查 tests / candidate summary / manifest
  ↓
post_run_review_gate     # 默认：等待客户验收 approve / reject
  ↓
persist_workflow_files   # approve 后幂等写 summary / manifest / memory.md
  ↓
route_next               # done / ready / blocked
```

条件边：

- `select_session -> END`: `session_gate = done`
- `select_session -> END`: `session_gate = blocked` 且等待外部修订后再触发
- `post_run_review_gate -> persist_workflow_files`: `approve`
- `post_run_review_gate -> END`: `reject`
- `route_next -> END`: 每次 run 只完成一个 session 的官方推进，不自动批量推进后续 session

## Claude Invocation Policy

- `run_session_task` 调用 Claude CLI 时，统一带上 `claude --permission-mode plan`
- `opusplan` 的固定定义是：plan mode 用 Opus，execution 用 Sonnet
- 规划型运行默认采用 `opusplan`，包括 Session 0、方案拆解、重规划、复杂设计判断
- 落地执行默认使用 Sonnet，包括 Session 1+ 的实现、修复、回归和文档落盘
- 目标是把高成本推理集中在 Opus plan mode，把高频执行放到 Sonnet execution mode
- 若某一轮任务复杂度明显超出 Sonnet 适配范围，可按 session prompt 明确升级回 Opus

## Rules

- 先分层，后结论
- 先证据，后汇总
- 插件不保存 workflow 真相状态
- 插件不能绕过 `startup-prompt.md` 推进 Session
- 插件不能绕过 `memory.md` 自己决定 `next_session`
- 插件不能把 `run.status = success` 误展示为“workflow 已推进”
- `LangGraph Local Server + VS Code UI shell` 是固定推荐架构
- 历史 `run-vibecoding-loop.py` 已归档，不再扩展为主路径

## Responsibility Boundary

### VS Code Extension Owns

- workspace 内 workflow 文件存在性检查
- 用户命令入口
- 调用 LangGraph Local Server HTTP API
- 把结果投射为状态栏、通知、输出面板
- 打开相关文件与终端
- LangGraph server 存活检查与提示
- LangGraph 离线时对 approve / reject 的最小 `memory.md` 兼容写回
- 展示“等待验收”“可 approve / reject”“需要重跑当前 Session”这类 UI 动作
- 以 Session / artifact / gate 语义组织用户可见操作
- 提供跳转到 LangSmith Studio 的上下文入口，但不把 Studio 当作主控制台

### LangGraph Local Server Owns

- 读取 `memory.md`
- 校验 `Session Status`
- 判断 `ready` / `blocked` / `done`
- 节点编排与状态路由
- checkpoint / interrupt / resume
- 调 Claude Code / Codex CLI（subprocess）
- runner 完成后中断等待客户验收
- approve 后写 summary / manifest / 更新 `memory.md`
- reject 后保持当前 `next_session` 不推进
- 输出 `next_session`、`next_session_prompt`
- 记录 loop log

### Explicitly Not Owned By Extension

- session routing truth
- next session advancement policy
- memory schema truth
- test gate truth
- review acceptance truth
- LangGraph 节点内部逻辑
- LangGraph Studio 内部的调试能力定义

## LangGraph Runtime State

```python
class WorkflowRuntimeState(TypedDict):
    project_root: str
    task_title: str | None
    current_phase: str
    next_session: str
    next_session_prompt: str
    session_gate: str
    previous_summary_path: str | None
    expected_summary_path: str | None
    runner_payload: dict | None
    runner_result: dict | None
    approval_required: bool
    approval_decision: str | None
    rejection_reason: str | None
```

## `memory.md` / LangGraph State Mapping

| `memory.md` 字段/区块 | `WorkflowRuntimeState` / API 字段 | 设计含义 |
|---|---|---|
| `current_phase` | `current_phase` | 当前 workflow 阶段 |
| `next_session` | `next_session` | 下一轮应进入哪个 session |
| `next_session_prompt` | `next_session_prompt` | 下一轮 prompt 文件 |
| `session_gate` | `session_gate` | 业务 gate，决定是否允许推进 |
| `last_completed_session` | `last_completed_session` | 最近正式完成的 session |
| `last_completed_session_tests` | `last_completed_session_tests` | 最近正式完成 session 的测试结论 |
| `review_notes` | `rejection_reason` / interrupt payload | 人工 reject 的原因与补充说明 |
| `Session Artifacts` | `previous_summary_path` / `expected_summary_path` | runtime 只消费路径，不替代 artifact 本身 |

### Runtime-Only Fields

- `runner_payload`
- `runner_result`
- checkpoint / thread state
- node-level execution progress
- subprocess stdout / stderr
- interrupt waiting status

这些字段属于执行运行时，插件可以显示，但不能写回 `memory.md` 作为业务真相。

## Primary States

- `ready`: 允许启动当前 `next_session`
- `blocked`: 当前不能推进，需要先修订文档、计划或代码
- `done`: workflow 已结束
- `invalid`: 文件缺失、脚本异常、JSON 输出不合法

Important:

- 这里的 `ready / blocked / done` 指的是 workflow business state
- 不是 LangGraph run API 的 `pending / running / interrupted / success / error`
- `interrupted` 在目标设计里通常表示“等待客户验收”或“等待明确 resume 决策”
- 插件展示时必须把这两组状态分开

## Key Interaction Flows

### Flow A: Refresh Status

1. 用户执行 `VibeCoding: Refresh Workflow Status`
2. 插件确认当前 workspace 包含最小 workflow 文件
3. 插件调用 LangGraph `GET /threads/{thread_id}/state`
4. 返回 machine-readable result
5. 插件更新状态栏、Dashboard 和 Studio deep-link 上下文

### Flow B: Trigger Current Session

1. 用户执行 `VibeCoding: Start Current Session`
2. 插件先探测 LangGraph，必要时尝试自动启动本地服务
3. 插件调用 `POST /threads/{thread_id}/runs`
4. LangGraph 读取 `memory.md` 并执行当前 `next_session`
5. 插件展示 run runtime 状态

### Flow C: Waiting For Review

1. LangGraph run 进入 `interrupted`
2. 插件显示当前 Session、测试结果、候选产物位置
3. 插件提供动作：
- `Approve Current Session`
- `Reject Current Session`
- `Open PRD.md`
- `Open design.md`
- `Open task.md`
- `Open work-plan.md`
- `Open current session prompt`
- `Open current thread in Studio`

### Flow D: Reject / Rework Handling

1. 用户 reject 当前 Session
2. `memory.md` 保持当前 `next_session`
3. 用户可补充 `review_notes`
4. 用户可更新 `PRD.md` / `design.md` / `task.md`
5. Agent 或规划节点修订 `work-plan.md` 和当前/后续 `session-N-prompt.md`
6. 插件再次触发同一个 Session run

### Flow E: Approve / Closeout

1. 用户 approve 当前 Session
2. LangGraph 在线时，插件调用 `POST /runs/{run_id}/resume`（必要时兼容 `command.resume`）
3. LangGraph 离线时，仅回退到直接更新 `memory.md` 的兼容路径
4. LangGraph 写 summary / manifest / `memory.md`
5. 插件刷新状态
6. 若 `session_gate = ready`，界面提示可触发下一轮

## Session Timeline Inline Actions（2026-03-18）

### 设计决策

将 session-x-prompt.md 的状态机控制完全迁移到 VSCode Dashboard，LangGraph 作为纯执行引擎。Session 时间线表格每行提供上下文感知的内联操作按钮，替代原有的通用"管理/打开/Studio"按钮。

### 分层职责

| 层 | 职责 |
|---|---|
| LangGraph | 执行引擎：运行 session-x-prompt.md、维护 checkpoint、提供 interrupt/resume API |
| memory.md | 业务状态真相：session_gate、next_session |
| VSCode Dashboard | 产品级状态机控制面板：停止/重跑/通过/驳回 |

### 操作列布局

```
[停止] [重跑] [通过] [驳回]   ← 主操作行（上下文感知）
[打开] [Studio]               ← 次要操作行（始终可用）
```

### 状态-按钮映射

| SessionTimelineState | 停止 | 重跑 | 通过 | 驳回 |
|---|---|---|---|---|
| `running` / `starting` / `paused` | ✅ | — | — | — |
| `review` (interrupted) | — | — | ✅ | ✅ |
| `failed` / `blocked`（当前 session） | — | ✅ | — | — |
| `completed` / `ready` / `pending` / 历史行 | — | — | — | — |

重跑限制：仅对 `isCurrentSession === true` 的行启用，防止跳跃执行历史 session。

### 命令映射

| 按钮 | 命令 |
|---|---|
| 停止 | `vibeCoding.cancelWorkflowRunner` |
| 重跑 | `vibeCoding.activateWorkflowRunner` |
| 通过 | `vibeCoding.approveSession` |
| 驳回 | `vibeCoding.rejectSession` |

无需新增命令，全部复用已有注册命令。

### HITL Banner 变更

顶部 `gate-pending-review` banner 移除 approve/reject 按钮，改为被动提示：`⏸ 等待人工验收 — 请在下方 Session 时间线中操作`。避免与行内按钮重复。

### 实现文件

- `vscode-ext/src/ui/dashboard.ts`：新增 CSS 类、`renderSessionRowActions()` 辅助函数、更新操作列、降级 HITL banner

---

## Current Implementation Snapshot

截至 2026-03-17，当前实现已经把下面这些设计点落到代码：

- `vscode-ext/src/driver/langgraphDriver.ts`
  - LangGraph HTTP 读写
  - daemon 状态探测
  - Studio deep-link 所需 thread/run 元数据映射
- `vscode-ext/src/ui/sessionRuntimeInspector.ts`
  - Session 级运行时检查面板
  - approve / reject / rerun 动作入口
- `vscode-ext/src/ui/langGraphManager.ts`
  - task 级 thread 视图
  - Session 时间线、当前 run、summary / manifest 挂载
- `vscode-ext/src/extension.ts`
  - refresh / open files / start / approve / reject 主命令
  - LangGraph 自动探测与本地 auto-start
  - LangGraph 离线时的最小 review fallback

## Command Design

- `VibeCoding: Refresh Workflow Status`
- `VibeCoding: Open Memory`
- `VibeCoding: Open Startup Prompt`
- `VibeCoding: Open Next Session Prompt`
- `VibeCoding: Open Work Plan`
- `VibeCoding: Start Current Session`
- `VibeCoding: Approve Current Session`
- `VibeCoding: Reject Current Session`
- `VibeCoding: Open Loop Log`
- `VibeCoding: Configure LangGraph Server URL`

Notes:

- LangSmith Studio deep-link is a contextual runtime affordance, not a replacement for the Dashboard command set.
- No Studio-only action may become the sole path for business approval or next-session progression.

## Status Bar Design

- `Vibe: W ready | S3`
- `Vibe: W blocked | S3`
- `Vibe: W ready | R running | S3`
- `Vibe: W ready | R review | S3`
- `Vibe: workflow done`
- `Vibe: workflow invalid`

## Driver Interface

### 读取状态

- `GET http://localhost:2024/threads/{thread_id}/state`
- 返回 `WorkflowRuntimeState` + `memory.md` 解析结果
- 其中 `session_gate` 应按 business gate 解释，不应按运行态解释

### 触发执行

- `POST http://localhost:2024/threads/{thread_id}/runs`
- body: `{ "input": { "project_root": "..." } }`
- 单次 run 不应自动串行推进多个 sessions
- `run.status` 仅表示这次执行请求的运行态，不等于 workflow 已推进

### HITL Resume

- `POST http://localhost:2024/threads/{thread_id}/runs/{run_id}/resume`
- body: `{ "resume": { "decision": "approve" | "reject", "reason": "..." } }`
- `approve`: 进入 closeout，写 artifacts 和 `memory.md`
- `reject`: 本次 run 结束，等待文档修订后再次触发

### thread_id 计算

- `thread_id = sha1(project_root + ":" + task_identifier)`

## Data Contract Guidance

- 插件不要自己重新解析 markdown 作为主路径。
- 插件应优先消费 LangGraph API 返回的状态。
- fallback markdown parse 只能用于提示文件缺失/格式异常，不能作为推进依据。

## Validation Path

- 结构校验：workspace 文件完整
- 命令校验：插件能正常调用 LangGraph Server
- 输出校验：状态字段齐全且正确
- UX 校验：`blocked` 时没有误导动作，`interrupted` 时提供 approve / reject，`ready` 时提供触发当前 Session

## Current Implementation Snapshot

### Source Layout

- `vscode-ext/src/driver/`
- `vscode-ext/src/workspace/`
- `vscode-ext/src/ui/`
- `vscode-ext/src/extension.ts`

### Architecture Decision

- LangGraph Local Server 已替代 `run-vibecoding-loop.py`
- driver 层已完成从 Python CLI wrapper 到 LangGraph HTTP API wrapper 的迁移
- 当前交付口径为：LangGraph server 常驻、每次 run 只执行一个 session、每个 session 需人工验收后才推进
- 参见：`plans/langgraph-direct-integration-evaluation.md`
