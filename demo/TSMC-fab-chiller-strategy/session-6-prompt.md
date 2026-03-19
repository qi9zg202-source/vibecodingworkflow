工作目录切到 __PROJECT_ROOT__

本次只做 Session 6。

目标：
- 实现审批、下发、执行反馈、稳态验证和回退闭环
- 补充角色权限和审计日志入口

限制：
- 不做真实系统集成

测试 Gate：
- 状态流转完整
- 审批不可绕过
- 回退路径和稳态结论可追踪

memory 更新：
- `last_completed_session: 6`
- `next_session: 7`
- `next_session_prompt: session-7-prompt.md`
- `session_gate: ready`
