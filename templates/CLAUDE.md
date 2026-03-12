# CLAUDE.md

## 上下文
这是一个以多 Session 状态机驱动的 webcoding 项目。

## 核心原则
- 一个 Task = 一个业务目标
- 一个 Session = 一个可交付物
- 不依赖对话记忆
- 通过 `startup-prompt.md` 统一调度
- 通过 `memory.md` 统一推进
- 测试没过不得进入下一 Session
- 若存在上一轮 `session summary`，下一轮必须先读取
