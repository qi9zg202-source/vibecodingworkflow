# design.md

## Goal
- 定义模块边界
- 定义输入输出
- 定义验证路径

## Standard Workflow
- 先和 Codex 沟通需求，收敛目标、范围、约束、验收标准
- 将稳定的项目背景写入 `CLAUDE.md`，作为长期上下文，不依赖聊天历史
- 生成或更新 `PRD.md`，明确问题、用户价值、范围和验收标准
- 生成或更新 `design.md`，明确架构、模块边界、数据流和关键技术决策
- 先定义当前要推进的 `Task`
- 再将该 `Task` 拆分为多个 `Sessions`，并写入 `work-plan.md`
- 由外部 driver 读取 `memory.md`，判断当前 workflow 状态
- 启动一个 fresh session，并始终通过 `startup-prompt.md` 进入
- 当前 session 完成后，必须先运行测试、更新 `memory.md`、记录 summary / artifacts、明确下一轮输入
- 结束当前 session，再由 driver 决定是否启动下一轮 fresh session

## Execution Model
- `Task` 是业务目标单位
- `Session` 是执行单位
- 推荐关系是 `Task > Sessions`
- 一个 `Task` 通常由多个 `Sessions` 完成
- 一个 `Session` 只推进一个明确子目标，并对应一个测试 gate
- `memory.md` 是 workflow routing truth
- `startup-prompt.md` 是每轮 fresh session 的统一入口

## Orchestration Layer
- 如果目标是解决 `task` 拆解、`session` 接力和模型持续自主工作，优先建设最小 orchestration layer，而不是更复杂的 IDE 面板

### Task Object
- `title`
- `goal`
- `constraints`
- `acceptance criteria`
- `related files`
- `allowed tools`

### Session Object
- `task_id`
- `branch/worktree/sandbox`
- `current plan`
- `status`
- `artifacts`
- `next action`
- `review URL / diff`

### Persistent Memory
- repo-level: `AGENTS.md`
- task-level: `task.md`
- run-level: `session log / test log / summary`

### Loop
- `plan`
- `execute`
- `run tests`
- `summarize evidence`
- `request review or continue`

### Continuation Rule
- 需求变化不回旧聊天补丁式续写
- 统一进入 `task / PR / session` 继续

## Architecture
- UI Layer
- Data Layer
- Runtime Layer
- Integration Layer

## Rules
- 先分层，后结论
- 先证据，后汇总
- 默认不跨 Session
