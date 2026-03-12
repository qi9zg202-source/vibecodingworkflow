工作目录切到 __PROJECT_ROOT__

本次只做 Session 5。

开始前必须先读取：
- `artifacts/session-4-summary.md`

目标：
- 实现策略包下发、反馈和稳态验证闭环
- 支持人工审核、人工下发、反馈记录和回退结论

状态至少包含：
- 待评审
- 待下发
- 执行中
- 反馈中
- 稳态验证
- 已完成
- 已回退

限制：
- 不接真实控制系统
- 不跳过审核与反馈

测试 Gate：
- 状态流转完整
- 能记录反馈和稳态结论
- 回退路径可追踪

memory 更新：
- `last_completed_session: 5`
- `next_session: 6`
- `next_session_prompt: session-6-prompt.md`
- `session_gate: ready`
