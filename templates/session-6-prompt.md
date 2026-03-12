工作目录切到 __PROJECT_ROOT__

本次只做 Session 6。
开始前若存在上一轮 summary，先读：
- `artifacts/session-5-summary.md`

目标：
- 接入运行态集成与副作用层

限制：
- 不做最终流程收尾

测试 Gate：
- 最小真实环境验证
- 失败场景验证

summary：
- 写 `artifacts/session-6-summary.md`

memory 更新：
- `last_completed_session: 6`
- `next_session: 7`
- `next_session_prompt: session-7-prompt.md`
- `session_gate: ready`

完成策略：
- 本 Session 完成后，结束当前会话
- 下一轮在新的 Session / 新上下文里重新执行 `startup-prompt.md`
