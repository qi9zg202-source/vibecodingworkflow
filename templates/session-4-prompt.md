工作目录切到 __TASK_ROOT__

本次只做 Session 4。
开始前若存在上一轮 summary，先读：
- `artifacts/session-3-summary.md`

目标：
- 实现核心 UI / API 逻辑 A

限制：
- 不做最终集成

测试 Gate：
- 单元验证
- 最小功能验证

产出要求：
- 写 `artifacts/session-4-summary.md`（人类可读）
- 写 `artifacts/session-4-manifest.json`（机器可验证）

memory 更新：
- `last_completed_session: 4`
- `next_session: 5`
- `next_session_prompt: session-5-prompt.md`
- `session_gate: ready`

完成策略：
- 本 Session 完成后，结束当前会话
- 下一轮在新的 Session / 新上下文里重新执行 `startup-prompt.md`
