# CLAUDE.md

## 文件职责说明

`CLAUDE.md` 是**项目级**长期上下文，写入后跨所有 Task 共享，基本不变。
`task.md` 是**Task 级**上下文，每个二级功能点独立维护，随 Task 变化。

---

## Project Background
- 描述这个项目是什么、服务对象是谁、核心业务场景
- 写入稳定的领域知识和系统边界，不写具体功能目标

## Product Intent
- 产品的核心价值主张
- 用户角色和核心使用场景

## Domain Guardrails
- 不可违反的业务规则和约束
- 安全、合规、可靠性边界

## Workflow Guardrails
- `memory.md` 是 workflow 真相源
- 每轮必须从 `startup-prompt.md` 重新进入
- 不允许跨 Session 混合推进多个未完成 deliverable
- 若存在上一轮 `session summary`，下一轮必须先读取
- 测试没过不得进入下一 Session
