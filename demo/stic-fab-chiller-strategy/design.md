# design.md

## Goal
- 定义高效制冷机房策略优化建议管理功能的模块边界
- 定义业务对象、状态流转、输入输出和验证路径
- 定义以 `Task > Sessions` 为基础的交付工作流

## Standard Workflow

开发前必须完成两步需求对齐：

1. **对齐项目背景**：与 Agent 聊系统是什么、服务对象、领域约束
   → 写入 `CLAUDE.md`（项目级，跨所有 Task 共享，基本不变）

2. **对齐功能需求**：与 Agent 聊具体功能目标、范围边界、验收标准
   → 写入 `task.md` + `PRD.md`（Task 级，本功能独立维护）

需求对齐后触发 Session 0，生成完整规划文档，然后进入 Session 循环：

- 每个 Session 从 `startup-prompt.md` 重新进入
- `memory.md` 决定进入哪个 Session，不依赖聊天记忆
- 每个 Session 完成一个可测试的具体交付物
- 通过测试后写 `artifacts/session-N-summary.md` + `session-N-manifest.json`
- 更新 `memory.md`，结束当前会话，开新会话继续

## Execution Model

```
Project（代码仓库）
└── CLAUDE.md（项目级背景，跨 Task 共享）
    └── Task（高效制冷机房策略优化建议管理功能）
        ├── task.md（Task 目标与范围）
        ├── PRD.md（产品需求）
        ├── design.md（本文件，技术设计）
        ├── work-plan.md（Session 0-10 拆分计划）
        ├── memory.md（workflow 状态真相源）
        ├── startup-prompt.md（每轮 fresh session 统一入口）
        └── Session（具体交付物，每轮一个）
            └── artifacts/session-N-summary.md + session-N-manifest.json
```

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
- `current plan`
- `status`
- `artifacts`
- `next action`

### Persistent Memory
- repo-level: `CLAUDE.md`
- task-level: `task.md`
- run-level: `artifacts/session-N-summary.md`
- routing-level: `memory.md`

### Loop
- `plan`
- `execute`
- `run tests`
- `write summary + manifest`
- `update memory.md`
- `end session → start fresh session`

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
- 需求变化不回旧聊天补丁式续写，更新 `task.md` 后开新 Session
