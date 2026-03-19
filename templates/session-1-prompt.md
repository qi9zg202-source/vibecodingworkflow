工作目录切到 __TASK_ROOT__

本次只做 Session 1。
开始前若存在上一轮 summary，先读：
- `artifacts/session-0-summary.md`

目标：
- 搭 web 项目骨架与最小入口

限制：
- 不实现复杂业务逻辑

测试 Gate：
- 语法检查
- 最小启动验证

产出要求：
- 写 `artifacts/session-1-summary.md`（人类可读）
- 写 `artifacts/session-1-manifest.json`（机器可验证）

memory 更新：
- `last_completed_session: 1`
- `next_session: 2`
- `next_session_prompt: session-2-prompt.md`
- `session_gate: ready`

完成策略：
- 本 Session 完成后，结束当前会话
- 下一轮在新的 Session / 新上下文里重新执行 `startup-prompt.md`
