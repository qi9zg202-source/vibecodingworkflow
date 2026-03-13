工作目录切到 __PROJECT_ROOT__

本次只做 Session 5。
开始前若存在上一轮 summary，先读：
- `artifacts/session-4-summary.md`

目标：
- 实现核心 UI / API 逻辑 B

限制：
- 不做最终汇总和收尾

测试 Gate：
- 单元验证
- A+B 最小联调验证

产出要求：
- 写 `artifacts/session-5-summary.md`（人类可读）
- 写 `artifacts/session-5-manifest.json`（机器可验证）

memory 更新：
- `last_completed_session: 5`
- `next_session: 6`
- `next_session_prompt: session-6-prompt.md`
- `session_gate: ready`

完成策略：
- 本 Session 完成后，结束当前会话
- 下一轮在新的 Session / 新上下文里重新执行 `startup-prompt.md`
