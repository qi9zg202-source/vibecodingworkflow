# LangGraph Runtime Contract

> 2026-03-17 设计更新：本合同同步到“LangGraph 常驻服务 + 单 session 显式触发 + 人工验收后才推进”的目标运行时。

## Scope

- 本文档定义 LangGraph Local Server 提供给 VS Code 插件消费的稳定接口。
- 替代过渡期的 `python-driver-contract.md`。
- `memory.md` 仍然是唯一业务状态源；LangGraph Server 是执行运行时。
- 插件应优先消费 LangGraph HTTP API 返回的状态，不应自行解析 markdown 作为推进依据。

## Server

- 默认地址：`http://localhost:2024`
- 启动方式：`langgraph dev`
- 推荐形态：作为本地常驻服务运行，由 UI / 脚本显式触发单次 run
- 配置文件：`langgraph.json`
- Graph 入口：`src/vibecoding_langgraph/graph.py:graph`

## Daemon Introspection

- LangGraph thread state 只描述 workflow/run 状态，不直接承担守护进程托管元数据。
- VS Code 插件应额外探测本地 LangGraph 守护进程信息，并与 thread state 一起展示。
- 推荐探测入口：仓库根目录 `start-langgraph-dev.sh status-json`
- 推荐展示字段：
  - `manager`: `launchd | nohup | manual | unknown`
  - `lifecycle`: `online | offline | starting | error`
  - `pid`
  - `launchd_loaded`
  - `autostart_installed`
  - `pid_file`
  - `stdout_log` / `stderr_log`
  - `launchd_stdout_log` / `launchd_stderr_log`
  - `launchd_plist`

Interpretation:

- `manager` / `lifecycle` 解决“LangGraph run 已结束，但本地 server 是否还在守护”这个问题。
- 这些字段属于本机运行时托管层，不应写回 `memory.md`。
- UI 必须把 `daemon state`、`run state`、`workflow gate` 分开，避免误读。

## thread_id 设计

```text
thread_id = stable_uuid_v5_like(project_root + ":" + task_identifier)
```

- 一个 task 对应一个 thread
- 跨天、跨次执行复用同一 `thread_id`
- LangGraph checkpoint 保证可续跑
- 真实 `langgraph dev` 当前要求 `thread_id` 是 UUID；不能直接发送纯十六进制 sha1 字符串

## API 接口

### 1. 读取 Workflow 状态

```text
GET /threads/{thread_id}/state
```

Response（关键字段）：

```json
{
  "values": {
    "project_root": "/path/to/project",
    "current_phase": "design | development | done",
    "session_gate": "ready | blocked | in_progress | done",
    "next_session": "3",
    "next_session_prompt": "session-3-prompt.md",
    "last_completed_session": "2",
    "last_completed_session_tests": "passed",
    "run_id": "...",
    "run_status": "pending | running | interrupted | success | error",
    "approval_required": true,
    "runner_result": null
  },
  "next": [],
  "metadata": { "thread_id": "..." }
}
```

Interpretation:

- `values.session_gate` = business/workflow gate derived from `memory.md`
- `runs.status` = runtime execution status (`pending | running | interrupted | success | error`)
- `runs.status = interrupted` is the preferred runtime signal for “waiting for customer acceptance”
- do not treat `session_gate` as a node-level or subprocess-level runtime status

### 2. 触发执行

```text
POST /threads/{thread_id}/runs
```

Request body：

```json
{
  "input": {
    "project_root": "/path/to/project"
  }
}
```

Response：

```json
{
  "run_id": "...",
  "status": "pending | running | interrupted | success | error"
}
```

Design rules:

- 单次 `POST /runs` 只提交一次执行请求，不应隐式批量推进多个 sessions
- LangGraph 根据 `memory.md` 的 `next_session` / `next_session_prompt` 决定本次执行哪个 session
- runner 成功只代表“本次尝试执行完毕”，不代表“业务状态已推进”

### 3. HITL Resume（审批后继续）

```text
POST /threads/{thread_id}/runs/{run_id}/resume
```

兼容性说明：

- 目标合同仍以显式 `/{run_id}/resume` 表达 HITL 续跑语义。
- 但截至 2026-03-17，本机 `langgraph-api 0.7.71` 的 OpenAPI 公开的是 `POST /threads/{thread_id}/runs` + `command.resume`，未列出单独的 `/{run_id}/resume` 路径。
- 插件实现应优先尝试目标路径；若 server 返回 404，可回退到 `command.resume` 兼容当前本地开发版。
- 当前本机 `langgraph-api 0.7.71` 的 `command.resume` 请求体仍要求显式携带 `assistant_id`。

Request body（批准）：

```json
{
  "resume": {
    "decision": "approve"
  }
}
```

`langgraph-api 0.7.71` fallback 兼容体：

```json
{
  "assistant_id": "vibecoding_workflow",
  "command": {
    "resume": {
      "decision": "approve"
    }
  }
}
```

批准后的目标行为：

- 写 `artifacts/session-N-summary.md`
- 写 `artifacts/session-N-manifest.json`
- 更新 `memory.md` 到下一轮 `next_session`
- 若为最终轮，更新 `current_phase: done`，`session_gate: done`

Request body（驳回）：

```json
{
  "resume": {
    "decision": "reject",
    "reason": "summary 不完整，需补充测试结果"
  }
}
```

`langgraph-api 0.7.71` fallback 兼容体：

```json
{
  "assistant_id": "vibecoding_workflow",
  "command": {
    "resume": {
      "decision": "reject",
      "reason": "summary 不完整，需补充测试结果"
    }
  }
}
```

驳回后的目标行为：

- 保持 `memory.md` 的当前 `next_session` 不推进
- 把原因写入 `review_notes` / `rejection_reason`
- 允许外部先更新 `PRD.md`、`design.md`、`task.md`
- 必要时重生成 `work-plan.md` 与当前/后续 `session-N-prompt.md`
- 修改完成后重新 `POST /runs`

### 4. 查询执行状态

```text
GET /threads/{thread_id}/runs/{run_id}
```

Response：

```json
{
  "run_id": "...",
  "status": "pending | running | interrupted | success | error",
  "error": null
}
```

真实约束（2026-03-17，本机 `langgraph-api 0.7.71`）：

- review wait 不体现在 `GET /threads/{thread_id}/runs/{run_id}` 的 `status=interrupted`；该接口在 interrupt 后仍可能返回 `success`。
- 更可靠的等待判据是 `GET /threads/{thread_id}/state` 中存在带 `interrupts` 的 task；`state.next` 单独非空并不充分，因为普通节点切换期间也可能短暂非空。

## LangGraph 节点状态（WorkflowRuntimeState）

```python
class WorkflowRuntimeState(TypedDict):
    project_root: str
    runner_command_template: str | None
    runner_command_env: dict | None
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

## `memory.md` 与 `WorkflowRuntimeState` 对照

`memory.md` 是业务状态源，`WorkflowRuntimeState` 是执行运行时状态。两者可以映射，但不合并。

| `memory.md` 字段/区块 | `WorkflowRuntimeState` / LangGraph 字段 | 说明 |
|---|---|---|
| `current_phase` | `current_phase` | 当前 workflow 阶段，如 `design` / `development` / `done` |
| `next_session` | `next_session` | 下一轮应进入的 Session 编号 |
| `next_session_prompt` | `next_session_prompt` | 下一轮应执行的 prompt 文件名 |
| `session_gate` | `session_gate` | 当前是否允许推进；这是业务 gate，不是节点运行结果 |
| `last_completed_session` | `last_completed_session` | 最近正式完成并通过的 Session |
| `last_completed_session_tests` | `last_completed_session_tests` | 最近正式完成 Session 的测试结论 |
| `review_notes` | `rejection_reason` / interrupt payload | 人工驳回或补充意见 |
| `Session Artifacts` | `expected_summary_path` / `previous_summary_path` | runtime 只引用路径，不替代 artifact 本身 |

### Only Runtime Owns

下面这些字段属于 LangGraph 执行运行时，不应写回 `memory.md` 作为业务真相：

- `runner_payload`
- `runner_result`
- checkpoint / thread state
- node-level execution progress
- subprocess stdout / stderr
- interrupt waiting status

## Design Rule

- `memory.md` answers: "workflow 现在官方进行到哪里"
- `WorkflowRuntimeState` answers: "这次执行现在跑到哪里"
- 运行成功不等于 workflow 已推进；只有 summary、tests、customer review 和 `memory.md` 更新完成后，业务状态才算正式推进
- 客户驳回后，允许先修改 `PRD.md` / `design.md` / `task.md`，再重算 `work-plan.md` 和当前 session prompt

## 执行图节点

| 节点 | 职责 |
|---|---|
| `load_workflow_state` | 读 memory.md / task.md / design.md / work-plan.md，构造 state |
| `select_session` | 判断 session_gate，路由到 ready / blocked / done |
| `build_runner_input` | 组装 startup-prompt + session-N-prompt + previous summary |
| `pre_run_review_gate` | 可选：运行前审批，确认本次要执行的 session |
| `run_session_task` | subprocess 调 Claude Code / Codex CLI（新进程 = fresh context） |
| `collect_outputs` | 检查 session-N-summary.md + manifest.json + tests 结果 |
| `post_run_review_gate` | runner 完成后调用 `interrupt()`，等待客户 approve / reject |
| `persist_workflow_files` | approve 后幂等写 memory.md / summary / manifest |
| `route_next` | 决定 done / blocked / 等待下一次触发；不自动批量推进后续 session |

## Workflow 状态值

| 字段 | 合法值 |
|---|---|
| `current_phase` | `design` / `development` / `done` |
| `session_gate` | `ready` / `blocked` / `in_progress` / `done` |
| `last_completed_session_tests` | `n/a` / `passed` / `failed` / `blocked` |
| `approval_decision` | `approve` / `reject` / `null` |

Notes:

- `session_gate` is the business gate used for workflow advancement.
- `run.status` is the runtime execution status returned by LangGraph runs APIs.
- 在本机 `langgraph-api 0.7.71` 上，run 进入 review wait 后 `run.status` 仍可能保持 `success`。
- review wait 应优先通过 thread state 的 interrupt tasks 判断，而不是仅依赖 run status。

## Plugin Consumption Rules

- 状态栏主 workflow 状态应来自 `session_gate`：`ready | blocked | done | invalid`
- runner 运行态单独显示：`pending | running | interrupted | success | error`
- 插件不能因为本地缓存而覆盖 LangGraph state 结果
- `memory.md` 的业务状态与 LangGraph checkpoint 的运行时状态不合并，不互相替代

## Server 存活策略

- Extension 激活时检查 `GET http://localhost:2024/ok`
- 若 server 不在线，提示用户运行 `langgraph dev` 或通过插件配置 server URL
- 过渡期：若 LangGraph server 不可用，可降级到 Python driver fallback

## Validation Status

- 接口定义更新日期：2026-03-17
- 当前文档描述的是目标运行时合同
- 当前实现若仍未完全具备 post-run review gate，应按此合同继续演进
