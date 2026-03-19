工作目录切到 __TASK_ROOT__

本次只做 Session 9。
开始前若存在上一轮 summary，先读：
- `artifacts/session-8-summary.md`

目标：
- 真实环境验证与边界样例覆盖

限制：
- 不新增核心功能

测试 Gate：
- 回归测试
- 边界样例验证

产出要求：
- 写 `artifacts/session-9-summary.md`（人类可读）
- 写 `artifacts/session-9-manifest.json`（机器可验证）

memory 更新：
- `last_completed_session: 9`
- `next_session: 10`
- `next_session_prompt: session-10-prompt.md`
- `session_gate: ready`

完成策略：
- 本 Session 完成后，结束当前会话
- 下一轮在新的 Session / 新上下文里重新执行 `startup-prompt.md`
