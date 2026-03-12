工作目录切到 __PROJECT_ROOT__

本次只做 Session 0。
目标：
- 落 `PRD.md`、`design.md`、`work-plan.md`、`memory.md`

限制：
- 不写业务实现代码

测试 Gate：
- 关键文档存在
- `memory.md` 状态有效

summary：
- 写 `artifacts/session-0-summary.md`

memory 更新：
- `last_completed_session: 0`
- `next_session: 1`
- `next_session_prompt: session-1-prompt.md`
- `session_gate: ready`

完成策略：
- 本 Session 完成后，结束当前会话
- 下一轮在新的 Session / 新上下文里重新执行 `startup-prompt.md`
