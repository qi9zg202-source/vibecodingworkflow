# design.md

## 文件职责说明

`design.md` 是 **Task 级**技术设计文档，与 `task.md` 配套，定义本 Task 的架构决策。
每个 Task 独立维护一份，不跨 Task 共享。

---

## Goal
- 定义模块边界
- 定义输入输出
- 定义验证路径

## Architecture

### 分层结构
- UI Layer：用户界面与交互
- Data Layer：数据模型与状态
- Runtime Layer：业务逻辑与副作用
- Integration Layer：外部系统对接

### 模块边界
- 描述各模块的职责和边界
- 定义模块间的接口契约

### 数据流
- 描述核心数据流向
- 定义关键数据结构

## Key Technical Decisions
- 记录关键技术选型及理由
- 记录被否决的方案及原因

## Execution Model

```
Project（代码仓库）
└── CLAUDE.md（项目级背景，跨 Task 共享）
    └── Task（二级功能点）
        ├── task.md（Task 目标与范围）
        ├── design.md（本文件，Task 技术设计）
        ├── memory.md（workflow 状态真相源）
        ├── startup-prompt.md（每轮 fresh session 统一入口）
        └── Session（具体交付物，每轮一个）
            └── artifacts/session-N-summary.md + session-N-manifest.json
```

- `Task` 是业务目标单位（一个二级功能点）
- `Session` 是执行单位（一个具体可交付物）
- 一个 Task 通常由 3-15 个 Session 完成
- 一个 Session 只推进一个明确子目标，对应一个测试 gate
- `memory.md` 是 workflow routing truth
- `startup-prompt.md` 是每轮 fresh session 的统一入口

## Rules
- 先分层，后结论
- 先证据，后汇总
- 默认不跨 Session
- 需求变化不回旧聊天补丁式续写，统一进入新 Session 继续
