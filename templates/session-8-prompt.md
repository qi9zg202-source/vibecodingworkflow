工作目录切到 __PROJECT_ROOT__

本次只做 Session 8。
开始前若存在上一轮 summary，先读：
- `artifacts/session-7-summary.md`

目标：
- 模块集成与接口收口

限制：
- 不做流程结束

测试 Gate：
- 集成测试
- 主路径完整验证

产出要求：
- 写 `artifacts/session-8-summary.md`（人类可读）
- 写 `artifacts/session-8-manifest.json`（机器可验证）

memory 更新：
- `last_completed_session: 8`
- `next_session: 9`
- `next_session_prompt: session-9-prompt.md`
- `session_gate: ready`

完成策略：
- 本 Session 完成后，结束当前会话
- 下一轮在新的 Session / 新上下文里重新执行 `startup-prompt.md`
