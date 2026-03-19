# VibeCoding VS Code Extension

> 2026-03-19 更新：执行层使用 Roo Code `/run-session` slash command，插件作为 IDE 集成层提供状态展示与 Approve / Reject 入口。

## 定位

VS Code 插件是 VibeCoding 工作流的 IDE 集成层：

- 提供 Dashboard、状态栏、文件打开器、Approve / Reject 入口
- 读取 `memory.md` 展示当前 workflow 进度
- 不拥有 workflow 真相，不自行决定 `next_session`

业务真相分层如下：

- `memory.md`：官方 workflow 进度与业务 gate
- VS Code 插件：展示状态，并转发用户动作

## 整体架构

```text
VS Code Extension (UI Shell)
    │
    ├── Activity Bar / Dashboard / Status Bar
    ├── Open Memory / Work Plan / Session Prompt
    ├── Start Current Session (触发 Roo Code /run-session)
    └── Approve / Reject Current Session
         │
         ▼
memory.md + work-plan.md + tasksubsessionN.md
         │
         ▼
Runner subprocess (Roo Code / Claude Code)
```

历史 Python driver 已归档到 `scripts/archived/run-vibecoding-loop.py`，仅作历史参考。

## 核心执行规则

- Session 0 负责生成第一版 `work-plan.md` 与后续 `tasksubsessionN.md`
- 每次执行只处理一个"当前 Session 的一次 attempt"
- runner 完成后只代表"候选结果已产出"，不代表 workflow 已推进
- 必须先经过客户验收，再写 summary / manifest / 更新 `memory.md`
- 验收不通过时，允许先更新 `PRD.md` / `design.md` / `task.md`，再修订 `work-plan.md` 与当前/后续 prompt
- `memory.md` 只在验收通过后推进；reject 不推进 `next_session`

## 配置与依赖

### 前提

- VS Code >= 1.85
- workflow 项目包含 `memory.md`、`work-plan.md`、`tasksubsessionN.md` 等标准文件

### 主要配置

| 设置项 | 作用 |
|---|---|
| `vibeCoding.defaultProjectRoot` | 默认 workflow 根目录 |
| `vibeCoding.runnerCommandTemplate` | 触发当前 Session 时的 runner 模板 |

## UI 组件

### Activity Bar / Dashboard

Dashboard 是主控制台，至少需要展示：

- workflow business state：`ready` / `blocked` / `done` / `invalid`
- 当前 `next_session` 与 `next_session_prompt`
- 候选 summary / manifest / 测试结果路径
- Approve / Reject / 打开关键文档动作

Dashboard 中的 Session 时间线应至少覆盖：

| 场景 | UI 状态 | 说明 |
|---|---|---|
| 当前 session 已就绪但还没点 Start | `待启动` | 等待用户显式触发 |
| runner 正在执行 | `执行中` | 当前 session attempt 正在运行 |
| runner 产出候选结果后进入等待 | `待验收` | 等待 Approve / Reject |
| 上一次 run 失败 | `失败待重试` | 当前 session 还没重新开始 |
| reject 后 workflow 卡住 | `已阻塞` | 必须先处理 review notes |
| 后续 session 尚未轮到 | `等待前序` | 前序 session 未完成前不会自动开始 |

### Status Bar

状态栏必须把 workflow state 与 runner state 分开显示。

推荐示例：

- `Vibe: W ready | S3`
- `Vibe: W blocked | S3`
- `Vibe: W ready | R running | S3`
- `Vibe: W ready | R review | S3`
- `Vibe: workflow done`

其中：

- `W ...` 来自 `memory.md` 对应的业务 gate
- `R ...` 来自当前 runner 的运行时状态

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

## 标准使用流程

### 1. Refresh

插件读取 `memory.md`，解析：

- `current_phase`
- `session_gate`
- `next_session`
- `next_session_prompt`

### 2. Start Current Session

用户触发 `Start Runner In Terminal` 后：

- 插件在终端执行 `/run-session` 或对应的 runner 命令
- 只执行当前 `next_session` 的一次 attempt
- runner 在 fresh context 中消费 `startup-prompt.md` 和当前 `tasksubsessionN.md`

### 3. Wait For Review

runner 完成后进入等待验收状态：

- 候选产物已经生成
- 正在等待客户验收
- 业务状态尚未正式推进

### 4. Approve

用户批准后，插件写入 `memory.md`：

- 写 `artifacts/session-N-summary.md`
- 写 `artifacts/session-N-manifest.json`
- 更新 `memory.md`
- 将 `next_session` 推进到下一轮，或将 workflow 标记为 `done`

### 5. Reject / Rework

用户驳回后：

- 当前 `next_session` 保持不变
- 驳回原因写入 `review_notes`
- 允许先修改 `PRD.md`、`design.md`、`task.md`
- 再修订 `work-plan.md` 与当前/后续 `tasksubsessionN.md`
- 然后重新触发同一个 Session 的下一次 attempt

## Session 0 特别约束

Session 0 不是业务实现轮，而是规划轮。它的目标是：

- 生成第一版 `work-plan.md`
- 生成后续 `tasksubsessionN.md`
- 为后续开发阶段建立可执行的 session 切分与验收顺序

只有 Session 0 验收通过后，workflow 才能进入开发阶段。

## 契约边界

- 业务状态定义：见 `memory.md`
- Python fallback 契约：见 `integrations/vibecoding-vscode-extension/interfaces/python-driver-contract.md`

插件不能：

- 绕过 `memory.md` 自己决定 `next_session`
- 把本地缓存当作 workflow 真相
- 在 reject 后自动跳过当前 Session 去执行后续 Session
