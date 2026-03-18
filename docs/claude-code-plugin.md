# VibeCoding VS Code Extension

> 2026-03-17 设计更新：本说明对齐“LangGraph Local Server 常驻 + 单 session 显式触发 + runner 完成后先人工验收”的执行模型。

## 定位

VS Code 插件是 VibeCoding 工作流的 IDE 集成层：

- 提供 Dashboard、状态栏、文件打开器、Approve / Reject 入口
- 提供 LangSmith Studio deep-link，便于查看 thread / node / checkpoint
- 调用 LangGraph Local Server 读取状态、触发执行、提交验收结论
- 不拥有 workflow 真相，不自行决定 `next_session`

业务真相与运行时真相分层如下：

- `memory.md`：官方 workflow 进度与业务 gate
- LangGraph runtime：本次 run 的执行状态、checkpoint、interrupt / resume
- VS Code 插件：展示这两层状态，并转发用户动作

## 整体架构

```text
VS Code Extension (UI Shell)
    │
    ├── Activity Bar / Dashboard / Status Bar
    ├── Open Memory / Work Plan / Session Prompt
    ├── Start Current Session
    └── Approve / Reject Current Session
         │
         ▼
LangGraph Local Server (Long-Running Runtime)
         │
         ├── GET /threads/{thread_id}/state
         ├── POST /threads/{thread_id}/runs
         └── POST /threads/{thread_id}/runs/{run_id}/resume
              │
              ▼
memory.md + work-plan.md + session-N-prompt.md
              │
              ▼
Runner subprocess (Codex / Claude Code)
```

历史 Python driver 已归档到 `scripts/archived/run-vibecoding-loop.py`，当前插件设计不再把它作为主路径；仅在 LangGraph 离线时保留极小范围的 `memory.md` 直写兜底。

## 核心执行规则

- LangGraph Local Server 应作为本地常驻服务运行
- Session 0 负责生成第一版 `work-plan.md` 与后续 `session-N-prompt.md`
- 每次 `POST /runs` 只执行一个“当前 Session 的一次 attempt”
- runner 完成后只代表“候选结果已产出”，不代表 workflow 已推进
- 必须先经过客户验收，再由 LangGraph 在 approve 路径下写 summary / manifest / `memory.md`
- 验收不通过时，允许先更新 `PRD.md` / `design.md` / `task.md`，再修订 `work-plan.md` 与当前/后续 prompt
- `memory.md` 只在验收通过后推进；reject 不推进 `next_session`

## 配置与依赖

### 前提

- VS Code >= 1.85
- 本机可访问 LangGraph Local Server，默认 `http://localhost:2024`
- workflow 项目包含 `memory.md`、`work-plan.md`、`session-N-prompt.md` 等标准文件

### 主要配置

| 设置项 | 作用 |
|---|---|
| `vibeCoding.langGraphServerUrl` | LangGraph Local Server 地址 |
| `vibeCoding.defaultProjectRoot` | 默认 workflow 根目录 |
| `vibeCoding.runnerCommandTemplate` | 触发当前 Session 时传给 LangGraph 的 runner 模板 |

补充说明：

- 当前实现仍保留部分历史设置项，但它们不再属于推荐设计基线。
- `Refresh Workflow Status` 与 `Start Runner In Terminal` 依赖 LangGraph 在线；插件会先探测服务状态，并尝试自动启动本地 `start-langgraph-dev.sh`。
- `Approve / Reject` 在线时走 LangGraph resume；离线时仅回退到直接更新 `memory.md` 的兼容路径。

## UI 组件

### Activity Bar / Dashboard

Dashboard 是主控制台，至少需要展示：

- workflow business state：`ready` / `blocked` / `done` / `invalid`
- runtime run state：`pending` / `running` / `interrupted` / `success` / `error`
- 当前 `next_session` 与 `next_session_prompt`
- 候选 summary / manifest / 测试结果路径
- Approve / Reject / 打开关键文档动作

Dashboard 中的 Session 时间线不能只显示“未执行 / 执行中 / 完成”三态。对客户可见的最小状态机应至少覆盖：

| 场景 | UI 状态 | 说明 |
|---|---|---|
| 当前 session 已就绪但还没点 Start | `待启动` | 等待用户显式触发，不是“未执行原因不明” |
| run 已创建但 runner 还没接管 | `排队中` / `启动中` | 正在从调度层切换到 runner |
| runner 正在执行 | `执行中` | 当前 session attempt 正在运行 |
| runner 被中止或挂起 | `已暂停` | 等待恢复或人工处理 |
| runner 产出候选结果后进入 interrupt | `待验收` | 等待 Approve / Reject |
| 上一次 run 失败 | `失败待重试` | 当前 session 还没重新开始 |
| reject 后 workflow 卡住 | `已阻塞` | 必须先处理 review notes |
| 后续 session 尚未轮到 | `等待前序` | 前序 session 未完成前不会自动开始 |

每个 session 行除了状态 pill，还应展示一句原因说明，例如“上一轮 run 失败，当前 session 尚未重新触发”或“当前 next_session 是 session-5，前序未完成前不会开始这里”。

Dashboard 负责业务动作，不负责替代 LangGraph 调试视图：

- 应在 Dashboard 中完成：
  - `Start Current Session`
  - `Approve / Reject Current Session`
  - 打开 `memory.md`、`startup-prompt.md`、当前 session prompt、summary、loop log
- 不应要求普通使用者进入 Studio 才能完成 session 推进

### LangSmith Studio

LangSmith Studio 是辅助调试界面，不是 workflow 主控制台。

- 适合：
  - 查看 thread history
  - 查看 node traversal / checkpoint / state
  - 做 fork、checkpoint rerun、interrupt 调试
- 不适合承担：
  - “当前该不该推进到下一个 Session”的主交互
  - 使用者视角下的主验收按钮入口

推荐实现：

- Dashboard 显示当前 `thread_id`、`run_id` 与 Studio deep-link
- 出现复杂运行时问题时再跳转到 Studio 深挖
- 默认用户路径仍然停留在 Dashboard

### Status Bar

状态栏必须把 workflow state 与 runtime state 分开显示，避免把“run 执行完成”误读为“业务状态已推进”。

推荐示例：

- `Vibe: W ready | S3`
- `Vibe: W blocked | S3`
- `Vibe: W ready | R running | S3`
- `Vibe: W ready | R review | S3`
- `Vibe: workflow done`

其中：

- `W ...` 来自 `memory.md` 对应的业务 gate
- `R ...` 来自 LangGraph run API 的运行时状态

## 命令设计

推荐主命令：

- `VibeCoding: Refresh Workflow Status`
- `VibeCoding: Open Memory`
- `VibeCoding: Open Startup Prompt`
- `VibeCoding: Open Work Plan`
- `VibeCoding: Open Next Session Prompt`
- `VibeCoding: Start Runner In Terminal`
- `VibeCoding: Approve Current Session`
- `VibeCoding: Reject Current Session`
- `VibeCoding: Open Loop Log`
- `VibeCoding: Configure LangGraph Server URL`

说明：

- 当前 UI 命令名仍保留 `Prepare Fresh Session` 与 `Start Runner In Terminal`，但其实现已经切换到 LangGraph read path / run path，而不是调用 Python driver。
- `Open in Studio` 更适合作为 Dashboard 中的上下文链接，而不是要求用户记忆的主命令。
- 若未来补充独立命令，也只应服务于运行时排障，不应承载业务审批语义。

## 标准使用流程

### 1. Refresh

插件调用 `GET /threads/{thread_id}/state`，读取：

- `current_phase`
- `session_gate`
- `next_session`
- `next_session_prompt`
- 最近已通过验收的 session 信息

### 2. Start Current Session

用户触发 `Start Runner In Terminal` 后：

- 插件先探测 LangGraph；若离线则尝试自动启动本地服务
- 只有 LangGraph 在线时才会真正触发 run
- LangGraph 读取 `memory.md`
- 只执行当前 `next_session` 的一次 attempt
- runner 在 fresh context 中消费 `startup-prompt.md` 和当前 `session-N-prompt.md`

### 3. Wait For Review

runner 完成后，run 进入 `interrupted`，表示：

- 候选产物已经生成
- 正在等待客户验收
- 业务状态尚未正式推进

### 4. Approve

用户批准后，插件调用 `POST /runs/{run_id}/resume`，LangGraph 执行：

- 写 `artifacts/session-N-summary.md`
- 写 `artifacts/session-N-manifest.json`
- 更新 `memory.md`
- 必要时把 `next_session` 推进到下一轮，或将 workflow 标记为 `done`

### 5. Reject / Rework

用户驳回后：

- 当前 `next_session` 保持不变
- 驳回原因写入 `review_notes` / runtime interrupt payload
- 允许先修改 `PRD.md`、`design.md`、`task.md`
- 再修订 `work-plan.md` 与当前/后续 `session-N-prompt.md`
- 然后重新触发同一个 Session 的下一次 attempt

如果此时 LangGraph 离线，当前实现只会把 `session_gate` / `review_notes` 回退写回 `memory.md`，作为兼容兜底，而不是完整替代 resume 语义。

## Session 0 特别约束

Session 0 不是业务实现轮，而是规划轮。它的目标是：

- 生成第一版 `work-plan.md`
- 生成后续 `session-N-prompt.md`
- 为后续开发阶段建立可执行的 session 切分与验收顺序

只有 Session 0 验收通过后，workflow 才能进入开发阶段。

## 契约边界

- 业务状态定义：见 `memory.md`
- LangGraph HTTP 契约：见 `integrations/vibecoding-vscode-extension/interfaces/langgraph-runtime-contract.md`
- Python fallback 契约：见 `integrations/vibecoding-vscode-extension/interfaces/python-driver-contract.md`

插件不能：

- 绕过 `memory.md` 自己决定 `next_session`
- 把本地缓存当作 workflow 真相
- 把 `run.status = success` 解释成 session 已正式通过
- 在 reject 后自动跳过当前 Session 去执行后续 Session

## 开发提示

如果当前实现仍依赖 Python driver，请把它视为兼容层，不要再围绕 driver 扩展新的主流程设计。后续 UI、状态展示和命令语义都应以 LangGraph runtime contract 为准。
