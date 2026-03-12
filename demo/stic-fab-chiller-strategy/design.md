# design.md

## Goal
- 定义高效制冷机房策略优化建议管理功能的模块边界
- 定义业务对象、状态流转、输入输出和验证路径
- 定义以 `Task > Sessions` 为基础的交付工作流

## Standard Workflow
- 先和 Codex 沟通需求，收敛目标、范围、约束、验收标准
- 将稳定的项目背景写入 `CLAUDE.md`
- 生成或更新 `PRD.md`
- 生成或更新 `design.md`
- 先定义当前 `Task`
- 再将该 `Task` 拆分为多个 `Sessions`
- 由外部 driver 读取 `memory.md` 判断是否可推进
- 启动 fresh session，并始终通过 `startup-prompt.md` 进入
- 当前 session 完成后，先运行测试、写 summary、更新 `memory.md`
- 再结束当前 session，交由下一轮 fresh session 接力

## Execution Model
- `Task` 是“高效制冷机房策略优化建议管理功能”
- 多个 `Sessions` 负责分别完成指标分析、策略包、闭环管理等子目标
- `memory.md` 负责 workflow routing truth
- `artifacts/session-N-summary.md` 负责上一轮 handoff evidence
- `startup-prompt.md` 负责统一 re-entry

## Orchestration Layer

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
- repo-level: `CLAUDE.md`
- task-level: `task.md`
- run-level: `artifacts/session-N-summary.md`
- routing-level: `memory.md`

### Loop
- `plan`
- `execute`
- `run tests`
- `summarize evidence`
- `request review or continue`

### Continuation Rule
- 需求变化不回旧聊天补丁式续写
- 统一进入 `task / PR / session` 继续

## Domain Objects

### KPI Metric
- 指标名称
- 时间粒度
- 当前值
- 趋势值
- 预警等级

### Strategy Package
- 策略名称
- 目标对象
- 适用工况
- 预期收益区间
- 风险等级
- 控制建议
- 回退条件

### Strategy Execution
- 下发对象
- 下发时间
- 执行负责人
- 执行反馈
- 稳态观察窗口
- 稳态结论
- 是否回退

## Architecture

### Monitoring Layer
- 指标总览
- 趋势曲线
- 异常预警

### Strategy Layer
- 策略包列表
- 策略包详情
- 工况匹配和风险说明

### Execution Layer
- 下发记录
- 反馈记录
- 稳态验证
- 回退和关闭

### Persistence Layer
- 策略状态
- 执行记录
- 稳态结论
- 审计日志

## Rules
- 不输出不可回退的自动控制方案
- 不绕过人工审核
- 不牺牲可靠性换取表面节能
- 每轮 session 只完成一个明确 deliverable
